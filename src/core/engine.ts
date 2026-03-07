import { Packet, LintDiagnostic, LintRule, Question } from "./model.js";
import { packetRules } from "./rules/packet.js";
import { questionRules } from "./rules/question.js";
import { answerlineRules } from "./rules/answerline.js";
import { pronunciationRules } from "./rules/pronunciation.js";
import { formattingRules } from "./rules/formatting.js";
import { tagRules, extractTagCategory } from "./rules/tag.js";
import { writingRules } from "./rules/writing.js";

const allRules: LintRule[] = [
  ...packetRules,
  ...questionRules,
  ...answerlineRules,
  ...pronunciationRules,
  ...formattingRules,
  ...tagRules,
  ...writingRules,
];

const PACKET_STRUCTURE_RULES = new Set([
  "packet.section-headers",
  "packet.section-order",
  "packet.question-numbering",
  "packet.no-bold-numbers",
  "packet.no-extras-label",
  "packet.blank-paragraphs",
  "packet.expected-count",
  "tag.consistent-categories",
]);

export function lint(
  packet: Packet,
  disabledRules?: Set<string>
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const rule of allRules) {
    const results = rule(packet);
    for (const d of results) {
      if (disabledRules && disabledRules.has(d.rule)) continue;
      if (!packet.structured && PACKET_STRUCTURE_RULES.has(d.rule)) continue;
      diagnostics.push(d);
    }
  }

  // Sort by paragraph index
  diagnostics.sort((a, b) => a.paragraph - b.paragraph);

  // Enrich with question labels and answer previews
  enrichDiagnostics(diagnostics, packet);

  return diagnostics;
}

const ANSWER_PREVIEW_MAX = 60;

function extractAnswerText(q: Question): string[] {
  const answers: string[] = [];

  if (q.type === "tossup" && q.answerLine) {
    answers.push(truncateAnswer(q.answerLine.rawText));
  } else if (q.type === "bonus") {
    for (const part of q.parts) {
      if (part.answerLine) {
        answers.push(truncateAnswer(part.answerLine.rawText));
      }
    }
  }

  return answers;
}

function truncateAnswer(raw: string): string {
  // Strip "ANSWER: " prefix
  let text = raw.replace(/^\s*ANSWER:\s*/i, "").trim();
  // Remove bracketed instructions (e.g. [accept ...], [or ...], [prompt ...])
  const bracketIdx = text.indexOf("[");
  if (bracketIdx !== -1) {
    text = text.substring(0, bracketIdx).trim();
  }
  if (text.length > ANSWER_PREVIEW_MAX) {
    text = text.substring(0, ANSWER_PREVIEW_MAX) + "\u2026";
  }
  return text;
}

function enrichDiagnostics(diagnostics: LintDiagnostic[], packet: Packet): void {
  // Build a map from paragraph index → question info
  const paraToQuestion = new Map<number, { label: string; answers: string[] }>();

  for (const q of packet.tossups) {
    const label = `T${q.number}`;
    const answers = extractAnswerText(q);
    for (const p of q.paragraphs) {
      paraToQuestion.set(p.index, { label, answers });
    }
  }

  for (const q of packet.bonuses) {
    const label = `B${q.number}`;
    const answers = extractAnswerText(q);
    for (const p of q.paragraphs) {
      paraToQuestion.set(p.index, { label, answers });
    }
  }

  for (const d of diagnostics) {
    const info = paraToQuestion.get(d.paragraph);
    if (info) {
      d.questionLabel = info.label;
      d.answerPreview = info.answers.join(" / ");
    }
  }
}

/**
 * Cross-packet category inference.  When multiple packets (≥ 4) are
 * available, categories are validated by their frequency across packets
 * rather than against the static VALID_CATEGORIES list.
 *
 * Categories appearing in fewer than half the packets are flagged as
 * potentially non-standard.  Categories appearing in at least half the
 * packets are considered standard for this tournament.
 *
 * Returns an array parallel to `packets` — each element is the list of
 * inferred `tag.valid-category` diagnostics for that packet.
 */
export function inferCrossPacketCategories(
  packets: Packet[]
): LintDiagnostic[][] {
  // category (lower-cased) → set of packet indices that use it
  const categoryToPackets = new Map<string, Set<number>>();

  for (let pi = 0; pi < packets.length; pi++) {
    for (const q of [...packets[pi].tossups, ...packets[pi].bonuses]) {
      if (!q.tag) continue;
      const cat = extractTagCategory(q.tag.rawText);
      if (!cat) continue;
      const key = cat.toLowerCase();
      if (!categoryToPackets.has(key)) categoryToPackets.set(key, new Set());
      categoryToPackets.get(key)!.add(pi);
    }
  }

  const threshold = packets.length / 2;
  const result: LintDiagnostic[][] = packets.map(() => []);

  for (let pi = 0; pi < packets.length; pi++) {
    for (const q of [...packets[pi].tossups, ...packets[pi].bonuses]) {
      if (!q.tag) continue;
      const cat = extractTagCategory(q.tag.rawText);
      if (!cat) continue;
      const key = cat.toLowerCase();
      const count = categoryToPackets.get(key)?.size ?? 0;
      if (count < threshold) {
        const label = `${q.type === "tossup" ? "T" : "B"}${q.number}`;
        result[pi].push({
          rule: "tag.valid-category",
          severity: "warning",
          paragraph: q.tag.index,
          message: `Category "${cat}" appears in only ${count} of ${packets.length} packets. It may be non-standard.`,
          questionLabel: label,
        });
      }
    }
  }

  return result;
}
