import { Paragraph, Packet, Question, BonusPart, Run } from "./model.js";
import { QUESTION_NUMBER, ANSWER, TAG, BONUS_PART } from "./patterns.js";

/**
 * Segment a flat list of paragraphs into a structured Packet.
 *
 * Before segmenting, a preprocessing step splits any paragraph whose raw text
 * contains concatenated ANSWER lines, bonus-part markers, or author tags
 * without intervening newlines into separate virtual paragraphs.
 */
export function segmentPacket(paragraphs: Paragraph[]): Packet {
  const processed = preprocessParagraphs(paragraphs);

  const packet: Packet = {
    header: [],
    tossupHeader: null,
    bonusHeader: null,
    tossups: [],
    bonuses: [],
    allParagraphs: processed,
    structured: false,
  };

  // Find section dividers
  let tossupIdx = -1;
  let bonusIdx = -1;

  for (let i = 0; i < processed.length; i++) {
    const text = processed[i].rawText.trim().toLowerCase();
    if (/\btossups:?\s*$/.test(text) && tossupIdx === -1) {
      tossupIdx = i;
      packet.tossupHeader = processed[i];
    } else if (
      /\bbonuses:?\s*$/.test(text) &&
      bonusIdx === -1
    ) {
      bonusIdx = i;
      packet.bonusHeader = processed[i];
    }
  }

  // If no section headers found, use flat-list fallback
  if (tossupIdx === -1 && bonusIdx === -1) {
    return segmentFlatList(processed);
  }

  packet.structured = true;

  // Header: everything before "Tossups"
  const headerEnd = tossupIdx !== -1 ? tossupIdx : processed.length;
  packet.header = processed.slice(0, headerEnd);

  // Parse tossups
  if (tossupIdx !== -1) {
    const tossupEnd = bonusIdx !== -1 ? bonusIdx : processed.length;
    const tossupParas = processed.slice(tossupIdx + 1, tossupEnd);
    packet.tossups = parseQuestions(tossupParas, "tossup");
  }

  // Parse bonuses
  if (bonusIdx !== -1) {
    const bonusParas = processed.slice(bonusIdx + 1);
    packet.bonuses = parseQuestions(bonusParas, "bonus");
  }

  return packet;
}

function parseQuestions(
  paragraphs: Paragraph[],
  type: "tossup" | "bonus"
): Question[] {
  const questions: Question[] = [];
  let current: Question | null = null;

  for (const para of paragraphs) {
    const text = para.rawText.trim();
    if (!text) {
      // Blank paragraph — question boundary
      if (current) {
        questions.push(current);
        current = null;
      }
      continue;
    }

    const numMatch = text.match(QUESTION_NUMBER);
    if (numMatch && !current) {
      // Start of a new question
      current = {
        type,
        number: parseInt(numMatch[1], 10),
        numberParagraph: para,
        paragraphs: [para],
        answerLine: null,
        tag: null,
        parts: [],
      };
    } else if (numMatch && current) {
      // New numbered question without a blank line separator — finalize the
      // previous question and start a new one.
      questions.push(current);
      current = {
        type,
        number: parseInt(numMatch[1], 10),
        numberParagraph: para,
        paragraphs: [para],
        answerLine: null,
        tag: null,
        parts: [],
      };
    } else if (current) {
      current.paragraphs.push(para);

      if (ANSWER.test(text)) {
        // If this is a bonus and we have parts, assign to the last part
        if (type === "bonus" && current.parts.length > 0) {
          current.parts[current.parts.length - 1].answerLine = para;
        } else {
          current.answerLine = para;
        }
      } else if (TAG.test(text)) {
        current.tag = para;
      } else if (type === "bonus" && BONUS_PART.test(text)) {
        const markerMatch = text.match(BONUS_PART)!;
        // Check if this paragraph also contains an embedded ANSWER:
        const restOfText = text.slice(markerMatch[0].length);
        const hasEmbeddedAnswer = /ANSWER\s*:/i.test(restOfText);
        current.parts.push({
          marker: markerMatch[0].trim(),
          textParagraph: para,
          answerLine: hasEmbeddedAnswer ? para : null,
        });
      }
    }
  }

  if (current) {
    questions.push(current);
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Flat-list fallback: infer questions from ANSWER: lines
// ---------------------------------------------------------------------------

const FTPE_RE = /for\s+10\s+points?\s+each|FTPE/i;

function segmentFlatList(processed: Paragraph[]): Packet {
  const packet: Packet = {
    header: [],
    tossupHeader: null,
    bonusHeader: null,
    tossups: [],
    bonuses: [],
    allParagraphs: processed,
    structured: false,
  };

  // Find all ANSWER: line indices
  const answerIndices: number[] = [];
  for (let i = 0; i < processed.length; i++) {
    if (ANSWER.test(processed[i].rawText.trim())) {
      answerIndices.push(i);
    }
  }

  if (answerIndices.length === 0) return packet;

  // Group answer lines into questions.
  // Walk backward from each answer line to find question start,
  // walk forward to find tag line.
  const questions: Question[] = [];
  const assigned = new Set<number>();

  // First pass: group consecutive ANSWER: lines that belong to bonuses
  // A question boundary is: previous tag line, blank line, or start of doc
  const questionGroups: { start: number; end: number; answerLines: number[] }[] = [];

  let gi = 0;
  while (gi < answerIndices.length) {
    const firstAnswer = answerIndices[gi];

    // Walk backward to find question start
    let start = firstAnswer;
    for (let j = firstAnswer - 1; j >= 0; j--) {
      const text = processed[j].rawText.trim();
      if (!text) break; // blank line
      if (ANSWER.test(text)) break; // previous answer
      if (TAG.test(text) && assigned.has(j)) break; // previous tag already assigned
      start = j;
    }

    // Collect consecutive answer lines that belong to this question
    const answerLines = [firstAnswer];
    let lastIdx = firstAnswer;

    // Look ahead for more answer lines that are part of this question (bonus parts)
    let ni = gi + 1;
    while (ni < answerIndices.length) {
      const nextAnswer = answerIndices[ni];
      // Check if there's a blank line or tag-only gap between
      let gapHasBlank = false;
      for (let k = lastIdx + 1; k < nextAnswer; k++) {
        const text = processed[k].rawText.trim();
        if (!text) { gapHasBlank = true; break; }
      }
      if (gapHasBlank) break;

      // Check if lines between are bonus parts or question text (not a new question start)
      const betweenLines = processed.slice(lastIdx + 1, nextAnswer);
      const hasBonusPartMarker = betweenLines.some(p => BONUS_PART.test(p.rawText.trim()));
      if (!hasBonusPartMarker && betweenLines.length > 0) {
        // Could still be bonus text without markers if the first chunk had markers
        const firstChunkText = processed.slice(start, firstAnswer + 1).map(p => p.rawText).join(" ");
        if (!BONUS_PART.test(firstChunkText) && !FTPE_RE.test(firstChunkText)) {
          break; // Separate question
        }
      }

      answerLines.push(nextAnswer);
      lastIdx = nextAnswer;
      ni++;
    }

    // Walk forward from last answer to find tag line
    let end = lastIdx;
    if (lastIdx + 1 < processed.length) {
      const nextText = processed[lastIdx + 1].rawText.trim();
      if (TAG.test(nextText)) {
        end = lastIdx + 1;
      }
    }

    for (let k = start; k <= end; k++) assigned.add(k);
    questionGroups.push({ start, end, answerLines });
    gi = ni;
  }

  // Build Question objects
  let tossupNum = 1;
  let bonusNum = 1;

  for (const group of questionGroups) {
    const paras = processed.slice(group.start, group.end + 1);
    const fullText = paras.map(p => p.rawText).join(" ");

    // Infer type
    const hasBonusPartMarkers = paras.some(p => BONUS_PART.test(p.rawText.trim()));
    const hasFTPE = FTPE_RE.test(fullText);
    const multipleAnswers = group.answerLines.length > 1;
    const isBonus = hasBonusPartMarkers || hasFTPE || multipleAnswers;

    const type = isBonus ? "bonus" : "tossup";
    const number = type === "tossup" ? tossupNum++ : bonusNum++;

    const q: Question = {
      type,
      number,
      numberParagraph: paras[0],
      paragraphs: paras,
      answerLine: null,
      tag: null,
      parts: [],
    };

    // Assign tag
    const lastPara = paras[paras.length - 1];
    if (TAG.test(lastPara.rawText.trim())) {
      q.tag = lastPara;
    }

    if (type === "bonus") {
      // Parse bonus parts
      for (const para of paras) {
        const text = para.rawText.trim();
        if (BONUS_PART.test(text)) {
          const markerMatch = text.match(BONUS_PART)!;
          const restOfText = text.slice(markerMatch[0].length);
          const hasEmbeddedAnswer = /ANSWER\s*:/i.test(restOfText);
          q.parts.push({
            marker: markerMatch[0].trim(),
            textParagraph: para,
            answerLine: hasEmbeddedAnswer ? para : null,
          });
        } else if (ANSWER.test(text)) {
          if (q.parts.length > 0 && !q.parts[q.parts.length - 1].answerLine) {
            q.parts[q.parts.length - 1].answerLine = para;
          } else {
            q.answerLine = para;
          }
        }
      }
    } else {
      // Tossup: find the ANSWER: line
      for (const para of paras) {
        if (ANSWER.test(para.rawText.trim())) {
          q.answerLine = para;
          break;
        }
      }
    }

    if (type === "tossup") {
      packet.tossups.push(q);
    } else {
      packet.bonuses.push(q);
    }
  }

  return packet;
}

// ---------------------------------------------------------------------------
// Preprocessing: split concatenated paragraphs
// ---------------------------------------------------------------------------

/**
 * Some .docx files contain entire questions (text + ANSWER + tag, or multiple
 * bonus parts) crammed into a single Word paragraph with no line breaks.
 * This function detects those cases and splits them into separate virtual
 * paragraphs so the segmenter can parse them normally.
 */
function preprocessParagraphs(paragraphs: Paragraph[]): Paragraph[] {
  const result: Paragraph[] = [];

  for (const para of paragraphs) {
    const splits = splitConcatenatedParagraph(para);
    result.push(...splits);
  }

  // Re-index so every paragraph has a unique, sequential index
  for (let i = 0; i < result.length; i++) {
    result[i] = { ...result[i], index: i };
  }

  return result;
}

/**
 * Identify positions within a single paragraph's rawText where a new logical
 * paragraph should begin and split accordingly.  Split points are:
 *
 *  - Before `ANSWER:` (case-insensitive) that is not at the start of text
 *  - Before a bonus-part marker `[10e]`, `[10m]`, `[10h]`, `[E]`, `[M]`, `[H]`
 *    that is not at the start of text
 *  - Before a trailing author tag `<Author, Category>` optionally followed by
 *    `[Edited]` or similar editorial suffixes
 */
function splitConcatenatedParagraph(para: Paragraph): Paragraph[] {
  const text = para.rawText;
  if (!text.trim()) return [para];

  const splitPoints: number[] = [];

  // ANSWER: not at the very start
  let match: RegExpExecArray | null;
  const answerRe = /ANSWER\s*:/gi;
  while ((match = answerRe.exec(text)) !== null) {
    if (match.index > 0 && text.substring(0, match.index).trim().length > 0) {
      splitPoints.push(match.index);
    }
  }

  // Bonus-part markers not at the very start
  const partRe = /\[(10[emh]?|[EMH])\]/gi;
  while ((match = partRe.exec(text)) !== null) {
    if (match.index > 0 && text.substring(0, match.index).trim().length > 0) {
      splitPoints.push(match.index);
    }
  }

  // Trailing author tag  —  <Name, Category> optionally followed by [Edited] etc.
  const tagMatch = text.match(
    /<[A-Z][^>]{2,}>\s*(?:[\[{][^\]\}]*[\]\}])?\s*$/i
  );
  if (
    tagMatch &&
    tagMatch.index! > 0 &&
    text.substring(0, tagMatch.index!).trim().length > 0
  ) {
    splitPoints.push(tagMatch.index!);
  }

  if (splitPoints.length === 0) return [para];

  // Sort, deduplicate
  const positions = [...new Set(splitPoints)].sort((a, b) => a - b);

  // Build sub-paragraphs
  const subParas: Paragraph[] = [];
  let prevPos = 0;

  for (const pos of positions) {
    if (pos <= prevPos) continue;
    const subText = text.substring(prevPos, pos);
    if (subText.trim()) {
      subParas.push({
        index: para.index, // will be re-indexed later
        runs: sliceRuns(para.runs, prevPos, pos),
        rawText: subText,
        hasPageBreak: prevPos === 0 ? para.hasPageBreak : false,
      });
    }
    prevPos = pos;
  }

  // Last segment
  const lastText = text.substring(prevPos);
  if (lastText.trim()) {
    subParas.push({
      index: para.index,
      runs: sliceRuns(para.runs, prevPos, text.length),
      rawText: lastText,
      hasPageBreak: subParas.length === 0 ? para.hasPageBreak : false,
    });
  }

  return subParas.length > 1 ? subParas : [para];
}

/**
 * Extract the sub-sequence of runs that covers characters
 * `[startChar, endChar)` within the concatenated run text.
 */
function sliceRuns(
  runs: Run[],
  startChar: number,
  endChar: number
): Run[] {
  const result: Run[] = [];
  let pos = 0;

  for (const run of runs) {
    const runEnd = pos + run.text.length;

    if (runEnd <= startChar) {
      pos = runEnd;
      continue;
    }
    if (pos >= endChar) break;

    const sliceStart = Math.max(0, startChar - pos);
    const sliceEnd = Math.min(run.text.length, endChar - pos);
    const slicedText = run.text.substring(sliceStart, sliceEnd);

    if (slicedText) {
      result.push({ ...run, text: slicedText });
    }

    pos = runEnd;
  }

  return result;
}
