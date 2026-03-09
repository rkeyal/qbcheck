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

function tossupWith(text: string) {
  return makeQuestion('tossup', 1, text, 'ANSWER: thing', {
    numberParagraphIndex: 1,
    answerRuns: [plain('ANSWER: '), bu('thing')],
    tag: '<Auth, Biology>',
  });
}

describe('pronunciation.paren-delimiter', () => {
  it('flags square bracket pronunciation guides', () => {
    const t = tossupWith('For 10 points, name this composer ["BAHK"].');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: [...t.paragraphs, ...packet_extras()],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.paren-delimiter')).toBe(true);
  });

  it('passes parenthetical pronunciation guides', () => {
    const t = tossupWith('For 10 points, name this composer ("BAHK").');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.paren-delimiter')).toBe(false);
  });
});

describe('pronunciation.trailing-punct', () => {
  it('flags punctuation inside pronunciation guide', () => {
    const t = tossupWith('For 10 points, name this composer ("BAHK.")');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.trailing-punct')).toBe(true);
  });

  it('passes punctuation outside pronunciation guide', () => {
    const t = tossupWith('For 10 points, name this composer ("BAHK").');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.trailing-punct')).toBe(false);
  });
});

function packet_extras() {
  // Empty array – just a helper for the allParagraphs
  return [];
}

describe('pronunciation.quotes-required', () => {
  it('flags pronunciation guide without quotes', () => {
    const t = tossupWith('For 10 points, name this composer (BAHK).');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(true);
  });

  it('passes pronunciation guide with quotes', () => {
    const t = tossupWith('For 10 points, name this composer ("BAHK").');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(false);
  });

  it('does not flag chemical notation - single letters', () => {
    const t = tossupWith(
      'This involves copper (I) and copper (II) ions. For 10 points, name this.'
    );
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(false);
  });

  it('does not flag stereochemistry notation', () => {
    const t = tossupWith(
      'This reaction produces (R)-2-bromobutane and (S)-2-butanol.'
    );
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(false);
  });

  it('does not flag Roman numerals', () => {
    const t = tossupWith(
      'This emperor was Constantine (VII). Louis (XIV) ruled France.'
    );
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(false);
  });

  it('does not flag single digits', () => {
    const t = tossupWith('This is step (1) in the process, followed by (2).');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(false);
  });
});

describe('pronunciation.possessive-ending', () => {
  it("flags pronunciation guide after possessive that doesn't end in s/z", () => {
    const t = tossupWith('For 10 points, name Toibin\'s ("TOY-bin") novel.');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.possessive-ending')).toBe(true);
  });

  it('passes pronunciation guide after possessive ending in s', () => {
    const t = tossupWith('For 10 points, name Toibin\'s ("TOY-bins") novel.');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.possessive-ending')).toBe(false);
  });

  it('passes pronunciation guide after possessive ending in z', () => {
    const t = tossupWith('For 10 points, name Toibin\'s ("TOY-binz") novel.');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.possessive-ending')).toBe(false);
  });

  it("passes pronunciation guide after possessive ending in 's", () => {
    const t = tossupWith('For 10 points, name Toibin\'s ("TOY-bin\'s") novel.');
    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, 'pronunciation.possessive-ending')).toBe(false);
  });
});
