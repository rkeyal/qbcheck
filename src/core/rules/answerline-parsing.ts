export interface BracketSpan {
  start: number; // index of '[' in rawText
  end: number; // index of ']' in rawText
  content: string; // text between brackets
}

export interface SubDirective {
  type:
    | 'accept'
    | 'or'
    | 'prompt'
    | 'anti-prompt'
    | 'reject'
    | 'do not accept'
    | 'do not accept or prompt on'
    | 'do not prompt'
    | 'unknown';
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

export function findBracketSpans(rawText: string): BracketSpan[] {
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

export function parseSubDirectives(
  bracket: BracketSpan,
  _rawText: string
): SubDirective[] {
  const results: SubDirective[] = [];
  // The content inside the brackets, split on ';'
  const innerStart = bracket.start + 1; // after '['
  const parts = bracket.content.split(';');

  let offset = innerStart;
  for (const part of parts) {
    const trimmed = part.trimStart();
    const leadingSpaces = part.length - trimmed.length;
    const partStart = offset + leadingSpaces;
    const trimmedEnd = trimmed.trimEnd();

    // Try to match directive keywords (case-insensitive)
    const patterns: {
      type: SubDirective['type'];
      regex: RegExp;
    }[] = [
      { type: 'do not accept or prompt on', regex: /^do\s+not\s+accept\s+or\s+prompt\s+(on\s+)?/i },
      { type: 'do not accept', regex: /^do\s+not\s+accept\s+/i },
      { type: 'do not prompt', regex: /^do\s+not\s+prompt\s+/i },
      { type: 'anti-prompt', regex: /^anti-?prompt\s+(on\s+)?/i },
      { type: 'prompt', regex: /^prompt\s+(on\s+)?/i },
      { type: 'accept', regex: /^accept\s+/i },
      { type: 'reject', regex: /^reject\s+/i },
      { type: 'or', regex: /^or\s+/i },
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
        type: 'unknown',
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

/**
 * Returns true if the directive content is a meta-instruction about how to
 * judge answers (e.g. "partial answer", "either answer", "equivalents")
 * rather than a specific answer that should carry formatting.
 */
export function isMetaInstruction(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return (
    /^(either|any|both|all)\b/.test(normalized) ||
    /^(in\s+(either|any)\s+order|names?\s+in\s+(either|any)\s+order)\b/.test(
      normalized
    ) ||
    /^answers?\s+in\s+(either|any)\s+order\b/.test(normalized) ||
    /\b(partial|equivalent|reasonable|similar|obvious|clear|specific|either|any)\s+(answer|response|mention|description|form)s?\b/.test(
      normalized
    ) ||
    /\b(equivalents|partial answers?|either answer|any answer|word forms?)\b/.test(
      normalized
    ) ||
    // Substitution instructions: "X" in place of "Y" or "X" instead of "Y"
    /\b(in\s+place\s+of|instead\s+of)\b/.test(normalized) ||
    // Descriptive class-level accepts: "answers (that) describe/indicating/mentioning X"
    /^(answers?|other\s+answers?|the\s+aforementioned\s+answers?)\s+(that\s+)?(describ|indicat|mention|involv|such\s+as)\w*\b/.test(
      normalized
    ) ||
    // "other answers" without qualification is always meta
    /^other\s+answers?\b/.test(normalized)
  );
}
