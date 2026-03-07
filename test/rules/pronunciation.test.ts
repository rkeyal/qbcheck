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
