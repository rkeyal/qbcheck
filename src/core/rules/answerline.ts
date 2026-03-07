import { Packet, LintDiagnostic, LintRule, Paragraph, Run } from "../model.js";

function getAnswerLines(packet: Packet): Paragraph[] {
  const lines: Paragraph[] = [];

  for (const q of packet.tossups) {
    if (q.answerLine) lines.push(q.answerLine);
  }
  for (const q of packet.bonuses) {
    // Bonus-level answer line (for the lead-in, if any)
    if (q.answerLine) lines.push(q.answerLine);
    for (const part of q.parts) {
      if (part.answerLine) lines.push(part.answerLine);
    }
  }

  return lines;
}

// ---------- shared utility ----------

interface CharFormat {
  bold: boolean;
  underline: boolean;
}

/**
 * Build a per-character formatting map from runs so we can look up
 * bold/underline at any character position in rawText.
 */
function buildFormattingMap(runs: Run[]): CharFormat[] {
  const map: CharFormat[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      map.push({ bold: run.bold, underline: run.underline });
    }
  }
  return map;
}

// ---------- directive parsing ----------

interface BracketSpan {
  start: number; // index of '[' in rawText
  end: number; // index of ']' in rawText
  content: string; // text between brackets
}

interface SubDirective {
  type:
    | "accept"
    | "or"
    | "prompt"
    | "anti-prompt"
    | "reject"
    | "do not accept"
    | "do not prompt"
    | "unknown";
  /** Start offset of the content (after the keyword) in rawText */
  contentStart: number;
  /** End offset of the content in rawText */
  contentEnd: number;
  /** The raw text of the content portion */
  contentText: string;
  /** The full raw text of this sub-directive */
  fullText: string;
  /** Start offset of this sub-directive in rawText */
  fullStart: number;
}

function findBracketSpans(rawText: string): BracketSpan[] {
  const spans: BracketSpan[] = [];
  for (const m of rawText.matchAll(/\[([^\]]*)\]/g)) {
    spans.push({
      start: m.index!,
      end: m.index! + m[0].length - 1,
      content: m[1],
    });
  }
  return spans;
}

function parseSubDirectives(
  bracket: BracketSpan,
  rawText: string
): SubDirective[] {
  const results: SubDirective[] = [];
  // The content inside the brackets, split on ';'
  const innerStart = bracket.start + 1; // after '['
  const parts = bracket.content.split(";");

  let offset = innerStart;
  for (const part of parts) {
    const trimmed = part.trimStart();
    const leadingSpaces = part.length - trimmed.length;
    const partStart = offset + leadingSpaces;
    const trimmedEnd = trimmed.trimEnd();

    // Try to match directive keywords (case-insensitive)
    const patterns: {
      type: SubDirective["type"];
      regex: RegExp;
    }[] = [
      { type: "do not accept", regex: /^do\s+not\s+accept\s+/i },
      { type: "do not prompt", regex: /^do\s+not\s+prompt\s+/i },
      { type: "anti-prompt", regex: /^anti-?prompt\s+(on\s+)?/i },
      { type: "prompt", regex: /^prompt\s+(on\s+)?/i },
      { type: "accept", regex: /^accept\s+/i },
      { type: "reject", regex: /^reject\s+/i },
      { type: "or", regex: /^or\s+/i },
    ];

    let matched = false;
    for (const p of patterns) {
      const m = trimmedEnd.match(p.regex);
      if (m) {
        const contentStartInPart = m[0].length;
        results.push({
          type: p.type,
          contentStart: partStart + contentStartInPart,
          contentEnd: partStart + trimmedEnd.length,
          contentText: trimmedEnd.slice(contentStartInPart),
          fullText: trimmedEnd,
          fullStart: partStart,
        });
        matched = true;
        break;
      }
    }

    if (!matched && trimmedEnd.length > 0) {
      results.push({
        type: "unknown",
        contentStart: partStart,
        contentEnd: partStart + trimmedEnd.length,
        contentText: trimmedEnd,
        fullText: trimmedEnd,
        fullStart: partStart,
      });
    }

    offset += part.length + 1; // +1 for the ';'
  }
  return results;
}

// ---------- existing rules ----------

function checkAnswerPrefix(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    if (!/^\s*ANSWER:\s/.test(text)) {
      // Check common variants
      if (/^\s*ANSWER\s*:/i.test(text)) {
        if (!/^\s*ANSWER:/.test(text)) {
          diags.push({
            rule: "answerline.prefix",
            severity: "error",
            paragraph: para.index,
            message: '"ANSWER" must be in all caps.',
            suggestion: "ANSWER:",
          });
        }
        if (!/ANSWER:\s/.test(text)) {
          diags.push({
            rule: "answerline.prefix",
            severity: "warning",
            paragraph: para.index,
            message: 'Missing space after "ANSWER:".',
          });
        }
      } else if (/^\s*answer/i.test(text)) {
        diags.push({
          rule: "answerline.prefix",
          severity: "error",
          paragraph: para.index,
          message: 'Answer line must start with "ANSWER: ".',
          suggestion: "ANSWER: ",
        });
      }
    }
  }

  return diags;
}

function checkRequiredAnswerFormatting(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const runs = para.runs;
    const fmtMap = buildFormattingMap(runs);

    // Find the start of the answer text (after "ANSWER: ") and end (first '[' or end of text)
    const answerColonMatch = para.rawText.match(/ANSWER:\s*/);
    if (!answerColonMatch) continue;

    const answerStart = answerColonMatch.index! + answerColonMatch[0].length;
    const firstBracket = para.rawText.indexOf("[", answerStart);
    const answerEnd = firstBracket === -1 ? para.rawText.length : firstBracket;

    // Check that there is some bold+underlined non-whitespace text in that range
    let foundBoldUnderline = false;
    for (let i = answerStart; i < answerEnd; i++) {
      if (
        i < fmtMap.length &&
        fmtMap[i].bold &&
        fmtMap[i].underline &&
        para.rawText[i].trim()
      ) {
        foundBoldUnderline = true;
        break;
      }
    }

    if (!foundBoldUnderline) {
      // Determine what's missing for a helpful message
      let hasUnderline = false;
      let hasBold = false;
      for (let i = answerStart; i < answerEnd; i++) {
        if (i < fmtMap.length && para.rawText[i].trim()) {
          if (fmtMap[i].underline) hasUnderline = true;
          if (fmtMap[i].bold) hasBold = true;
        }
      }

      let message: string;
      if (!hasUnderline && !hasBold) {
        message =
          "The required (primary) answer should be bold and underlined.";
      } else if (!hasBold) {
        message = "The required (primary) answer should be bold and underlined (missing bold).";
      } else {
        message = "The required (primary) answer should be bold and underlined (missing underline).";
      }

      diags.push({
        rule: "answerline.required-formatting",
        severity: "error",
        paragraph: para.index,
        message,
      });
    }
  }

  return diags;
}

function checkBracketBalance(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    let depth = 0;

    for (const ch of text) {
      if (ch === "[") depth++;
      if (ch === "]") depth--;
      if (depth < 0) break;
    }

    if (depth !== 0) {
      diags.push({
        rule: "answerline.bracket-balance",
        severity: "error",
        paragraph: para.index,
        message: "Unbalanced brackets in answer line.",
      });
    }
  }

  return diags;
}

function checkAcceptRejectFormat(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    // Extract bracket contents
    const brackets = [...text.matchAll(/\[([^\]]*)\]/g)];
    for (const match of brackets) {
      const content = match[1].trim().toLowerCase();

      // Check that bracket content starts with a valid directive
      const validStarts = [
        "accept",
        "or",
        "prompt",
        "do not accept",
        "do not prompt",
        "reject",
        "anti-prompt",
        "antiprompt",
        "read",
      ];

      const hasValidStart = validStarts.some((s) => content.startsWith(s));

      if (!hasValidStart && content.length > 0) {
        // It might be a parenthetical note — those are allowed after the answer
        // Only flag if it looks like a malformed directive
        if (/^(acept|accpet|promt|rejct)/i.test(content)) {
          diags.push({
            rule: "answerline.directive-typo",
            severity: "warning",
            paragraph: para.index,
            message: `Possible typo in answer line directive: "[${match[1]}]".`,
          });
        }
      }
    }
  }

  return diags;
}

// ---------- helpers ----------

/**
 * Returns true if the directive content is a meta-instruction about how to
 * judge answers (e.g. "partial answer", "either answer", "equivalents")
 * rather than a specific answer that should carry formatting.
 */
function isMetaInstruction(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return /^(either|any|both|all)\b/.test(normalized) ||
    /^(in\s+(either|any)\s+order|names?\s+in\s+(either|any)\s+order)\b/.test(normalized) ||
    /^answers?\s+in\s+(either|any)\s+order\b/.test(normalized) ||
    /\b(partial|equivalent|reasonable|similar|obvious|clear|specific|either|any)\s+(answer|response|mention|description|form)s?\b/.test(normalized) ||
    /\b(equivalents|partial answers?|either answer|any answer|word forms?)\b/.test(normalized) ||
    // "X" in place of "Y" substitution instructions
    /\bin\s+place\s+of\b/.test(normalized);
}

// ---------- new rules ----------

function checkAcceptFormatting(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const fmtMap = buildFormattingMap(para.runs);
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "accept" && sub.type !== "or") continue;
        if (isMetaInstruction(sub.contentText)) continue;

        // Check that the content has some bold+underlined text
        let foundBoldUnderline = false;
        for (let i = sub.contentStart; i < sub.contentEnd; i++) {
          if (
            i < fmtMap.length &&
            fmtMap[i].bold &&
            fmtMap[i].underline &&
            para.rawText[i].trim()
          ) {
            foundBoldUnderline = true;
            break;
          }
        }

        if (!foundBoldUnderline) {
          const directive = sub.type === "or" ? "or" : "accept";
          diags.push({
            rule: "answerline.accept-formatting",
            severity: "warning",
            paragraph: para.index,
            message: `Text in [${directive}] directive should have bold and underlined formatting: "${sub.contentText}".`,
          });
        }
      }
    }
  }

  return diags;
}

function checkPromptFormatting(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const fmtMap = buildFormattingMap(para.runs);
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "prompt" && sub.type !== "anti-prompt") continue;
        if (isMetaInstruction(sub.contentText)) continue;

        // The content may contain "by asking ..." — only check the part before that
        const byAskingMatch = sub.contentText.match(/\s+by\s+asking\s+/i);
        const checkEnd = byAskingMatch
          ? sub.contentStart + byAskingMatch.index!
          : sub.contentEnd;

        // Check that the content has some underlined text
        let foundUnderline = false;
        for (let i = sub.contentStart; i < checkEnd; i++) {
          if (
            i < fmtMap.length &&
            fmtMap[i].underline &&
            para.rawText[i].trim()
          ) {
            foundUnderline = true;
            break;
          }
        }

        if (!foundUnderline) {
          const directive =
            sub.type === "anti-prompt" ? "anti-prompt" : "prompt";
          diags.push({
            rule: "answerline.prompt-formatting",
            severity: "warning",
            paragraph: para.index,
            message: `Text in [${directive}] directive should have underlined formatting: "${sub.contentText}".`,
          });
        }
      }
    }
  }

  return diags;
}

function checkRejectQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "reject" && sub.type !== "do not accept") continue;

        const content = sub.contentText.trim();
        if (!content) continue;

        // Skip descriptive reject instructions (not a literal answer string)
        const lower = content.toLowerCase();
        if (/^answers?\s+(like|that|describing|mentioning|involving|such\s+as)\b/.test(lower)) continue;
        // Skip if the content already contains internal quotes (compound reject)
        if (/[\u201c\u201d"'].*[\u201c\u201d"']/.test(content) && !/^[\u201c\u201d"']/.test(content)) continue;
        // Skip if it contains "or other" / "or any" (describing a class)
        if (/\bor\s+(other|any)\b/.test(lower)) continue;
        // Skip conditional instructions (e.g. "X" until "Y" is read and accept afterwards)
        if (/\buntil\b.*\bread\b/.test(lower)) continue;
        // Skip meta-instructions (e.g. "partial answers")
        if (/^partial\s+answers?\b/.test(lower)) continue;

        // Check if the content is wrapped in quotes (straight or curly)
        const quotePattern = /^[\u201c\u201d"'].+[\u201c\u201d"']$/;
        if (!quotePattern.test(content)) {
          const directive =
            sub.type === "do not accept" ? "do not accept" : "reject";
          diags.push({
            rule: "answerline.reject-quotes",
            severity: "warning",
            paragraph: para.index,
            message: `Text in [${directive}] directive should be wrapped in quotes: "${content}".`,
          });
        }
      }
    }
  }

  return diags;
}

function checkPromptQuestionQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "prompt" && sub.type !== "anti-prompt") continue;

        // Look for "by asking X" in the content
        const byAskingMatch = sub.contentText.match(/by\s+asking\s+(.*)/i);
        if (!byAskingMatch) continue;

        const askingContent = byAskingMatch[1].trim();
        if (!askingContent) continue;

        // Check if the asking content is wrapped in quotes
        const quotePattern = /^[\u201c\u201d"'].+[\u201c\u201d"']$/;
        if (!quotePattern.test(askingContent)) {
          diags.push({
            rule: "answerline.prompt-question-quotes",
            severity: "warning",
            paragraph: para.index,
            message: `The "by asking" question should be wrapped in quotes: "${askingContent}".`,
          });
        }
      }
    }
  }

  return diags;
}

function checkPostNotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    // Find the last ']' in the text
    const lastBracket = text.lastIndexOf("]");
    if (lastBracket === -1) continue;

    const afterBracket = text.slice(lastBracket + 1);

    // Strip trailing tag (e.g. <Category> or <Author, Category>)
    const withoutTag = afterBracket.replace(/<[^>]+>\s*$/, "");

    // Check if there's non-whitespace text after the last bracket
    const trimmed = withoutTag.trim();
    if (!trimmed) continue;

    // Check if the text is wrapped in parentheses
    if (!(trimmed.startsWith("(") && trimmed.endsWith(")"))) {
      diags.push({
        rule: "answerline.post-notes",
        severity: "info",
        paragraph: para.index,
        message: `Text after the last bracket should be wrapped in parentheses: "${trimmed}".`,
      });
    }
  }

  return diags;
}

function checkDeprecatedDirectives(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        // Anti-prompt is deprecated (§Formatting answerlines #5)
        if (sub.type === "anti-prompt") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message:
              '"anti-prompt" is deprecated. Use a directed prompt instead, e.g. "prompt on X by asking \'can you be less specific?\'".',
          });
        }

        // "do not accept" is deprecated in favor of "reject" (§Formatting answerlines #6)
        if (sub.type === "do not accept") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message:
              '"do not accept" is deprecated. Use "reject" instead.',
          });
        }

        // "do not prompt" is deprecated alongside "do not accept"
        if (sub.type === "do not prompt") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message:
              '"do not prompt" is deprecated. Use "reject" instead.',
          });
        }
      }
    }

    // Check for deprecated meta-directives in bracket content
    const text = para.rawText.toLowerCase();

    // "accept in either order" is deprecated (§Multiple answers #5)
    if (/\baccept\s+in\s+(either|any)\s+order\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message:
          '"accept in either order" is unnecessary. It is implicit that multiple answers can be accepted in any order.',
      });
    }

    // "accept either underlined part/portion" is deprecated (§Alternate answers #5)
    if (/\baccept\s+(either|any)\s+underlined\s+(part|portion)\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message:
          '"accept either underlined part" is deprecated. List acceptable alternatives explicitly instead.',
      });
    }

    // "names in either order" is deprecated (§Alternate answers #5)
    if (/\bnames?\s+in\s+(either|any)\s+order\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message:
          '"names in either order" is deprecated. List acceptable name orderings explicitly (e.g. [or Murakami Haruki]).',
      });
    }

    // "begrudgingly/grudgingly accept" is discouraged (§Alternate answers #6)
    if (/\b(begrudgingly|grudgingly|reluctantly)\s+accept\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message:
          'Do not include "begrudgingly accept." Either an answer is acceptable, or it is not.',
      });
    }
  }

  return diags;
}

function checkPostNoteQuotationMark(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    // Find the last ']' in the text
    const lastBracket = text.lastIndexOf("]");
    if (lastBracket === -1) continue;

    const afterBracket = text.slice(lastBracket + 1).trim();
    if (!afterBracket) continue;

    // Check if the text after brackets starts with parenthesized content
    // that begins with a quotation mark
    const parenMatch = afterBracket.match(/^\((.)/);
    if (parenMatch) {
      const firstChar = parenMatch[1];
      if (/["\u201c\u201d]/.test(firstChar)) {
        diags.push({
          rule: "answerline.post-note-no-quote-start",
          severity: "info",
          paragraph: para.index,
          message:
            "Post-question notes should not begin with a quotation mark to reduce confusion with pronunciation guides.",
        });
      }
    }
  }

  return diags;
}

function checkParentheticalOptional(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    // Find the answer text after ANSWER:
    const answerMatch = text.match(/ANSWER:\s*/i);
    if (!answerMatch) continue;

    const answerStart = answerMatch.index! + answerMatch[0].length;
    const firstBracket = text.indexOf("[", answerStart);
    const answerEnd = firstBracket === -1 ? text.length : firstBracket;
    const answerText = text.substring(answerStart, answerEnd);

    // Look for short parenthesized text that looks like optional parts
    // e.g. "(The) Great Gatsby" or "(a) priori"
    for (const m of answerText.matchAll(/\(([^)]{1,20})\)/g)) {
      const content = m[1].trim();
      // Skip power marks
      if (content === "*") continue;
      // Skip pronunciation guides: ("foo-BAR")
      if (/^".*"$/.test(content)) continue;
      if (/^[\u201c].*[\u201d]$/.test(content)) continue;
      // Skip if it looks like a clause with conjunctions
      if (/\b(or|and|also)\b/i.test(content)) continue;
      // Skip attributions: (by Author Name)
      if (/^by\s/i.test(content)) continue;

      // Only flag if it's short enough to be an optional word/article
      if (content.split(/\s+/).length <= 3) {
        diags.push({
          rule: "answerline.no-parenthetical-optional",
          severity: "info",
          paragraph: para.index,
          message: `Avoid parentheses for optional parts in answers: "(${content})". List alternatives explicitly with [or] or [accept] instead.`,
        });
        break; // One per answer line
      }
    }
  }

  return diags;
}

function checkNonstandardPrefix(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  // Build set of known answer line paragraph indices
  const knownAnswerIndices = new Set<number>();
  for (const para of getAnswerLines(packet)) {
    knownAnswerIndices.add(para.index);
  }

  // Scan all paragraphs for answer-like prefixes that weren't recognized
  // YAPP accepts: ANS(WER)?(:|.) — we only recognize ANSWER:
  const NONSTANDARD_RE = /^\s*(ans\s*[:.]\s*|answer\s*\.\s*)/i;

  for (const para of packet.allParagraphs) {
    if (knownAnswerIndices.has(para.index)) continue;
    const text = para.rawText;
    const match = text.match(NONSTANDARD_RE);
    if (!match) continue;

    const prefix = match[1].trim();
    diags.push({
      rule: "answerline.nonstandard-prefix",
      severity: "error",
      paragraph: para.index,
      message: `"${prefix}" is not recognized as an answer line. Use "ANSWER: " (all caps, colon, space).`,
      suggestion: "ANSWER: ",
      sourceText: text,
      offset: match.index!,
      length: match[1].length,
    });
  }

  return diags;
}

export const answerlineRules: LintRule[] = [
  checkNonstandardPrefix,
  checkAnswerPrefix,
  checkRequiredAnswerFormatting,
  checkBracketBalance,
  checkAcceptRejectFormat,
  checkAcceptFormatting,
  checkPromptFormatting,
  checkRejectQuotes,
  checkPromptQuestionQuotes,
  checkPostNotes,
  checkDeprecatedDirectives,
  checkPostNoteQuotationMark,
  checkParentheticalOptional,
];
