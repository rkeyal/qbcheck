export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
}

export interface Paragraph {
  index: number;
  runs: Run[];
  rawText: string;
  hasPageBreak: boolean;
}

export interface BonusPart {
  marker: string; // "[10]", "[10e]", "[10m]", "[10h]", "[E]", "[M]", "[H]"
  textParagraph: Paragraph;
  answerLine: Paragraph | null;
}

export interface Question {
  type: "tossup" | "bonus";
  number: number;
  numberParagraph: Paragraph; // the paragraph containing "N. ..."
  paragraphs: Paragraph[]; // all paragraphs belonging to this question
  answerLine: Paragraph | null;
  tag: Paragraph | null;
  parts: BonusPart[]; // bonus parts (empty for tossups)
}

export interface Packet {
  header: Paragraph[];
  tossupHeader: Paragraph | null;
  bonusHeader: Paragraph | null;
  tossups: Question[];
  bonuses: Question[];
  allParagraphs: Paragraph[];
  structured: boolean;
}

export type Severity = "error" | "warning" | "info";

export interface LintDiagnostic {
  rule: string;
  severity: Severity;
  paragraph: number;
  message: string;
  suggestion?: string;
  questionLabel?: string;   // e.g. "T5", "B17"
  answerPreview?: string;   // truncated answer text
  sourceText?: string;      // paragraph rawText for snippet rendering
  offset?: number;          // char offset of match within sourceText
  length?: number;          // length of matched text
}

export type LintRule = (packet: Packet) => LintDiagnostic[];
