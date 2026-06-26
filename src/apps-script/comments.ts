import { LintDiagnostic } from '../core/model.js';

export function insertCommentsForDiagnostics(
  diagnostics: LintDiagnostic[]
): number {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const numChildren = body.getNumChildren();

  const parIndexToElement = buildParagraphMap(body, numChildren);

  let inserted = 0;
  for (const d of diagnostics) {
    const element = parIndexToElement.get(d.paragraph);
    if (!element) continue;

    const commentText = formatCommentBody(d);
    const text = element.editAsText();
    const anchor = findAnchorPosition(text, d);

    try {
      // Use the cursor position API to place a comment at the diagnostic location
      const rangeBuilder = doc.newRange();
      if (anchor.offset >= 0 && anchor.length > 0) {
        rangeBuilder.addElement(
          text,
          anchor.offset,
          Math.min(anchor.offset + anchor.length - 1, text.getText().length - 1)
        );
      } else {
        rangeBuilder.addElement(element);
      }

      // Note: DocumentApp doesn't have a direct comment API.
      // We use the Drive Advanced Service to insert comments.
      insertDriveComment(doc.getId(), commentText, element, anchor);
      inserted++;
    } catch {
      // If comment insertion fails for a single diagnostic, continue with the rest
    }
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
  text: GoogleAppsScript.Document.Text,
  d: LintDiagnostic
): { offset: number; length: number } {
  if (d.offset != null && d.length != null && d.length > 0) {
    return { offset: d.offset, length: d.length };
  }
  // Default to the full paragraph
  return { offset: 0, length: text.getText().length };
}

function insertDriveComment(
  docId: string,
  commentText: string,
  _element: GoogleAppsScript.Document.Paragraph,
  anchor: { offset: number; length: number }
): void {
  const quotedContent = _element
    .editAsText()
    .getText()
    .substring(anchor.offset, anchor.offset + Math.min(anchor.length, 100));

  const resource = {
    content: commentText,
    quotedFileContent: {
      value: quotedContent,
    },
  };

  // @ts-expect-error Drive is an Apps Script Advanced Service
  Drive.Comments.create(resource, docId, { fields: 'id' });
}
