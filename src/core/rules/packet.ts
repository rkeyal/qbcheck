import { Packet, LintDiagnostic, LintRule } from "../model.js";

function checkSectionHeaders(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  if (!packet.tossupHeader) {
    diags.push({
      rule: "packet.section-headers",
      severity: "error",
      paragraph: 0,
      message: 'Missing "Tossups" section header.',
    });
  }
  if (!packet.bonusHeader) {
    diags.push({
      rule: "packet.section-headers",
      severity: "error",
      paragraph: 0,
      message: 'Missing "Bonuses" section header.',
    });
  }

  return diags;
}

function checkSectionOrder(packet: Packet): LintDiagnostic[] {
  if (!packet.tossupHeader || !packet.bonusHeader) return [];

  if (packet.tossupHeader.index > packet.bonusHeader.index) {
    return [
      {
        rule: "packet.section-order",
        severity: "error",
        paragraph: packet.bonusHeader.index,
        message: '"Bonuses" section appears before "Tossups" section.',
      },
    ];
  }
  return [];
}

function checkQuestionNumbering(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const [label, questions] of [
    ["Tossup", packet.tossups],
    ["Bonus", packet.bonuses],
  ] as const) {
    for (let i = 0; i < questions.length; i++) {
      const expected = i + 1;
      if (questions[i].number !== expected) {
        diags.push({
          rule: "packet.question-numbering",
          severity: "error",
          paragraph: questions[i].numberParagraph.index,
          message: `${label} ${i + 1} is numbered ${questions[i].number} (expected ${expected}).`,
        });
      }
    }
  }

  return diags;
}

function checkBoldNumbers(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    const firstRun = q.numberParagraph.runs[0];
    if (firstRun && firstRun.bold && /^\s*\d+\.\s/.test(firstRun.text)) {
      diags.push({
        rule: "packet.no-bold-numbers",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `Question number ${q.number} should not be bold.`,
      });
    }
  }

  return diags;
}

function checkExtrasLabel(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const re = /\b(extra|tiebreaker|TB)\b/i;

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    const text = q.numberParagraph.rawText;
    const numEnd = text.indexOf(". ");
    const prefix = numEnd !== -1 ? text.substring(0, numEnd + 2) : "";
    if (re.test(prefix)) {
      diags.push({
        rule: "packet.no-extras-label",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Don\'t label questions as "Extra", "Tiebreaker", or "TB". Use sequential numbering instead.',
      });
    }
  }

  return diags;
}

function checkBlankParagraphs(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const paras = packet.allParagraphs;

  // Only check within question sections (from tossup header onward)
  const startIndex = packet.tossupHeader?.index ?? 0;

  // Collect section header indices to suppress blanks near them
  const sectionHeaderIndices = new Set<number>();
  if (packet.tossupHeader) sectionHeaderIndices.add(packet.tossupHeader.index);
  if (packet.bonusHeader) sectionHeaderIndices.add(packet.bonusHeader.index);

  for (let i = 0; i < paras.length - 1; i++) {
    // Skip paragraphs before the question sections
    if (paras[i].index < startIndex) continue;

    if (paras[i].rawText.trim() === "" && paras[i + 1]?.rawText.trim() === "") {
      // Skip if any nearby paragraph is a section header
      const nearHeader = [i - 1, i, i + 1, i + 2].some(
        (j) => j >= 0 && j < paras.length && sectionHeaderIndices.has(j)
      );
      if (nearHeader) continue;

      // Count consecutive blanks and report once per group
      let blankEnd = i + 1;
      while (blankEnd + 1 < paras.length && paras[blankEnd + 1].rawText.trim() === "") {
        blankEnd++;
      }
      const blankCount = blankEnd - i + 1;

      diags.push({
        rule: "packet.blank-paragraphs",
        severity: "info",
        paragraph: paras[i].index,
        message: `${blankCount} consecutive blank paragraphs.`,
      });

      // Skip past this group
      i = blankEnd;
    }
  }

  return diags;
}

function checkExpectedCount(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const EXPECTED = 20;

  if (packet.tossups.length > 0 && packet.tossups.length !== EXPECTED) {
    diags.push({
      rule: "packet.expected-count",
      severity: "warning",
      paragraph: packet.tossupHeader?.index ?? 0,
      message: `Found ${packet.tossups.length} tossup${packet.tossups.length === 1 ? "" : "s"} (expected ${EXPECTED}).`,
    });
  }

  if (packet.bonuses.length > 0 && packet.bonuses.length !== EXPECTED) {
    diags.push({
      rule: "packet.expected-count",
      severity: "warning",
      paragraph: packet.bonusHeader?.index ?? 0,
      message: `Found ${packet.bonuses.length} bonus${packet.bonuses.length === 1 ? "" : "es"} (expected ${EXPECTED}).`,
    });
  }

  return diags;
}

export const packetRules: LintRule[] = [
  checkSectionHeaders,
  checkSectionOrder,
  checkQuestionNumbering,
  checkBoldNumbers,
  checkExtrasLabel,
  checkBlankParagraphs,
  checkExpectedCount,
];
