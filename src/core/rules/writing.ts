import { Packet, LintDiagnostic, LintRule, Paragraph } from "../model.js";
import {
  WEASEL_WORDS,
  WORD_REPLACEMENTS,
  CONTRACTION_RE,
} from "../../shared/constants.js";
import { stripTitleText } from "./utils.js";

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

function checkContractions(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const text = stripTitleText(para);
    const matches = [...text.matchAll(CONTRACTION_RE)];
    for (const match of matches) {
      const rawOffset = para.rawText.indexOf(match[1], match.index! > 10 ? match.index! - 10 : 0);
      diags.push({
        rule: "writing.no-contractions",
        severity: "warning",
        paragraph: para.index,
        message: `Avoid contraction "${match[1]}". Spell it out.`,
        sourceText: para.rawText,
        offset: rawOffset !== -1 ? rawOffset : match.index!,
        length: match[1].length,
      });
    }
  }

  return diags;
}

function checkWeaselWords(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const stripped = stripTitleText(para);

    for (const word of WEASEL_WORDS) {
      const re = new RegExp(`\\b${word.replace(/-/g, "[-\\s]?")}\\b`, "gi");
      const m = stripped.match(re);
      if (m) {
        // Find offset in original text for correct highlighting
        const rawIdx = para.rawText.search(re);
        diags.push({
          rule: "writing.no-weasel-words",
          severity: "info",
          paragraph: para.index,
          message: `Avoid "${word}" — if it appears in quizbowl, it's already notable.`,
          sourceText: para.rawText,
          offset: rawIdx !== -1 ? rawIdx : undefined,
          length: m[0].length,
        });
        break; // One per paragraph to avoid noise
      }
    }
  }

  return diags;
}

// Phrasal verbs where "upon" is idiomatic and "on" would be unnatural
const UPON_PHRASAL_VERBS = /\b(called|stumbled|relied|based|bestow(?:ed)?|confer(?:red)?|impose[ds]?|inflict(?:ed)?|look(?:ed|ing)?|act(?:ed|ing)?|draw[ns]?|built?|expand(?:ed|ing)?|improv(?:e[ds]?|ing)|decided?|agree[ds]?|embark(?:ed|ing)?|depend(?:ed|s|ing)?|hit|come|came|happen(?:ed|s)?|chance[ds]?|settle[ds]?|insist(?:ed|s|ing)?|enter(?:ed)?|seize[ds]?|descend(?:ed)?|reflect(?:ed|ing)?|verge[ds]?)\s+upon\b/i;

function checkWordReplacements(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const text = stripTitleText(para);

    for (const [bad, good] of Object.entries(WORD_REPLACEMENTS)) {
      // Skip "following" when preceded by "the" (adjective/noun sense)
      if (bad === "following") {
        if (/\bthe following\b/i.test(text)) continue;
        if (/\banswer the following\b/i.test(text)) continue;
      }

      // Skip "upon" in phrasal verbs and "upon + gerund" constructions
      if (bad === "upon") {
        if (UPON_PHRASAL_VERBS.test(text)) continue;
        if (/\bupon\s+[a-z]+ing\b/i.test(text)) continue;
      }

      const re = new RegExp(`\\b${bad}\\b`, "gi");
      const matches = [...text.matchAll(re)];
      // Filter out capitalized matches that aren't at the start of a
      // sentence — a capitalized word mid-sentence is likely a proper noun.
      const flaggable = matches.filter((m) => {
        const matched = m[0];
        if (matched[0] === matched[0].toLowerCase()) return true; // lowercase → always flag
        // Capitalized: only flag if it looks like sentence start
        const before = text.substring(0, m.index!);
        return /(?:^|[.!?]\s*)$/.test(before.trimEnd());
      });
      if (flaggable.length > 0) {
        const first = flaggable[0];
        const rawIdx = para.rawText.indexOf(first[0], first.index! > 10 ? first.index! - 10 : 0);
        diags.push({
          rule: "writing.word-replacements",
          severity: "info",
          paragraph: para.index,
          message: `Consider replacing "${bad}" with "${good}".`,
          sourceText: para.rawText,
          offset: rawIdx !== -1 ? rawIdx : undefined,
          length: first[0].length,
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
    const stripped = stripTitleText(para);
    const matches = [...stripped.matchAll(relativeTime)];
    for (const match of matches) {
      // Skip "this year" when used as a factual clue (e.g. "in this year", "during this year")
      if (/^this year$/i.test(match[1])) {
        const before = stripped.substring(Math.max(0, match.index! - 15), match.index!);
        if (/\b(in|during|of|from|since)\s*$/i.test(before)) continue;
      }

      // Find the true offset in the original (un-stripped) text
      const rawOffset = para.rawText.indexOf(match[1], match.index! > 10 ? match.index! - 10 : 0);

      diags.push({
        rule: "writing.absolute-time",
        severity: "warning",
        paragraph: para.index,
        message: `Use absolute dates instead of "${match[1]}".`,
        sourceText: para.rawText,
        offset: rawOffset !== -1 ? rawOffset : match.index!,
        length: match[1].length,
      });
    }
  }

  return diags;
}

function checkAnswerSomeQuestions(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.bonuses) {
    const text = q.numberParagraph.rawText;
    const asqMatch = text.match(/\banswer\s+some\s+questions?\s+about\b/i);
    if (asqMatch) {
      diags.push({
        rule: "writing.answer-some-questions",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Use "Answer the following about" instead of "Answer some questions about".',
        sourceText: text,
        offset: asqMatch.index!,
        length: asqMatch[0].length,
      });
    }
  }

  return diags;
}

function checkWouldGoOnTo(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionTextParagraphs(packet)) {
    const text = stripTitleText(para);

    const wgotMatch = text.match(/\bwould\s+go\s+on\s+to\b/i);
    if (wgotMatch) {
      const rawOffset = para.rawText.search(/\bwould\s+go\s+on\s+to\b/i);
      diags.push({
        rule: "writing.would-go-on-to",
        severity: "info",
        paragraph: para.index,
        message:
          'Avoid "would go on to." Use simple past tense instead (e.g. "He wrote" not "He would go on to write").',
        sourceText: para.rawText,
        offset: rawOffset !== -1 ? rawOffset : wgotMatch.index!,
        length: wgotMatch[0].length,
      });
    }

    const wotMatch = text.match(/\bwent\s+on\s+to\b/i);
    if (wotMatch) {
      const rawOffset = para.rawText.search(/\bwent\s+on\s+to\b/i);
      diags.push({
        rule: "writing.would-go-on-to",
        severity: "info",
        paragraph: para.index,
        message:
          'Avoid "went on to." Use simple past tense instead (e.g. "He wrote" not "He went on to write").',
        sourceText: para.rawText,
        offset: rawOffset !== -1 ? rawOffset : wotMatch.index!,
        length: wotMatch[0].length,
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
