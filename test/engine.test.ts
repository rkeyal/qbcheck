import { describe, it, expect } from 'vitest';
import { lint, inferCrossPacketCategories } from '../src/core/engine.js';
import { makePacket, makeQuestion, makeBonusPart, hasDiag } from './helpers.js';

function makeValidTossup(n: number, tag?: string) {
  return makeQuestion(
    'tossup',
    n,
    `This is a test question. For 10 points, name it.`,
    'ANSWER: **__test answer__**',
    { tag: tag ?? `<Auth, American History>`, numberParagraphIndex: n * 10 }
  );
}

function _makeValidBonus(n: number, tag?: string) {
  return makeQuestion(
    'bonus',
    n,
    'Answer the following about testing for 10 points each.',
    '',
    {
      tag: tag ?? `<Auth, American History>`,
      numberParagraphIndex: n * 10 + 500,
      parts: [
        makeBonusPart('[10e]', 'Easy part.', 'ans1', n * 10 + 510),
        makeBonusPart('[10m]', 'Medium part.', 'ans2', n * 10 + 520),
        makeBonusPart('[10h]', 'Hard part.', 'ans3', n * 10 + 530),
      ],
    }
  );
}

describe('lint()', () => {
  it('returns diagnostics sorted by paragraph index', () => {
    const t1 = makeValidTossup(1);
    const t2 = makeValidTossup(2);
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });

    const diags = lint(packet);
    for (let i = 1; i < diags.length; i++) {
      expect(diags[i].paragraph).toBeGreaterThanOrEqual(diags[i - 1].paragraph);
    }
  });

  it('disabledRules filters out matching rules', () => {
    const tossup = makeQuestion('tossup', 1, 'A question.', 'plain answer', {
      numberParagraphIndex: 1,
    });
    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: tossup.paragraphs,
    });

    const allDiags = lint(packet);
    const disabled = new Set(['question.ftp-format']);
    const filtered = lint(packet, disabled);

    expect(hasDiag(allDiags, 'question.ftp-format')).toBe(true);
    expect(hasDiag(filtered, 'question.ftp-format')).toBe(false);
  });

  it('enriches diagnostics with questionLabel and answerPreview', () => {
    const tossup = makeQuestion(
      'tossup',
      3,
      'For 10 points, name it.',
      'ANSWER: the answer',
      {
        numberParagraphIndex: 30,
      }
    );
    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: tossup.paragraphs,
    });

    const diags = lint(packet);
    const withLabel = diags.filter((d) => d.questionLabel);
    expect(withLabel.length).toBeGreaterThan(0);
    expect(withLabel[0].questionLabel).toBe('Tossup');
  });
});

describe('inferCrossPacketCategories()', () => {
  it('flags categories appearing in fewer than half the packets', () => {
    // 4 packets: "Rare Category" only in packet 0
    const packets = Array.from({ length: 4 }, (_, i) => {
      const cat = i === 0 ? 'Rare Category' : 'American History';
      const t = makeValidTossup(1, `<Auth, ${cat}>`);
      return makePacket({
        tossups: [t],
        bonuses: [],
        allParagraphs: t.paragraphs,
      });
    });

    const result = inferCrossPacketCategories(packets);
    const allDiags = result.flat();
    const rareDiag = allDiags.find((d) => d.message.includes('Rare Category'));
    expect(rareDiag).toBeDefined();
  });

  it('passes categories appearing in at least half the packets', () => {
    const packets = Array.from({ length: 4 }, () => {
      const t = makeValidTossup(1, `<Auth, American History>`);
      return makePacket({
        tossups: [t],
        bonuses: [],
        allParagraphs: t.paragraphs,
      });
    });

    const result = inferCrossPacketCategories(packets);
    const allDiags = result.flat();
    expect(allDiags.length).toBe(0);
  });
});
