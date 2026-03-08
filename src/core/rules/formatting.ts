import { Packet, LintDiagnostic, LintRule } from '../model.js';
import {
  stripTitleText,
  stripItalicOnly,
  getQuestionParagraphs,
  createDiagnostic,
} from './utils.js';

function checkSmartQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'non-answer')) {
    const text = para.rawText;

    // Check for straight double quotes (not inside pronunciation guides)
    // Remove pronunciation guides first for this check
    const withoutPron = text.replace(/\("[^"]*"\)/g, '');
    if (withoutPron.includes('"')) {
      const idx = text.indexOf('"');
      diags.push(
        createDiagnostic(
          'formatting.smart-quotes',
          para,
          'Use typographic (smart/curly) quotes instead of straight quotes.',
          {
            suggestion: 'Replace " with \u201c or \u201d',
            offset: idx !== -1 ? idx : undefined,
            length: idx !== -1 ? 1 : undefined,
          }
        )
      );
    }

    // Check for straight single quotes / apostrophes
    // Exclude possessives in pronunciation guides
    if (/(?<![(\w])'(?![)\w])/.test(withoutPron) || withoutPron.includes("'")) {
      // More nuanced: check for actual straight apostrophes
      if (withoutPron.includes("'")) {
        const idx = text.indexOf("'");
        diags.push({
          rule: 'formatting.smart-quotes',
          severity: 'info',
          paragraph: para.index,
          message:
            'Possible straight apostrophe detected. Use typographic (curly) apostrophe \u2019 instead.',
          sourceText: text,
          offset: idx !== -1 ? idx : undefined,
          length: idx !== -1 ? 1 : undefined,
        });
      }
    }
  }

  return diags;
}

function checkEmDash(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    const stripped = stripTitleText(para);
    const idx = text.indexOf('\u2014');
    if (idx !== -1 && stripped.includes('\u2014')) {
      // Build context-aware replacement: add spaces around en dash
      // only where the em dash doesn't already have them
      const hasPrecedingSpace = idx > 0 && text[idx - 1] === ' ';
      const hasFollowingSpace =
        idx < text.length - 1 && text[idx + 1] === ' ';
      const oldText = text.substring(
        hasPrecedingSpace ? idx - 1 : idx,
        hasFollowingSpace ? idx + 2 : idx + 1
      );
      const newText = (hasPrecedingSpace ? ' ' : '') +
        ' \u2013 ' +
        (hasFollowingSpace ? ' ' : '');
      // Normalize to avoid double spaces
      const fixOld = oldText;
      const fixNew = newText.replace(/ {2,}/g, ' ');
      const fixOffset = hasPrecedingSpace ? idx - 1 : idx;

      diags.push({
        rule: 'formatting.no-em-dash',
        severity: 'warning',
        paragraph: para.index,
        message:
          'Use spaced en dashes (\u2013) instead of em dashes (\u2014) for parenthetical breaks.',
        suggestion: 'Replace \u2014 with \u2013 (en dash)',
        sourceText: text,
        offset: idx,
        length: 1,
        fix: { oldText: fixOld, newText: fixNew, offset: fixOffset },
      });
    }
  }

  return diags;
}

function checkSubscriptSuperscript(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    let charPos = 0;
    for (const run of para.runs) {
      if (run.superscript || run.subscript) {
        const kind = run.superscript ? 'Superscripts' : 'Subscripts';
        diags.push({
          rule: 'formatting.no-sub-superscript',
          severity: 'warning',
          paragraph: para.index,
          message: `${kind} should not be used. Write out in prose instead (e.g. "X-sub-two").`,
          sourceText: para.rawText,
          offset: charPos,
          length: run.text.length,
        });
        break; // One per paragraph
      }
      charPos += run.text.length;
    }
  }

  return diags;
}

function checkSpellOutNumbers(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  // Don't flag answer lines, tags, or "For 10 points"
  const skip = /ANSWER:|^<|for 10 points|\[10[emh]?\]|\[[EMH]\]/i;

  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    if (skip.test(text)) continue;

    const stripped = stripTitleText(para);
    // Find standalone numbers 1-10 (but not part of dates, lists, etc.)
    const matches = [
      ...stripped.matchAll(/(?<!\d)(?<!\w)([2-9]|10)(?!\d)(?=\s|[,.])/g),
    ];
    for (const match of matches) {
      // Skip if preceded by "No." or "#" or part of a date/year
      const before = text.substring(
        Math.max(0, match.index! - 5),
        match.index!
      );
      if (/No\.\s*$|#\s*$|\d/.test(before)) continue;
      // Skip if part of "10 points"
      if (text.substring(match.index!, match.index! + 12).includes('10 points'))
        continue;

      const num = match[1];
      const words: Record<string, string> = {
        '2': 'two',
        '3': 'three',
        '4': 'four',
        '5': 'five',
        '6': 'six',
        '7': 'seven',
        '8': 'eight',
        '9': 'nine',
        '10': 'ten',
      };

      diags.push({
        rule: 'formatting.spell-out-small-numbers',
        severity: 'info',
        paragraph: para.index,
        message: `Consider spelling out number ${num} as "${words[num]}".`,
        sourceText: text,
        offset: match.index!,
        length: num.length,
      });
    }
  }

  return diags;
}

function checkNoAmpersand(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'non-answer')) {
    const text = para.rawText;
    // Skip tag lines (e.g. <Painting & Sculpture>)
    if (/^\s*<[^>]+>\s*$/.test(text)) continue;
    const stripped = stripTitleText(para);
    if (stripped.includes('&') && !stripped.includes('&amp;')) {
      const idx = stripped.indexOf('&');
      diags.push({
        rule: 'formatting.no-ampersand',
        severity: 'info',
        paragraph: para.index,
        message:
          'Avoid ampersands (&). Use "and" unless it\'s part of an official name.',
        sourceText: text,
        offset: idx,
        length: 1,
      });
    }
  }

  return diags;
}

function checkPoetrySlash(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'non-answer')) {
    const text = para.rawText;
    // Only strip italic text (titles), not quoted text — poetry slashes
    // appear inside quoted passages
    const stripped = stripItalicOnly(para);

    // Look for slashes between text that look like poetry line breaks
    // but aren't spaced properly (e.g., "foo/bar" instead of "foo / bar")
    // This is too noisy for general text — only flag if the question is about poetry
    // or contains multiple slashes suggesting poetry quotation
    const slashCount = (stripped.match(/\//g) || []).length;
    if (slashCount >= 2) {
      // Skip slashes that are fractions/ratios (digit/digit) or single-char/single-char
      const unspaced = [...stripped.matchAll(/(\S)\/(\S)/g)].filter(
        (m) => !/^\d\/\d/.test(m[0])
      );
      for (const match of unspaced) {
        diags.push({
          rule: 'formatting.poetry-slash',
          severity: 'info',
          paragraph: para.index,
          message:
            'Poetry line breaks should use spaced slashes: " / " not "/".',
          sourceText: text,
          offset: match.index!,
          length: match[0].length,
        });
        break; // One diagnostic per paragraph
      }
    }
  }

  return diags;
}

function checkDoubleSpaces(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    const idx = text.indexOf('  ');
    if (idx !== -1) {
      diags.push({
        rule: 'formatting.no-double-spaces',
        severity: 'warning',
        paragraph: para.index,
        message: 'Do not use two spaces after a period, or anywhere else.',
        sourceText: text,
        offset: idx,
        length: 2,
        fix: { oldText: '  ', newText: ' ', offset: idx },
      });
    }
  }

  return diags;
}

function checkAbbreviationPeriods(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const stripped = stripTitleText(para);
    // Check for U.S., U.N., U.K., E.U. with periods
    const matches = [
      ...stripped.matchAll(/\b(U\.S\.A?\.|U\.K\.|U\.N\.|E\.U\.)/g),
    ];
    for (const match of matches) {
      const without = match[1].replace(/\./g, '');
      diags.push({
        rule: 'formatting.no-abbreviation-periods',
        severity: 'warning',
        paragraph: para.index,
        message: `Omit periods in "${match[1]}". Use "${without}" instead, since periods often cause confusion over the end of a sentence.`,
        sourceText: para.rawText,
        offset: match.index!,
        length: match[1].length,
        fix: { oldText: match[1], newText: without, offset: match.index! },
      });
    }
  }

  return diags;
}

function checkBceCeSystem(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    const stripped = stripTitleText(para);
    // Check for BC/AD usage (but not BCE/CE which is correct)
    // Match "123 BC" or "AD 123" but not "BCE"
    const bceMatch =
      stripped.match(/\b(\d+)\s+BC\b(?!E)/) ||
      stripped.match(/\bAD\s+(\d+)\b/) ||
      stripped.match(/\b(\d+)\s+AD\b/);
    if (bceMatch) {
      // Build the replacement: "123 BC" → "123 BCE", "AD 123" → "123 CE", "123 AD" → "123 CE"
      const matchText = bceMatch[0];
      const year = bceMatch[1];
      let fixNew: string;
      if (/BC$/i.test(matchText)) {
        fixNew = `${year} BCE`;
      } else {
        fixNew = `${year} CE`;
      }

      diags.push({
        rule: 'formatting.bce-ce-system',
        severity: 'warning',
        paragraph: para.index,
        message: 'Use the BCE/CE system for years instead of BC/AD.',
        sourceText: text,
        offset: bceMatch.index!,
        length: bceMatch[0].length,
        fix: {
          oldText: matchText,
          newText: fixNew,
          offset: bceMatch.index!,
        },
      });
    }
  }

  return diags;
}

function checkLatinAbbreviations(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = stripTitleText(para);

    const latinAbbrevs: [RegExp, string][] = [
      [/\be\.g\./gi, 'Use "for example" or "such as" instead of "e.g."'],
      [/\bi\.e\./gi, 'Use "that is" instead of "i.e."'],
      [/\betc\./gi, 'Avoid "etc." — be specific or use "and others"'],
      [/\bviz\./gi, 'Use "namely" instead of "viz."'],
      [/\bcf\./gi, 'Use "compare" or "see" instead of "cf."'],
    ];

    for (const [re, msg] of latinAbbrevs) {
      const m = text.match(re);
      if (m) {
        diags.push({
          rule: 'formatting.no-latin-abbrev',
          severity: 'warning',
          paragraph: para.index,
          message: msg,
          sourceText: para.rawText,
          offset: m.index!,
          length: m[0].length,
        });
      }
    }
  }

  return diags;
}

function checkPunctuationInsideQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet, 'non-answer')) {
    const text = para.rawText;
    // Skip tag lines
    if (/^\s*<[^>]+>/.test(text)) continue;

    // Strip pronunciation guides ("foo-BAR") before checking,
    // since their closing ") often precedes commas/periods legitimately
    const withoutPron = text
      .replace(/\("[^"]*"\)/g, '')
      .replace(/\(\u201c[^\u201d]*\u201d\)/g, '');

    // Check for closing quotation mark followed by comma or period only
    // (American style requires punctuation inside the quotes)
    // Exclude ! and ? since those typically belong to the quoted material
    const piqMatch = withoutPron.match(/[\u201d"][.,]/);
    if (piqMatch) {
      // Find the match position in the original text (may differ due to stripping)
      const origMatch = text.match(/[\u201d"][.,]/);
      diags.push({
        rule: 'formatting.punctuation-inside-quotes',
        severity: 'info',
        paragraph: para.index,
        message:
          'Commas and periods should go inside closing quotation marks (American style).',
        sourceText: text,
        offset: origMatch ? origMatch.index! : undefined,
        length: origMatch ? 2 : undefined,
      });
    }
  }

  return diags;
}

function checkFormattingBleeding(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  // Helper to check if text looks like a pronunciation guide opening or closing
  const isPronunciationGuideOpening = (text: string): boolean => {
    // Matches start of pronunciation guide: (" or (\u201c
    return /^\([""\u201c]/.test(text);
  };

  const isPronunciationGuideClosing = (text: string): boolean => {
    // Matches end of pronunciation guide: ") or \u201d)
    return /[""\u201d]\)$/.test(text);
  };

  // Helper to check if text looks like a specific instruction directive
  // (not answer directives like [accept] or [reject])
  const isInstructionDirectiveOpening = (text: string): boolean => {
    // Matches instruction directives that are commonly unbolded:
    // [emphasize, [prompt on, [or equivalent, [do not accept, [do not prompt
    return /^\[(emphasize|prompt on|or equivalent|do not (accept|prompt))/i.test(
      text
    );
  };

  const isInstructionDirectiveClosing = (text: string): boolean => {
    // Matches end of instruction directive
    // Check if it contains the directive keywords and ends with ]
    return /(emphasize|prompt on|or equivalent|do not (accept|prompt))[^\]]*\]$/i.test(
      text
    );
  };

  for (const para of getQuestionParagraphs(packet)) {
    let charPos = 0;

    for (let i = 0; i < para.runs.length; i++) {
      const run = para.runs[i];

      // Check if run has any formatting
      const hasFormatting = run.bold || run.underline || run.italic;
      if (!hasFormatting) {
        charPos += run.text.length;
        continue;
      }

      // Check for leading space
      const hasLeadingSpace = run.text.length > 0 && run.text[0] === ' ';
      // Check for trailing space
      const hasTrailingSpace =
        run.text.length > 0 && run.text[run.text.length - 1] === ' ';

      // Get adjacent runs for context
      const prevRun = i > 0 ? para.runs[i - 1] : null;
      const nextRun = i < para.runs.length - 1 ? para.runs[i + 1] : null;

      // Helper to check if a space would remain formatted if moved to adjacent run
      const wouldRemainFormatted = (
        adjacentRun: typeof run | null,
        checkType: 'leading' | 'trailing'
      ): boolean => {
        if (!adjacentRun) return false;

        // Check if adjacent run shares ALL the formatting of current run
        if (run.bold && !adjacentRun.bold) return false;
        if (run.underline && !adjacentRun.underline) return false;
        if (run.italic && !adjacentRun.italic) return false;

        return true;
      };

      // Check if this run is purely whitespace (common when editing around directives)
      const isPureWhitespace = /^\s+$/.test(run.text);

      // Check if spaces are adjacent to pronunciation guides (always allow)
      // or instruction directives (only for pure whitespace runs)
      const isNextToPronunciationGuideOpening =
        hasTrailingSpace && nextRun && isPronunciationGuideOpening(nextRun.text);

      const isNextToPronunciationGuideClosing =
        hasLeadingSpace && prevRun && isPronunciationGuideClosing(prevRun.text);

      const isNextToInstructionDirectiveOpening =
        hasTrailingSpace &&
        isPureWhitespace &&
        nextRun &&
        isInstructionDirectiveOpening(nextRun.text);

      const isNextToInstructionDirectiveClosing =
        hasLeadingSpace &&
        isPureWhitespace &&
        prevRun &&
        isInstructionDirectiveClosing(prevRun.text);

      // Only flag if the space would become unformatted when moved
      // AND it's not adjacent to a pronunciation guide or instruction directive
      const shouldFlagLeading =
        hasLeadingSpace &&
        !wouldRemainFormatted(prevRun, 'leading') &&
        !isNextToPronunciationGuideClosing &&
        !isNextToInstructionDirectiveClosing;

      const shouldFlagTrailing =
        hasTrailingSpace &&
        !wouldRemainFormatted(nextRun, 'trailing') &&
        !isNextToPronunciationGuideOpening &&
        !isNextToInstructionDirectiveOpening;

      if (shouldFlagLeading || shouldFlagTrailing) {
        // Determine severity: underline is more visible, so higher severity
        const severity = run.underline ? 'warning' : 'info';
        const formatTypes: string[] = [];
        if (run.bold) formatTypes.push('bold');
        if (run.underline) formatTypes.push('underline');
        if (run.italic) formatTypes.push('italic');
        const formatDesc = formatTypes.join('/');

        const spaceType = shouldFlagLeading
          ? shouldFlagTrailing
            ? 'leading and trailing'
            : 'leading'
          : 'trailing';

        diags.push({
          rule: 'formatting.no-format-bleeding',
          severity,
          paragraph: para.index,
          message: `Formatting (${formatDesc}) should not include ${spaceType} spaces.`,
          sourceText: para.rawText,
          offset: charPos,
          length: run.text.length,
        });
        // Only report once per paragraph
        break;
      }

      charPos += run.text.length;
    }
  }

  return diags;
}

export const formattingRules: LintRule[] = [
  checkSmartQuotes,
  checkEmDash,
  checkSpellOutNumbers,
  checkNoAmpersand,
  checkPoetrySlash,
  checkLatinAbbreviations,
  checkDoubleSpaces,
  checkSubscriptSuperscript,
  checkAbbreviationPeriods,
  checkBceCeSystem,
  checkPunctuationInsideQuotes,
  checkFormattingBleeding,
];
