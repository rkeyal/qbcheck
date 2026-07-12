import { describe, it, expect } from 'vitest';
import { lint } from '../../src/core/engine.js';
import { makePacket, makeQuestion, hasDiag, findDiag } from '../helpers.js';
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

function tossupWith(text: string) {
  return makeQuestion('tossup', 1, text, 'ANSWER: thing', {
    numberParagraphIndex: 1,
    answerRuns: [plain('ANSWER: '), bu('thing')],
    tag: '<Auth, American History>',
  });
}

describe('writing.no-contractions', () => {
  it('flags contractions', () => {
    const t = tossupWith(
      "This composer can't be named. For 10 points, name this person."
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
  });

  it('passes text without contractions', () => {
    const t = tossupWith(
      'This composer cannot be named. For 10 points, name this person.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(false);
  });
});

describe('writing.no-weasel-words', () => {
  it('flags weasel words', () => {
    const t = tossupWith(
      'This famous composer wrote symphonies. For 10 points, name this person.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
  });

  it('passes text without weasel words', () => {
    const t = tossupWith(
      'This composer wrote symphonies. For 10 points, name this person.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(false);
  });
});

describe('writing.word-replacements', () => {
  it('flags lowercase replaceable word', () => {
    const t = tossupWith(
      'This composer would utilize the piano. For 10 points, name him.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.word-replacements')).toBe(true);
    expect(findDiag(diags, 'writing.word-replacements')!.message).toContain(
      'utilize'
    );
  });

  it('skips capitalized word mid-sentence (likely proper noun)', () => {
    const t = tossupWith(
      'D.W. Griffith directed Birth of a Nation in 1915. For 10 points, name this director.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    // Should not flag "Nation" since it's part of a proper noun title
    const diagCount = diags.filter(
      (d) => d.rule === 'writing.word-replacements'
    ).length;
    expect(diagCount).toBe(0);
  });

  it('flags capitalized word at sentence start', () => {
    const t = tossupWith(
      'Name a painting. Utilize means to use. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.word-replacements')).toBe(true);
  });
});

describe('writing.absolute-time', () => {
  it('flags "currently"', () => {
    const t = tossupWith(
      'This museum is currently located in Paris. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(true);
  });

  it('flags "recently"', () => {
    const t = tossupWith(
      'This country recently joined the EU. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(true);
  });

  it('passes "this year" preceded by "in"', () => {
    const t = tossupWith(
      'Something happened in this year. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(false);
  });

  it('passes "this year" preceded by "since"', () => {
    const t = tossupWith(
      'A book chronicles Europe since this year, when World War II ended. For 10 points, name it.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(false);
  });

  it('passes all "this year" when question is about a year', () => {
    const t = tossupWith(
      'A sequel about this year was published in 2024. For 10 points, name this year.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(false);
  });
});

describe('writing.answer-some-questions', () => {
  function bonusWith(text: string) {
    const b = makeQuestion('bonus', 1, text, 'ANSWER: thing', {
      numberParagraphIndex: 1,
      answerRuns: [plain('ANSWER: '), bu('thing')],
    });
    return b;
  }

  it('flags "answer some questions about"', () => {
    const b = bonusWith('Answer some questions about music.');
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.answer-some-questions')).toBe(true);
  });

  it('provides fix with correct replacement (capitalized)', () => {
    const b = bonusWith('Answer some questions about music.');
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'writing.answer-some-questions')!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.oldText).toBe('Answer some questions about');
    expect(d.fix!.newText).toBe('Answer the following about');
  });

  it('provides fix preserving lowercase', () => {
    const b = bonusWith('answer some questions about music.');
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'writing.answer-some-questions')!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.oldText).toBe('answer some questions about');
    expect(d.fix!.newText).toBe('answer the following about');
  });

  it('handles "answer some question about" (singular)', () => {
    const b = bonusWith('Answer some question about history.');
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'writing.answer-some-questions')!;
    expect(d.fix).toBeDefined();
    expect(d.fix!.oldText).toBe('Answer some question about');
    expect(d.fix!.newText).toBe('Answer the following about');
  });
});

describe('writing.would-go-on-to', () => {
  it('flags "would go on to"', () => {
    const t = tossupWith(
      'He would go on to write many novels. For 10 points, name this author.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.would-go-on-to')).toBe(true);
  });

  it('flags "went on to"', () => {
    const t = tossupWith(
      'She went on to become president. For 10 points, name this leader.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.would-go-on-to')).toBe(true);
  });

  it('passes simple past tense', () => {
    const t = tossupWith(
      'He wrote many novels. For 10 points, name this author.'
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'writing.would-go-on-to')).toBe(false);
  });
});
