import { Packet, LintDiagnostic, LintRule, Paragraph } from '../model.js';
import { createDiagnostic } from './utils.js';

// Match guides using square brackets instead of parens
const PRON_SQUARE_RE = /\["([^"]+)"\]/g;

function getAllTextParagraphs(packet: Packet): Paragraph[] {
  return packet.allParagraphs.filter((p) => p.rawText.trim().length > 0);
}

function checkPronunciationDelimiters(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;

    // Check for square bracket pronunciation guides
    const squareMatches = [...text.matchAll(PRON_SQUARE_RE)];
    for (const match of squareMatches) {
      // Only flag if it looks like a pronunciation guide (contains hyphens or phonetic content)
      const content = match[1];
      if (content.includes('-') || /^[a-zA-Z\s-]+$/.test(content)) {
        const oldText = match[0]; // e.g. ["foo-BAR"]
        const newText = `("${content}")`; // e.g. ("foo-BAR")
        diags.push(
          createDiagnostic(
            'pronunciation.paren-delimiter',
            para,
            `Pronunciation guide should use parentheses with double quotes: ("${content}"), not ["${content}"].`,
            {
              offset: match.index!,
              length: oldText.length,
              fix: { oldText, newText, offset: match.index! },
            }
          )
        );
      }
    }
  }

  return diags;
}

function checkTrailingPunctuation(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;

    // Find pronunciation guides where punctuation is inside the closing paren
    // e.g., ("foo-bar.") instead of ("foo-bar").
    const badTrailing = [...text.matchAll(/\("([^"]+[.,;:!?])"\)/g)];

    for (const match of badTrailing) {
      const content = match[1];
      // Check it's actually a pronunciation guide and not quoted speech
      if (content.includes('-') || /^[a-zA-Z\s-]+[.,;:!?]$/.test(content)) {
        const lastChar = content[content.length - 1];
        diags.push(
          createDiagnostic(
            'pronunciation.trailing-punct',
            para,
            `Punctuation "${lastChar}" should come after the pronunciation guide, not inside it.`,
            { severity: 'info', offset: match.index!, length: match[0].length }
          )
        );
      }
    }
  }

  return diags;
}

function checkPronunciationQuotes(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;

    // Find pronunciation guides without quotes: (foo-BAR) instead of ("foo-BAR")
    // Match parens with content that looks like a pronunciation guide but lacks quotes
    const unquotedMatches = [...text.matchAll(/\(([A-Z-]+|[a-z]+-[A-Z]+)\)/g)];

    for (const match of unquotedMatches) {
      const content = match[1];

      // Skip chemical/mathematical notation:
      // - Single letters: (R), (S), (Z), etc.
      // - Roman numerals: (I), (II), (III), (IV), etc.
      // - Single digits: (1), (2), etc.
      if (/^[A-Z]$/.test(content)) continue; // Single letter
      if (/^[IVX]+$/.test(content)) continue; // Roman numerals
      if (/^\d+$/.test(content)) continue; // Single/multiple digits

      // Only flag if it contains hyphens or is all caps (typical PG patterns)
      // and isn't just a short abbreviation
      if (content.includes('-') || /^[A-Z]+$/.test(content)) {
        const oldText = match[0]; // e.g. (foo-BAR)
        const newText = `("${content}")`; // e.g. ("foo-BAR")
        diags.push(
          createDiagnostic(
            'pronunciation.quotes-required',
            para,
            `Pronunciation guide should have quotes around it: ("${content}"), not (${content}).`,
            {
              offset: match.index!,
              length: match[0].length,
              fix: { oldText, newText, offset: match.index! },
            }
          )
        );
      }
    }
  }

  return diags;
}

function checkPossessivePronunciation(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;

    // Find pronunciation guides preceded by possessives (ending in 's)
    // e.g., Toibin's ("TOY-bin") should be ("TOY-binz") or ("TOY-bin's")
    const possessiveMatches = [...text.matchAll(/'s\s*\(["']([^"']+)["']\)/g)];

    for (const match of possessiveMatches) {
      const pgContent = match[1];
      // Check if the PG ends with 's, s, or z
      if (!/['']s$|[sz]$/i.test(pgContent)) {
        diags.push(
          createDiagnostic(
            'pronunciation.possessive-ending',
            para,
            `Pronunciation guide following a possessive ('s) should end with 's, s, or z: "${pgContent}".`,
            { offset: match.index!, length: match[0].length }
          )
        );
      }
    }
  }

  return diags;
}

export const pronunciationRules: LintRule[] = [
  checkPronunciationDelimiters,
  checkTrailingPunctuation,
  checkPronunciationQuotes,
  checkPossessivePronunciation,
];
