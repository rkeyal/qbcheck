import {
  Paragraph,
  Packet,
  Question,
  LintDiagnostic,
  Severity,
  Run,
  AutoFix,
} from '../model.js';
import { ANSWER } from '../patterns.js';

/**
 * Character formatting info extracted from runs.
 */
export interface CharFormat {
  bold: boolean;
  underline: boolean;
}

/**
 * Replace all quoted regions with spaces (preserving string length).
 * Handles curly double quotes, straight double quotes, and curly single quotes.
 */
export function stripQuotedText(text: string): string {
  return text
    .replace(/\u201c[^\u201d]*\u201d/g, (m) => ' '.repeat(m.length))
    .replace(/"[^"]*"/g, (m) => ' '.repeat(m.length))
    .replace(/\u2018[^\u2019]*\u2019/g, (m) => ' '.repeat(m.length));
}

/**
 * Build a per-character italic map from a paragraph's runs.
 */
function buildItalicMap(para: Paragraph): boolean[] {
  const map: boolean[] = [];
  for (const run of para.runs) {
    for (let i = 0; i < run.text.length; i++) {
      map.push(run.italic);
    }
  }
  return map;
}

/**
 * Strip only italic text from a paragraph, preserving quoted regions.
 * Use for rules where the flagged content appears inside quotes
 * (e.g. poetry slashes) but not inside titles.
 */
export function stripItalicOnly(para: Paragraph): string {
  return stripItalicText(para.rawText, buildItalicMap(para));
}

/**
 * Blank out italic character ranges, replacing them with spaces.
 */
function stripItalicText(text: string, italicMap: boolean[]): string {
  const chars = text.split('');
  for (let i = 0; i < chars.length && i < italicMap.length; i++) {
    if (italicMap[i]) chars[i] = ' ';
  }
  return chars.join('');
}

/**
 * Strip both quoted and italic text from a paragraph, replacing
 * matched regions with spaces so character offsets are preserved.
 * Use this to avoid flagging titles, quotations, and other
 * text that should not be subject to style/formatting rules.
 */
export function stripTitleText(para: Paragraph): string {
  let text = stripQuotedText(para.rawText);
  const italicMap = buildItalicMap(para);
  text = stripItalicText(text, italicMap);
  return text;
}

/**
 * Iterate over all questions (tossups then bonuses) in a packet.
 */
export function* allQuestions(packet: Packet): Generator<Question> {
  yield* packet.tossups;
  yield* packet.bonuses;
}

/**
 * Collect all answer line paragraphs from tossups and bonus parts.
 */
export function getAnswerLines(packet: Packet): Paragraph[] {
  const lines: Paragraph[] = [];
  for (const q of packet.tossups) {
    if (q.answerLine) lines.push(q.answerLine);
  }
  for (const q of packet.bonuses) {
    if (q.answerLine) lines.push(q.answerLine);
    for (const part of q.parts) {
      if (part.answerLine) lines.push(part.answerLine);
    }
  }
  return lines;
}

/**
 * Get paragraphs from all questions in the packet, with optional filtering.
 *
 * @param packet - The packet to extract paragraphs from
 * @param filter - Optional filter mode:
 *   - undefined or 'all': returns all question paragraphs
 *   - 'non-answer': excludes ANSWER: lines
 *   - 'text-only': excludes both ANSWER: lines and tag lines
 * @returns Array of paragraphs matching the filter criteria
 */
export function getQuestionParagraphs(
  packet: Packet,
  filter?: 'all' | 'non-answer' | 'text-only'
): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const q of allQuestions(packet)) {
    for (const p of q.paragraphs) {
      const text = p.rawText.trim();

      // Apply filters
      if (filter === 'non-answer' || filter === 'text-only') {
        if (ANSWER.test(text)) continue;
      }
      if (filter === 'text-only') {
        if (/^\s*<[^>]+>\s*$/.test(text)) continue;
      }

      paras.push(p);
    }
  }
  return paras;
}

/**
 * Find the character offset of a search string within raw text,
 * with optional approximate starting position for more efficient searching.
 *
 * When stripping/filtering produces an approximate index from the processed text,
 * this function searches backward a bit from that position to account for
 * characters that were removed during processing.
 *
 * @param rawText - The original text to search in
 * @param searchText - The text to find
 * @param approximateIndex - Optional hint about where the match might be
 * @returns The character offset of the match, or -1 if not found
 */
export function findOffsetInRawText(
  rawText: string,
  searchText: string,
  approximateIndex?: number
): number {
  // If we have an approximate index, search nearby first (with a small lookback)
  if (approximateIndex !== undefined && approximateIndex > 0) {
    const searchStart = Math.max(0, approximateIndex - 10);
    const nearbyMatch = rawText.indexOf(searchText, searchStart);
    if (nearbyMatch !== -1) return nearbyMatch;
  }

  // Fall back to searching from the beginning
  return rawText.indexOf(searchText);
}

/**
 * Create a lint diagnostic with standard fields, reducing boilerplate.
 *
 * @param rule - The rule ID (e.g., "writing.no-contractions")
 * @param para - The paragraph being checked
 * @param message - The diagnostic message
 * @param opts - Optional fields (severity defaults to 'warning')
 * @returns A complete LintDiagnostic object
 */
export function createDiagnostic(
  rule: string,
  para: Paragraph,
  message: string,
  opts?: {
    severity?: Severity;
    offset?: number;
    length?: number;
    suggestion?: string;
    fix?: AutoFix;
  }
): LintDiagnostic {
  return {
    rule,
    severity: opts?.severity ?? 'warning',
    paragraph: para.index,
    message,
    sourceText: para.rawText,
    offset: opts?.offset,
    length: opts?.length,
    suggestion: opts?.suggestion,
    fix: opts?.fix,
  };
}

/**
 * Build a per-character formatting map from runs.
 *
 * @param runs - The text runs from a paragraph
 * @returns An array mapping each character position to its formatting
 */
export function buildFormattingMap(runs: Run[]): CharFormat[] {
  const map: CharFormat[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      map.push({ bold: run.bold, underline: run.underline });
    }
  }
  return map;
}

/**
 * Check if a range of text has bold AND underlined formatting.
 *
 * @param fmtMap - The formatting map from buildFormattingMap()
 * @param startIdx - Start character index
 * @param endIdx - End character index (exclusive)
 * @param rawText - The raw text to check for non-whitespace
 * @returns True if any non-whitespace character in the range is both bold and underlined
 */
export function hasBoldUnderline(
  fmtMap: CharFormat[],
  startIdx: number,
  endIdx: number,
  rawText: string
): boolean {
  for (let i = startIdx; i < endIdx; i++) {
    if (
      i < fmtMap.length &&
      fmtMap[i].bold &&
      fmtMap[i].underline &&
      rawText[i].trim()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a range of text has underlined formatting.
 *
 * @param fmtMap - The formatting map from buildFormattingMap()
 * @param startIdx - Start character index
 * @param endIdx - End character index (exclusive)
 * @param rawText - The raw text to check for non-whitespace
 * @returns True if any non-whitespace character in the range is underlined
 */
export function hasUnderline(
  fmtMap: CharFormat[],
  startIdx: number,
  endIdx: number,
  rawText: string
): boolean {
  for (let i = startIdx; i < endIdx; i++) {
    if (i < fmtMap.length && fmtMap[i].underline && rawText[i].trim()) {
      return true;
    }
  }
  return false;
}
