import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeGas, type GasHandle } from './fake-gas.js';
import {
  applyFixForDiagnostic,
  applyFixesForDiagnostics,
} from '../../src/apps-script/fixes.js';
import { applyFixesAndRelint } from '../../src/apps-script/main.js';
import type { LintDiagnostic } from '../../src/core/model.js';

function textFix(
  paragraph: number,
  fix: { oldText: string; newText: string; offset: number }
): LintDiagnostic {
  return {
    rule: 'question.ftp-format',
    severity: 'error',
    paragraph,
    message: 'msg',
    fix,
  };
}

describe('applyFixForDiagnostic — text fixes', () => {
  let gas: GasHandle;
  beforeEach(() => {
    gas = installFakeGas();
  });

  it('replaces oldText at its offset and reports applied', () => {
    gas.setDocument([{ text: '1. For ten points, name this.' }]);

    const out = applyFixForDiagnostic(
      textFix(0, { oldText: 'For ten points', newText: 'For 10 points', offset: 3 })
    );

    expect(out.applied).toBe(true);
    expect(gas.paragraphText(0)).toBe('1. For 10 points, name this.');
  });

  it('falls back to the nearest occurrence when the offset has shifted', () => {
    // Offset points one char too far right; oldText still present nearby.
    gas.setDocument([{ text: 'ANSWER : Napoleon' }]);

    const out = applyFixForDiagnostic(
      textFix(0, { oldText: 'ANSWER :', newText: 'ANSWER:', offset: 5 })
    );

    expect(out.applied).toBe(true);
    expect(gas.paragraphText(0)).toBe('ANSWER: Napoleon');
  });

  it('picks the occurrence nearest the offset when text repeats', () => {
    // Two double-spaces; the fix should collapse the second one (offset 20).
    gas.setDocument([{ text: 'alpha  beta gamma  delta' }]);

    const out = applyFixForDiagnostic(
      textFix(0, { oldText: '  ', newText: ' ', offset: 17 })
    );

    expect(out.applied).toBe(true);
    expect(gas.paragraphText(0)).toBe('alpha  beta gamma delta');
  });

  it('reports not-applied when the text is gone', () => {
    gas.setDocument([{ text: 'nothing to fix here' }]);

    const out = applyFixForDiagnostic(
      textFix(0, { oldText: 'MISSING', newText: 'X', offset: 0 })
    );

    expect(out.applied).toBe(false);
    expect(out.reason).toContain('not found');
    expect(gas.paragraphText(0)).toBe('nothing to fix here');
  });

  it('reports not-applied when the paragraph does not exist', () => {
    gas.setDocument([{ text: 'only paragraph' }]);

    const out = applyFixForDiagnostic(
      textFix(9, { oldText: 'x', newText: 'y', offset: 0 })
    );

    expect(out.applied).toBe(false);
    expect(out.reason).toContain('not found');
  });
});

describe('applyFixForDiagnostic — format fixes', () => {
  let gas: GasHandle;
  beforeEach(() => {
    gas = installFakeGas();
  });

  it('strips bold/underline from a bled trailing space', () => {
    // "word " is bold+underlined; the trailing space (offset 4) bled.
    gas.setDocument([
      {
        runs: [
          { text: 'word ', bold: true, underline: true },
          { text: 'next' },
        ],
      },
    ]);

    const diag: LintDiagnostic = {
      rule: 'formatting.no-format-bleeding',
      severity: 'info',
      paragraph: 0,
      message: 'msg',
      formatFix: { ranges: [{ offset: 4, length: 1 }] },
    };

    const out = applyFixForDiagnostic(diag);

    expect(out.applied).toBe(true);
    // The space is now unformatted; the preceding letter is still bold.
    expect(gas.paragraphFormat(0, 4)).toEqual({
      bold: false,
      italic: false,
      underline: false,
    });
    expect(gas.paragraphFormat(0, 3).bold).toBe(true);
  });

  it('reports not-applied when the range is out of bounds', () => {
    gas.setDocument([{ text: 'short' }]);

    const diag: LintDiagnostic = {
      rule: 'formatting.no-format-bleeding',
      severity: 'info',
      paragraph: 0,
      message: 'msg',
      formatFix: { ranges: [{ offset: 100, length: 1 }] },
    };

    expect(applyFixForDiagnostic(diag).applied).toBe(false);
  });
});

describe('applyFixesForDiagnostics — batch ("Fix all")', () => {
  let gas: GasHandle;
  beforeEach(() => {
    gas = installFakeGas();
  });

  it('applies multiple text fixes in one paragraph (offset-safe)', () => {
    gas.setDocument([{ text: 'a  b   c' }]); // double space at 1, triple at 4..5

    const result = applyFixesForDiagnostics([
      textFix(0, { oldText: '  ', newText: ' ', offset: 1 }),
      textFix(0, { oldText: '  ', newText: ' ', offset: 4 }),
    ]);

    expect(result).toEqual({ applied: 2, failed: 0 });
    expect(gas.paragraphText(0)).toBe('a b  c');
  });

  it('applies text and format fixes across paragraphs together', () => {
    gas.setDocument([
      { text: '1. For ten points, name this.' },
      {
        runs: [
          { text: 'word ', bold: true, underline: true },
          { text: 'next' },
        ],
      },
    ]);

    const result = applyFixesForDiagnostics([
      textFix(0, {
        oldText: 'For ten points',
        newText: 'For 10 points',
        offset: 3,
      }),
      {
        rule: 'formatting.no-format-bleeding',
        severity: 'info',
        paragraph: 1,
        message: 'msg',
        formatFix: { ranges: [{ offset: 4, length: 1 }] },
      },
    ]);

    expect(result).toEqual({ applied: 2, failed: 0 });
    expect(gas.paragraphText(0)).toBe('1. For 10 points, name this.');
    expect(gas.paragraphFormat(1, 4).bold).toBe(false);
  });

  it('counts failures without aborting the rest', () => {
    gas.setDocument([{ text: 'For ten points' }, { text: 'plain' }]);

    const result = applyFixesForDiagnostics([
      textFix(0, {
        oldText: 'For ten points',
        newText: 'For 10 points',
        offset: 0,
      }),
      textFix(1, { oldText: 'MISSING', newText: 'X', offset: 0 }),
    ]);

    expect(result).toEqual({ applied: 1, failed: 1 });
    expect(gas.paragraphText(0)).toBe('For 10 points');
    expect(gas.paragraphText(1)).toBe('plain');
  });
});

describe('applyFixesAndRelint — combined apply + re-lint round-trip', () => {
  let gas: GasHandle;
  beforeEach(() => {
    gas = installFakeGas();
  });

  it('applies fixes to the doc and returns a fresh re-linted list', () => {
    gas.setDocument([{ text: '1. For ten points, name this.' }]);

    const result = applyFixesAndRelint(
      [
        textFix(0, {
          oldText: 'For ten points',
          newText: 'For 10 points',
          offset: 3,
        }),
      ],
      'doc'
    );

    // The fix landed in the live document...
    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(gas.paragraphText(0)).toBe('1. For 10 points, name this.');

    // ...and the response carries a fresh lint (with rule metadata) rather than
    // requiring a second round-trip, and no longer flags the now-fixed text.
    expect(result.rulesMeta).toBeDefined();
    expect(
      result.diagnostics.some((d) => d.rule === 'question.ftp-format')
    ).toBe(false);
  });

  it('fixes and re-lints only the cursor-scoped question, returning its label', () => {
    gas.setDocument([
      { text: 'Tossups' },
      { text: '1. For ten points, name this thing.' },
      { text: 'ANSWER: something' },
      { text: '' },
    ]);
    gas.setCursorAtParagraph(1);

    const result = applyFixesAndRelint(
      [
        textFix(1, {
          oldText: 'For ten points',
          newText: 'For 10 points',
          offset: 3,
        }),
      ],
      'question'
    );

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(gas.paragraphText(1)).toBe('1. For 10 points, name this thing.');

    // Question mode returns the detected question's short label (proving the
    // re-lint ran through lintCurrentQuestion) and omits rule metadata. The
    // re-lint reflects the applied fix, so ftp-format no longer fires.
    expect(result.label).toBe('T1');
    expect(result.rulesMeta).toBeUndefined();
    expect(
      result.diagnostics.some((d) => d.rule === 'question.ftp-format')
    ).toBe(false);
  });

  it('returns an error and no diagnostics when the cursor is not in a question', () => {
    gas.setDocument([{ text: '1. A question.' }, { text: 'ANSWER: x' }]);
    gas.clearCursor();

    const result = applyFixesAndRelint([], 'question');

    expect(result.error).toBeDefined();
    expect(result.diagnostics).toEqual([]);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(0);
  });
});
