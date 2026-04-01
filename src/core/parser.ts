import JSZip from 'jszip';
import { Paragraph, Run } from './model.js';

/**
 * Parse a .docx file (as ArrayBuffer) into an array of Paragraphs
 * with run-level formatting metadata.
 */
export async function parseDocx(buffer: ArrayBuffer): Promise<Paragraph[]> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    throw new Error('Invalid .docx file: missing word/document.xml');
  }
  const xml = await docXml.async('string');
  return parseParagraphs(xml);
}

/**
 * Accept all tracked changes (revisions) in the Word XML.
 * - <w:del>: deleted text — remove entirely (accepting the deletion)
 * - <w:ins>: inserted text — unwrap tags, keep content (accepting the insertion)
 * - <w:moveFrom>: moved text source — remove entirely
 * - <w:moveTo>: moved text destination — unwrap tags, keep content
 * - <w:rPrChange>: formatting changes — remove (current formatting is already accepted)
 * - <w:pPrChange>: paragraph property changes — remove
 * - <w:sectPrChange>: section property changes — remove
 */
export function acceptRevisions(xml: string): string {
  // Remove deleted text and move sources (accept deletion = discard old text)
  let result = xml.replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '');
  result = result.replace(/<w:moveFrom\b[^>]*>[\s\S]*?<\/w:moveFrom>/g, '');

  // Unwrap insertions and move destinations (accept = keep content, remove wrapper)
  result = result.replace(/<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g, '$1');
  result = result.replace(/<w:moveTo\b[^>]*>([\s\S]*?)<\/w:moveTo>/g, '$1');

  // Remove property-change metadata (current properties are already correct)
  result = result.replace(/<w:rPrChange\b[^>]*>[\s\S]*?<\/w:rPrChange>/g, '');
  result = result.replace(/<w:pPrChange\b[^>]*>[\s\S]*?<\/w:pPrChange>/g, '');
  result = result.replace(/<w:sectPrChange\b[^>]*>[\s\S]*?<\/w:sectPrChange>/g, '');

  return result;
}

function parseParagraphs(xml: string): Paragraph[] {
  // Accept all tracked changes before parsing
  const cleanXml = acceptRevisions(xml);

  // Split on closing </w:p> tags to get each paragraph's XML
  const paraChunks = cleanXml.split(/<\/w:p>/);
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < paraChunks.length; i++) {
    const chunk = paraChunks[i];
    // Only process chunks that contain an opening <w:p> tag
    if (!chunk.includes('<w:p')) continue;

    const hasPageBreak =
      chunk.includes('w:type="page"') ||
      chunk.includes("w:type='page'") ||
      chunk.includes('<w:lastRenderedPageBreak');

    const runs = parseRuns(chunk);
    const rawText = runs.map((r) => r.text).join('');

    paragraphs.push({
      index: paragraphs.length,
      runs,
      rawText,
      hasPageBreak,
    });
  }

  return paragraphs;
}

function parseRuns(paraXml: string): Run[] {
  const runs: Run[] = [];
  // Split on </w:r> to get individual runs
  const runChunks = paraXml.split(/<\/w:r>/);

  for (const chunk of runChunks) {
    // Extract text from <w:t> elements
    const textMatches = [...chunk.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
    if (textMatches.length === 0) continue;

    const text = unescapeXml(textMatches.map((m) => m[1]).join(''));
    if (!text) continue;

    // Check formatting in the run properties (<w:rPr>)
    // Scope to content after <w:r> to skip paragraph-level <w:pPr><w:rPr>
    const runTagMatch = chunk.match(/<w:r[\s>]/);
    const runScope = runTagMatch ? chunk.substring(runTagMatch.index!) : chunk;
    const rPr = extractBetween(runScope, '<w:rPr>', '</w:rPr>') ?? '';

    const bold = hasProp(rPr, 'w:b');
    const italic = hasProp(rPr, 'w:i');
    const underline = rPr.includes('<w:u ') && !rPr.includes('w:val="none"');
    const superscript = /w:vertAlign[^>]*w:val\s*=\s*"superscript"/.test(rPr);
    const subscript = /w:vertAlign[^>]*w:val\s*=\s*"subscript"/.test(rPr);

    runs.push({ text, bold, italic, underline, superscript, subscript });
  }

  return runs;
}

function hasProp(rPr: string, tag: string): boolean {
  // Match <w:b/> or <w:b /> or <w:b> but not <w:b w:val="0"/> or <w:b w:val="false"/>
  const selfClosing = new RegExp(`<${tag}\\s*/>`);
  const withAttrs = new RegExp(`<${tag}[^>]*>`);

  if (selfClosing.test(rPr)) return true;

  const match = rPr.match(withAttrs);
  if (!match) return false;

  // Check for val="0" or val="false" which negate the property
  if (/w:val\s*=\s*"(0|false)"/.test(match[0])) return false;

  return true;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * Parse HTML (e.g. from Google Docs clipboard) into an array of Paragraphs
 * with run-level formatting metadata.
 */
export function parseHtml(html: string): Paragraph[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs: Paragraph[] = [];

  const pElements = doc.querySelectorAll('p');

  for (const p of Array.from(pElements)) {
    const runs: Run[] = [];

    // Walk child nodes — Google Docs wraps text in <span> elements
    for (const node of Array.from(p.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (text) {
          runs.push({
            text,
            bold: false,
            italic: false,
            underline: false,
            superscript: false,
            subscript: false,
          });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const text = el.textContent ?? '';
        if (!text) continue;

        const computedStyle = getComputedStyleFromElement(el);

        runs.push({
          text,
          bold: computedStyle.bold,
          italic: computedStyle.italic,
          underline: computedStyle.underline,
          superscript: computedStyle.superscript,
          subscript: computedStyle.subscript,
        });
      }
    }

    const rawText = runs.map((r) => r.text).join('');

    // Skip completely empty paragraphs only if there are no runs
    // (keep blank paragraphs for segmenter boundaries)
    paragraphs.push({
      index: paragraphs.length,
      runs,
      rawText,
      hasPageBreak: false,
    });
  }

  return paragraphs;
}

interface FormattingInfo {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
}

function getComputedStyleFromElement(el: HTMLElement): FormattingInfo {
  const style = el.getAttribute('style') ?? '';

  // Check inline style
  const fontWeight = extractStyleValue(style, 'font-weight');
  let bold = false;
  if (fontWeight) {
    const weight = parseInt(fontWeight, 10);
    bold = !isNaN(weight) ? weight >= 700 : fontWeight === 'bold';
  }

  const fontStyle = extractStyleValue(style, 'font-style');
  let italic = fontStyle === 'italic';

  const textDeco = extractStyleValue(style, 'text-decoration');
  const textDecoLine = extractStyleValue(style, 'text-decoration-line');
  let underline =
    (textDeco ? textDeco.includes('underline') : false) ||
    (textDecoLine ? textDecoLine.includes('underline') : false);

  const vertAlign = extractStyleValue(style, 'vertical-align');
  let superscript = vertAlign === 'super';
  let subscript = vertAlign === 'sub';

  // Also check HTML tags — Google Docs sometimes uses <b>, <i>, <u>
  if (!bold && (el.tagName === 'B' || el.tagName === 'STRONG')) bold = true;
  if (!italic && (el.tagName === 'I' || el.tagName === 'EM')) italic = true;
  if (!underline && el.tagName === 'U') underline = true;
  if (!superscript && el.tagName === 'SUP') superscript = true;
  if (!subscript && el.tagName === 'SUB') subscript = true;

  // Check child spans — Google Docs nests formatting in child spans
  if (el.tagName === 'SPAN' || el.tagName === 'A') {
    const children = el.querySelectorAll('span, b, strong, i, em, u, sup, sub');
    for (const child of Array.from(children)) {
      const childStyle = child.getAttribute('style') ?? '';
      const cfw = extractStyleValue(childStyle, 'font-weight');
      if (cfw) {
        const w = parseInt(cfw, 10);
        if (!isNaN(w) ? w >= 700 : cfw === 'bold') bold = true;
      }
      const cfs = extractStyleValue(childStyle, 'font-style');
      if (cfs === 'italic') italic = true;
      const ctd = extractStyleValue(childStyle, 'text-decoration');
      const ctdl = extractStyleValue(childStyle, 'text-decoration-line');
      if (
        (ctd && ctd.includes('underline')) ||
        (ctdl && ctdl.includes('underline'))
      )
        underline = true;
      const cva = extractStyleValue(childStyle, 'vertical-align');
      if (cva === 'super') superscript = true;
      if (cva === 'sub') subscript = true;

      if (child.tagName === 'B' || child.tagName === 'STRONG') bold = true;
      if (child.tagName === 'I' || child.tagName === 'EM') italic = true;
      if (child.tagName === 'U') underline = true;
      if (child.tagName === 'SUP') superscript = true;
      if (child.tagName === 'SUB') subscript = true;
    }
  }

  return { bold, italic, underline, superscript, subscript };
}

function extractStyleValue(style: string, property: string): string | null {
  // Match "property: value" in inline style string
  const re = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i');
  const match = style.match(re);
  return match ? match[1].trim().toLowerCase() : null;
}

function extractBetween(
  str: string,
  start: string,
  end: string
): string | null {
  const startIdx = str.indexOf(start);
  if (startIdx === -1) return null;
  const endIdx = str.indexOf(end, startIdx + start.length);
  if (endIdx === -1) return null;
  return str.substring(startIdx + start.length, endIdx);
}
