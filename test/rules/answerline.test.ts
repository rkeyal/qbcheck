import { describe, it, expect } from 'vitest';
import { lint } from '../../src/core/engine.js';
import { makePacket, makeQuestion, hasDiag } from '../helpers.js';
import { Run } from '../../src/core/model.js';

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
function ul(text: string): Run {
  return {
    text,
    bold: false,
    italic: false,
    underline: true,
    superscript: false,
    subscript: false,
  };
}

function tossupWithAnswer(answer: string, answerRuns?: Run[]) {
  return makeQuestion('tossup', 1, 'For 10 points, name this.', answer, {
    numberParagraphIndex: 1,
    answerRuns,
  });
}

describe('answerline.answer-prefix', () => {
  it("flags lowercase 'answer:'", () => {
    const t = tossupWithAnswer('answer: thing');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.answer-prefix')).toBe(true);
  });

  it("passes 'ANSWER: '", () => {
    const t = tossupWithAnswer('ANSWER: thing', [
      plain('ANSWER: '),
      bu('thing'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.answer-prefix')).toBe(false);
  });
});

describe('answerline.bracket-balance', () => {
  it('flags unbalanced brackets', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept stuff'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.bracket-balance')).toBe(true);
  });

  it('passes balanced brackets', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('stuff'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.bracket-balance')).toBe(false);
  });
});

describe('answerline.answer-formatting', () => {
  it('flags answer without bold/underline', () => {
    const t = tossupWithAnswer('ANSWER: thing', [plain('ANSWER: thing')]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.answer-formatting')).toBe(true);
  });

  it('passes bold+underlined answer', () => {
    const t = tossupWithAnswer('ANSWER: thing', [
      plain('ANSWER: '),
      bu('thing'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.answer-formatting')).toBe(false);
  });
});

describe('answerline.directive-typo', () => {
  it('flags typo in directive', () => {
    const t = tossupWithAnswer('ANSWER: thing [acept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [acept other]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-typo')).toBe(true);
  });
});

describe('answerline.deprecated-directive', () => {
  it("flags 'do not accept'", () => {
    const t = tossupWithAnswer('ANSWER: thing [do not accept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [do not accept other]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.filter((d) => d.rule === 'answerline.deprecated-directive');
    expect(d.length).toBeGreaterThan(0);
    expect(d.some((dd) => dd.message.includes('do not accept'))).toBe(true);
  });

  it("flags 'anti-prompt'", () => {
    const t = tossupWithAnswer('ANSWER: thing [anti-prompt on other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [anti-prompt on '),
      ul('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(
      diags.some(
        (d) =>
          d.rule === 'answerline.deprecated-directive' &&
          d.message.includes('anti-prompt')
      )
    ).toBe(true);
  });
});

describe('answerline.directive-separator', () => {
  it('flags directive separated by comma instead of semicolon', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff, accept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('stuff'),
      plain(', accept '),
      bu('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(true);
  });

  it('passes directive separated by semicolon', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff; accept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('stuff'),
      plain('; accept '),
      bu('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });

  it('passes "or" within a directive', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff or other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('stuff'),
      plain(' or '),
      bu('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });

  it('does not flag first directive', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('stuff'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });
});

describe('answerline.reject-no-alone', () => {
  it('flags "alone" after reject directive', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject "Persians" alone]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject "Persians" alone]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-no-alone')).toBe(true);
  });

  it('passes reject without "alone"', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject "Persians"]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject "Persians"]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-no-alone')).toBe(false);
  });
});

describe('answerline.directive-brackets', () => {
  it('flags accept directive in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: thing (accept stuff)', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' (accept stuff)'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(true);
  });

  it('flags reject directive in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: thing (reject "wrong")', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' (reject "wrong")'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(true);
  });

  it('flags prompt directive in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: thing (prompt on partial)', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' (prompt on partial)'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(true);
  });

  it('flags or directive in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: thing (or other thing)', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' (or other thing)'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(true);
  });

  it('flags "do not accept" directive in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: thing (do not accept "wrong")', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' (do not accept "wrong")'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(true);
  });

  it('flags anti-prompt directive in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: thing (anti-prompt on partial)', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' (anti-prompt on partial)'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(true);
  });

  it('passes directives in square brackets', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept stuff]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept stuff]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(false);
  });

  it('passes pronunciation guides in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: Goethe ("GUR-tuh")', [
      plain('ANSWER: '),
      bu('Goethe'),
      plain(' ("GUR-tuh")'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(false);
  });

  it('passes parenthetical notes without directives', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept stuff] (note: something)',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept stuff] (note: something)'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(false);
  });

  it('passes subtitle in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: The Great Gatsby (by F. Scott Fitzgerald)', [
      plain('ANSWER: '),
      bu('The Great Gatsby'),
      plain(' (by F. Scott Fitzgerald)'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(false);
  });
});
