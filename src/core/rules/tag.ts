import { Packet, LintDiagnostic, LintRule } from "../model.js";
import { VALID_CATEGORIES } from "../../shared/constants.js";

// Matches <Author, Category> (with comma) or <Category> (without comma)
const TAG_PATTERN = /^<([^,]+),\s*(.+)>$/;
const TAG_CATEGORY_ONLY = /^<([^,>]+)>$/;

// Strip editorial suffixes like [Edited], [Ed. CT], {Ed. CT] from tag text
const EDITORIAL_SUFFIX_RE = /\s*[\[{][^\]\}]*[\]\}]\s*$/;

function stripEditorialSuffix(text: string): string {
  return text.replace(EDITORIAL_SUFFIX_RE, "");
}

/**
 * Extract the category string from a tag paragraph's rawText.
 * Returns null if the tag doesn't match the expected format.
 */
export function extractTagCategory(tagRawText: string): string | null {
  const text = stripEditorialSuffix(tagRawText.trim());
  const match = text.match(TAG_PATTERN);
  const catOnlyMatch = !match ? text.match(TAG_CATEGORY_ONLY) : null;
  if (!match && !catOnlyMatch) return null;
  return match ? match[2].trim() : catOnlyMatch![1].trim();
}

function checkTagExists(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) {
      diags.push({
        rule: "tag.tag-present",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `${q.type === "tossup" ? "Tossup" : "Bonus"} ${q.number} has no tag line.`,
      });
    }
  }

  return diags;
}

function checkTagFormat(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) continue;

    const rawText = q.tag.rawText.trim();
    const text = stripEditorialSuffix(rawText);
    if (!TAG_PATTERN.test(text) && !TAG_CATEGORY_ONLY.test(text)) {
      diags.push({
        rule: "tag.tag-format",
        severity: "warning",
        paragraph: q.tag.index,
        message: `Tag "${rawText}" does not match expected format <Author, Category> or <Category>.`,
      });
    }
  }

  return diags;
}

function checkNestedAngleBrackets(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) continue;

    const rawText = q.tag.rawText.trim();
    // Strip outer < and > then check for nested ones
    const inner = rawText.replace(EDITORIAL_SUFFIX_RE, "");
    const openBracket = inner.indexOf("<");
    if (openBracket === -1) continue;
    const afterFirst = inner.substring(openBracket + 1);
    if (afterFirst.includes("<") || (afterFirst.indexOf(">") < afterFirst.lastIndexOf(">"))) {
      diags.push({
        rule: "tag.no-nested-brackets",
        severity: "error",
        paragraph: q.tag.index,
        message: `Tag contains nested angle brackets, which will break downstream parsers: "${rawText}".`,
        sourceText: rawText,
      });
    }
  }

  return diags;
}

function checkValidCategory(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) continue;

    const text = stripEditorialSuffix(q.tag.rawText.trim());
    const match = text.match(TAG_PATTERN);
    const catOnlyMatch = !match ? text.match(TAG_CATEGORY_ONLY) : null;
    if (!match && !catOnlyMatch) continue;

    const category = match ? match[2].trim() : catOnlyMatch![1].trim();
    if (!VALID_CATEGORIES.has(category)) {
      diags.push({
        rule: "tag.valid-category",
        severity: "warning",
        paragraph: q.tag.index,
        message: `Category "${category}" is not a standard QMOS category.`,
      });
    }
  }

  return diags;
}

function checkConsistentCategories(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const categoryVariants = new Map<string, string[]>();

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) continue;

    const text = stripEditorialSuffix(q.tag.rawText.trim());
    const match = text.match(TAG_PATTERN);
    const catOnlyMatch = !match ? text.match(TAG_CATEGORY_ONLY) : null;
    if (!match && !catOnlyMatch) continue;

    const category = match ? match[2].trim() : catOnlyMatch![1].trim();
    const normalized = category.toLowerCase();

    if (!categoryVariants.has(normalized)) {
      categoryVariants.set(normalized, []);
    }
    const variants = categoryVariants.get(normalized)!;
    if (!variants.includes(category)) {
      variants.push(category);
    }
  }

  for (const [, variants] of categoryVariants) {
    if (variants.length > 1) {
      diags.push({
        rule: "tag.consistent-categories",
        severity: "warning",
        paragraph: 0,
        message: `Inconsistent category naming: ${variants.map((v) => `"${v}"`).join(" vs ")}. Pick one and use it consistently.`,
      });
    }
  }

  return diags;
}

export const tagRules: LintRule[] = [
  checkTagExists,
  checkTagFormat,
  checkNestedAngleBrackets,
  checkValidCategory,
  checkConsistentCategories,
];
