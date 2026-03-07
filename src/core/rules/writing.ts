import { Packet, LintDiagnostic, LintRule, Paragraph } from "../model.js";
import {
  WEASEL_WORDS,
  WORD_REPLACEMENTS,
  CONTRACTION_RE,
} from "../../shared/constants.js";

function getQuestionTextParagraphs(packet: Packet): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const q of [...packet.tossups, ...packet.bonuses]) {
    // Include question text paragraphs but not answer lines or tags
    for (const p of q.paragraphs) {
      const text = p.rawText.trim();
      if (/^\s*ANSWER/i.test(text)) continue;
      if (/^\s*<[^>]+>\s*$/.test(text)) continue;
      paras.push(p);
    }
  }
  return paras;
}

/**
 * Remove all quoted regions from text so phrasing rules
 * don't flag language that appears inside quotations.
 * Handles curly quotes (\u201c\u201d), straight quotes, and single curly quotes (\u2018\u2019).
 */
function stripQuotedText(text: string): string {
  return text
    .replace(/\u201c[^\u201d]*\u201d/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\u2018[^\u2019]*\u2019/g, "");
}

function checkContractions(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const text = stripQuotedText(para.rawText);
    const matches = [...text.matchAll(CONTRACTION_RE)];
    for (const match of matches) {
      diags.push({
        rule: "writing.no-contractions",
        severity: "warning",
        paragraph: para.index,
        message: `Avoid contraction "${match[1]}". Spell it out.`,
      });
    }
  }

  return diags;
}

function checkWeaselWords(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const textLower = stripQuotedText(para.rawText).toLowerCase();

    for (const word of WEASEL_WORDS) {
      const re = new RegExp(`\\b${word.replace(/-/g, "[-\\s]?")}\\b`, "gi");
      if (re.test(textLower)) {
        diags.push({
          rule: "writing.no-weasel-words",
          severity: "info",
          paragraph: para.index,
          message: `Avoid "${word}" — if it appears in quizbowl, it's already notable.`,
        });
        break; // One per paragraph to avoid noise
      }
    }
  }

  return diags;
}

function checkWordReplacements(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const text = stripQuotedText(para.rawText);

    for (const [bad, good] of Object.entries(WORD_REPLACEMENTS)) {
      // Skip "following" when used in "answer the following"
      if (bad === "following" && /\banswer the following\b/i.test(text)) continue;

      const re = new RegExp(`\\b${bad}\\b`, "gi");
      if (re.test(text)) {
        diags.push({
          rule: "writing.word-replacements",
          severity: "info",
          paragraph: para.index,
          message: `Consider replacing "${bad}" with "${good}".`,
        });
      }
    }
  }

  return diags;
}

function checkAbsoluteTime(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const relativeTime =
    /\b(recently|last year|this year|last month|currently|presently|nowadays|at present|to date)\b/gi;

  for (const para of getQuestionTextParagraphs(packet)) {
    const stripped = stripQuotedText(para.rawText);
    const matches = [...stripped.matchAll(relativeTime)];
    for (const match of matches) {
      // Skip "this year" when used as a factual clue (e.g. "in this year", "during this year")
      if (/^this year$/i.test(match[1])) {
        const before = stripped.substring(Math.max(0, match.index! - 15), match.index!);
        if (/\b(in|during|of|from)\s*$/i.test(before)) continue;
      }

      diags.push({
        rule: "writing.absolute-time",
        severity: "warning",
        paragraph: para.index,
        message: `Use absolute dates instead of "${match[1]}".`,
      });
    }
  }

  return diags;
}

function checkAnswerSomeQuestions(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.bonuses) {
    const text = q.numberParagraph.rawText;
    if (/\banswer\s+some\s+questions?\s+about\b/i.test(text)) {
      diags.push({
        rule: "writing.answer-some-questions",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Use "Answer the following about" instead of "Answer some questions about".',
      });
    }
  }

  return diags;
}

function checkWouldGoOnTo(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const text = stripQuotedText(para.rawText);

    if (/\bwould\s+go\s+on\s+to\b/i.test(text)) {
      diags.push({
        rule: "writing.would-go-on-to",
        severity: "info",
        paragraph: para.index,
        message:
          'Avoid "would go on to." Use simple past tense instead (e.g. "He wrote" not "He would go on to write").',
      });
    }

    if (/\bwent\s+on\s+to\b/i.test(text)) {
      diags.push({
        rule: "writing.would-go-on-to",
        severity: "info",
        paragraph: para.index,
        message:
          'Avoid "went on to." Use simple past tense instead (e.g. "He wrote" not "He went on to write").',
      });
    }
  }

  return diags;
}

export const writingRules: LintRule[] = [
  checkContractions,
  checkWeaselWords,
  checkWordReplacements,
  checkAbsoluteTime,
  checkAnswerSomeQuestions,
  checkWouldGoOnTo,
];
