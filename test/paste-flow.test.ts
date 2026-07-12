// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHtml } from '../src/core/parser.js';
import { segmentPacket } from '../src/core/segmenter.js';
import { lint } from '../src/core/engine.js';
import { applyFixes, paragraphsToHtml } from '../src/core/fixer.js';
import { Paragraph } from '../src/core/model.js';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Re-implementation of the popup's restoreBlankLines for testing.
 * Walks plain text lines and HTML paragraphs in parallel, inserting
 * empty paragraphs where the plain text has blank lines that the
 * HTML dropped. If the HTML already has a blank paragraph, it is
 * consumed instead of inserting a duplicate.
 */
function restoreBlankLines(
  htmlParas: Paragraph[],
  plainText: string
): Paragraph[] {
  const textLines = plainText.split('\n');
  const result: Paragraph[] = [];
  let htmlIdx = 0;

  for (const line of textLines) {
    if (line.trim() === '') {
      if (
        htmlIdx < htmlParas.length &&
        htmlParas[htmlIdx].rawText.trim() === ''
      ) {
        const para = htmlParas[htmlIdx];
        para.index = result.length;
        result.push(para);
        htmlIdx++;
      } else {
        result.push({
          index: result.length,
          runs: [],
          rawText: '',
          hasPageBreak: false,
        });
      }
    } else if (htmlIdx < htmlParas.length) {
      const para = htmlParas[htmlIdx];
      para.index = result.length;
      result.push(para);
      htmlIdx++;
    }
  }

  while (htmlIdx < htmlParas.length) {
    const para = htmlParas[htmlIdx];
    para.index = result.length;
    result.push(para);
    htmlIdx++;
  }

  return result;
}

/** Parse plain text to HTML paragraphs (includes empty paragraphs for blank lines). */
function plainTextToParas(text: string): Paragraph[] {
  const html = '<p>' + escHtml(text).split('\n').join('</p><p>') + '</p>';
  return parseHtml(html);
}

/**
 * Simulate Google Docs clipboard: HTML paragraphs have NO empty elements
 * for blank lines (those are dropped). Returns the HTML-parsed paragraphs
 * and the plain text.
 */
function simulateGDocsClipboard(text: string) {
  const lines = text.split('\n');
  const contentLines = lines.filter((l) => l.trim() !== '');
  const html = contentLines.map((l) => `<p>${escHtml(l)}</p>`).join('');
  return { paragraphs: parseHtml(html), plainText: text };
}

/**
 * Simulate a clipboard source that DOES preserve blank paragraphs in HTML
 * (e.g., some versions of Google Docs or other editors).
 */
function simulateHtmlWithBlanks(text: string) {
  const html = '<p>' + escHtml(text).split('\n').join('</p><p>') + '</p>';
  return { paragraphs: parseHtml(html), plainText: text };
}

/**
 * Full paste pipeline: parse → restoreBlankLines → segment → lint → fix.
 * The `htmlParas` simulates what the HTML clipboard provides.
 */
function runPipeline(htmlParas: Paragraph[], plainText: string) {
  const paragraphs = restoreBlankLines(htmlParas, plainText);
  const packet = segmentPacket(paragraphs);
  const diags = lint(packet);
  const result = applyFixes(paragraphs, diags, []);
  return { paragraphs, packet, diags, result };
}

/** Simulate the popup paste handler: convert plain text to HTML, parse, lint, fix. */
function simulatePaste(text: string) {
  const paragraphs = plainTextToParas(text);
  const packet = segmentPacket(paragraphs);
  const diags = lint(packet);
  const result = applyFixes(paragraphs, diags, []);
  return { paragraphs, packet, diags, result };
}

// ---------------------------------------------------------------------------
// Existing tests
// ---------------------------------------------------------------------------

describe('paste flow – empty paragraph between questions', () => {
  const input =
    'Question text. For ten points, name this thing.\n' +
    'ANSWER: thing\n' +
    '<Auth, Cat>\n' +
    '\n' +
    'Another question. For 10 points each:\n' +
    '[10h] Part one.\n' +
    'ANSWER: part one answer';

  it('preserves empty paragraph in parsed output', () => {
    const paragraphs = plainTextToParas(input);

    expect(paragraphs.length).toBe(7);
    expect(paragraphs[3].rawText).toBe('');
  });

  it('preserves empty paragraph through applyFixes', () => {
    const { result } = simulatePaste(input);

    const emptyParas = result.fixedParagraphs.filter((p) => p.rawText === '');
    expect(emptyParas.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves empty paragraph in HTML output', () => {
    const { result } = simulatePaste(input);

    const outputHtml = paragraphsToHtml(result.fixedParagraphs);

    // Should contain a <p>\u00A0</p> for the blank line
    expect(outputHtml).toContain('<p style="margin:0;page-break-inside:avoid;orphans:2;widows:2">\u00A0</p>');

    // All but last paragraph wrapped in <p>; last is inline
    const pCount = (outputHtml.match(/<p /g) || []).length;
    expect(pCount).toBe(6);
  });

  it('produces correct output for user example with tossup and bonus', () => {
    const userInput =
      'An essay claims that this man "acquired more essential history from Plutarch than most men could from the whole British Museum." For ten points, name this author.\n' +
      'ANSWER: William Shakespeare\n' +
      '<RK, British Literature>\n' +
      '\n' +
      'The title of Bill Morgan\'s history declares "The typewriter is" this adjective. For 10 points each:\n' +
      '[10h] Identify this adjective.\n' +
      'ANSWER: holy';

    const { result } = simulatePaste(userInput);
    const outputHtml = paragraphsToHtml(result.fixedParagraphs);

    // Should contain a <p>\u00A0</p> for the blank line between questions
    expect(outputHtml).toContain('<p style="margin:0;page-break-inside:avoid;orphans:2;widows:2">\u00A0</p>');

    // Last paragraph should be inline (no trailing <p>)
    expect(outputHtml).not.toMatch(/<\/p>$/);

    // "For ten points" should have been fixed to "For 10 points"
    expect(outputHtml).toContain('For 10 points');
    expect(outputHtml).not.toContain('ten points');
  });
});

// ---------------------------------------------------------------------------
// restoreBlankLines alignment
// ---------------------------------------------------------------------------

describe('restoreBlankLines – alignment', () => {
  const twoQuestions =
    'Tossup text. For 10 points, name this.\n' +
    'ANSWER: thing\n' +
    '<Auth, Cat>\n' +
    '\n' +
    'Bonus lead-in. For 10 points each:\n' +
    '[10h] Part one.\n' +
    'ANSWER: one';

  it('inserts blank paragraph when HTML drops it (Google Docs)', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(twoQuestions);

    // Google Docs HTML has 6 paragraphs (no blank)
    expect(paragraphs).toHaveLength(6);

    const restored = restoreBlankLines(paragraphs, plainText);

    // Should have 7 paragraphs (blank inserted)
    expect(restored).toHaveLength(7);
    expect(restored[3].rawText).toBe('');

    // Content paragraphs should be in the right order
    expect(restored[0].rawText).toContain('Tossup text');
    expect(restored[1].rawText).toContain('ANSWER: thing');
    expect(restored[4].rawText).toContain('Bonus lead-in');
    expect(restored[5].rawText).toContain('[10h]');
    expect(restored[6].rawText).toContain('ANSWER: one');
  });

  it('consumes existing blank paragraph when HTML includes it', () => {
    const { paragraphs, plainText } = simulateHtmlWithBlanks(twoQuestions);

    // HTML already has 7 paragraphs (includes blank)
    expect(paragraphs).toHaveLength(7);

    const restored = restoreBlankLines(paragraphs, plainText);

    // Should still have 7 paragraphs (no duplicate)
    expect(restored).toHaveLength(7);
    expect(restored[3].rawText).toBe('');

    // Content paragraphs stay correctly aligned
    expect(restored[0].rawText).toContain('Tossup text');
    expect(restored[1].rawText).toContain('ANSWER: thing');
    expect(restored[4].rawText).toContain('Bonus lead-in');
    expect(restored[5].rawText).toContain('[10h]');
    expect(restored[6].rawText).toContain('ANSWER: one');
  });

  it('does not insert duplicate when HTML already has blank paragraph', () => {
    // This is the specific bug: if HTML already has the blank paragraph,
    // the old code would insert a duplicate, shifting all subsequent
    // paragraphs and breaking segmentation.
    const { paragraphs, plainText } = simulateHtmlWithBlanks(twoQuestions);
    const restored = restoreBlankLines(paragraphs, plainText);

    // Count blank paragraphs — should be exactly 1
    const blanks = restored.filter((p) => p.rawText.trim() === '');
    expect(blanks).toHaveLength(1);
  });

  it('handles multiple blank lines between questions', () => {
    const input =
      'Question one.\n' +
      'ANSWER: one\n' +
      '\n' +
      '\n' +
      'Question two.\n' +
      'ANSWER: two';

    const { paragraphs, plainText } = simulateGDocsClipboard(input);
    const restored = restoreBlankLines(paragraphs, plainText);

    // 4 content + 2 blank = 6
    expect(restored).toHaveLength(6);
    expect(restored[2].rawText).toBe('');
    expect(restored[3].rawText).toBe('');
    expect(restored[4].rawText).toContain('Question two');
  });

  it('handles trailing blank lines in plain text', () => {
    const input = 'Question.\nANSWER: ans\n';
    const { paragraphs, plainText } = simulateGDocsClipboard(input);
    const restored = restoreBlankLines(paragraphs, plainText);

    // 2 content + 1 trailing blank = 3
    expect(restored).toHaveLength(3);
    expect(restored[0].rawText).toContain('Question');
    expect(restored[1].rawText).toContain('ANSWER: ans');
    expect(restored[2].rawText).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Segmentation with blank lines
// ---------------------------------------------------------------------------

describe('paste flow – segmentation with blank lines', () => {
  // Tossup + blank line + 3-part bonus with tag
  const fullInput =
    'This is a tossup question. For 10 points, name this thing.\n' +
    'ANSWER: thing\n' +
    '<Auth, Category>\n' +
    '\n' +
    'This is a bonus lead-in. For 10 points each:\n' +
    '[10h] First part.\n' +
    'ANSWER: first\n' +
    '[10m] Second part.\n' +
    'ANSWER: second\n' +
    '[10e] Third part.\n' +
    'ANSWER: third\n' +
    '<Auth, Category>';

  it('Google Docs clipboard: restoreBlankLines + segmenter → 1 tossup, 1 bonus', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(fullInput);
    const restored = restoreBlankLines(paragraphs, plainText);
    const packet = segmentPacket(restored);

    expect(packet.tossups).toHaveLength(1);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].parts).toHaveLength(3);
    expect(packet.bonuses[0].tag).not.toBeNull();
  });

  it('HTML-with-blanks clipboard: restoreBlankLines + segmenter → 1 tossup, 1 bonus', () => {
    const { paragraphs, plainText } = simulateHtmlWithBlanks(fullInput);
    const restored = restoreBlankLines(paragraphs, plainText);
    const packet = segmentPacket(restored);

    expect(packet.tossups).toHaveLength(1);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].parts).toHaveLength(3);
    expect(packet.bonuses[0].tag).not.toBeNull();
  });

  it('full pipeline (Google Docs): correct segmentation and no spurious diagnostics', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(fullInput);
    const { packet, diags } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(1);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].parts).toHaveLength(3);

    // No FTP diagnostics from bonus parts misidentified as tossups
    const ftpDiags = diags.filter((d) => d.rule === 'question.ftp-format');
    expect(ftpDiags).toHaveLength(0);
  });

  it('full pipeline (HTML with blanks): same result as Google Docs pipeline', () => {
    const gdocs = simulateGDocsClipboard(fullInput);
    const withBlanks = simulateHtmlWithBlanks(fullInput);

    const gdocsResult = runPipeline(gdocs.paragraphs, gdocs.plainText);
    const blanksResult = runPipeline(
      withBlanks.paragraphs,
      withBlanks.plainText
    );

    // Both pipelines should produce the same question counts
    expect(gdocsResult.packet.tossups).toHaveLength(
      blanksResult.packet.tossups.length
    );
    expect(gdocsResult.packet.bonuses).toHaveLength(
      blanksResult.packet.bonuses.length
    );
  });
});

// ---------------------------------------------------------------------------
// Bonus not split by misalignment
// ---------------------------------------------------------------------------

describe('paste flow – bonus not split by blank line misalignment', () => {
  const twoTossups =
    'First tossup question. For 10 points, name this person.\n' +
    'ANSWER: person one\n' +
    '<Auth, Category>\n' +
    '\n' +
    'Second tossup question. For 10 points, identify this work.\n' +
    'ANSWER: work two\n' +
    '<Auth, Category>';

  it('identifies two separate tossups (Google Docs clipboard)', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(twoTossups);
    const { packet } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(2);
    expect(packet.bonuses).toHaveLength(0);
    expect(packet.tossups[0].tag).not.toBeNull();
    expect(packet.tossups[1].tag).not.toBeNull();
  });

  it('identifies two separate tossups (HTML already has blank)', () => {
    const { paragraphs, plainText } = simulateHtmlWithBlanks(twoTossups);
    const { packet } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(2);
    expect(packet.bonuses).toHaveLength(0);
  });
});

describe('paste flow – multiple bonuses not merged', () => {
  const twoBonuses =
    'First bonus lead-in. For 10 points each:\n' +
    '[10h] Part A.\n' +
    'ANSWER: alpha\n' +
    '[10m] Part B.\n' +
    'ANSWER: beta\n' +
    '[10e] Part C.\n' +
    'ANSWER: gamma\n' +
    '<Auth, Category>\n' +
    '\n' +
    'Second bonus lead-in. For 10 points each:\n' +
    '[10h] Part D.\n' +
    'ANSWER: delta\n' +
    '[10m] Part E.\n' +
    'ANSWER: epsilon\n' +
    '[10e] Part F.\n' +
    'ANSWER: zeta\n' +
    '<Auth, Category>';

  it('identifies two separate bonuses (Google Docs clipboard)', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(twoBonuses);
    const { packet } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(0);
    expect(packet.bonuses).toHaveLength(2);
    expect(packet.bonuses[0].parts).toHaveLength(3);
    expect(packet.bonuses[1].parts).toHaveLength(3);
    expect(packet.bonuses[0].tag).not.toBeNull();
    expect(packet.bonuses[1].tag).not.toBeNull();
  });

  it('identifies two separate bonuses (HTML already has blank)', () => {
    const { paragraphs, plainText } = simulateHtmlWithBlanks(twoBonuses);
    const { packet } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(0);
    expect(packet.bonuses).toHaveLength(2);
    expect(packet.bonuses[0].parts).toHaveLength(3);
    expect(packet.bonuses[1].parts).toHaveLength(3);
  });
});

describe('paste flow – mixed packet with blank-line separators', () => {
  const mixed =
    'Tossup one text. For 10 points, name it.\n' +
    'ANSWER: answer one\n' +
    '<Auth, Cat>\n' +
    '\n' +
    'Bonus lead-in. For 10 points each:\n' +
    '[10h] Hard part.\n' +
    'ANSWER: hard answer\n' +
    '[10m] Medium part.\n' +
    'ANSWER: medium answer\n' +
    '[10e] Easy part.\n' +
    'ANSWER: easy answer\n' +
    '<Auth, Cat>\n' +
    '\n' +
    'Tossup two text. For 10 points, identify this.\n' +
    'ANSWER: answer two\n' +
    '<Auth, Cat>';

  it('Google Docs: 2 tossups, 1 bonus, blank lines in output', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(mixed);
    const { packet, result } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(2);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].parts).toHaveLength(3);

    // Output should have 2 blank lines (between the 3 questions)
    const emptyCount = result.fixedParagraphs.filter(
      (p) => p.rawText === ''
    ).length;
    expect(emptyCount).toBe(2);
  });

  it('HTML with blanks: same 2 tossups, 1 bonus', () => {
    const { paragraphs, plainText } = simulateHtmlWithBlanks(mixed);
    const { packet } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(2);
    expect(packet.bonuses).toHaveLength(1);
    expect(packet.bonuses[0].parts).toHaveLength(3);
  });

  it('no spurious FTP diagnostics from bonus parts', () => {
    const { paragraphs, plainText } = simulateGDocsClipboard(mixed);
    const { packet, diags } = runPipeline(paragraphs, plainText);

    expect(packet.tossups).toHaveLength(2);
    expect(packet.bonuses).toHaveLength(1);

    // FTP rule should not fire — both tossups already say "For 10 points"
    const ftpDiags = diags.filter((d) => d.rule === 'question.ftp-format');
    expect(ftpDiags).toHaveLength(0);
  });
});
