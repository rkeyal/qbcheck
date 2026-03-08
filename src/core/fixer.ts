import { Paragraph, Run, LintDiagnostic, AutoFix } from './model.js';

export interface FixResult {
  fixedParagraphs: Paragraph[];
  fixCount: number;
  appliedFixes: LintDiagnostic[];
  remainingDiagnostics: LintDiagnostic[];
}

/**
 * Apply auto-fixes to paragraphs, returning modified paragraphs and
 * split diagnostic lists.
 *
 * Fixes are applied at the rawText level and propagated into the runs
 * array so that run-level formatting is preserved for HTML clipboard output.
 */
export function applyFixes(
  paragraphs: Paragraph[],
  diagnostics: LintDiagnostic[],
  autoFixDisabled: string[]
): FixResult {
  const disabledSet = new Set(autoFixDisabled);

  const applied: LintDiagnostic[] = [];
  const remaining: LintDiagnostic[] = [];

  // Separate fixable from non-fixable
  const fixableByPara = new Map<number, { diag: LintDiagnostic; fix: AutoFix }[]>();

  for (const d of diagnostics) {
    if (d.fix && !disabledSet.has(d.rule)) {
      const list = fixableByPara.get(d.paragraph) ?? [];
      list.push({ diag: d, fix: d.fix });
      fixableByPara.set(d.paragraph, list);
    } else {
      remaining.push(d);
    }
  }

  if (fixableByPara.size === 0) {
    return {
      fixedParagraphs: paragraphs,
      fixCount: 0,
      appliedFixes: [],
      remainingDiagnostics: diagnostics,
    };
  }

  // Deep-clone paragraphs that need modification
  const fixedParagraphs = paragraphs.map((p) => {
    if (!fixableByPara.has(p.index)) return p;
    return {
      ...p,
      runs: p.runs.map((r) => ({ ...r })),
    };
  });

  // Build index map from paragraph index → array position
  const paraByIndex = new Map<number, number>();
  for (let i = 0; i < fixedParagraphs.length; i++) {
    paraByIndex.set(fixedParagraphs[i].index, i);
  }

  for (const [paraIndex, fixes] of fixableByPara) {
    const arrIdx = paraByIndex.get(paraIndex);
    if (arrIdx === undefined) {
      // Paragraph not found; move diagnostics to remaining
      for (const f of fixes) remaining.push(f.diag);
      continue;
    }

    const para = fixedParagraphs[arrIdx];

    // Sort fixes by offset descending (apply from end to start)
    fixes.sort((a, b) => b.fix.offset - a.fix.offset);

    // Track applied ranges to detect overlaps
    let appliedRanges: { start: number; end: number }[] = [];

    for (const { diag, fix } of fixes) {
      const fixEnd = fix.offset + fix.oldText.length;

      // Check for overlap with already-applied fixes
      const overlaps = appliedRanges.some(
        (r) => fix.offset < r.end && fixEnd > r.start
      );
      if (overlaps) {
        remaining.push(diag);
        continue;
      }

      // Verify the oldText matches at the expected offset
      const actual = para.rawText.substring(fix.offset, fixEnd);
      if (actual !== fix.oldText) {
        remaining.push(diag);
        continue;
      }

      // Apply fix to rawText
      para.rawText =
        para.rawText.substring(0, fix.offset) +
        fix.newText +
        para.rawText.substring(fixEnd);

      // Apply fix to runs
      applyFixToRuns(para.runs, fix);

      appliedRanges.push({ start: fix.offset, end: fixEnd });
      applied.push(diag);
    }
  }

  return {
    fixedParagraphs,
    fixCount: applied.length,
    appliedFixes: applied,
    remainingDiagnostics: remaining,
  };
}

/**
 * Apply a text fix to the runs array, preserving formatting.
 *
 * When the fix falls entirely within one run, we just update that run's text.
 * When it spans multiple runs, we update the first run and trim/remove
 * subsequent affected runs.
 */
function applyFixToRuns(runs: Run[], fix: AutoFix): void {
  const { offset, oldText, newText } = fix;
  const fixEnd = offset + oldText.length;

  // Find which runs are affected
  let charPos = 0;
  let startRunIdx = -1;
  let startRunOffset = 0;
  let endRunIdx = -1;
  let endRunOffset = 0;

  for (let i = 0; i < runs.length; i++) {
    const runStart = charPos;
    const runEnd = charPos + runs[i].text.length;

    if (startRunIdx === -1 && offset < runEnd) {
      startRunIdx = i;
      startRunOffset = offset - runStart;
    }
    if (fixEnd <= runEnd) {
      endRunIdx = i;
      endRunOffset = fixEnd - runStart;
      break;
    }
    charPos = runEnd;
  }

  if (startRunIdx === -1 || endRunIdx === -1) return;

  if (startRunIdx === endRunIdx) {
    // Fix is within a single run
    const run = runs[startRunIdx];
    run.text =
      run.text.substring(0, startRunOffset) +
      newText +
      run.text.substring(endRunOffset);
  } else {
    // Fix spans multiple runs — put new text in the first run,
    // trim the last affected run, and remove runs in between
    const firstRun = runs[startRunIdx];
    const lastRun = runs[endRunIdx];

    firstRun.text = firstRun.text.substring(0, startRunOffset) + newText;
    lastRun.text = lastRun.text.substring(endRunOffset);

    // Remove empty runs between (exclusive) and including lastRun if empty
    const removeStart = startRunIdx + 1;
    const removeCount = endRunIdx - startRunIdx;
    if (removeCount > 0) {
      // Keep lastRun if it still has text
      if (lastRun.text.length > 0) {
        runs.splice(removeStart, removeCount - 1);
      } else {
        runs.splice(removeStart, removeCount);
      }
    }
  }

  // Remove empty runs left behind
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].text.length === 0 && runs.length > 1) {
      runs.splice(i, 1);
    }
  }
}

/**
 * Convert paragraphs to HTML preserving run-level formatting.
 * Used for rich-text clipboard output.
 */
export function paragraphsToHtml(paragraphs: Paragraph[]): string {
  // Strip trailing empty paragraphs.
  let end = paragraphs.length;
  while (end > 0 && paragraphs[end - 1].rawText.trim() === '') {
    end--;
  }
  const trimmed = end === paragraphs.length ? paragraphs : paragraphs.slice(0, end);

  const lines = trimmed.map((p) => {
    return p.runs
      .map((r) => {
        const styles: string[] = [];
        if (r.bold) styles.push('font-weight:bold');
        if (r.italic) styles.push('font-style:italic');
        if (r.underline) styles.push('text-decoration:underline');
        if (r.superscript)
          styles.push('vertical-align:super', 'font-size:smaller');
        if (r.subscript)
          styles.push('vertical-align:sub', 'font-size:smaller');

        const text = escapeHtml(r.text);
        return styles.length > 0
          ? `<span style="${styles.join(';')}">${text}</span>`
          : text;
      })
      .join('');
  });

  if (lines.length === 0) return '';

  // Use <p> tags for all paragraphs except the last one. The last
  // paragraph is emitted as inline content so that Google Docs doesn't
  // create an extra trailing paragraph after the final </p>.
  // Empty paragraphs use <br> content so Google Docs renders a blank line.
  const parts: string[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    parts.push(`<p style="margin:0">${lines[i] || '\u00A0'}</p>`);
  }
  parts.push(lines[lines.length - 1]);
  return parts.join('\n');
}

/**
 * Convert paragraphs to plain text (one paragraph per line).
 */
export function paragraphsToPlainText(paragraphs: Paragraph[]): string {
  return paragraphs.map((p) => p.rawText).join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
