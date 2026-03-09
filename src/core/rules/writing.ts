import { Packet, LintDiagnostic, LintRule } from '../model.js';
import {
  WEASEL_WORDS,
  WORD_REPLACEMENTS,
  CONTRACTION_RE,
} from '../../shared/constants.js';
import {
  stripTitleText,
  getQuestionParagraphs,
  findOffsetInRawText,
  createDiagnostic,
} from './utils.js';

function checkContractions(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'text-only')) {
    const text = stripTitleText(para);
    const matches = [...text.matchAll(CONTRACTION_RE)];
    for (const match of matches) {
      const offset = findOffsetInRawText(para.rawText, match[1], match.index);
      diags.push(
        createDiagnostic(
          'writing.no-contractions',
          para,
          `Avoid contraction "${match[1]}". Spell it out.`,
          {
            offset: offset !== -1 ? offset : match.index!,
            length: match[1].length,
          }
        )
      );
    }
  }

  return diags;
}

function checkWeaselWords(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'text-only')) {
    const stripped = stripTitleText(para);

    for (const word of WEASEL_WORDS) {
      const re = new RegExp(`\\b${word.replace(/-/g, '[-\\s]?')}\\b`, 'gi');
      const m = stripped.match(re);
      if (m) {
        // Find offset in original text for correct highlighting
        const offset = findOffsetInRawText(para.rawText, m[0]);
        diags.push(
          createDiagnostic(
            'writing.no-weasel-words',
            para,
            `Avoid "${word}" — if it appears in quizbowl, it's already notable.`,
            {
              severity: 'info',
              offset: offset !== -1 ? offset : undefined,
              length: m[0].length,
            }
          )
        );
        break; // One per paragraph to avoid noise
      }
    }
  }

  return diags;
}

// Phrasal verbs where "upon" is idiomatic and "on" would be unnatural
const UPON_PHRASAL_VERBS =
  /\b(called|stumbled|relied|based|bestow(?:ed)?|confer(?:red)?|impose[ds]?|inflict(?:ed)?|look(?:ed|ing)?|act(?:ed|ing)?|draw[ns]?|built?|expand(?:ed|ing)?|improv(?:e[ds]?|ing)|decided?|agree[ds]?|embark(?:ed|ing)?|depend(?:ed|s|ing)?|hit|come|came|happen(?:ed|s)?|chance[ds]?|settle[ds]?|insist(?:ed|s|ing)?|enter(?:ed)?|seize[ds]?|descend(?:ed)?|reflect(?:ed|ing)?|verge[ds]?)\s+upon\b/i;

function checkWordReplacements(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'text-only')) {
    const text = stripTitleText(para);

    for (const [bad, good] of Object.entries(WORD_REPLACEMENTS)) {
      // Skip "following" when it's a verb or means "according to"
      if (bad === 'following') {
        // Skip "the following" (adjective/noun sense)
        if (/\bthe following\b/i.test(text)) continue;
        if (/\banswer the following\b/i.test(text)) continue;
        // Skip verb forms: "was/were/is/are following"
        if (/\b(was|were|is|are)\s+following\b/i.test(text)) continue;
        // Skip when meaning "according to": "following the/this/that"
        if (
          /\bfollowing\s+(the|this|that|a|an)\s+(same|similar|method|approach|pattern|model|technique|procedure)\b/i.test(
            text
          )
        )
          continue;
      }

      // Skip "upon" in phrasal verbs and "upon + gerund" constructions
      if (bad === 'upon') {
        if (UPON_PHRASAL_VERBS.test(text)) continue;
        if (/\bupon\s+[a-z]+ing\b/i.test(text)) continue;
      }

      const re = new RegExp(`\\b${bad}\\b`, 'gi');
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
        const offset = findOffsetInRawText(para.rawText, first[0], first.index);
        diags.push(
          createDiagnostic(
            'writing.word-replacements',
            para,
            `Consider replacing "${bad}" with "${good}".`,
            {
              severity: 'info',
              offset: offset !== -1 ? offset : undefined,
              length: first[0].length,
            }
          )
        );
      }
    }
  }

  return diags;
}

function checkAbsoluteTime(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const relativeTime =
    /\b(recently|last year|this year|last month|currently|presently|nowadays|at present|to date)\b/gi;

  for (const para of getQuestionParagraphs(packet, 'text-only')) {
    const stripped = stripTitleText(para);
    const matches = [...stripped.matchAll(relativeTime)];
    for (const match of matches) {
      const word = match[1].toLowerCase();

      // Skip "to date" when it's a verb phrase (refuse to date, continue to date)
      if (word === 'to date') {
        const before = stripped.substring(
          Math.max(0, match.index! - 15),
          match.index!
        );
        if (/\bto\s*$/i.test(before)) continue; // Part of infinitive "to date"
      }

      // Skip "this year"/"last year" when used as a factual clue or as the answer itself
      if (word === 'this year' || word === 'last year') {
        const before = stripped.substring(
          Math.max(0, match.index! - 20),
          match.index!
        );
        const after = stripped.substring(
          match.index! + match[1].length,
          match.index! + match[1].length + 20
        );
        // Skip "in this year", "during this year", etc. (temporal context clues)
        if (/\b(in|during|of|from|since)\s*$/i.test(before)) continue;
        // Skip when it appears to be the answer (near "Name" or "What")
        if (
          /\b(name|what|identify)\b/i.test(before) ||
          /\b(name|what|identify)\b/i.test(after)
        )
          continue;
      }

      // Skip "recently" in past-tense historical narrative
      // Look for past-tense verbs nearby
      if (word === 'recently') {
        const context = stripped.substring(
          Math.max(0, match.index! - 50),
          match.index! + match[1].length + 50
        );
        // If the surrounding context contains past-tense markers, it's likely historical narrative
        if (
          /\b(had|was|were|did|became|moved|wrote|created|established|founded)\s+(recently\s+)?(moved|stepped|emerged|opened)/i.test(
            context
          )
        )
          continue;
      }

      // Find the true offset in the original (un-stripped) text
      const offset = findOffsetInRawText(para.rawText, match[1], match.index);

      diags.push({
        rule: 'writing.absolute-time',
        severity: 'warning',
        paragraph: para.index,
        message: `Use absolute dates instead of "${match[1]}".`,
        sourceText: para.rawText,
        offset: offset !== -1 ? offset : match.index!,
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
      const matched = asqMatch[0];
      const startsUpper = matched[0] === matched[0].toUpperCase();
      const replacement = startsUpper
        ? 'Answer the following about'
        : 'answer the following about';
      diags.push({
        rule: 'writing.answer-some-questions',
        severity: 'warning',
        paragraph: q.numberParagraph.index,
        message:
          'Use "Answer the following about" instead of "Answer some questions about".',
        sourceText: text,
        offset: asqMatch.index!,
        length: asqMatch[0].length,
        fix: {
          oldText: matched,
          newText: replacement,
          offset: asqMatch.index!,
        },
      });
    }
  }

  return diags;
}

function checkWouldGoOnTo(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'text-only')) {
    const text = stripTitleText(para);

    const wgotMatch = text.match(/\bwould\s+go\s+on\s+to\b/i);
    if (wgotMatch) {
      const offset = findOffsetInRawText(para.rawText, wgotMatch[0]);
      diags.push({
        rule: 'writing.would-go-on-to',
        severity: 'info',
        paragraph: para.index,
        message:
          'Avoid "would go on to." Use simple past tense instead (e.g. "He wrote" not "He would go on to write").',
        sourceText: para.rawText,
        offset: offset !== -1 ? offset : wgotMatch.index!,
        length: wgotMatch[0].length,
      });
    }

    const wotMatch = text.match(/\bwent\s+on\s+to\b/i);
    if (wotMatch) {
      const offset = findOffsetInRawText(para.rawText, wotMatch[0]);
      diags.push({
        rule: 'writing.would-go-on-to',
        severity: 'info',
        paragraph: para.index,
        message:
          'Avoid "went on to." Use simple past tense instead (e.g. "He wrote" not "He went on to write").',
        sourceText: para.rawText,
        offset: offset !== -1 ? offset : wotMatch.index!,
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
