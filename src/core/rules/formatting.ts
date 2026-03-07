import { Packet, LintDiagnostic, LintRule, Paragraph } from "../model.js";

function getQuestionParagraphs(packet: Packet): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const q of [...packet.tossups, ...packet.bonuses]) {
    for (const p of q.paragraphs) {
      paras.push(p);
    }
  }
  return paras;
}

function getNonAnswerLineParagraphs(packet: Packet): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const q of [...packet.tossups, ...packet.bonuses]) {
    for (const p of q.paragraphs) {
      if (/^\s*ANSWER/i.test(p.rawText)) continue;
      paras.push(p);
    }
  }
  return paras;
}

/**
 * Remove all quoted regions from text so rules
 * don't flag content that appears inside quotations.
 */
function stripQuotedText(text: string): string {
  return text
    .replace(/\u201c[^\u201d]*\u201d/g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\u2018[^\u2019]*\u2019/g, "");
}

function checkSmartQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getNonAnswerLineParagraphs(packet)) {
    const text = para.rawText;

    // Check for straight double quotes (not inside pronunciation guides)
    // Remove pronunciation guides first for this check
    const withoutPron = text.replace(/\("[^"]*"\)/g, "");
    if (withoutPron.includes('"')) {
      diags.push({
        rule: "formatting.smart-quotes",
        severity: "warning",
        paragraph: para.index,
        message:
          "Use typographic (smart/curly) quotes instead of straight quotes.",
        suggestion: 'Replace " with \u201c or \u201d',
      });
    }

    // Check for straight single quotes / apostrophes
    // Exclude possessives in pronunciation guides
    if (/(?<![(\w])'(?![)\w])/.test(withoutPron) || withoutPron.includes("'")) {
      // More nuanced: check for actual straight apostrophes
      if (withoutPron.includes("'")) {
        diags.push({
          rule: "formatting.smart-quotes",
          severity: "info",
          paragraph: para.index,
          message:
            "Possible straight apostrophe detected. Use typographic (curly) apostrophe \u2019 instead.",
        });
      }
    }
  }

  return diags;
}

function checkEmDash(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    if (stripQuotedText(para.rawText).includes("\u2014")) {
      // em dash
      diags.push({
        rule: "formatting.no-em-dash",
        severity: "warning",
        paragraph: para.index,
        message:
          "Use spaced en dashes (\u2013) instead of em dashes (\u2014) for parenthetical breaks.",
        suggestion: "Replace \u2014 with \u2013 (en dash)",
      });
    }
  }

  return diags;
}

function checkSubscriptSuperscript(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    for (const run of para.runs) {
      if (run.superscript || run.subscript) {
        const kind = run.superscript ? "Superscripts" : "Subscripts";
        diags.push({
          rule: "formatting.no-sub-superscript",
          severity: "warning",
          paragraph: para.index,
          message: `${kind} should not be used. Write out in prose instead (e.g. "X-sub-two").`,
        });
        break; // One per paragraph
      }
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

    // Find standalone numbers 1-10 (but not part of dates, lists, etc.)
    const matches = [...text.matchAll(/(?<!\d)(?<!\w)([2-9]|10)(?!\d)(?=\s|[,.])/g)];
    for (const match of matches) {
      // Skip if preceded by "No." or "#" or part of a date/year
      const before = text.substring(Math.max(0, match.index! - 5), match.index!);
      if (/No\.\s*$|#\s*$|\d/.test(before)) continue;
      // Skip if part of "10 points"
      if (text.substring(match.index!, match.index! + 12).includes("10 points")) continue;

      const num = match[1];
      const words: Record<string, string> = {
        "2": "two", "3": "three", "4": "four", "5": "five",
        "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
      };

      diags.push({
        rule: "formatting.spell-out-small-numbers",
        severity: "info",
        paragraph: para.index,
        message: `Consider spelling out number ${num} as "${words[num]}".`,
      });
    }
  }

  return diags;
}

function checkNoAmpersand(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getNonAnswerLineParagraphs(packet)) {
    const text = para.rawText;
    // Skip tag lines (e.g. <Painting & Sculpture>)
    if (/^\s*<[^>]+>\s*$/.test(text)) continue;
    if (text.includes("&") && !text.includes("&amp;")) {
      // Check it's not part of an official name (hard to determine — flag anyway)
      diags.push({
        rule: "formatting.no-ampersand",
        severity: "info",
        paragraph: para.index,
        message: 'Avoid ampersands (&). Use "and" unless it\'s part of an official name.',
      });
    }
  }

  return diags;
}

function checkPoetrySlash(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getNonAnswerLineParagraphs(packet)) {
    const text = para.rawText;

    // Look for slashes between text that look like poetry line breaks
    // but aren't spaced properly (e.g., "foo/bar" instead of "foo / bar")
    // This is too noisy for general text — only flag if the question is about poetry
    // or contains multiple slashes suggesting poetry quotation
    const slashCount = (text.match(/\//g) || []).length;
    if (slashCount >= 2) {
      // Skip slashes that are fractions/ratios (digit/digit) or single-char/single-char
      const unspaced = [...text.matchAll(/(\S)\/(\S)/g)].filter(
        (m) => !/^\d\/\d/.test(m[0])
      );
      for (const match of unspaced) {
        diags.push({
          rule: "formatting.poetry-slash",
          severity: "info",
          paragraph: para.index,
          message:
            "Poetry line breaks should use spaced slashes: \" / \" not \"/\".",
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
    if (/  /.test(para.rawText)) {
      diags.push({
        rule: "formatting.no-double-spaces",
        severity: "warning",
        paragraph: para.index,
        message: "Do not use two spaces after a period, or anywhere else.",
      });
    }
  }

  return diags;
}

function checkAbbreviationPeriods(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = stripQuotedText(para.rawText);
    // Check for U.S., U.N., U.K., E.U. with periods
    const matches = [...text.matchAll(/\b(U\.S\.A?\.|U\.K\.|U\.N\.|E\.U\.)/g)];
    for (const match of matches) {
      const without = match[1].replace(/\./g, "");
      diags.push({
        rule: "formatting.no-abbreviation-periods",
        severity: "warning",
        paragraph: para.index,
        message: `Omit periods in "${match[1]}". Use "${without}" instead, since periods often cause confusion over the end of a sentence.`,
      });
    }
  }

  return diags;
}

function checkBceCeSystem(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    // Check for BC/AD usage (but not BCE/CE which is correct)
    // Match "123 BC" or "AD 123" but not "BCE"
    if (/\b\d+\s+BC\b(?!E)/.test(text) || /\bAD\s+\d+\b/.test(text) || /\b\d+\s+AD\b/.test(text)) {
      diags.push({
        rule: "formatting.bce-ce-system",
        severity: "warning",
        paragraph: para.index,
        message: 'Use the BCE/CE system for years instead of BC/AD.',
      });
    }
  }

  return diags;
}

function checkLatinAbbreviations(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getQuestionParagraphs(packet)) {
    const text = stripQuotedText(para.rawText);

    const latinAbbrevs: [RegExp, string][] = [
      [/\be\.g\./gi, 'Use "for example" or "such as" instead of "e.g."'],
      [/\bi\.e\./gi, 'Use "that is" instead of "i.e."'],
      [/\betc\./gi, 'Avoid "etc." — be specific or use "and others"'],
      [/\bviz\./gi, 'Use "namely" instead of "viz."'],
      [/\bcf\./gi, 'Use "compare" or "see" instead of "cf."'],
    ];

    for (const [re, msg] of latinAbbrevs) {
      if (re.test(text)) {
        diags.push({
          rule: "formatting.no-latin-abbrev",
          severity: "warning",
          paragraph: para.index,
          message: msg,
        });
      }
    }
  }

  return diags;
}

function checkPunctuationInsideQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getNonAnswerLineParagraphs(packet)) {
    const text = para.rawText;
    // Skip tag lines
    if (/^\s*<[^>]+>/.test(text)) continue;

    // Check for closing quotation mark followed by comma or period
    // (American style requires punctuation inside the quotes)
    if (/[\u201d"][.,]/.test(text)) {
      diags.push({
        rule: "formatting.punctuation-inside-quotes",
        severity: "info",
        paragraph: para.index,
        message:
          "Commas and periods should go inside closing quotation marks (American style).",
      });
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
];
