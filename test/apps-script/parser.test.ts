import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeGas, type GasHandle } from './fake-gas.js';
import { parseGoogleDoc } from '../../src/apps-script/parser.js';

describe('parseGoogleDoc', () => {
  let gas: GasHandle;

  beforeEach(() => {
    gas = installFakeGas();
  });

  it('extracts one Paragraph per body paragraph with rawText', () => {
    gas.setDocument([
      { text: 'Tossups' },
      { text: '1. This is a question.' },
      { text: 'ANSWER: something' },
    ]);

    const paras = parseGoogleDoc();

    expect(paras.map((p) => p.rawText)).toEqual([
      'Tossups',
      '1. This is a question.',
      'ANSWER: something',
    ]);
    expect(paras.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('preserves run-level formatting split at attribute boundaries', () => {
    gas.setDocument([
      {
        runs: [
          { text: 'ANSWER: ' },
          { text: 'Napoleon', bold: true, underline: true },
          { text: ' Bonaparte', bold: true },
        ],
      },
    ]);

    const [para] = parseGoogleDoc();

    expect(para.runs).toHaveLength(3);
    expect(para.runs[0]).toMatchObject({ text: 'ANSWER: ', bold: false });
    expect(para.runs[1]).toMatchObject({
      text: 'Napoleon',
      bold: true,
      underline: true,
    });
    expect(para.runs[2]).toMatchObject({
      text: ' Bonaparte',
      bold: true,
      underline: false,
    });
  });

  it('captures superscript and subscript alignment', () => {
    gas.setDocument([
      {
        runs: [
          { text: 'H' },
          { text: '2', subscript: true },
          { text: 'O and E=mc' },
          { text: '2', superscript: true },
        ],
      },
    ]);

    const [para] = parseGoogleDoc();

    expect(para.runs[1]).toMatchObject({ text: '2', subscript: true });
    expect(para.runs[3]).toMatchObject({ text: '2', superscript: true });
  });

  it('emits a single empty run for an empty paragraph', () => {
    gas.setDocument([{ text: '' }]);

    const [para] = parseGoogleDoc();

    expect(para.rawText).toBe('');
    expect(para.runs).toHaveLength(1);
    expect(para.runs[0].text).toBe('');
  });

  it('flags paragraphs that contain a page break', () => {
    gas.setDocument([
      { text: 'before break' },
      { text: 'after break', pageBreak: true },
    ]);

    const paras = parseGoogleDoc();

    expect(paras[0].hasPageBreak).toBe(false);
    expect(paras[1].hasPageBreak).toBe(true);
  });

  it('skips non-paragraph body children when indexing', () => {
    gas.setDocument([
      { text: 'para one' },
      { other: true }, // e.g. a table
      { text: 'para two' },
    ]);

    const paras = parseGoogleDoc();

    expect(paras.map((p) => p.rawText)).toEqual(['para one', 'para two']);
    expect(paras.map((p) => p.index)).toEqual([0, 1]);
  });
});
