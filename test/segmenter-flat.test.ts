import { describe, it, expect } from 'vitest';
import { segmentPacket } from '../src/core/segmenter.js';
import { makeParagraph } from './helpers.js';

function makeParas(texts: string[]) {
  return texts.map((t, i) => makeParagraph(t, { index: i }));
}

describe('segmentPacket() flat-list fallback', () => {
  it('sets structured=true when headers are present', () => {
    const paras = makeParas([
      'Tossups',
      '1. Question text for 10 points.',
      'ANSWER: answer',
      '',
      'Bonuses',
      '1. Bonus lead-in for 10 points each.',
      '[10e] Easy part.',
      'ANSWER: easy',
      '[10m] Medium part.',
      'ANSWER: medium',
      '[10h] Hard part.',
      'ANSWER: hard',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(true);
    expect(packet.tossupHeader).not.toBeNull();
    expect(packet.bonusHeader).not.toBeNull();
  });

  it.each([
    ['Toss-Ups', 'Bonuses'],
    ['Toss-ups', 'Bonuses'],
    ['Toss Ups', 'Bonuses'],
    ['Tossup', 'Bonus'],
    ['Round 1 - Tossups', 'Bonuses'],
  ])(
    'recognizes variant section headers: %s / %s',
    (tossupHeader, bonusHeader) => {
      const paras = makeParas([
        tossupHeader,
        '1. Question text for 10 points.',
        'ANSWER: answer',
        '',
        bonusHeader,
        '1. Bonus lead-in for 10 points each.',
        '[10e] Easy part.',
        'ANSWER: easy',
        '[10m] Medium part.',
        'ANSWER: medium',
        '[10h] Hard part.',
        'ANSWER: hard',
      ]);
      const packet = segmentPacket(paras);
      expect(packet.structured).toBe(true);
      expect(packet.tossupHeader).not.toBeNull();
      expect(packet.bonusHeader).not.toBeNull();
    }
  );

  it('sets structured=false and infers tossups from flat list', () => {
    const paras = makeParas([
      'This is a tossup question. For 10 points, name it.',
      'ANSWER: test answer',
      '<Author, History>',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);
    expect(packet.tossupHeader).toBeNull();
    expect(packet.bonusHeader).toBeNull();
    expect(packet.tossups).toHaveLength(1);
    expect(packet.tossups[0].type).toBe('tossup');
    expect(packet.tossups[0].answerLine).not.toBeNull();
    expect(packet.tossups[0].tag).not.toBeNull();
  });

  it('infers bonus from part markers', () => {
    const paras = makeParas([
      'This bonus is about testing.',
      '[10e] Easy part question.',
      'ANSWER: easy answer',
      '[10m] Medium part question.',
      'ANSWER: medium answer',
      '[10h] Hard part question.',
      'ANSWER: hard answer',
      '<Author, Science>',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].type).toBe('bonus');
    expect(packet.bonuses[0].parts).toHaveLength(3);
  });

  it('infers bonus from FTPE text', () => {
    const paras = makeParas([
      'For 10 points each, answer the following.',
      'Name this thing.',
      'ANSWER: thing one',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].type).toBe('bonus');
  });

  it('handles mix of tossups and bonuses without headers', () => {
    const paras = makeParas([
      'This is a tossup question. For 10 points, name it.',
      'ANSWER: tossup answer',
      '<Auth, History>',
      '',
      'This bonus is about testing.',
      '[10e] Easy part.',
      'ANSWER: easy',
      '[10m] Medium part.',
      'ANSWER: medium',
      '[10h] Hard part.',
      'ANSWER: hard',
      '<Auth, Science>',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);
    expect(packet.tossups).toHaveLength(1);
    expect(packet.bonuses).toHaveLength(1);
  });

  it('assigns sequential question numbers', () => {
    const paras = makeParas([
      'First tossup question.',
      'ANSWER: first',
      '',
      'Second tossup question.',
      'ANSWER: second',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.tossups[0].number).toBe(1);
    expect(packet.tossups[1].number).toBe(2);
  });

  it('returns empty packet when no ANSWER: lines found', () => {
    const paras = makeParas([
      'Just some text without answers.',
      'More text here.',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);
    expect(packet.tossups).toHaveLength(0);
    expect(packet.bonuses).toHaveLength(0);
  });

  it('handles multiple tossups separated by blank lines', () => {
    const paras = makeParas([
      'First question text.',
      'ANSWER: first',
      '',
      'Second question text.',
      'ANSWER: second',
      '',
      'Third question text.',
      'ANSWER: third',
    ]);
    const packet = segmentPacket(paras);
    expect(packet.tossups).toHaveLength(3);
  });
});
