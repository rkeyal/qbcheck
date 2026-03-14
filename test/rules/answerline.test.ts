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

  it('provides fix for "do not accept" → "reject"', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [do not accept "wrong"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [do not accept "wrong"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.find(
      (d) =>
        d.rule === 'answerline.deprecated-directive' &&
        d.message.includes('do not accept')
    )!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.newText).toBe('reject "wrong"');
  });

  it('provides fix for "do not prompt" → "reject"', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [do not prompt "wrong"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [do not prompt "wrong"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.find(
      (d) =>
        d.rule === 'answerline.deprecated-directive' &&
        d.message.includes('do not prompt')
    )!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.newText).toBe('reject "wrong"');
  });

  it('does not provide fix for "anti-prompt"', () => {
    const t = tossupWithAnswer('ANSWER: thing [anti-prompt on other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [anti-prompt on '),
      ul('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.find(
      (d) =>
        d.rule === 'answerline.deprecated-directive' &&
        d.message.includes('anti-prompt')
    )!;
    expect(d.fix).toBeUndefined();
  });

  it("flags 'do not accept or prompt on' with full phrase", () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [do not accept or prompt on other]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [do not accept or prompt on other]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.filter(
      (d) => d.rule === 'answerline.deprecated-directive'
    );
    expect(d.length).toBeGreaterThan(0);
    expect(
      d.some((dd) => dd.message.includes('do not accept or prompt on'))
    ).toBe(true);
  });

  it('provides fix for "do not accept or prompt on" → "reject"', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [do not accept or prompt on "wrong"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [do not accept or prompt on "wrong"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.find(
      (d) =>
        d.rule === 'answerline.deprecated-directive' &&
        d.message.includes('do not accept or prompt on')
    )!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.newText).toBe('reject "wrong"');
  });

  it('does not fire directive-separator for "do not accept or prompt on"', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [do not accept or prompt on other]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [do not accept or prompt on other]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(
      diags.some((d) => d.rule === 'answerline.directive-separator')
    ).toBe(false);
  });

  it('does not provide fix for meta-directive deprecations', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept in either order]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept in either order]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.find(
      (d) =>
        d.rule === 'answerline.deprecated-directive' &&
        d.message.includes('accept in either order')
    )!;
    expect(d.fix).toBeUndefined();
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

  it('does not flag "and prompt" in conditional phrasing', () => {
    const t = tossupWithAnswer(
      'ANSWER: styrene [accept vinylbenzene until "vinyl" is read and prompt on it afterwards]',
      [
        plain('ANSWER: '),
        bu('styrene'),
        plain(
          ' [accept vinylbenzene until "vinyl" is read and prompt on it afterwards]'
        ),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });

  it('does not flag "or reject" conjunction', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept stuff; prompt on X; or reject "Y"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept stuff; prompt on X; or reject "Y"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });

  it('does not flag "but reject" conjunction', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on momentum, but reject "linear momentum"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on momentum, but reject "linear momentum"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });

  it("does not flag \"don't accept\" as directive", () => {
    const t = tossupWithAnswer(
      "ANSWER: 260 nanometers [accept just 260, but if they say any other units don't accept the answer]",
      [
        plain('ANSWER: '),
        bu('260 nanometers'),
        plain(
          " [accept just 260, but if they say any other units don't accept the answer]"
        ),
      ]
    );
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

  it('provides fix that removes " alone"', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject "Persians" alone]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject "Persians" alone]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.find((d) => d.rule === 'answerline.reject-no-alone')!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.oldText).toBe('"Persians" alone');
    expect(d.fix!.newText).toBe('"Persians"');
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
    const t = tossupWithAnswer(
      'ANSWER: The Great Gatsby (by F. Scott Fitzgerald)',
      [
        plain('ANSWER: '),
        bu('The Great Gatsby'),
        plain(' (by F. Scott Fitzgerald)'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-brackets')).toBe(false);
  });
});

describe('answerline.accept-formatting', () => {
  it('flags accept directive text without bold+underline formatting', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept other]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.accept-formatting')).toBe(true);
  });

  it('passes accept directive text with bold+underline formatting', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.accept-formatting')).toBe(false);
  });

  it('skips meta-instructions like "either answer"', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept either answer]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept either answer]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.accept-formatting')).toBe(false);
  });

  it('flags or directive text without bold+underline formatting', () => {
    const t = tossupWithAnswer('ANSWER: thing [or other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [or other]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.accept-formatting')).toBe(true);
  });
});

describe('answerline.prompt-formatting', () => {
  it('flags prompt directive text without underline formatting', () => {
    const t = tossupWithAnswer('ANSWER: thing [prompt on partial]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [prompt on partial]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-formatting')).toBe(true);
  });

  it('passes prompt directive text with underline formatting', () => {
    const t = tossupWithAnswer('ANSWER: thing [prompt on partial]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [prompt on '),
      ul('partial'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-formatting')).toBe(false);
  });

  it('only checks text before "by asking" for formatting', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on partial by asking "what kind?"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(' by asking "what kind?"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-formatting')).toBe(false);
  });
});

describe('answerline.reject-quotes', () => {
  it('flags reject directive text not wrapped in quotes', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject wrong]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject wrong]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(true);
  });

  it('passes reject directive text wrapped in quotes', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject "wrong"]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject "wrong"]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(false);
  });

  it('skips descriptive rejects like "answers like..."', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [reject answers like anything else]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [reject answers like anything else]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(false);
  });
});

describe('answerline.prompt-question-quotes', () => {
  it('flags "by asking" question text not wrapped in quotes', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on partial by asking what kind]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(' by asking what kind]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-question-quotes')).toBe(true);
  });

  it('passes "by asking" question text wrapped in quotes', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on partial by asking "what kind?"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(' by asking "what kind?"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-question-quotes')).toBe(false);
  });

  it('does not fire when there is no "by asking" clause', () => {
    const t = tossupWithAnswer('ANSWER: thing [prompt on partial]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [prompt on '),
      ul('partial'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-question-quotes')).toBe(false);
  });
});

describe('answerline.prompt-with-not-by-asking', () => {
  it('flags prompt directive using "with" followed by a quote', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on partial with "what kind?"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(' with "what kind?"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-with-not-by-asking')).toBe(true);
  });

  it('passes prompt directive using "by asking"', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on partial by asking "what kind?"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(' by asking "what kind?"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-with-not-by-asking')).toBe(false);
  });
});

describe('answerline.prompt-partial-answers', () => {
  it('flags prompt directive containing "partial answer"', () => {
    const t = tossupWithAnswer('ANSWER: thing [prompt on partial answer]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [prompt on partial answer]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-partial-answers')).toBe(true);
  });

  it('passes prompt directive without "partial answer"', () => {
    const t = tossupWithAnswer('ANSWER: thing [prompt on something]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [prompt on '),
      ul('something'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.prompt-partial-answers')).toBe(false);
  });
});

describe('answerline.post-notes', () => {
  it('flags text after last bracket not wrapped in parentheses', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept other] note about this',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept '),
        bu('other'),
        plain('] note about this'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.post-notes')).toBe(true);
  });

  it('passes text after last bracket wrapped in parentheses', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept other] (note about this)',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept '),
        bu('other'),
        plain('] (note about this)'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.post-notes')).toBe(false);
  });

  it('passes when there is no text after the last bracket', () => {
    const t = tossupWithAnswer('ANSWER: thing [accept other]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [accept '),
      bu('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.post-notes')).toBe(false);
  });
});

describe('answerline.post-note-no-quote-start', () => {
  it('flags parenthesized post-note starting with a quotation mark', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept other] ("GUR-tuh")',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept '),
        bu('other'),
        plain('] ("GUR-tuh")'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.post-note-no-quote-start')).toBe(true);
  });

  it('passes parenthesized post-note not starting with a quotation mark', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept other] (accept after the clue)',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept '),
        bu('other'),
        plain('] (accept after the clue)'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.post-note-no-quote-start')).toBe(false);
  });
});

describe('answerline.no-parenthetical-optional', () => {
  it('flags short parenthesized optional parts in the answer text', () => {
    const t = tossupWithAnswer(
      'ANSWER: The Great (American) Novel [accept other]',
      [
        plain('ANSWER: '),
        bu('The Great (American) Novel'),
        plain(' [accept '),
        bu('other'),
        plain(']'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.no-parenthetical-optional')).toBe(true);
  });

  it('passes pronunciation guides in parentheses', () => {
    const t = tossupWithAnswer('ANSWER: Goethe ("GUR-tuh") [accept other]', [
      plain('ANSWER: '),
      bu('Goethe'),
      plain(' ("GUR-tuh") [accept '),
      bu('other'),
      plain(']'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.no-parenthetical-optional')).toBe(false);
  });

  it('passes single-character parenthesized content', () => {
    const t = tossupWithAnswer(
      'ANSWER: vitamin (D) supplements [accept other]',
      [
        plain('ANSWER: '),
        bu('vitamin (D) supplements'),
        plain(' [accept '),
        bu('other'),
        plain(']'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.no-parenthetical-optional')).toBe(false);
  });
});
