import { Packet, LintDiagnostic, LintRule } from '../model.js';
import { allQuestions, createDiagnostic } from './utils.js';

function checkSectionHeaders(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  if (!packet.tossupHeader) {
    diags.push({
      rule: 'packet.section-headers',
      severity: 'error',
      paragraph: 0,
      message: 'Missing "Tossups" section header.',
    });
  }
  if (!packet.bonusHeader) {
    diags.push({
      rule: 'packet.section-headers',
      severity: 'error',
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
        rule: 'packet.section-order',
        severity: 'error',
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
    ['Tossup', packet.tossups],
    ['Bonus', packet.bonuses],
  ] as const) {
    // Collect runs of consecutive misnumbered questions with the same offset
    let runStart = -1;
    let runOffset = 0;

    const flushRun = (runEnd: number) => {
      if (runStart === -1) return;
      const len = runEnd - runStart;
      if (len === 1) {
        const expected = runStart + 1;
        diags.push({
          rule: 'packet.question-numbering',
          severity: 'error',
          paragraph: questions[runStart].numberParagraph.index,
          message: `${label} ${expected} is numbered ${questions[runStart].number} (expected ${expected}).`,
        });
      } else {
        const firstExpected = runStart + 1;
        const lastExpected = runEnd;
        const firstActual = questions[runStart].number;
        const lastActual = questions[runEnd - 1].number;
        diags.push({
          rule: 'packet.question-numbering',
          severity: 'error',
          paragraph: questions[runStart].numberParagraph.index,
          message: `${label}s ${firstExpected}\u2013${lastExpected} are numbered ${firstActual}\u2013${lastActual} (off by ${runOffset > 0 ? '+' : ''}${runOffset}).`,
        });
      }
      runStart = -1;
    };

    for (let i = 0; i < questions.length; i++) {
      const expected = i + 1;
      const offset = questions[i].number - expected;
      if (offset !== 0) {
        if (runStart !== -1 && offset === runOffset) {
          // Continue the current run
        } else {
          flushRun(i);
          runStart = i;
          runOffset = offset;
        }
      } else {
        flushRun(i);
      }
    }
    flushRun(questions.length);
  }

  return diags;
}

function checkBoldNumbers(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of allQuestions(packet)) {
    const firstRun = q.numberParagraph.runs[0];
    if (firstRun && firstRun.bold && /^\s*\d+\.\s/.test(firstRun.text)) {
      diags.push({
        rule: 'packet.no-bold-numbers',
        severity: 'warning',
        paragraph: q.numberParagraph.index,
        message: `Question number ${q.number} should not be bold.`,
      });
    }
  }

  return diags;
}

function checkBlankParagraphs(packet: Packet): LintDiagnostic[] {
  const paras = packet.allParagraphs;

  // Only check within question sections (from tossup header onward)
  const startIndex = packet.tossupHeader?.index ?? 0;

  // Collect section header indices to suppress blanks near them
  const sectionHeaderIndices = new Set<number>();
  if (packet.tossupHeader) sectionHeaderIndices.add(packet.tossupHeader.index);
  if (packet.bonusHeader) sectionHeaderIndices.add(packet.bonusHeader.index);

  let groupCount = 0;
  let firstGroupPara = -1;

  for (let i = 0; i < paras.length - 1; i++) {
    // Skip paragraphs before the question sections
    if (paras[i].index < startIndex) continue;

    if (paras[i].rawText.trim() === '' && paras[i + 1]?.rawText.trim() === '') {
      // Skip if any nearby paragraph is a section header
      const nearHeader = [i - 1, i, i + 1, i + 2].some(
        (j) => j >= 0 && j < paras.length && sectionHeaderIndices.has(j)
      );
      if (nearHeader) continue;

      // Count consecutive blanks and skip past this group
      let blankEnd = i + 1;
      while (
        blankEnd + 1 < paras.length &&
        paras[blankEnd + 1].rawText.trim() === ''
      ) {
        blankEnd++;
      }

      groupCount++;
      if (firstGroupPara === -1) firstGroupPara = paras[i].index;

      i = blankEnd;
    }
  }

  // Report once per packet instead of once per group
  if (groupCount > 0) {
    return [
      {
        rule: 'packet.blank-paragraphs',
        severity: 'info',
        paragraph: firstGroupPara,
        message: `${groupCount} group${groupCount > 1 ? 's' : ''} of consecutive blank paragraphs.`,
      },
    ];
  }

  return [];
}

function checkExpectedCount(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];
  const EXPECTED = 20;

  if (packet.tossups.length > 0 && packet.tossups.length !== EXPECTED) {
    diags.push({
      rule: 'packet.expected-count',
      severity: 'warning',
      paragraph: packet.tossupHeader?.index ?? 0,
      message: `Found ${packet.tossups.length} tossup${packet.tossups.length === 1 ? '' : 's'} (expected ${EXPECTED}).`,
    });
  }

  if (packet.bonuses.length > 0 && packet.bonuses.length !== EXPECTED) {
    diags.push({
      rule: 'packet.expected-count',
      severity: 'warning',
      paragraph: packet.bonusHeader?.index ?? 0,
      message: `Found ${packet.bonuses.length} bonus${packet.bonuses.length === 1 ? '' : 'es'} (expected ${EXPECTED}).`,
    });
  }

  return diags;
}

function checkNumberingSequence(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const [label, questions] of [
    ['Tossup', packet.tossups],
    ['Bonus', packet.bonuses],
  ] as const) {
    for (let i = 1; i < questions.length; i++) {
      if (questions[i].number <= questions[i - 1].number) {
        diags.push(
          createDiagnostic(
            'packet.numbering-sequence',
            questions[i].numberParagraph,
            `${label} ${questions[i].number} does not increase from previous ${label.toLowerCase()} ${questions[i - 1].number}. Downstream parsers use number resets to detect the tossup/bonus boundary.`,
            { severity: 'error' }
          )
        );
      }
    }
  }

  return diags;
}

export const packetRules: LintRule[] = [
  checkSectionHeaders,
  checkSectionOrder,
  checkQuestionNumbering,
  checkNumberingSequence,
  checkBoldNumbers,
  checkBlankParagraphs,
  checkExpectedCount,
];
