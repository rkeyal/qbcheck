import { describe, it, expect } from 'vitest';
import { lint } from '../../src/core/engine.js';
import { makePacket, makeQuestion, hasDiag, findDiag } from '../helpers.js';
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

  it('does not flag "don’t accept" with a curly apostrophe', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [accept just X, but if they say Y don’t accept the answer]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [accept just X, but if they say Y don’t accept the answer]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(false);
  });

  it('flags a semicolon misplaced inside a closing quote', () => {
    // The separator belongs outside the quotes, so this is not correctly
    // separated: "…“chlorine;” accept…".
    const t = tossupWithAnswer(
      'ANSWER: thing [accept Cl in place of “chlorine;” accept Br in place of “bromine”]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(
          ' [accept Cl in place of “chlorine;” accept Br in place of “bromine”]'
        ),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.directive-separator')).toBe(true);
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

  it('passes multiple quoted rejected answers joined by "or"', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject "A" or "B"]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject "A" or "B"]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(false);
  });

  it('flags a quoted reject followed by explanatory prose', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [reject "disproportionation", the opposite]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [reject "disproportionation", the opposite]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(true);
  });

  it('passes quoted alternatives with pronunciations or qualifiers', () => {
    for (const directive of [
      'reject "alkenes" ("al-keens")',
      'reject "gut microbiome" or equivalents',
      'reject "little g" or "lowercase g" or equivalents',
    ]) {
      const t = tossupWithAnswer(`ANSWER: thing [${directive}]`, [
        plain('ANSWER: '),
        bu('thing'),
        plain(` [${directive}]`),
      ]);
      const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
      const diags = lint(packet);
      expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(false);
    }
  });

  it('skips class-level rejects (synonyms, specific X, other X)', () => {
    for (const directive of [
      'reject synonyms',
      'reject specific metals other than iron',
      'reject other problems of consciousness',
    ]) {
      const t = tossupWithAnswer(`ANSWER: thing [${directive}]`, [
        plain('ANSWER: '),
        bu('thing'),
        plain(` [${directive}]`),
      ]);
      const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
      const diags = lint(packet);
      expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(false);
    }
  });

  it('skips descriptive class rejects that cite a quoted example', () => {
    for (const directive of [
      'reject answers mentioning "gulags"',
      'reject descriptions like "founding of Manhattan"',
      'reject other allotropes such as "nanotubes"',
      'reject the specific phrases "no-slip" or "no-slip condition"',
    ]) {
      const t = tossupWithAnswer(`ANSWER: thing [${directive}]`, [
        plain('ANSWER: '),
        bu('thing'),
        plain(` [${directive}]`),
      ]);
      const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
      const diags = lint(packet);
      expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(false);
    }
  });

  it('flags a quoted reject glued to a reason or condition clause', () => {
    for (const directive of [
      'reject "Helmholtz free energy" as temperature is not held constant',
      'reject "gyroscopes" after "bubble" is read',
    ]) {
      const t = tossupWithAnswer(`ANSWER: thing [${directive}]`, [
        plain('ANSWER: '),
        bu('thing'),
        plain(` [${directive}]`),
      ]);
      const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
      const diags = lint(packet);
      expect(hasDiag(diags, 'answerline.reject-quotes')).toBe(true);
    }
  });

  it('reports an unclosed quote as unbalanced, not as extra prose', () => {
    const t = tossupWithAnswer('ANSWER: thing [reject "unclosed answer]', [
      plain('ANSWER: '),
      bu('thing'),
      plain(' [reject "unclosed answer]'),
    ]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const diag = findDiag(diags, 'answerline.reject-quotes');
    expect(diag).toBeTruthy();
    expect(diag!.message).toContain('Unbalanced quotes');
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
    const diag = findDiag(diags, 'answerline.prompt-question-quotes');
    expect(diag).toBeTruthy();
    expect(diag!.message).toContain('should be wrapped in quotes');
  });

  it('reports a partially quoted question as unbalanced, not unquoted', () => {
    const t = tossupWithAnswer(
      'ANSWER: thing [prompt on partial by asking for what kind?"]',
      [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(' by asking for what kind?"]'),
      ]
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const diag = findDiag(diags, 'answerline.prompt-question-quotes');
    expect(diag).toBeTruthy();
    expect(diag!.message).toContain('unbalanced quote');
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

  it('passes a quoted question with trailing punctuation or prose', () => {
    for (const asking of [
      'by asking "what kind"?',
      'by asking "what kind?" prompt on the general form',
      'by asking, "what kind?"',
    ]) {
      const t = tossupWithAnswer(`ANSWER: thing [prompt on partial ${asking}]`, [
        plain('ANSWER: '),
        bu('thing'),
        plain(' [prompt on '),
        ul('partial'),
        plain(` ${asking}]`),
      ]);
      const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
      const diags = lint(packet);
      expect(hasDiag(diags, 'answerline.prompt-question-quotes')).toBe(false);
    }
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
