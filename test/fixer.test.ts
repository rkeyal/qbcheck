import { describe, it, expect } from 'vitest';
import {
  applyFixes,
  paragraphsToHtml,
  paragraphsToPlainText,
} from '../src/core/fixer.js';
import { Paragraph, Run, LintDiagnostic, AutoFix } from '../src/core/model.js';
import { lint } from '../src/core/engine.js';
import {
  makePacket as makePacketH,
  makeQuestion as makeQuestionH,
} from './helpers.js';

function plain(text: string): Run {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    superscript: false,
    subscript: false,
  };
}

function bold(text: string): Run {
  return { ...plain(text), bold: true };
}

function italic(text: string): Run {
  return { ...plain(text), italic: true };
}

function underline(text: string): Run {
  return { ...plain(text), underline: true };
}

function boldUnderline(text: string): Run {
  return { ...plain(text), bold: true, underline: true };
}

function makePara(text: string, index: number, runs?: Run[]): Paragraph {
  return {
    index,
    runs: runs ?? [plain(text)],
    rawText: text,
    hasPageBreak: false,
  };
}

function makeDiag(
  rule: string,
  paragraph: number,
  fix?: AutoFix
): LintDiagnostic {
  return {
    rule,
    severity: 'warning',
    paragraph,
    message: 'test diagnostic',
    fix,
  };
}

// ── applyFixes ──────────────────────────────────────────────────────

describe('applyFixes', () => {
  it('returns original paragraphs when no diagnostics have fixes', () => {
    const paras = [makePara('hello world', 0)];
    const diags = [makeDiag('some.rule', 0)];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(0);
    expect(result.fixedParagraphs).toBe(paras); // same reference
    expect(result.appliedFixes).toEqual([]);
    expect(result.remainingDiagnostics).toEqual(diags);
  });

  it('returns original paragraphs when diagnostics array is empty', () => {
    const paras = [makePara('hello', 0)];
    const result = applyFixes(paras, [], []);

    expect(result.fixCount).toBe(0);
    expect(result.fixedParagraphs).toBe(paras);
  });

  it('applies a single fix to rawText', () => {
    const paras = [makePara('hello  world', 0)];
    const diags = [
      makeDiag('formatting.no-double-spaces', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(1);
    expect(result.fixedParagraphs[0].rawText).toBe('hello world');
    expect(result.appliedFixes).toHaveLength(1);
    expect(result.remainingDiagnostics).toHaveLength(0);
  });

  it('applies multiple fixes in the same paragraph (sorted by offset)', () => {
    const paras = [makePara('a  b  c', 0)];
    const diags = [
      makeDiag('formatting.no-double-spaces', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 1,
      }),
      makeDiag('formatting.no-double-spaces', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 4,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(2);
    expect(result.fixedParagraphs[0].rawText).toBe('a b c');
  });

  it('applies fixes across different paragraphs', () => {
    const paras = [makePara('hello  world', 0), makePara('foo  bar', 1)];
    const diags = [
      makeDiag('formatting.no-double-spaces', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
      makeDiag('formatting.no-double-spaces', 1, {
        oldText: '  ',
        newText: ' ',
        offset: 3,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(2);
    expect(result.fixedParagraphs[0].rawText).toBe('hello world');
    expect(result.fixedParagraphs[1].rawText).toBe('foo bar');
  });

  it('does not modify paragraphs that have no fixes', () => {
    const paras = [makePara('unchanged', 0), makePara('hello  world', 1)];
    const diags = [
      makeDiag('formatting.no-double-spaces', 1, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    // Paragraph 0 should be the exact same reference (not cloned)
    expect(result.fixedParagraphs[0]).toBe(paras[0]);
    expect(result.fixedParagraphs[1].rawText).toBe('hello world');
  });

  it('skips fixes for disabled rules', () => {
    const paras = [makePara('hello  world', 0)];
    const diags = [
      makeDiag('formatting.no-double-spaces', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
    ];

    const result = applyFixes(paras, diags, ['formatting.no-double-spaces']);

    expect(result.fixCount).toBe(0);
    expect(result.fixedParagraphs[0].rawText).toBe('hello  world');
    expect(result.remainingDiagnostics).toHaveLength(1);
  });

  it('skips fix when oldText does not match at offset', () => {
    const paras = [makePara('hello world', 0)];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: 'xx',
        newText: 'yy',
        offset: 5,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(0);
    expect(result.fixedParagraphs[0].rawText).toBe('hello world');
    expect(result.remainingDiagnostics).toHaveLength(1);
  });

  it('handles overlapping fixes by skipping the later one', () => {
    // Two fixes that overlap in the same paragraph
    const paras = [makePara('abcdef', 0)];
    const diags = [
      makeDiag('rule.a', 0, {
        oldText: 'bcd',
        newText: 'X',
        offset: 1,
      }),
      makeDiag('rule.b', 0, {
        oldText: 'cde',
        newText: 'Y',
        offset: 2,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    // Both fixes sorted descending by offset: rule.b (offset 2) applied first,
    // then rule.a (offset 1) overlaps with it and goes to remaining
    expect(result.fixCount).toBe(1);
    expect(result.remainingDiagnostics).toHaveLength(1);
  });

  it('moves fixes to remaining when paragraph index not found', () => {
    const paras = [makePara('hello', 0)];
    const diags = [
      makeDiag('test.rule', 99, {
        oldText: 'x',
        newText: 'y',
        offset: 0,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(0);
    expect(result.remainingDiagnostics).toHaveLength(1);
  });

  it('separates fixable and non-fixable diagnostics', () => {
    const paras = [makePara('hello  world', 0)];
    const diags = [
      makeDiag('formatting.no-double-spaces', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
      makeDiag('formatting.smart-quotes', 0), // no fix
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(1);
    expect(result.appliedFixes).toHaveLength(1);
    expect(result.appliedFixes[0].rule).toBe('formatting.no-double-spaces');
    expect(result.remainingDiagnostics).toHaveLength(1);
    expect(result.remainingDiagnostics[0].rule).toBe('formatting.smart-quotes');
  });

  it('applies fix that changes text length (expansion)', () => {
    const paras = [makePara('100 BC was', 0)];
    const diags = [
      makeDiag('formatting.bce-ce-system', 0, {
        oldText: '100 BC',
        newText: '100 BCE',
        offset: 0,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(1);
    expect(result.fixedParagraphs[0].rawText).toBe('100 BCE was');
  });

  it('applies fix that changes text length (contraction)', () => {
    const paras = [makePara('AD 100 was', 0)];
    const diags = [
      makeDiag('formatting.bce-ce-system', 0, {
        oldText: 'AD 100',
        newText: '100 CE',
        offset: 0,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixCount).toBe(1);
    expect(result.fixedParagraphs[0].rawText).toBe('100 CE was');
  });
});

// ── Run-level fix propagation ───────────────────────────────────────

describe('applyFixes – run-level propagation', () => {
  it('updates single-run text', () => {
    const paras = [makePara('hello  world', 0)];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixedParagraphs[0].runs[0].text).toBe('hello world');
  });

  it('preserves formatting when fix is within a formatted run', () => {
    const paras = [makePara('ANSWER:  thing', 0, [bold('ANSWER:  thing')])];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 7,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixedParagraphs[0].runs[0].text).toBe('ANSWER: thing');
    expect(result.fixedParagraphs[0].runs[0].bold).toBe(true);
  });

  it('handles fix within a middle run of multi-run paragraph', () => {
    // "Hello " (plain, 6 chars) + "beautiful  world" (bold, 16 chars) + "!" (plain)
    // Double space is at index 9 within run → global offset 6+9 = 15
    const paras = [
      makePara('Hello beautiful  world!', 0, [
        plain('Hello '),
        bold('beautiful  world'),
        plain('!'),
      ]),
    ];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 15,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixedParagraphs[0].rawText).toBe('Hello beautiful world!');
    expect(result.fixedParagraphs[0].runs[1].text).toBe('beautiful world');
    expect(result.fixedParagraphs[0].runs[1].bold).toBe(true);
  });

  it('handles fix spanning two runs', () => {
    // "hel" (plain) + "lo" (bold) → replace "ello" with "i"
    const paras = [makePara('hello', 0, [plain('hel'), bold('lo')])];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: 'ello',
        newText: 'i',
        offset: 1,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixedParagraphs[0].rawText).toBe('hi');
    // First run gets the new text; second run is removed (empty)
    expect(result.fixedParagraphs[0].runs).toHaveLength(1);
    expect(result.fixedParagraphs[0].runs[0].text).toBe('hi');
  });

  it('handles fix spanning multiple runs, preserving trailing run', () => {
    // "ab" (plain) + "cd" (bold) + "ef" (italic) → replace "bcde" with "X"
    const paras = [
      makePara('abcdef', 0, [plain('ab'), bold('cd'), italic('ef')]),
    ];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: 'bcde',
        newText: 'X',
        offset: 1,
      }),
    ];

    const result = applyFixes(paras, diags, []);

    expect(result.fixedParagraphs[0].rawText).toBe('aXf');
    // First run has "aX", last run has "f"
    const runs = result.fixedParagraphs[0].runs;
    expect(runs[0].text).toBe('aX');
    expect(runs[runs.length - 1].text).toBe('f');
    expect(runs[runs.length - 1].italic).toBe(true);
  });

  it('does not mutate original paragraph runs', () => {
    const origRuns = [plain('hello  world')];
    const paras = [makePara('hello  world', 0, origRuns)];
    const diags = [
      makeDiag('test.rule', 0, {
        oldText: '  ',
        newText: ' ',
        offset: 5,
      }),
    ];

    applyFixes(paras, diags, []);

    // Original run should be untouched
    expect(origRuns[0].text).toBe('hello  world');
  });
});

// ── paragraphsToHtml ────────────────────────────────────────────────

describe('paragraphsToHtml', () => {
  it('renders single paragraph as inline content (no <p> wrapping)', () => {
    const paras = [makePara('hello world', 0)];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('hello world');
  });

  it('renders bold run with inline style', () => {
    const paras = [makePara('hello', 0, [bold('hello')])];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('<span style="font-weight:bold">hello</span>');
  });

  it('renders italic run with inline style', () => {
    const paras = [makePara('hello', 0, [italic('hello')])];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('<span style="font-style:italic">hello</span>');
  });

  it('renders underline run with inline style', () => {
    const paras = [makePara('hello', 0, [underline('hello')])];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('<span style="text-decoration:underline">hello</span>');
  });

  it('renders combined bold+underline', () => {
    const paras = [makePara('answer', 0, [boldUnderline('answer')])];
    const html = paragraphsToHtml(paras);
    expect(html).toBe(
      '<span style="font-weight:bold;text-decoration:underline">answer</span>'
    );
  });

  it('renders superscript with vertical-align and font-size', () => {
    const run: Run = { ...plain('2'), superscript: true };
    const paras = [makePara('2', 0, [run])];
    const html = paragraphsToHtml(paras);
    expect(html).toBe(
      '<span style="vertical-align:super;font-size:smaller">2</span>'
    );
  });

  it('renders subscript with vertical-align and font-size', () => {
    const run: Run = { ...plain('2'), subscript: true };
    const paras = [makePara('2', 0, [run])];
    const html = paragraphsToHtml(paras);
    expect(html).toBe(
      '<span style="vertical-align:sub;font-size:smaller">2</span>'
    );
  });

  it('renders mixed runs preserving formatting', () => {
    const paras = [
      makePara('ANSWER: thing', 0, [plain('ANSWER: '), boldUnderline('thing')]),
    ];
    const html = paragraphsToHtml(paras);
    expect(html).toBe(
      'ANSWER: <span style="font-weight:bold;text-decoration:underline">thing</span>'
    );
  });

  it('wraps all but last paragraph in <p> tags', () => {
    const paras = [makePara('first', 0), makePara('second', 1)];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('<p style="margin:0">first</p>\nsecond');
  });

  it('preserves empty paragraphs between content with \u00A0', () => {
    const paras = [
      makePara('first', 0),
      makePara('', 1),
      makePara('second', 2),
    ];
    const html = paragraphsToHtml(paras);
    expect(html).toBe(
      '<p style="margin:0">first</p>\n<p style="margin:0">\u00A0</p>\nsecond'
    );
  });

  it('strips trailing empty paragraphs', () => {
    const paras = [makePara('content', 0), makePara('', 1)];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('content');
  });

  it('escapes HTML special characters', () => {
    const paras = [makePara('<script>"&', 0)];
    const html = paragraphsToHtml(paras);
    expect(html).toBe('&lt;script&gt;&quot;&amp;');
  });
});

// ── paragraphsToPlainText ───────────────────────────────────────────

describe('paragraphsToPlainText', () => {
  it('joins paragraph rawText with newlines', () => {
    const paras = [makePara('line one', 0), makePara('line two', 1)];
    const text = paragraphsToPlainText(paras);
    expect(text).toBe('line one\nline two');
  });

  it('returns single paragraph without newline', () => {
    const paras = [makePara('only line', 0)];
    const text = paragraphsToPlainText(paras);
    expect(text).toBe('only line');
  });
});

// ── Integration: rules produce correct fix data ─────────────────────

describe('auto-fix integration with lint rules', () => {
  function tossupWith(text: string, answerText?: string) {
    const answer = answerText ?? 'ANSWER: thing';
    return makeQuestionH('tossup', 1, text, answer, {
      numberParagraphIndex: 1,
      answerRuns: [plain('ANSWER: '), boldUnderline('thing')],
      tag: '<Auth, American History>',
    });
  }

  it('formatting.no-double-spaces produces fixable diagnostic', () => {
    const t = tossupWith('For 10 points,  name this thing.');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const fixable = diags.filter(
      (d) => d.rule === 'formatting.no-double-spaces' && d.fix
    );

    expect(fixable.length).toBeGreaterThan(0);
    const fix = fixable[0].fix!;
    expect(fix.oldText).toBe('  ');
    expect(fix.newText).toBe(' ');
  });

  it('formatting.no-double-spaces fix applies correctly', () => {
    const t = tossupWith('For 10 points,  name this thing.');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const result = applyFixes(packet.allParagraphs, diags, []);

    // The double-space should be fixed
    const fixedPara = result.fixedParagraphs.find(
      (p) => p.index === t.numberParagraph.index
    );
    expect(fixedPara).toBeDefined();
    expect(fixedPara!.rawText).not.toContain('  ');
  });

  it('formatting.no-em-dash produces fixable diagnostic', () => {
    const t = tossupWith('For 10 points\u2014name this thing.');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const fixable = diags.filter(
      (d) => d.rule === 'formatting.no-em-dash' && d.fix
    );

    expect(fixable.length).toBeGreaterThan(0);
    expect(fixable[0].fix!.newText).toContain('\u2013'); // en dash
  });

  it('question.ftp-format produces fixable diagnostic for "ten points"', () => {
    const t = tossupWith('For ten points, name this thing.');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const fixable = diags.filter(
      (d) => d.rule === 'question.ftp-format' && d.fix
    );

    expect(fixable.length).toBeGreaterThan(0);
    const fix = fixable[0].fix!;
    expect(fix.oldText.toLowerCase()).toContain('ten');
    expect(fix.newText).toContain('10');
  });

  it('question.ftp-format fix preserves casing', () => {
    const t = tossupWith('for ten points, name this thing.');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const fixable = diags.filter(
      (d) => d.rule === 'question.ftp-format' && d.fix
    );

    expect(fixable.length).toBeGreaterThan(0);
    // lowercase "for" should produce lowercase "for" in fix
    expect(fixable[0].fix!.newText).toMatch(/^for 10 points$/i);
  });

  it('question.power-mark fix adds space before (*)', () => {
    const t = tossupWith(
      'This clue is here.(*) For 10 points, name this thing.'
    );
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const fixable = diags.filter(
      (d) => d.rule === 'question.power-mark' && d.fix
    );

    expect(fixable.length).toBeGreaterThan(0);
    expect(fixable[0].fix!.oldText).toBe('(*)');
    expect(fixable[0].fix!.newText).toBe(' (*)');
  });

  it('answerline.answer-prefix produces fixable diagnostic for wrong case', () => {
    const t = tossupWith('For 10 points, name this thing.', 'Answer: thing');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    const fixable = diags.filter(
      (d) => d.rule === 'answerline.answer-prefix' && d.fix
    );

    expect(fixable.length).toBeGreaterThan(0);
    // "Answer:" → "ANSWER:" (case fix only, space already present)
    expect(fixable[0].fix!.newText).toBe('ANSWER:');
  });

  it('end-to-end: apply all fixes and verify remaining diagnostics', () => {
    // Create a question with multiple fixable issues
    const t = tossupWith('For ten points,  name this thing.', 'ANSWER: thing');
    const packet = makePacketH({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);

    const fixableBefore = diags.filter((d) => d.fix);
    const nonFixableBefore = diags.filter((d) => !d.fix);

    const result = applyFixes(packet.allParagraphs, diags, []);

    // All fixable should be applied (or in remaining if overlapping)
    expect(
      result.fixCount + result.remainingDiagnostics.filter((d) => d.fix).length
    ).toBe(fixableBefore.length);

    // Non-fixable should all remain
    for (const d of nonFixableBefore) {
      expect(result.remainingDiagnostics).toContainEqual(d);
    }
  });
});
