import { Paragraph, Packet, Question, BonusPart, Run, LintDiagnostic } from "../src/core/model.js";

/** Default plain-text run (no formatting). */
function plainRun(text: string): Run {
  return { text, bold: false, italic: false, underline: false, superscript: false, subscript: false };
}

/** Create a Paragraph with sensible defaults. */
export function makeParagraph(
  text: string,
  opts?: Partial<Paragraph> & { runs?: Run[] }
): Paragraph {
  return {
    index: opts?.index ?? 0,
    runs: opts?.runs ?? [plainRun(text)],
    rawText: text,
    hasPageBreak: opts?.hasPageBreak ?? false,
  };
}

/** Create a minimal valid Packet. Override any field via opts. */
export function makePacket(opts?: Partial<Packet>): Packet {
  return {
    header: opts?.header ?? [],
    tossupHeader: opts && "tossupHeader" in opts ? opts.tossupHeader! : makeParagraph("Tossups", { index: 0 }),
    bonusHeader: opts && "bonusHeader" in opts ? opts.bonusHeader! : makeParagraph("Bonuses", { index: 100 }),
    tossups: opts?.tossups ?? [],
    bonuses: opts?.bonuses ?? [],
    allParagraphs: opts?.allParagraphs ?? [],
    structured: opts?.structured ?? true,
  };
}

/**
 * Create a Question with minimal boilerplate.
 *
 * `text` is the main question body (appended after "N. ").
 * `answer` is the raw answer-line text (ANSWER: prefix is prepended automatically if missing).
 */
export function makeQuestion(
  type: "tossup" | "bonus",
  number: number,
  text: string,
  answer: string,
  opts?: {
    tag?: string;
    parts?: BonusPart[];
    numberParagraphIndex?: number;
    answerRuns?: Run[];
    numberRuns?: Run[];
  }
): Question {
  const baseIdx = opts?.numberParagraphIndex ?? number;
  const questionText = `${number}. ${text}`;
  const numberPara = makeParagraph(questionText, {
    index: baseIdx,
    runs: opts?.numberRuns ?? [plainRun(questionText)],
  });

  const answerText = /^\s*ANSWER/i.test(answer) ? answer : `ANSWER: ${answer}`;
  const answerPara = makeParagraph(answerText, {
    index: baseIdx + 1,
    runs: opts?.answerRuns ?? [plainRun(answerText)],
  });

  const tagPara = opts?.tag
    ? makeParagraph(opts.tag, { index: baseIdx + 2 })
    : null;

  const paragraphs = [numberPara, answerPara];
  if (tagPara) paragraphs.push(tagPara);
  if (opts?.parts) {
    for (const part of opts.parts) {
      paragraphs.push(part.textParagraph);
      if (part.answerLine) paragraphs.push(part.answerLine);
    }
  }

  return {
    type,
    number,
    numberParagraph: numberPara,
    paragraphs,
    answerLine: type === "tossup" ? answerPara : null,
    tag: tagPara,
    parts: opts?.parts ?? [],
  };
}

/** Create a bonus part for use in makeQuestion's parts array. */
export function makeBonusPart(
  marker: string,
  text: string,
  answer: string,
  baseIndex: number,
  opts?: { textRuns?: Run[]; answerRuns?: Run[] }
): BonusPart {
  const textPara = makeParagraph(`${marker} ${text}`, {
    index: baseIndex,
    runs: opts?.textRuns ?? [plainRun(`${marker} ${text}`)],
  });
  const answerText = /^\s*ANSWER/i.test(answer) ? answer : `ANSWER: ${answer}`;
  const answerPara = makeParagraph(answerText, {
    index: baseIndex + 1,
    runs: opts?.answerRuns ?? [plainRun(answerText)],
  });
  return { marker, textParagraph: textPara, answerLine: answerPara };
}

/** Find the first diagnostic matching a rule ID. */
export function findDiag(
  diagnostics: LintDiagnostic[],
  ruleId: string
): LintDiagnostic | undefined {
  return diagnostics.find((d) => d.rule === ruleId);
}

/** Check whether any diagnostic matches a rule ID. */
export function hasDiag(diagnostics: LintDiagnostic[], ruleId: string): boolean {
  return diagnostics.some((d) => d.rule === ruleId);
}
