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

function tossupWithTag(tag?: string) {
  return makeQuestion(
    'tossup',
    1,
    'For 10 points, name this thing.',
    'ANSWER: thing',
    {
      numberParagraphIndex: 1,
      answerRuns: [plain('ANSWER: '), bu('thing')],
      tag,
    }
  );
}

describe('tag.tag-present', () => {
  it('flags missing tag', () => {
    const t = tossupWithTag(undefined);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.tag-present')).toBe(true);
  });

  it('passes with tag present', () => {
    const t = tossupWithTag('<Author, Biology>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.tag-present')).toBe(false);
  });
});

describe('tag.tag-format', () => {
  it('flags invalid tag format', () => {
    const t = tossupWithTag('<Bad Tag');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.tag-format')).toBe(true);
  });

  it('passes <Author, Category>', () => {
    const t = tossupWithTag('<Author, Biology>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.tag-format')).toBe(false);
  });

  it('passes <Category>', () => {
    const t = tossupWithTag('<Biology>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.tag-format')).toBe(false);
  });
});

describe('tag.valid-category', () => {
  it('flags unrecognized category', () => {
    const t = tossupWithTag('<Author, Fake Category>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.valid-category')).toBe(true);
  });

  it('passes valid category', () => {
    const t = tossupWithTag('<Author, American History>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.valid-category')).toBe(false);
  });

  it('passes subcategory with valid base (Social Science: Anthropology)', () => {
    const t = tossupWithTag('<Author, Social Science: Anthropology>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.valid-category')).toBe(false);
  });

  it('flags invalid base category in subcategory', () => {
    const t = tossupWithTag('<Author, Fake: Subcategory>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'tag.valid-category');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('warning');
    expect(d!.message).toContain('Fake');
  });

  it('passes dash-separated subcategory with valid base', () => {
    const t = tossupWithTag('<Author, Other Science - Earth Science>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.valid-category')).toBe(false);
  });

  it('passes parenthetical subcategory with valid base', () => {
    const t = tossupWithTag('<Author, Other Science (Math)>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.valid-category')).toBe(false);
  });

  it('flags invalid base category with parenthetical subcategory', () => {
    const t = tossupWithTag('<Author, Fake (Something)>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'tag.valid-category');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('warning');
    expect(d!.message).toContain('Fake');
  });
});

describe('tag.no-nested-brackets', () => {
  it('flags tag with nested angle brackets', () => {
    const t = tossupWithTag('<Author, <Sub>Category>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, 'tag.no-nested-brackets');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('error');
    expect(d!.message).toContain('nested angle brackets');
  });

  it('flags tag with double opening brackets', () => {
    const t = tossupWithTag('<<Author, Biology>>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    expect(hasDiag(lint(packet), 'tag.no-nested-brackets')).toBe(true);
  });

  it('passes well-formed tag without nesting', () => {
    const t = tossupWithTag('<Author, Biology>');
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    expect(hasDiag(lint(packet), 'tag.no-nested-brackets')).toBe(false);
  });
});

describe('tag.consistent-categories', () => {
  it('flags inconsistent category casing across questions', () => {
    const t1 = tossupWithTag('<Author1, Biology>');
    const t2 = makeQuestion('tossup', 2, 'For 10 points, name this.', 'ANSWER: foo', {
      numberParagraphIndex: 10,
      answerRuns: [plain('ANSWER: '), bu('foo')],
      tag: '<Author2, biology>',
    });
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });
    const diags = lint(packet);
    const d = findDiag(diags, 'tag.consistent-categories');
    expect(d).toBeDefined();
    expect(d!.severity).toBe('warning');
    expect(d!.message).toContain('Biology');
    expect(d!.message).toContain('biology');
  });

  it('passes when all questions use identical category casing', () => {
    const t1 = tossupWithTag('<Author1, Biology>');
    const t2 = makeQuestion('tossup', 2, 'For 10 points, name this.', 'ANSWER: foo', {
      numberParagraphIndex: 10,
      answerRuns: [plain('ANSWER: '), bu('foo')],
      tag: '<Author2, Biology>',
    });
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.consistent-categories')).toBe(false);
  });

  it('does not flag different categories as inconsistent', () => {
    const t1 = tossupWithTag('<Author1, Biology>');
    const t2 = makeQuestion('tossup', 2, 'For 10 points, name this.', 'ANSWER: foo', {
      numberParagraphIndex: 10,
      answerRuns: [plain('ANSWER: '), bu('foo')],
      tag: '<Author2, American History>',
    });
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'tag.consistent-categories')).toBe(false);
  });
});
