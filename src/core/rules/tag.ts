import { Packet, LintDiagnostic, LintRule } from '../model.js';
import { VALID_CATEGORIES } from '../../shared/constants.js';
import {
  TAG_WITH_AUTHOR,
  TAG_CATEGORY_ONLY,
  EDITORIAL_SUFFIX,
} from '../patterns.js';

function stripEditorialSuffix(text: string): string {
  return text.replace(EDITORIAL_SUFFIX, '');
}

/**
 * Extract the category string from a tag paragraph's rawText.
 * Returns null if the tag doesn't match the expected format.
 */
export function extractTagCategory(tagRawText: string): string | null {
  const text = stripEditorialSuffix(tagRawText.trim());
  const match = text.match(TAG_WITH_AUTHOR);
  const catOnlyMatch = !match ? text.match(TAG_CATEGORY_ONLY) : null;
  if (!match && !catOnlyMatch) return null;
  return match ? match[2].trim() : catOnlyMatch![1].trim();
}

function checkTagExists(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) {
      diags.push({
        rule: 'tag.tag-present',
        severity: 'warning',
        paragraph: q.numberParagraph.index,
        message: `${q.type === 'tossup' ? 'Tossup' : 'Bonus'} ${q.number} has no tag line.`,
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
    if (!TAG_WITH_AUTHOR.test(text) && !TAG_CATEGORY_ONLY.test(text)) {
      diags.push({
        rule: 'tag.tag-format',
        severity: 'warning',
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
    const inner = rawText.replace(EDITORIAL_SUFFIX, '');
    const openBracket = inner.indexOf('<');
    if (openBracket === -1) continue;
    const afterFirst = inner.substring(openBracket + 1);
    if (
      afterFirst.includes('<') ||
      afterFirst.indexOf('>') < afterFirst.lastIndexOf('>')
    ) {
      diags.push({
        rule: 'tag.no-nested-brackets',
        severity: 'error',
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

  // First pass: count occurrences of each full category (including subcategories)
  const categoryCount = new Map<string, number>();

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) continue;

    const category = extractTagCategory(q.tag.rawText);
    if (!category) continue;

    categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
  }

  // Second pass: validate categories
  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (!q.tag) continue;

    const category = extractTagCategory(q.tag.rawText);
    if (!category) continue;

    // Check if category has a colon (subcategory like "Social Science: Anthropology")
    const colonIndex = category.indexOf(':');
    const baseCategory =
      colonIndex !== -1 ? category.substring(0, colonIndex).trim() : category;
    const isSubcategory = colonIndex !== -1;

    // Validate the base category (pre-colon part)
    if (!VALID_CATEGORIES.has(baseCategory)) {
      diags.push({
        rule: 'tag.valid-category',
        severity: 'warning',
        paragraph: q.tag.index,
        message: `Base category "${baseCategory}" is not a standard QMOS category.`,
      });
      continue; // Don't check consistency if base is invalid
    }

    // If it's a subcategory and appears only once, flag as inconsistent usage
    if (isSubcategory && categoryCount.get(category) === 1) {
      diags.push({
        rule: 'tag.valid-category',
        severity: 'info',
        paragraph: q.tag.index,
        message: `Subcategory "${category}" appears only once. Subcategories should be used consistently throughout the packet.`,
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
    const match = text.match(TAG_WITH_AUTHOR);
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
        rule: 'tag.consistent-categories',
        severity: 'warning',
        paragraph: 0,
        message: `Inconsistent category naming: ${variants.map((v) => `"${v}"`).join(' vs ')}. Pick one and use it consistently.`,
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
