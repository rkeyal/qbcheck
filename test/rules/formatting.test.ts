import { describe, it, expect } from 'vitest';
import { lint } from '../../src/core/engine.js';
import { makePacket, makeQuestion, hasDiag } from '../helpers.js';
import { Run } from '../../src/core/model.js';

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
function bu(text: string): Run {
  return {
    text,
    bold: true,
    italic: false,
    underline: true,
    superscript: false,
    subscript: false,
  };
}

function tossupWith(text: string, answerRuns?: Run[]) {
  return makeQuestion('tossup', 1, text, 'ANSWER: thing', {
    numberParagraphIndex: 1,
    answerRuns: answerRuns ?? [plain('ANSWER: '), bu('thing')],
    tag: '<Auth, American History>',
  });
}

describe('formatting.smart-quotes', () => {
  it('flags straight double quotes', () => {
    const t = tossupWith('For 10 points, name this "thing".');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.smart-quotes')).toBe(true);
  });

  it('passes curly quotes', () => {
    const t = tossupWith('For 10 points, name this \u201cthing.\u201d');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const smartDiags = diags.filter(
      (d) =>
        d.rule === 'formatting.smart-quotes' &&
        d.message.includes('typographic')
    );
    // The first smart-quotes diagnostic about double quotes should not fire
    expect(smartDiags.some((d) => d.message.includes('straight quotes'))).toBe(
      false
    );
  });
});

describe('formatting.no-em-dash', () => {
  it('flags em dashes', () => {
    const t = tossupWith('For 10 points, name this thing\u2014a great one.');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('passes en dashes', () => {
    const t = tossupWith('For 10 points, name this thing \u2013 a great one.');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(false);
  });
});

describe('formatting.no-double-spaces', () => {
  it('flags double spaces', () => {
    const t = tossupWith('For 10 points,  name this thing.');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-double-spaces')).toBe(true);
  });

  it('passes single spaces', () => {
    const t = tossupWith('For 10 points, name this thing.');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-double-spaces')).toBe(false);
  });
});

describe('formatting.no-latin-abbrev', () => {
  it('flags e.g.', () => {
    const t = tossupWith('For 10 points, name this thing, e.g. a widget.');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-latin-abbrev')).toBe(true);
  });

  it('flags i.e.', () => {
    const t = tossupWith('For 10 points, name this thing, i.e. the widget.');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-latin-abbrev')).toBe(true);
  });
});

describe('formatting.bce-ce-system', () => {
  it('flags BC usage', () => {
    const t = tossupWith(
      'This battle occurred in 490 BC. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(true);
  });

  it('flags AD usage', () => {
    const t = tossupWith(
      'This event occurred in AD 476. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(true);
  });

  it('passes BCE/CE', () => {
    const t = tossupWith(
      'This battle occurred in 490 BCE. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(false);
  });
});

describe('formatting.no-format-bleeding', () => {
  it('flags bold with leading space', () => {
    const boldWithLeading: Run = {
      text: ' bold text',
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const t = makeQuestion('tossup', 1, 'test', 'ANSWER: thing', {
      numberParagraphIndex: 1,
      numberRuns: [plain('1. For 10 points,'), boldWithLeading],
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-format-bleeding')).toBe(true);
  });

  it('flags underline with trailing space at warning severity', () => {
    const ulWithTrailing: Run = {
      text: 'underlined text ',
      bold: false,
      italic: false,
      underline: true,
      superscript: false,
      subscript: false,
    };
    const t = makeQuestion('tossup', 1, 'test', 'ANSWER: thing', {
      numberParagraphIndex: 1,
      numberRuns: [
        plain('1. For 10 points, '),
        ulWithTrailing,
        plain('name this.'),
      ],
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const diag = diags.find(
      (d) => d.rule === 'formatting.no-format-bleeding-underline'
    );
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('warning'); // Underline is more severe
  });

  it('passes formatting without bleeding spaces', () => {
    const boldNoSpace: Run = {
      text: 'bold text',
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const t = makeQuestion('tossup', 1, 'test', 'ANSWER: thing', {
      numberParagraphIndex: 1,
      numberRuns: [plain('1. For 10 points, '), boldNoSpace, plain(' here.')],
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'formatting.no-format-bleeding')).toBe(false);
  });

  it('should NOT flag italic title WITHOUT spaces within bold text', () => {
    const bold = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    });
    const boldItalic = (text: string): Run => ({
      text,
      bold: true,
      italic: true,
      underline: false,
      superscript: false,
      subscript: false,
    });

    // Pattern: bold text with italic title that has NO spaces
    // The spaces are in the adjacent bold runs
    const questionText = '1. This novel by The Great Gatsby features Jay.';
    const t = makeQuestion('tossup', 1, 'test', 'ANSWER: thing', {
      numberParagraphIndex: 1,
      numberRuns: [
        bold('1. This novel by '), // Space at end
        boldItalic('The Great Gatsby'), // NO spaces in italic
        bold(' features Jay.'), // Space at beginning
      ],
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    // Override the rawText to match our runs
    t.numberParagraph.rawText = questionText;
    t.paragraphs[0].rawText = questionText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - the italic run has no leading/trailing spaces
    // The adjacent bold runs share the bold formatting, so spaces at boundaries are OK
    expect(bleedingDiags.length).toBe(0);
  });

  it('should NOT flag underlined answer followed by bold directive', () => {
    const bold = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    });

    // Common pattern in answer lines: bold+underline answer followed by bold directive
    const answerText = 'ANSWER: The Great Gatsby [accept answers]';
    const t = makeQuestion('tossup', 1, 'test', answerText, {
      numberParagraphIndex: 1,
      answerRuns: [
        plain('ANSWER: '),
        bu('The Great Gatsby'), // Bold+underline, NO trailing space
        plain(' [accept '),
        bold('answers'), // Bold only
        plain(']'),
      ],
    });
    // Override the rawText to match our runs
    t.answerLine!.rawText = answerText;
    t.paragraphs[1].rawText = answerText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - the underlined answer has no trailing space
    expect(bleedingDiags.length).toBe(0);
  });

  it('SHOULD flag underlined answer WITH trailing space followed by plain text', () => {
    // This IS actual bleeding - underline on a space before plain text
    const answerText = 'ANSWER: The Great Gatsby [accept answers]';
    const ulWithSpace = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: true,
      superscript: false,
      subscript: false,
    });

    const t = makeQuestion('tossup', 1, 'test', answerText, {
      numberParagraphIndex: 1,
      answerRuns: [
        plain('ANSWER: '),
        ulWithSpace('The Great Gatsby '), // Bold+underline WITH trailing space
        plain('[accept answers]'), // Plain text - doesn't share underline
      ],
    });
    t.answerLine!.rawText = answerText;
    t.paragraphs[1].rawText = answerText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding-underline'
    );

    // SHOULD flag - underline is bleeding onto the trailing space
    expect(bleedingDiags.length).toBeGreaterThan(0);
    expect(bleedingDiags[0].severity).toBe('warning'); // Underline is high severity
  });

  it('should NOT flag multiple underlined answers separated by bold text', () => {
    // Pattern: [accept bold+underline; accept bold+underline]
    const answerText = 'ANSWER: thing [accept foo; accept bar]';
    const t = makeQuestion('tossup', 1, 'test', answerText, {
      numberParagraphIndex: 1,
      answerRuns: [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept '),
        bu('foo'), // No trailing space
        plain('; accept '),
        bu('bar'), // No trailing space
        plain(']'),
      ],
    });
    t.answerLine!.rawText = answerText;
    t.paragraphs[1].rawText = answerText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - no underlined runs have leading/trailing spaces
    expect(bleedingDiags.length).toBe(0);
  });

  it('should NOT flag bold spaces adjacent to unbolded pronunciation guide', () => {
    const bold = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    });

    // Pattern: bold text ("PG") *
    // When PG is unbolded, spaces around it may remain bold
    const questionText = '1. This composer ("BAHK") *wrote music.';
    const t = makeQuestion('tossup', 1, 'test', 'ANSWER: thing', {
      numberParagraphIndex: 1,
      numberRuns: [
        bold('1. This composer '), // Bold with trailing space before PG
        plain('("BAHK")'), // Unbolded PG
        bold(' *'), // Bold with leading space after PG (power mark)
        plain('wrote music.'),
      ],
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    t.numberParagraph.rawText = questionText;
    t.paragraphs[0].rawText = questionText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - bolded spaces adjacent to PG are acceptable
    expect(bleedingDiags.length).toBe(0);
  });

  it('should NOT flag bold spaces adjacent to pronunciation guide with smart quotes', () => {
    const bold = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    });

    // Pattern with smart quotes: bold text (\u201cPG\u201d) *
    const questionText = '1. This composer (\u201cBAHK\u201d) *wrote music.';
    const t = makeQuestion('tossup', 1, 'test', 'ANSWER: thing', {
      numberParagraphIndex: 1,
      numberRuns: [
        bold('1. This composer '), // Bold with trailing space
        plain('(\u201cBAHK\u201d)'), // Unbolded PG with smart quotes
        bold(' *'), // Bold with leading space
        plain('wrote music.'),
      ],
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    t.numberParagraph.rawText = questionText;
    t.paragraphs[0].rawText = questionText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - bolded spaces adjacent to PG are acceptable
    expect(bleedingDiags.length).toBe(0);
  });

  it('should NOT flag bold spaces adjacent to unbolded directives like [emphasize]', () => {
    const bold = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    });

    // Pattern: bold answer [unbolded directive] bold answer
    // Common in answer lines where directives are not bolded
    const answerText = 'ANSWER: The Great Gatsby [emphasize] or The Gatsby';
    const t = makeQuestion('tossup', 1, 'test', answerText, {
      numberParagraphIndex: 1,
      answerRuns: [
        plain('ANSWER: '),
        bu('The Great Gatsby'), // Bold+underlined answer
        bold(' '), // Bold space before directive
        plain('[emphasize]'), // Unbolded directive
        bold(' '), // Bold space after directive
        bu('or The Gatsby'), // Bold+underlined alternative
      ],
    });
    t.answerLine!.rawText = answerText;
    t.paragraphs[1].rawText = answerText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - bolded spaces adjacent to directives are acceptable
    expect(bleedingDiags.length).toBe(0);
  });

  it('should NOT flag bold spaces adjacent to other common directives', () => {
    const bold = (text: string): Run => ({
      text,
      bold: true,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    });

    // Test with [prompt on] directive
    const answerText = 'ANSWER: thing [prompt on partial answer]';
    const t = makeQuestion('tossup', 1, 'test', answerText, {
      numberParagraphIndex: 1,
      answerRuns: [
        plain('ANSWER: '),
        bu('thing'), // Bold+underlined answer
        bold(' '), // Bold space before directive
        plain('[prompt on partial answer]'), // Unbolded directive
      ],
    });
    t.answerLine!.rawText = answerText;
    t.paragraphs[1].rawText = answerText;

    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);

    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );

    // Should NOT flag - bolded spaces adjacent to directives are acceptable
    expect(bleedingDiags.length).toBe(0);
  });
});
