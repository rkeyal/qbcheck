import { Paragraph } from "../model.js";

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
