import { Paragraph, Packet } from "../model.js";
import { ANSWER } from "../patterns.js";

/**
 * Replace all quoted regions with spaces (preserving string length).
 * Handles curly double quotes, straight double quotes, and curly single quotes.
 */
export function stripQuotedText(text: string): string {
  return text
    .replace(/\u201c[^\u201d]*\u201d/g, (m) => " ".repeat(m.length))
    .replace(/"[^"]*"/g, (m) => " ".repeat(m.length))
    .replace(/\u2018[^\u2019]*\u2019/g, (m) => " ".repeat(m.length));
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
  const chars = text.split("");
  for (let i = 0; i < chars.length && i < italicMap.length; i++) {
    if (italicMap[i]) chars[i] = " ";
  }
  return chars.join("");
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
  for (const q of [...packet.tossups, ...packet.bonuses]) {
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
