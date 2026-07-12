import { LintDiagnostic, AutoFix, AutoFixFormat } from '../core/model.js';

/**
 * Map a zero-based paragraph index (counting only paragraph/list-item body
 * children) to its live element, so a diagnostic's `paragraph` can be resolved
 * back to the document paragraph to edit.
 */
function buildParagraphMap(
  body: GoogleAppsScript.Document.Body,
  numChildren: number
): Map<number, GoogleAppsScript.Document.Paragraph> {
  const map = new Map<number, GoogleAppsScript.Document.Paragraph>();
  let paraIndex = 0;

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (
      child.getType() === DocumentApp.ElementType.PARAGRAPH ||
      child.getType() === DocumentApp.ElementType.LIST_ITEM
    ) {
      map.set(paraIndex, child.asParagraph());
      paraIndex++;
    }
  }

  return map;
}

/** Outcome of attempting to apply a single auto-fix to the live document. */
export interface FixOutcome {
  applied: boolean;
  reason?: string; // populated when applied === false
}

/**
 * Apply a single diagnostic's auto-fix directly to the active Google Doc.
 *
 * Unlike the paste-mode fixer (src/core/fixer.ts), which rewrites an in-memory
 * Paragraph[] snapshot, this edits the live document in place via DocumentApp.
 * Each call re-reads the document, so applying fixes one at a time from the
 * sidebar is always operating on current text.
 */
export function applyFixForDiagnostic(diag: LintDiagnostic): FixOutcome {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const map = buildParagraphMap(body, body.getNumChildren());
  const para = map.get(diag.paragraph);
  if (!para) {
    return { applied: false, reason: `Paragraph ${diag.paragraph} not found.` };
  }
  return applyDiagToText(para.editAsText(), diag);
}

/**
 * Apply many auto-fixes in a single execution — the "Fix all" path.
 *
 * This is far faster than calling applyFixForDiagnostic once per issue: it
 * makes one server round-trip and builds the paragraph map once instead of N
 * times. Format fixes run first (they never change text length); text fixes are
 * grouped by paragraph and applied from the highest offset to the lowest so
 * each edit leaves the offsets of not-yet-applied fixes in that paragraph
 * valid.
 */
export function applyFixesForDiagnostics(diagnostics: LintDiagnostic[]): {
  applied: number;
  failed: number;
} {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const map = buildParagraphMap(body, body.getNumChildren());

  let applied = 0;
  let failed = 0;
  const tally = (outcome: FixOutcome): void => {
    if (outcome.applied) {
      applied++;
    } else {
      failed++;
    }
  };

  for (const d of diagnostics) {
    if (d.fix || !d.formatFix) continue;
    const para = map.get(d.paragraph);
    if (!para) {
      failed++;
      continue;
    }
    tally(applyFormatFix(para.editAsText(), d.formatFix));
  }

  const textFixesByPara = new Map<number, LintDiagnostic[]>();
  for (const d of diagnostics) {
    if (!d.fix) continue;
    const list = textFixesByPara.get(d.paragraph) ?? [];
    list.push(d);
    textFixesByPara.set(d.paragraph, list);
  }

  for (const [paraIndex, list] of textFixesByPara) {
    const para = map.get(paraIndex);
    if (!para) {
      failed += list.length;
      continue;
    }
    list.sort((a, b) => b.fix!.offset - a.fix!.offset);
    const text = para.editAsText();
    for (const d of list) {
      tally(applyTextFix(text, d.fix!));
    }
  }

  return { applied, failed };
}

function applyDiagToText(
  text: GoogleAppsScript.Document.Text,
  diag: LintDiagnostic
): FixOutcome {
  if (diag.fix) {
    return applyTextFix(text, diag.fix);
  }
  if (diag.formatFix) {
    return applyFormatFix(text, diag.formatFix);
  }
  return { applied: false, reason: 'This issue has no auto-fix.' };
}

function applyTextFix(
  text: GoogleAppsScript.Document.Text,
  fix: AutoFix
): FixOutcome {
  const raw = text.getText();
  const offset = resolveOffset(raw, fix.oldText, fix.offset);
  if (offset === -1) {
    return {
      applied: false,
      reason:
        'The text to fix was not found — the document may have changed since linting. Re-lint and try again.',
    };
  }

  const endInclusive = offset + fix.oldText.length - 1;
  // Delete the old text, then insert the replacement at the same offset. The
  // inserted text inherits the style of the surrounding text, which is correct
  // for these in-prose fixes (spacing, dashes, "For 10 points", ANSWER:, etc.).
  text.deleteText(offset, endInclusive);
  text.insertText(offset, fix.newText);
  return { applied: true };
}

function applyFormatFix(
  text: GoogleAppsScript.Document.Text,
  formatFix: AutoFixFormat
): FixOutcome {
  const length = text.getText().length;
  let anyApplied = false;

  for (const range of formatFix.ranges) {
    const start = range.offset;
    const endInclusive = range.offset + range.length - 1;
    if (start < 0 || endInclusive < start || endInclusive >= length) {
      continue;
    }
    // Mirror the paste-mode formatFix: strip bold/italic/underline from the
    // (whitespace) characters that formatting bled onto.
    text.setBold(start, endInclusive, false);
    text.setItalic(start, endInclusive, false);
    text.setUnderline(start, endInclusive, false);
    anyApplied = true;
  }

  if (!anyApplied) {
    return {
      applied: false,
      reason:
        'The formatting range is out of bounds — the document may have changed since linting. Re-lint and try again.',
    };
  }
  return { applied: true };
}

/**
 * Locate `oldText` in `raw`. Prefer the exact hint offset; if the document has
 * shifted, fall back to the occurrence nearest the hint so we fix the intended
 * instance rather than the first textual match.
 */
function resolveOffset(raw: string, oldText: string, hint: number): number {
  if (raw.substring(hint, hint + oldText.length) === oldText) {
    return hint;
  }

  let best = -1;
  let idx = raw.indexOf(oldText);
  while (idx !== -1) {
    if (best === -1 || Math.abs(idx - hint) < Math.abs(best - hint)) {
      best = idx;
    }
    idx = raw.indexOf(oldText, idx + 1);
  }
  return best;
}
