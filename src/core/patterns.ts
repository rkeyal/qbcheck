/**
 * Shared regex patterns used across multiple files in the linter.
 * Consolidates duplicate pattern definitions to improve maintainability.
 */

/**
 * Matches question number prefix: "1. " or "20. "
 * Captures the number in group 1
 */
export const QUESTION_NUMBER = /^\s*(\d+)\.\s/;

/**
 * Matches ANSWER: prefix (case-insensitive)
 * Used to identify answer line paragraphs
 */
export const ANSWER = /^\s*ANSWER\s*:\s*/i;

/**
 * Matches tag line format: <Author, Category> or <Category>
 * Includes optional editorial suffix like [Edited] or {Ed. CT}
 */
export const TAG = /^\s*<[^>]+>\s*(?:[[{][^]}]*[\]}])?\s*$/;

/**
 * Matches bonus part markers: [10], [10e], [10m], [10h], [E], [M], [H]
 */
export const BONUS_PART = /^\s*\[(10[emh]?|[EMH])\]\s*/i;

/**
 * Matches editorial suffixes in tag lines: [Edited], {Ed. CT], etc.
 */
export const EDITORIAL_SUFFIX = /\s*[[{][^]}]*[\]}]\s*$/;

/**
 * Matches tag with author and category: <Author, Category>
 * Captures author in group 1, category in group 2
 */
export const TAG_WITH_AUTHOR = /^<([^,]+),\s*(.+)>$/;

/**
 * Matches tag with category only: <Category>
 * Captures category in group 1
 */
export const TAG_CATEGORY_ONLY = /^<([^,>]+)>$/;

/**
 * Matches "For 10 points each" or "FTPE" (case-insensitive).
 * Used to identify bonus lead-ins in segmentation and rules.
 */
export const FTPE = /for\s+10\s+points?\s+each|FTPE/i;

/**
 * Matches "For 10 points" marker (case-insensitive).
 * Used to identify FTP markers in tossup text.
 */
export const FTP_MARKER = /for\s+10\s+points/i;
