import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeGas, type GasHandle, type ParaSpec } from './fake-gas.js';
import { detectCurrentQuestion } from '../../src/apps-script/question-detect.js';

// A packet with two tossups and one multi-part bonus, separated by blank lines.
const PACKET: ParaSpec[] = [
  { text: 'Tossups' }, // 0
  { text: '1. First tossup clue text.' }, // 1
  { text: 'ANSWER: first answer' }, // 2
  { text: '' }, // 3
  { text: '2. Second tossup clue text.' }, // 4
  { text: 'ANSWER: second answer' }, // 5
  { text: '' }, // 6
  { text: 'Bonuses' }, // 7
  { text: '1. This bonus has a leadin.' }, // 8
  { text: '[10] First part prompt.' }, // 9
  { text: 'ANSWER: part one' }, // 10
  { text: '[10] Second part prompt.' }, // 11
  { text: 'ANSWER: part two' }, // 12
  { text: '' }, // 13
];

describe('detectCurrentQuestion', () => {
  let gas: GasHandle;

  beforeEach(() => {
    gas = installFakeGas();
    gas.setDocument(PACKET);
  });

  it('returns null when there is no cursor', () => {
    expect(detectCurrentQuestion()).toBeNull();
  });

  it('returns null when the cursor is on a section header', () => {
    gas.setCursorAtParagraph(0);
    expect(detectCurrentQuestion()).toBeNull();
  });

  it('returns null when the cursor is on a blank line', () => {
    gas.setCursorAtParagraph(3);
    expect(detectCurrentQuestion()).toBeNull();
  });

  it('detects a single tossup when the cursor is on its clue line', () => {
    gas.setCursorAtParagraph(4);

    const detected = detectCurrentQuestion();

    expect(detected).not.toBeNull();
    expect(detected!.paragraphs.map((p) => p.rawText)).toEqual([
      '2. Second tossup clue text.',
      'ANSWER: second answer',
    ]);
    expect(detected!.label).toBe('Tossup 2');
  });

  it('detects the tossup when the cursor is on its ANSWER line', () => {
    gas.setCursorAtParagraph(2);

    const detected = detectCurrentQuestion();

    expect(detected!.paragraphs.map((p) => p.rawText)).toEqual([
      '1. First tossup clue text.',
      'ANSWER: first answer',
    ]);
    expect(detected!.label).toBe('Tossup 1');
  });

  it('detects a full multi-part bonus from any part', () => {
    gas.setCursorAtParagraph(9);

    const detected = detectCurrentQuestion();

    expect(detected!.paragraphs.map((p) => p.rawText)).toEqual([
      '1. This bonus has a leadin.',
      '[10] First part prompt.',
      'ANSWER: part one',
      '[10] Second part prompt.',
      'ANSWER: part two',
    ]);
    expect(detected!.label).toBe('Bonus 1');
  });

  it('re-indexes detected paragraphs from zero but reports absolute start', () => {
    gas.setCursorAtParagraph(4);

    const detected = detectCurrentQuestion();

    // Range starts at absolute paragraph 4 but is re-indexed 0..n. startIndex
    // preserves the offset callers need to map diagnostics back onto the doc.
    expect(detected!.paragraphs.map((p) => p.index)).toEqual([0, 1]);
    expect(detected!.startIndex).toBe(4);
  });
});

describe('detectCurrentQuestion — label inference without section headers', () => {
  let gas: GasHandle;

  beforeEach(() => {
    gas = installFakeGas();
  });

  it('infers a Bonus label from [10x] parts when no header precedes it', () => {
    // Plain "[10]" does not match the bonus regex — it requires an e/m/h tier.
    gas.setDocument([
      { text: '1. A bonus leadin with no header.' },
      { text: '[10e] first part' },
      { text: 'ANSWER: one' },
    ]);
    gas.setCursorAtParagraph(0);

    expect(detectCurrentQuestion()!.label).toBe('Bonus 1');
  });

  it('infers a Tossup label from an ANSWER line when no header precedes it', () => {
    gas.setDocument([
      { text: '3. A tossup clue with no header.' },
      { text: 'ANSWER: the answer' },
    ]);
    gas.setCursorAtParagraph(0);

    expect(detectCurrentQuestion()!.label).toBe('Tossup 3');
  });

  it('falls back to "Question N" when the type cannot be inferred', () => {
    gas.setDocument([{ text: '7. A lone numbered line, no answer.' }]);
    gas.setCursorAtParagraph(0);

    expect(detectCurrentQuestion()!.label).toBe('Question 7');
  });

  it('detects the question but reports a null label with neither number nor type', () => {
    gas.setDocument([
      { text: 'Some prose with neither a number nor an answer.' },
    ]);
    gas.setCursorAtParagraph(0);

    const detected = detectCurrentQuestion();
    expect(detected).not.toBeNull();
    expect(detected!.label).toBeNull();
  });
});
