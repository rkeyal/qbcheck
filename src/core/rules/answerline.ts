import { Packet, LintDiagnostic, LintRule } from '../model.js';
import {
  buildFormattingMap,
  hasBoldUnderline,
  hasUnderline,
  getAnswerLines,
} from './utils.js';
import {
  findBracketSpans,
  parseSubDirectives,
  isMetaInstruction,
} from './answerline-parsing.js';

function checkAnswerPrefix(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    if (!/^\s*ANSWER:\s/.test(text)) {
      // Check common variants
      if (/^\s*ANSWER\s*:/i.test(text)) {
        let hadCaseFix = false;
        if (!/^\s*ANSWER:/.test(text)) {
          // Case issue: "answer:" or "Answer:" → "ANSWER:"
          const prefixMatch = text.match(/^\s*(ANSWER\s*:)/i)!;
          hadCaseFix = true;
          diags.push({
            rule: 'answerline.answer-prefix',
            severity: 'error',
            paragraph: para.index,
            message: '"ANSWER" must be in all caps.',
            suggestion: 'ANSWER:',
            sourceText: text,
            offset:
              prefixMatch.index! +
              prefixMatch[0].length -
              prefixMatch[1].length,
            length: prefixMatch[1].length,
            fix: {
              oldText: prefixMatch[1],
              newText: 'ANSWER:',
              offset:
                prefixMatch.index! +
                prefixMatch[0].length -
                prefixMatch[1].length,
            },
          });
        }
        if (!hadCaseFix && !/ANSWER:\s/.test(text)) {
          // Missing space: "ANSWER:X" → "ANSWER: X"
          // Skip when a case fix was emitted — the case-sensitive regex
          // wouldn't match the original text and would cause a false positive.
          const colonMatch = text.match(/ANSWER:/i)!;
          diags.push({
            rule: 'answerline.answer-prefix',
            severity: 'warning',
            paragraph: para.index,
            message: 'Missing space after "ANSWER:".',
            sourceText: text,
            offset: colonMatch.index!,
            length: colonMatch[0].length,
            fix: {
              oldText: colonMatch[0],
              newText: 'ANSWER: ',
              offset: colonMatch.index!,
            },
          });
        }
      } else if (/^\s*answer/i.test(text)) {
        // Completely wrong prefix: "answer", "ans", etc.
        const prefixMatch = text.match(/^\s*(answer\s*:\s*|answer\s+)/i)!;
        if (prefixMatch) {
          diags.push({
            rule: 'answerline.answer-prefix',
            severity: 'error',
            paragraph: para.index,
            message: 'Answer line must start with "ANSWER: ".',
            suggestion: 'ANSWER: ',
            sourceText: text,
            offset:
              prefixMatch.index! +
              prefixMatch[0].length -
              prefixMatch[1].length,
            length: prefixMatch[1].length,
            fix: {
              oldText: prefixMatch[1],
              newText: 'ANSWER: ',
              offset:
                prefixMatch.index! +
                prefixMatch[0].length -
                prefixMatch[1].length,
            },
          });
        }
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
    const firstBracket = para.rawText.indexOf('[', answerStart);
    const answerEnd = firstBracket === -1 ? para.rawText.length : firstBracket;

    // Check that there is some bold+underlined non-whitespace text in that range
    const foundBoldUnderline = hasBoldUnderline(
      fmtMap,
      answerStart,
      answerEnd,
      para.rawText
    );

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
          'The required (primary) answer should be bold and underlined.';
      } else if (!hasBold) {
        message =
          'The required (primary) answer should be bold and underlined (missing bold).';
      } else {
        message =
          'The required (primary) answer should be bold and underlined (missing underline).';
      }

      diags.push({
        rule: 'answerline.answer-formatting',
        severity: 'error',
        paragraph: para.index,
        message,
        sourceText: para.rawText,
        offset: answerStart,
        length: answerEnd - answerStart,
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
    let unmatchedPos = -1;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[') {
        if (depth === 0) unmatchedPos = i;
        depth++;
      }
      if (text[i] === ']') {
        depth--;
        if (depth === 0) unmatchedPos = -1;
      }
      if (depth < 0) {
        unmatchedPos = i;
        break;
      }
    }

    if (depth !== 0) {
      diags.push({
        rule: 'answerline.bracket-balance',
        severity: 'error',
        paragraph: para.index,
        message: 'Unbalanced brackets in answer line.',
        sourceText: text,
        offset: unmatchedPos !== -1 ? unmatchedPos : undefined,
        length: unmatchedPos !== -1 ? 1 : undefined,
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
        'accept',
        'or',
        'prompt',
        'do not accept',
        'do not prompt',
        'reject',
        'anti-prompt',
        'antiprompt',
        'read',
      ];

      const hasValidStart = validStarts.some((s) => content.startsWith(s));

      if (!hasValidStart && content.length > 0) {
        // It might be a parenthetical note — those are allowed after the answer
        // Only flag if it looks like a malformed directive
        if (/^(acept|accpet|promt|rejct)/i.test(content)) {
          diags.push({
            rule: 'answerline.directive-typo',
            severity: 'warning',
            paragraph: para.index,
            message: `Possible typo in answer line directive: "[${match[1]}]".`,
            sourceText: text,
            offset: match.index!,
            length: match[0].length,
          });
        }
      }
    }
  }

  return diags;
}

// ---------- directive rules ----------

function checkAcceptFormatting(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const fmtMap = buildFormattingMap(para.runs);
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== 'accept' && sub.type !== 'or') continue;
        if (isMetaInstruction(sub.contentText)) continue;

        // Check that the content has some bold+underlined text
        const foundBoldUnderline = hasBoldUnderline(
          fmtMap,
          sub.contentStart,
          sub.contentEnd,
          para.rawText
        );

        if (!foundBoldUnderline) {
          const directive = sub.type === 'or' ? 'or' : 'accept';
          diags.push({
            rule: 'answerline.accept-formatting',
            severity: 'warning',
            paragraph: para.index,
            message: `Text in [${directive}] directive should have bold and underlined formatting: "${sub.contentText}".`,
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
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
        if (sub.type !== 'prompt' && sub.type !== 'anti-prompt') continue;
        if (isMetaInstruction(sub.contentText)) continue;

        // The content may contain "by asking ..." — only check the part before that
        const byAskingMatch = sub.contentText.match(/\s+by\s+asking\s+/i);
        const checkEnd = byAskingMatch
          ? sub.contentStart + byAskingMatch.index!
          : sub.contentEnd;

        // Check that the content has some underlined text
        const foundUnderline = hasUnderline(
          fmtMap,
          sub.contentStart,
          checkEnd,
          para.rawText
        );

        if (!foundUnderline) {
          const directive =
            sub.type === 'anti-prompt' ? 'anti-prompt' : 'prompt';
          diags.push({
            rule: 'answerline.prompt-formatting',
            severity: 'warning',
            paragraph: para.index,
            message: `Text in [${directive}] directive should have underlined formatting: "${sub.contentText}".`,
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
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
        if (sub.type !== 'reject' && sub.type !== 'do not accept') continue;

        const content = sub.contentText.trim();
        if (!content) continue;

        // Skip descriptive reject instructions (not a literal answer string)
        const lower = content.toLowerCase();
        if (
          /^answers?\s+(like|that|describing|mentioning|involving|such\s+as)\b/.test(
            lower
          )
        )
          continue;
        // Skip if the content already contains internal quotes (compound reject)
        if (
          /[\u201c\u201d"'].*[\u201c\u201d"']/.test(content) &&
          !/^[\u201c\u201d"']/.test(content)
        )
          continue;
        // Skip if content starts with quotes and has trailing meta-text after closing quote
        // e.g., "answer" alone, "answer" without indication
        if (
          /^[\u201c\u201d"'][^"'\u201c\u201d]+[\u201c\u201d"']\s+(alone|without)\b/.test(
            content
          )
        )
          continue;
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
            sub.type === 'do not accept' ? 'do not accept' : 'reject';
          diags.push({
            rule: 'answerline.reject-quotes',
            severity: 'warning',
            paragraph: para.index,
            message: `Text in [${directive}] directive should be wrapped in quotes: "${content}".`,
            sourceText: para.rawText,
            offset: sub.contentStart,
            length: sub.contentText.length,
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
        if (sub.type !== 'prompt' && sub.type !== 'anti-prompt') continue;

        // Look for "by asking X" in the content
        const byAskingMatch = sub.contentText.match(/by\s+asking\s+(.*)/i);
        if (!byAskingMatch) continue;

        const askingContent = byAskingMatch[1].trim();
        if (!askingContent) continue;

        // Check if the asking content is wrapped in quotes
        const quotePattern = /^[\u201c\u201d"'].+[\u201c\u201d"']$/;
        if (!quotePattern.test(askingContent)) {
          const askingOffset = sub.contentStart + byAskingMatch.index! + byAskingMatch[0].length - byAskingMatch[1].length;
          diags.push({
            rule: 'answerline.prompt-question-quotes',
            severity: 'warning',
            paragraph: para.index,
            message: `The "by asking" question should be wrapped in quotes: "${askingContent}".`,
            sourceText: para.rawText,
            offset: askingOffset,
            length: askingContent.length,
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
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket === -1) continue;

    const afterBracket = text.slice(lastBracket + 1);

    // Strip trailing tag (e.g. <Category> or <Author, Category>)
    const withoutTag = afterBracket.replace(/<[^>]+>\s*$/, '');

    // Check if there's non-whitespace text after the last bracket
    const trimmed = withoutTag.trim();
    if (!trimmed) continue;

    // Check if the text is wrapped in parentheses
    if (!(trimmed.startsWith('(') && trimmed.endsWith(')'))) {
      const noteOffset = text.indexOf(trimmed, lastBracket + 1);
      diags.push({
        rule: 'answerline.post-notes',
        severity: 'info',
        paragraph: para.index,
        message: `Text after the last bracket should be wrapped in parentheses: "${trimmed}".`,
        sourceText: text,
        offset: noteOffset !== -1 ? noteOffset : undefined,
        length: noteOffset !== -1 ? trimmed.length : undefined,
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
        if (sub.type === 'anti-prompt') {
          diags.push({
            rule: 'answerline.deprecated-directive',
            severity: 'warning',
            paragraph: para.index,
            message:
              '"anti-prompt" is deprecated. Use a directed prompt instead, e.g. "prompt on X by asking \'can you be less specific?\'".',
          });
        }

        // "do not accept or prompt on" is deprecated in favor of "reject"
        if (sub.type === 'do not accept or prompt on') {
          diags.push({
            rule: 'answerline.deprecated-directive',
            severity: 'warning',
            paragraph: para.index,
            message:
              '"do not accept or prompt on" is deprecated. Use "reject" instead.',
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
            fix: {
              oldText: sub.fullText,
              newText: 'reject ' + sub.contentText,
              offset: sub.fullStart,
            },
          });
        }

        // "do not accept" is deprecated in favor of "reject" (§Formatting answerlines #6)
        if (sub.type === 'do not accept') {
          diags.push({
            rule: 'answerline.deprecated-directive',
            severity: 'warning',
            paragraph: para.index,
            message: '"do not accept" is deprecated. Use "reject" instead.',
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
            fix: {
              oldText: sub.fullText,
              newText: 'reject ' + sub.contentText,
              offset: sub.fullStart,
            },
          });
        }

        // "do not prompt" is deprecated alongside "do not accept"
        if (sub.type === 'do not prompt') {
          diags.push({
            rule: 'answerline.deprecated-directive',
            severity: 'warning',
            paragraph: para.index,
            message: '"do not prompt" is deprecated. Use "reject" instead.',
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
            fix: {
              oldText: sub.fullText,
              newText: 'reject ' + sub.contentText,
              offset: sub.fullStart,
            },
          });
        }
      }
    }

    // Check for deprecated meta-directives in bracket content
    // "accept in either order" is deprecated (§Multiple answers #5)
    if (/\baccept\s+in\s+(either|any)\s+order\b/i.test(para.rawText)) {
      diags.push({
        rule: 'answerline.deprecated-directive',
        severity: 'warning',
        paragraph: para.index,
        message:
          '"accept in either order" is unnecessary. It is implicit that multiple answers can be accepted in any order.',
      });
    }

    // "accept either underlined part/portion" is deprecated (§Alternate answers #5)
    if (
      /\baccept\s+(either|any)\s+underlined\s+(part|portion)\b/i.test(
        para.rawText
      )
    ) {
      diags.push({
        rule: 'answerline.deprecated-directive',
        severity: 'warning',
        paragraph: para.index,
        message:
          '"accept either underlined part" is deprecated. List acceptable alternatives explicitly instead.',
      });
    }

    // "names in either order" is deprecated (§Alternate answers #5)
    if (/\bnames?\s+in\s+(either|any)\s+order\b/i.test(para.rawText)) {
      diags.push({
        rule: 'answerline.deprecated-directive',
        severity: 'warning',
        paragraph: para.index,
        message:
          '"names in either order" is deprecated. List acceptable name orderings explicitly (e.g. [or Murakami Haruki]).',
      });
    }

    // "begrudgingly/grudgingly accept" is discouraged (§Alternate answers #6)
    if (
      /\b(begrudgingly|grudgingly|reluctantly)\s+accept\b/i.test(para.rawText)
    ) {
      diags.push({
        rule: 'answerline.deprecated-directive',
        severity: 'warning',
        paragraph: para.index,
        message:
          'Do not include "begrudgingly accept." Either an answer is acceptable, or it is not.',
      });
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
    const firstBracket = text.indexOf('[', answerStart);
    const answerEnd = firstBracket === -1 ? text.length : firstBracket;
    const answerText = text.substring(answerStart, answerEnd);

    // Look for short parenthesized text that looks like optional parts
    // e.g. "(The) Great Gatsby" or "(a) priori"
    for (const m of answerText.matchAll(/\(([^)]{1,20})\)/g)) {
      const content = m[1].trim();
      // Skip power marks
      if (content === '*') continue;
      // Skip pronunciation guides: ("foo-BAR") or all-caps/hyphenated
      if (/^".*"$/.test(content)) continue;
      if (/^[\u201c].*[\u201d]$/.test(content)) continue;
      if (/^[A-Z-]+$/.test(content)) continue; // All-caps with optional hyphens
      if (content.includes('-') && /[A-Z]/.test(content)) continue; // Contains hyphen and uppercase
      // Skip chemical/mathematical notation: single character, single digit, or patterns like (1), (S), (I)
      if (/^[a-zA-Z0-9]$/.test(content)) continue;
      if (/^[IVX]+$/.test(content)) continue; // Roman numerals
      // Skip if it looks like a clause with conjunctions or punctuation (likely subtitle)
      if (/\b(or|and|also)\b/i.test(content)) continue;
      if (/[:,.]/.test(content)) continue; // Contains punctuation typical of subtitles
      // Skip attributions and provenance notes: (by Author), (from Work)
      if (/^(by|from)\s/i.test(content)) continue;
      // Skip clarifying adjectives that appear before the core answer
      // (these are typically descriptive prefixes, not optional parts)
      const matchPos = m.index!;
      const beforeParen = answerText.substring(0, matchPos).trim();
      // If there's nothing or very little before the parenthesis, it's likely a prefix
      if (beforeParen.length < 5) continue;

      // Only flag if it's short enough to be an optional word/article
      if (content.split(/\s+/).length <= 3) {
        diags.push({
          rule: 'answerline.no-parenthetical-optional',
          severity: 'info',
          paragraph: para.index,
          message: `Avoid parentheses for optional parts in answers: "(${content})". List alternatives explicitly with [or] or [accept] instead.`,
        });
        break; // One per answer line
      }
    }
  }

  return diags;
}

function checkPromptWithNotByAsking(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== 'prompt' && sub.type !== 'anti-prompt') continue;

        // Look for "with" followed by a quoted question
        const withMatch = sub.contentText.match(/\s+(with)\s+[\u201c\u201d"']/i);
        if (withMatch) {
          const withOffset =
            sub.contentStart + withMatch.index! + withMatch[0].indexOf(withMatch[1]);
          diags.push({
            rule: 'answerline.prompt-with-not-by-asking',
            severity: 'info',
            paragraph: para.index,
            message:
              'Directed prompts should use "by asking" instead of "with".',
            sourceText: para.rawText,
            offset: withOffset,
            length: withMatch[1].length,
          });
        }
      }
    }
  }

  return diags;
}

function checkPromptPartialAnswers(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== 'prompt' && sub.type !== 'anti-prompt') continue;

        // Look for "partial answer(s)" in prompt directives
        const partialMatch = sub.contentText.match(
          /\b(partial\s+answers?)\b/i
        );
        if (partialMatch) {
          const partialOffset = sub.contentStart + partialMatch.index!;
          diags.push({
            rule: 'answerline.prompt-partial-answers',
            severity: 'info',
            paragraph: para.index,
            message:
              'Avoid "prompt on partial answers". Spell out what exactly is promptable.',
            sourceText: para.rawText,
            offset: partialOffset,
            length: partialMatch[1].length,
          });
        }
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
      rule: 'answerline.no-nonstandard-prefix',
      severity: 'error',
      paragraph: para.index,
      message: `"${prefix}" is not recognized as an answer line. Use "ANSWER: " (all caps, colon, space).`,
      suggestion: 'ANSWER: ',
      sourceText: text,
      offset: match.index!,
      length: match[1].length,
      fix: {
        oldText: match[1],
        newText: 'ANSWER: ',
        offset: match.index!,
      },
    });
  }

  return diags;
}

const DIRECTIVE_SKIP_WORDS = new Set(['and', 'or', 'but', "don't", 'dont']);

function checkDirectiveSeparator(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const content = bracket.content;

      // Find all directive keywords in the bracket content (excluding "or")
      // "or" is special - it can be used within a directive to list alternatives
      // Match word boundaries, handling multi-word directives
      const directivePattern =
        /\b(do\s+not\s+accept\s+or\s+prompt(\s+on)?|do\s+not\s+accept|do\s+not\s+prompt|anti-?prompt|accept|prompt|reject)\s+/gi;
      const matches = [...content.matchAll(directivePattern)];

      // Skip if only one or no directives found
      if (matches.length <= 1) continue;

      // Check each directive after the first
      for (let i = 1; i < matches.length; i++) {
        const match = matches[i];
        const matchPos = match.index!;

        // Find the token before this directive (skip whitespace first)
        let j = matchPos - 1;
        while (j >= 0 && content[j] === ' ') j--;

        // If preceded by semicolon, this directive is properly separated
        if (j >= 0 && content[j] === ';') continue;

        // Nothing before — skip (first in content)
        if (j < 0) continue;

        // Extract the token: a word (including apostrophes for "don't")
        // or a single punctuation character
        let tokenBefore = '';
        if (/\w/.test(content[j]) || content[j] === "'") {
          while (j >= 0 && (/\w/.test(content[j]) || content[j] === "'")) {
            tokenBefore = content[j] + tokenBefore;
            j--;
          }
        } else {
          tokenBefore = content[j];
        }

        // Skip conjunctions — these connect clauses rather than separate
        // directives (e.g. "read and prompt on it afterwards",
        // "but reject X", "or reject X", "don't accept the answer")
        if (DIRECTIVE_SKIP_WORDS.has(tokenBefore.toLowerCase())) continue;

        // Flag — not preceded by semicolon
        const absPos = bracket.start + 1 + matchPos; // +1 for opening '['
        const directiveName = match[1].toLowerCase().trim();
        diags.push({
          rule: 'answerline.directive-separator',
          severity: 'warning',
          paragraph: para.index,
          message: `Secondary directive "${directiveName}" should be preceded by a semicolon, not "${tokenBefore}".`,
          sourceText: para.rawText,
          offset: absPos,
          length: match[0].length,
        });
      }
    }
  }

  return diags;
}

function checkRejectAlone(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);

    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== 'reject' && sub.type !== 'do not accept') continue;

        const content = sub.contentText.trim();
        if (!content) continue;

        // Check if content has quotes followed by " alone"
        const aloneMatch = content.match(
          /^[\u201c\u201d"']([^"'\u201c\u201d]+)[\u201c\u201d"']\s+alone$/i
        );
        if (aloneMatch) {
          const directive =
            sub.type === 'do not accept' ? 'do not accept' : 'reject';
          const fixedContent = content.replace(/\s+alone$/i, '');
          diags.push({
            rule: 'answerline.reject-no-alone',
            severity: 'warning',
            paragraph: para.index,
            message: `The word "alone" should not appear after a quoted phrase in [${directive}] directive. Remove "alone".`,
            sourceText: para.rawText,
            offset: sub.contentStart,
            length: content.length,
            fix: {
              oldText: content,
              newText: fixedContent,
              offset: sub.contentStart,
            },
          });
        }
      }
    }
  }

  return diags;
}

function checkDirectiveParentheses(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;

    // Find all parenthesized content
    for (const match of text.matchAll(/\(([^)]+)\)/g)) {
      const content = match[1].trim();
      if (!content) continue;

      // Check if content starts with a directive keyword
      const directivePattern =
        /^(do\s+not\s+accept|do\s+not\s+prompt|anti-?prompt|accept|reject|prompt|or)\s+/i;
      const directiveMatch = content.match(directivePattern);

      if (directiveMatch) {
        const offset = match.index!;

        diags.push({
          rule: 'answerline.directive-brackets',
          severity: 'error',
          paragraph: para.index,
          message: `Answerline directives must use square brackets, not parentheses. Change "(${content})" to "[${content}]".`,
          sourceText: text,
          offset: offset,
          length: match[0].length,
          fix: {
            oldText: match[0],
            newText: `[${match[1]}]`,
            offset: offset,
          },
        });
      }
    }
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
  checkPromptWithNotByAsking,
  checkPromptPartialAnswers,
  checkPostNotes,
  checkDeprecatedDirectives,
  checkParentheticalOptional,
  checkDirectiveSeparator,
  checkRejectAlone,
  checkDirectiveParentheses,
];
