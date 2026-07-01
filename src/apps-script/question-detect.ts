import { Paragraph } from '../core/model.js';
import { parseGoogleDocRange } from './parser.js';

const NUMBERED_RE = /^\d+\.\s/;
const ANSWER_RE = /^ANSWER:/i;
const HEADER_RE = /^(Tossups?|Bonuses?)\s*$/i;
const TAG_RE = /^<[^>]+,\s*[^>]+>\s*$/;

export interface DetectedQuestion {
  paragraphs: Paragraph[];
  label: string | null;
}

export function detectCurrentQuestion(): DetectedQuestion | null {
  const doc = DocumentApp.getActiveDocument();
  const cursor = doc.getCursor();
  if (!cursor) {
    return null;
  }

  const cursorElement = cursor.getElement();
  const body = doc.getBody();

  // Lightweight pass: get only raw text for all paragraphs (no formatting extraction)
  const rawTexts = getRawTexts(body);

  const cursorParaIndex = findCursorParagraphIndex(body, cursorElement);
  if (cursorParaIndex === -1 || cursorParaIndex >= rawTexts.length) {
    return null;
  }

  const cursorText = rawTexts[cursorParaIndex];
  if (HEADER_RE.test(cursorText) || cursorText.trim() === '') {
    return null;
  }

  let startIdx = cursorParaIndex;
  let endIdx = cursorParaIndex;

  // Walk backward to find question start
  for (let i = cursorParaIndex - 1; i >= 0; i--) {
    const text = rawTexts[i];

    if (HEADER_RE.test(text)) {
      break;
    }

    if (TAG_RE.test(text)) {
      break;
    }

    if (text.trim() === '') {
      break;
    }

    // If this line is a numbered start, it's the beginning of our question
    if (NUMBERED_RE.test(text)) {
      startIdx = i;
      break;
    }

    startIdx = i;
  }

  // Walk forward to find question end
  for (let i = cursorParaIndex + 1; i < rawTexts.length; i++) {
    const text = rawTexts[i];

    if (HEADER_RE.test(text)) {
      break;
    }

    // A numbered start that isn't part of a bonus
    if (NUMBERED_RE.test(text) && !isBonusPartContinuation(rawTexts, startIdx, i)) {
      break;
    }

    if (text.trim() === '') {
      break;
    }

    endIdx = i;

    if (TAG_RE.test(text)) {
      break;
    }
  }

  if (startIdx === endIdx && rawTexts[startIdx].trim() === '') {
    return null;
  }

  // Full formatting parse only for the detected range
  const paragraphs = parseGoogleDocRange(body, startIdx, endIdx + 1);

  const label = inferLabel(rawTexts, startIdx);

  return { paragraphs, label };
}

function getRawTexts(body: GoogleAppsScript.Document.Body): string[] {
  const texts: string[] = [];
  const numChildren = body.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (
      child.getType() === DocumentApp.ElementType.PARAGRAPH ||
      child.getType() === DocumentApp.ElementType.LIST_ITEM
    ) {
      texts.push(child.asParagraph().editAsText().getText());
    }
  }
  return texts;
}

function findCursorParagraphIndex(
  body: GoogleAppsScript.Document.Body,
  element: GoogleAppsScript.Document.Element
): number {
  // Walk up to the paragraph-level element
  let el: GoogleAppsScript.Document.Element | null = element;
  while (
    el &&
    el.getType() !== DocumentApp.ElementType.PARAGRAPH &&
    el.getType() !== DocumentApp.ElementType.LIST_ITEM
  ) {
    el = el.getParent() as GoogleAppsScript.Document.Element | null;
  }
  if (!el) return -1;

  // Find which paragraph index this element corresponds to
  const numChildren = body.getNumChildren();
  let paraCount = 0;
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (
      child.getType() === DocumentApp.ElementType.PARAGRAPH ||
      child.getType() === DocumentApp.ElementType.LIST_ITEM
    ) {
      // Compare by identity using the parent body index
      if (body.getChildIndex(el) === i) {
        return paraCount;
      }
      paraCount++;
    }
  }
  return -1;
}

function isBonusPartContinuation(
  texts: string[],
  questionStart: number,
  candidateIdx: number
): boolean {
  for (let i = questionStart; i < candidateIdx; i++) {
    if (/\[10[emh]\]/i.test(texts[i]) || /for 10 points each/i.test(texts[i])) {
      return true;
    }
  }
  return false;
}

function inferLabel(rawTexts: string[], startIdx: number): string | null {
  const firstText = rawTexts[startIdx];
  const numMatch = firstText.match(/^(\d+)\.\s/);
  const number = numMatch ? numMatch[1] : null;

  let type: 'Tossup' | 'Bonus' | null = null;
  for (let i = startIdx - 1; i >= 0; i--) {
    if (/^Tossups?\s*$/i.test(rawTexts[i])) {
      type = 'Tossup';
      break;
    }
    if (/^Bonuses?\s*$/i.test(rawTexts[i])) {
      type = 'Bonus';
      break;
    }
  }

  if (!type) {
    for (let i = startIdx; i < rawTexts.length; i++) {
      if (/\[10[emh]\]/i.test(rawTexts[i]) || /for 10 points each/i.test(rawTexts[i])) {
        type = 'Bonus';
        break;
      }
      if (ANSWER_RE.test(rawTexts[i])) {
        type = 'Tossup';
        break;
      }
    }
  }

  if (type && number) return `${type} ${number}`;
  if (type) return type;
  if (number) return `Question ${number}`;
  return null;
}
