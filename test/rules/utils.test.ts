import { describe, it, expect } from 'vitest';
import { iterateSubDirectives } from '../../src/core/rules/utils.js';
import { makePacket, makeQuestion, makeBonusPart } from '../helpers.js';

describe('iterateSubDirectives', () => {
  it('yields every sub-directive across tossup and bonus answer lines', () => {
    const tossup = makeQuestion(
      'tossup',
      1,
      'clue',
      'ANSWER: iron [or Fe; prompt on metal]'
    );
    const bonus = makeQuestion('bonus', 1, 'lead-in', 'unused', {
      parts: [makeBonusPart('[10e]', 'part', 'ANSWER: gold [accept Au]', 50)],
    });
    const packet = makePacket({
      tossups: [tossup],
      bonuses: [bonus],
    });

    const results = [...iterateSubDirectives(packet)];

    // Each yielded item carries the owning paragraph plus a parsed directive.
    expect(results.map((r) => r.sub.type)).toEqual(['or', 'prompt', 'accept']);
    expect(results.map((r) => r.sub.contentText.trim())).toEqual([
      'Fe',
      'metal',
      'Au',
    ]);
    // The tossup subs point at the tossup answer line; the bonus sub at the part.
    expect(results[0].para.index).toBe(tossup.answerLine!.index);
    expect(results[2].para.index).toBe(bonus.parts[0].answerLine!.index);
  });

  it('yields nothing when there are no bracketed directives', () => {
    const tossup = makeQuestion('tossup', 1, 'clue', 'ANSWER: plain answer');
    const packet = makePacket({ tossups: [tossup] });
    expect([...iterateSubDirectives(packet)]).toHaveLength(0);
  });
});
