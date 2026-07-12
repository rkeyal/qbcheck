import {
  Paragraph,
  Run,
  LintDiagnostic,
  AutoFix,
  AutoFixFormat,
} from './model.js';

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
 * Format fixes operate only on runs (splitting runs and stripping formatting
 * from space characters) without changing rawText.
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
  const textFixByPara = new Map<
    number,
    { diag: LintDiagnostic; fix: AutoFix }[]
  >();
  const formatFixByPara = new Map<
    number,
    { diag: LintDiagnostic; formatFix: AutoFixFormat }[]
  >();

  for (const d of diagnostics) {
    if (disabledSet.has(d.rule)) {
      remaining.push(d);
      continue;
    }
    if (d.fix) {
      const list = textFixByPara.get(d.paragraph) ?? [];
      list.push({ diag: d, fix: d.fix });
      textFixByPara.set(d.paragraph, list);
    } else if (d.formatFix) {
      const list = formatFixByPara.get(d.paragraph) ?? [];
      list.push({ diag: d, formatFix: d.formatFix });
      formatFixByPara.set(d.paragraph, list);
    } else {
      remaining.push(d);
    }
  }

  const hasTextFixes = textFixByPara.size > 0;
  const hasFormatFixes = formatFixByPara.size > 0;

  if (!hasTextFixes && !hasFormatFixes) {
    return {
      fixedParagraphs: paragraphs,
      fixCount: 0,
      appliedFixes: [],
      remainingDiagnostics: diagnostics,
    };
  }

  // Collect all paragraph indices that need modification
  const parasToClone = new Set<number>();
  for (const idx of textFixByPara.keys()) parasToClone.add(idx);
  for (const idx of formatFixByPara.keys()) parasToClone.add(idx);

  // Deep-clone paragraphs that need modification
  const fixedParagraphs = paragraphs.map((p) => {
    if (!parasToClone.has(p.index)) return p;
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

  // Apply format fixes first (they don't change rawText, so no offset shifting)
  for (const [paraIndex, fixes] of formatFixByPara) {
    const arrIdx = paraByIndex.get(paraIndex);
    if (arrIdx === undefined) {
      for (const f of fixes) remaining.push(f.diag);
      continue;
    }

    const para = fixedParagraphs[arrIdx];
    for (const { diag, formatFix } of fixes) {
      applyFormatFix(para.runs, formatFix.ranges);
      applied.push(diag);
    }
  }

  // Apply text-level fixes
  for (const [paraIndex, fixes] of textFixByPara) {
    const arrIdx = paraByIndex.get(paraIndex);
    if (arrIdx === undefined) {
      for (const f of fixes) remaining.push(f.diag);
      continue;
    }

    const para = fixedParagraphs[arrIdx];

    // Sort fixes by offset descending (apply from end to start)
    fixes.sort((a, b) => b.fix.offset - a.fix.offset);

    // Track applied ranges to detect overlaps
    const appliedRanges: { start: number; end: number }[] = [];

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
 * Apply a format fix to the runs array by splitting runs at the given
 * character offsets and stripping all formatting from those characters.
 * This does not change the rawText — only run boundaries and formatting flags.
 */
export function applyFormatFix(
  runs: Run[],
  ranges: Array<{ offset: number; length: number }>
): void {
  // Process ranges from end to start so earlier offsets remain valid
  const sorted = [...ranges].sort((a, b) => b.offset - a.offset);
  for (const range of sorted) {
    splitAndStripFormatting(runs, range.offset, range.length);
  }
  mergeAdjacentRuns(runs);
}

/**
 * Split a run at the given global offset to isolate `length` characters,
 * then strip all formatting from the isolated segment.
 */
function splitAndStripFormatting(
  runs: Run[],
  offset: number,
  length: number
): void {
  // Find which run contains the offset
  let charPos = 0;
  let runIdx = -1;
  let runOffset = 0;

  for (let i = 0; i < runs.length; i++) {
    const runEnd = charPos + runs[i].text.length;
    if (offset < runEnd) {
      runIdx = i;
      runOffset = offset - charPos;
      break;
    }
    charPos = runEnd;
  }

  if (runIdx === -1) return;

  const run = runs[runIdx];
  const endOffset = runOffset + length;

  // If the range matches the entire run, just strip formatting
  if (runOffset === 0 && endOffset >= run.text.length) {
    run.bold = false;
    run.italic = false;
    run.underline = false;
    return;
  }

  // Split into up to 3 parts: before | target | after
  const newRuns: Run[] = [];

  if (runOffset > 0) {
    newRuns.push({ ...run, text: run.text.substring(0, runOffset) });
  }

  // The target segment with formatting stripped
  newRuns.push({
    text: run.text.substring(runOffset, endOffset),
    bold: false,
    italic: false,
    underline: false,
    superscript: false,
    subscript: false,
  });

  if (endOffset < run.text.length) {
    newRuns.push({ ...run, text: run.text.substring(endOffset) });
  }

  runs.splice(runIdx, 1, ...newRuns);
}

/**
 * Merge adjacent runs that have identical formatting.
 */
export function mergeAdjacentRuns(runs: Run[]): void {
  let i = 0;
  while (i < runs.length - 1) {
    if (sameFormatting(runs[i], runs[i + 1])) {
      runs[i] = { ...runs[i], text: runs[i].text + runs[i + 1].text };
      runs.splice(i + 1, 1);
    } else {
      i++;
    }
  }
}

/**
 * Check if two runs have identical formatting flags.
 */
export function sameFormatting(a: Run, b: Run): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.superscript === b.superscript &&
    a.subscript === b.subscript
  );
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
  const trimmed =
    end === paragraphs.length ? paragraphs : paragraphs.slice(0, end);

  const pStyle =
    'margin:0;page-break-inside:avoid;orphans:2;widows:2';

  const lines = trimmed.map((p) => {
    return p.runs
      .map((r) => {
        const styles: string[] = [];
        if (r.bold) styles.push('font-weight:bold');
        if (r.italic) styles.push('font-style:italic');
        if (r.underline) styles.push('text-decoration:underline');

        const text = escapeHtml(r.text);
        let html =
          styles.length > 0
            ? `<span style="${styles.join(';')}">${text}</span>`
            : text;

        if (r.superscript) html = `<sup>${html}</sup>`;
        if (r.subscript) html = `<sub>${html}</sub>`;

        return html;
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
    parts.push(`<p style="${pStyle}">${lines[i] || '\u00A0'}</p>`);
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
