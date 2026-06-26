import { Paragraph, Run } from '../core/model.js';

export function parseGoogleDoc(): Paragraph[] {
  Logger.log('parseGoogleDoc: getting active document');
  const doc = DocumentApp.getActiveDocument();
  Logger.log('parseGoogleDoc: doc name = ' + doc.getName());
  const body = doc.getBody();
  const numChildren = body.getNumChildren();
  Logger.log('parseGoogleDoc: body has ' + numChildren + ' children');
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (
      child.getType() !== DocumentApp.ElementType.PARAGRAPH &&
      child.getType() !== DocumentApp.ElementType.LIST_ITEM
    ) {
      continue;
    }

    const para = child.asParagraph();
    const text = para.editAsText();
    const rawText = text.getText();

    const hasPageBreak = detectPageBreak(para);
    const runs = extractRuns(text, rawText);

    paragraphs.push({
      index: paragraphs.length,
      runs,
      rawText,
      hasPageBreak,
    });
  }

  return paragraphs;
}

function extractRuns(
  text: GoogleAppsScript.Document.Text,
  rawText: string
): Run[] {
  if (rawText.length === 0) {
    return [
      {
        text: '',
        bold: false,
        italic: false,
        underline: false,
        superscript: false,
        subscript: false,
      },
    ];
  }

  // getTextAttributeIndices() returns offsets where formatting changes —
  // much faster than checking every character individually
  const indices = text.getTextAttributeIndices();
  const runs: Run[] = [];

  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : rawText.length;
    const fmt = getFormattingAt(text, start);

    runs.push({
      text: rawText.substring(start, end),
      bold: fmt.bold,
      italic: fmt.italic,
      underline: fmt.underline,
      superscript: fmt.superscript,
      subscript: fmt.subscript,
    });
  }

  return runs;
}

interface Formatting {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
}

function getFormattingAt(
  text: GoogleAppsScript.Document.Text,
  offset: number
): Formatting {
  const vertAlign = text.getTextAlignment(offset);
  return {
    bold: text.isBold(offset) ?? false,
    italic: text.isItalic(offset) ?? false,
    underline: text.isUnderline(offset) ?? false,
    superscript:
      vertAlign === DocumentApp.TextAlignment.SUPERSCRIPT,
    subscript:
      vertAlign === DocumentApp.TextAlignment.SUBSCRIPT,
  };
}

function detectPageBreak(
  para: GoogleAppsScript.Document.Paragraph
): boolean {
  const numChildren = para.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    if (
      para.getChild(i).getType() === DocumentApp.ElementType.PAGE_BREAK
    ) {
      return true;
    }
  }
  return false;
}
