import { describe, it, expect } from 'vitest';
import { lint } from '../../src/core/engine.js';
import {
  makePacket,
  makeQuestion,
  makeBonusPart,
  makeParagraph,
  hasDiag,
  findDiag,
} from '../helpers.js';

describe('question.ftp-format', () => {
  it("flags 'For ten points' (words instead of numerals)", () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For ten points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'question.ftp-format');
    expect(d).toBeDefined();
    expect(d!.message).toContain('numerals');
  });

  it("passes 'For 10 points,'", () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    // Should not have the "missing FTP" or "ten points" errors
    const ftpDiags = diags.filter((d) => d.rule === 'question.ftp-format');
    const hasMissing = ftpDiags.some(
      (d) => d.message.includes('missing') || d.message.includes('numerals')
    );
    expect(hasMissing).toBe(false);
  });
});

describe('question.missing-answer', () => {
  it('flags tossup without answer line', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this.',
      'ANSWER: x',
      { numberParagraphIndex: 1 }
    );
    t.answerLine = null;
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-answer')).toBe(true);
  });

  it('passes tossup with answer line', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this.',
      'ANSWER: x',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-answer')).toBe(false);
  });
});

describe('question.power-mark', () => {
  it('flags missing power mark when packet uses power', () => {
    const t1 = makeQuestion(
      'tossup',
      1,
      'Clue one (*) For 10 points, name this.',
      'ANSWER: x',
      { numberParagraphIndex: 10 }
    );
    const t2 = makeQuestion(
      'tossup',
      2,
      'For 10 points, name that.',
      'ANSWER: y',
      { numberParagraphIndex: 20 }
    );
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.power-mark')).toBe(true);
  });
});

describe('question.bonus-part-marker', () => {
  it('flags bonus with no part markers', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.bonus-part-marker')).toBe(true);
  });
});

describe('question.bonus-difficulty-spread', () => {
  it('flags bonus missing difficulty markers', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart('[10]', 'Part one.', 'a1', 110),
          makeBonusPart('[10]', 'Part two.', 'a2', 120),
          makeBonusPart('[10]', 'Part three.', 'a3', 130),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.bonus-difficulty-spread')).toBe(true);
  });

  it('passes bonus with e/m/h markers', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart('[10e]', 'Easy.', 'a1', 110),
          makeBonusPart('[10m]', 'Medium.', 'a2', 120),
          makeBonusPart('[10h]', 'Hard.', 'a3', 130),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.bonus-difficulty-spread')).toBe(false);
  });
});

describe('question.post-question-note-sentence', () => {
  it('flags lowercase post-question note', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer. (the composer is Ludwig Beethoven)',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(true);
    const d = findDiag(diags, 'question.post-question-note-sentence');
    expect(d?.message).toContain('capitalize');
  });

  it('flags post-question note without period', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer. (The composer is Ludwig Beethoven)',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(true);
    const d = findDiag(diags, 'question.post-question-note-sentence');
    expect(d?.message).toContain('period');
  });

  it('flags both lowercase and missing period', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer. (the composer is Ludwig Beethoven)',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(true);
  });

  it('passes properly formatted post-question note', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer. (The composer is Ludwig Beethoven.)',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
  });

  it('passes author attribution without capitalization requirement', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer. (by Ludwig Beethoven)',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
  });

  it('passes author attribution with comma', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer. (by Ludwig Beethoven, 1827)',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
  });

  it('ignores pronunciation guides', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this composer ("BAY-toe-ven").',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
  });

  it('checks bonus parts', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart(
            '[10e]',
            'Name this composer. (the composer is Ludwig Beethoven)',
            'Ludwig van Beethoven',
            110
          ),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(true);
  });
});

describe('question.separate-note-paragraph', () => {
  it('flags separate note paragraph', () => {
    const t = makeQuestion(
      'tossup',
      16,
      'Note to players: specific word required.',
      'ANSWER: anger',
      { numberParagraphIndex: 50 }
    );
    // Add an extra body paragraph with the actual question text
    const bodyPara = makeParagraph(
      'A theater press officer prophesied that this emotion would grip audiences.',
      { index: 52 }
    );
    t.paragraphs.push(bodyPara);
    const packet = makePacket({
      tossups: [t],
      allParagraphs: [...t.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.separate-note-paragraph')).toBe(true);
  });

  it('flags "Description acceptable" variant', () => {
    const t = makeQuestion(
      'tossup',
      20,
      'Description Acceptable.',
      'ANSWER: something',
      { numberParagraphIndex: 60 }
    );
    const bodyPara = makeParagraph('This painting depicts a woman holding a fan.', {
      index: 62,
    });
    t.paragraphs.push(bodyPara);
    const packet = makePacket({
      tossups: [t],
      allParagraphs: [...t.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.separate-note-paragraph')).toBe(true);
  });

  it('does not flag when note is inline with question text', () => {
    const t = makeQuestion(
      'tossup',
      15,
      'Note to players: specific word required. A theater press officer prophesied that this emotion would grip audiences. For 10 points, name this emotion.',
      'ANSWER: anger',
      { numberParagraphIndex: 50 }
    );
    const packet = makePacket({
      tossups: [t],
      allParagraphs: [...t.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.separate-note-paragraph')).toBe(false);
  });

  it('does not flag normal questions without notes', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({
      tossups: [t],
      allParagraphs: [...t.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.separate-note-paragraph')).toBe(false);
  });
});

describe('question.note-to-moderator-format', () => {
  it('flags "Note to reader:" as nonstandard', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'Note to reader: Read answerline carefully. For 10 points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.note-to-moderator-format')).toBe(true);
    const d = findDiag(diags, 'question.note-to-moderator-format');
    expect(d?.message).toContain('Note to moderator:');
    expect(d?.message).toContain('moderator');
  });

  it('flags "Moderator note:" as nonstandard', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'Moderator note: accept either order. For 10 points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.note-to-moderator-format')).toBe(true);
  });

  it('passes "Note to moderator:" (correct format)', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'Note to moderator: Read answerline carefully. For 10 points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.note-to-moderator-format')).toBe(false);
  });

  it('passes normal question without notes', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this thing.',
      'ANSWER: thing',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.note-to-moderator-format')).toBe(false);
  });
});

describe('question.missing-pronoun', () => {
  it('passes tossup where every sentence has "this"', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This composer wrote nine symphonies. For 10 points, name this German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('flags clue sentence missing "this"', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'A composer wrote nine symphonies. For 10 points, name this German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'question.missing-pronoun');
    expect(d).toBeDefined();
    expect(d!.message).toContain('Clue sentence');
  });

  it('flags FTP sentence missing "this"/"what"', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This composer wrote nine symphonies. For 10 points, name the German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'question.missing-pronoun');
    expect(d).toBeDefined();
    expect(d!.message).toContain('FTP sentence');
  });

  it('accepts "these" in clue sentence', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'These symphonies were groundbreaking. For 10 points, name this German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('accepts "what" in FTP sentence', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This composer wrote nine symphonies. For 10 points, what German composer wrote the Eroica?',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('strips title text so "this" inside a title does not count', () => {
    const italicRun = {
      text: 'This Side of Paradise',
      bold: false,
      italic: true,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const plainBefore = {
      text: '1. A novel titled ',
      bold: false,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const plainAfter = {
      text: ' was published in 1920. For 10 points, name this author.',
      bold: false,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const rawText =
      '1. A novel titled This Side of Paradise was published in 1920. For 10 points, name this author.';
    const para = makeParagraph(rawText, {
      index: 1,
      runs: [plainBefore, italicRun, plainAfter],
    });

    const t: ReturnType<typeof makeQuestion> = {
      type: 'tossup',
      number: 1,
      numberParagraph: para,
      paragraphs: [
        para,
        makeParagraph('ANSWER: F. Scott Fitzgerald', { index: 2 }),
      ],
      answerLine: makeParagraph('ANSWER: F. Scott Fitzgerald', { index: 2 }),
      tag: null,
      parts: [],
    };
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    // The first sentence has "this" only inside the italic title — should be flagged
    const d = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(d.some((dd) => dd.message.includes('Clue sentence'))).toBe(true);
  });

  it('skips leading fully-italic instruction notes', () => {
    const rawText =
      '1. Description acceptable. This composer wrote nine symphonies. For 10 points, name this German composer.';
    const italicNote = {
      text: 'Description acceptable. ',
      bold: false,
      italic: true,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const plainBody = {
      text: 'This composer wrote nine symphonies. For 10 points, name this German composer.',
      bold: false,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const numRun = {
      text: '1. ',
      bold: false,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const para = makeParagraph(rawText, {
      index: 1,
      runs: [numRun, italicNote, plainBody],
    });
    const answerPara = makeParagraph('ANSWER: Ludwig van Beethoven', { index: 2 });
    const t = {
      type: 'tossup' as const,
      number: 1,
      numberParagraph: para,
      paragraphs: [para, answerPara],
      answerLine: answerPara,
      tag: null,
      parts: [],
    };
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('skips short fragment sentences', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'OK then. This composer wrote nine symphonies. For 10 points, name this German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    // "OK then." is < 20 chars, should be skipped
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('flags only the sentence missing a pronoun when others have one', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This composer wrote nine symphonies. A famous work is the Moonlight Sonata. For 10 points, name this German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(1);
    expect(mpDiags[0].message).toContain('Clue sentence');
  });

  // --- Bonus tests ---

  it('passes bonus part with "this"', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following about composers for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart(
            '[10e]',
            'Name this German composer of nine symphonies.',
            'Ludwig van Beethoven',
            110
          ),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('flags bonus part missing pronoun', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following about composers for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart(
            '[10e]',
            'Name the German composer of nine symphonies.',
            'Ludwig van Beethoven',
            110
          ),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'question.missing-pronoun');
    expect(d).toBeDefined();
    expect(d!.message).toContain('Bonus part');
  });

  it('accepts "what" in bonus part', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following about composers for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart(
            '[10e]',
            'What German composer wrote nine symphonies?',
            'Ludwig van Beethoven',
            110
          ),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  // --- Edge cases ---

  it('skips leading italic note like "Common or scientific name acceptable"', () => {
    const rawText =
      '1. Common or scientific name acceptable. This organism reproduces asexually. For 10 points, name this organism.';
    const numRun = {
      text: '1. ',
      bold: false,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const italicNote = {
      text: 'Common or scientific name acceptable. ',
      bold: false,
      italic: true,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const plainBody = {
      text: 'This organism reproduces asexually. For 10 points, name this organism.',
      bold: false,
      italic: false,
      underline: false,
      superscript: false,
      subscript: false,
    };
    const para = makeParagraph(rawText, {
      index: 1,
      runs: [numRun, italicNote, plainBody],
    });
    const answerPara = makeParagraph('ANSWER: hydra', { index: 2 });
    const t = {
      type: 'tossup' as const,
      number: 1,
      numberParagraph: para,
      paragraphs: [para, answerPara],
      answerLine: answerPara,
      tag: null,
      parts: [],
    };
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('does not split sentences at punctuation after closing quotes', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'A canvas is blank besides the word "solidary." In a story by this author, a man travels. For 10 points, name this author.',
      'ANSWER: Albert Camus',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('does not split at periods inside a quote that precedes "this"', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'The line "Life, friends, is boring. We must not say so," opens a poem in this collection. For 10 points, name this poetry collection.',
      'ANSWER: The Dream Songs',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('does not false-flag FTP with single-letter initials', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This law was signed by a president. For 10 points, Chester A. Arthur signed what 1882 law?',
      'ANSWER: Chinese Exclusion Act',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('does not false-split on standalone initials like A. E. Housman', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This poet was born in Worcestershire. For 10 points, A. E. Housman wrote what poetry collection?',
      'ANSWER: A Shropshire Lad',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('does not false-flag FTP with court case "v."', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This concept was established in a landmark case. For 10 points, Roe v. Wade affirmed what right?',
      'ANSWER: right to privacy',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('skips tossup with no FTP marker entirely', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'A composer wrote nine symphonies by a German master.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('skips sentences inside a quoted passage', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This figure said, \u201cSentence one inside quote. Sentence two inside quote.\u201d For 10 points, name this figure.',
      'ANSWER: test',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('skips sentences inside a straight-quoted passage', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'A character created by this author declares "Man! It has a proud ring to it!" in a monologue from a play that ends with him complaining "He spoiled the song!" as singing is interrupted. For 10 points, name this author.',
      'ANSWER: test',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('flags sentences outside quotes that lack pronouns even when quotes are present', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'A figure said some words. A different sentence about a topic. For 10 points, name this thing.',
      'ANSWER: test',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    // Both "A figure said..." and "A different sentence..." lack pronouns
    expect(mpDiags).toHaveLength(2);
  });

  it('accepts "which" in FTP sentence', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This composer wrote nine symphonies. For 10 points, name the symphony in which a chorus sings the "Ode to Joy."',
      'ANSWER: Symphony No. 9',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('accepts "these" in FTP sentence', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This type of structure stores data efficiently. For 10 points, name these computer science data structures.',
      'ANSWER: binary trees',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('matches pronouns case-insensitively', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'THIS composer wrote nine symphonies. For 10 points, name THIS German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'question.missing-pronoun')).toBe(false);
  });

  it('skips short bonus parts', () => {
    const b = makeQuestion(
      'bonus',
      1,
      'Answer the following for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        parts: [
          makeBonusPart('[10e]', 'Name it.', 'answer', 110),
        ],
      }
    );
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    // "[10e] Name it." is < 20 chars of body text, should be skipped
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('does not split at common abbreviations like Dr. or St.', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'This saint was born in Assisi. For 10 points, St. Francis founded what religious order?',
      'ANSWER: Franciscans',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const mpDiags = diags.filter((d) => d.rule === 'question.missing-pronoun');
    expect(mpDiags).toHaveLength(0);
  });

  it('reports correct offset and length in diagnostic', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'A composer wrote nine symphonies. For 10 points, name this German composer.',
      'ANSWER: Ludwig van Beethoven',
      { numberParagraphIndex: 1 }
    );
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'question.missing-pronoun');
    expect(d).toBeDefined();
    // The flagged sentence is "A composer wrote nine symphonies. " starting after "1. "
    const rawText = t.numberParagraph.rawText;
    expect(d!.offset).toBe(3); // after "1. "
    expect(rawText.substring(d!.offset!, d!.offset! + d!.length!)).toBe(
      'A composer wrote nine symphonies.'
    );
  });
});
