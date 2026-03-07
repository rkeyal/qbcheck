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
