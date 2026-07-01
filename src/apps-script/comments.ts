import { LintDiagnostic } from '../core/model.js';

export function insertCommentsForDiagnostics(
  diagnostics: LintDiagnostic[]
): number {
  const doc = DocumentApp.getActiveDocument();
  const docId = doc.getId();
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const parIndexToElement = buildParagraphMap(body, numChildren);

  let inserted = 0;
  const errors: string[] = [];

  for (const d of diagnostics) {
    const element = parIndexToElement.get(d.paragraph);
    if (!element) {
      errors.push(`Paragraph ${d.paragraph} not found`);
      continue;
    }

    const commentText = formatCommentBody(d);
    const rawText = element.editAsText().getText();
    const anchor = findAnchorPosition(d, rawText);

    try {
      const quotedContent = rawText.substring(
        anchor.offset,
        anchor.offset + Math.min(anchor.length, 200)
      );

      if (!quotedContent.trim()) {
        errors.push(`Empty anchor text for ${d.rule} at paragraph ${d.paragraph}`);
        continue;
      }

      // Drive Advanced Service v3
      // @ts-expect-error Drive is an Apps Script Advanced Service
      Drive.Comments.create(
        {
          content: commentText,
          quotedFileContent: {
            value: quotedContent,
            mimeType: 'text/html',
          },
        },
        docId,
        { fields: 'id' }
      );
      inserted++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Failed to insert comment for ${d.rule}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    Logger.log('Comment insertion errors: ' + errors.join('; '));
  }

  return inserted;
}

function buildParagraphMap(
  body: GoogleAppsScript.Document.Body,
  numChildren: number
): Map<number, GoogleAppsScript.Document.Paragraph> {
  const map = new Map<number, GoogleAppsScript.Document.Paragraph>();
  let paraIndex = 0;

  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (
      child.getType() === DocumentApp.ElementType.PARAGRAPH ||
      child.getType() === DocumentApp.ElementType.LIST_ITEM
    ) {
      map.set(paraIndex, child.asParagraph());
      paraIndex++;
    }
  }

  return map;
}

function formatCommentBody(d: LintDiagnostic): string {
  let body = `[${d.rule}] ${d.message}`;

  if (d.suggestion) {
    body += `\n\nSuggested fix: ${d.suggestion}`;
  } else if (d.fix) {
    body += `\n\nSuggested fix: replace "${d.fix.oldText}" with "${d.fix.newText}"`;
  }

  return body;
}

function findAnchorPosition(
  d: LintDiagnostic,
  rawText: string
): { offset: number; length: number } {
  if (d.offset != null && d.length != null && d.length > 0) {
    return { offset: d.offset, length: d.length };
  }
  // Default to the full paragraph text
  return { offset: 0, length: rawText.length };
}
