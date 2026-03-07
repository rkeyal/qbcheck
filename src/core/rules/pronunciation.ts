import { Packet, LintDiagnostic, LintRule, Paragraph } from "../model.js";

// Match pronunciation guides: ("foo-bar") or ("FOO-bar")
const PRON_GUIDE_RE = /\("([^"]+)"\)/g;

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
      if (content.includes("-") || /^[a-zA-Z\s-]+$/.test(content)) {
        diags.push({
          rule: "pronunciation.delimiter",
          severity: "warning",
          paragraph: para.index,
          message: `Pronunciation guide should use parentheses with double quotes: ("${content}"), not ["${content}"].`,
        });
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
    const badTrailing = [
      ...text.matchAll(/\("([^"]+[.,;:!?])"\)/g),
    ];

    for (const match of badTrailing) {
      const content = match[1];
      // Check it's actually a pronunciation guide and not quoted speech
      if (content.includes("-") || /^[a-zA-Z\s-]+[.,;:!?]$/.test(content)) {
        const lastChar = content[content.length - 1];
        diags.push({
          rule: "pronunciation.trailing-punct",
          severity: "info",
          paragraph: para.index,
          message: `Punctuation "${lastChar}" should come after the pronunciation guide, not inside it.`,
        });
      }
    }
  }

  return diags;
}

export const pronunciationRules: LintRule[] = [
  checkPronunciationDelimiters,
  checkTrailingPunctuation,
];
