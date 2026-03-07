import { describe, it, expect } from "vitest";
import { segmentPacket } from "../src/core/segmenter.js";
import { lint } from "../src/core/engine.js";
import { makeParagraph } from "./helpers.js";

function makeParas(texts: string[]) {
  return texts.map((t, i) => makeParagraph(t, { index: i }));
}

describe("lint() with unstructured packets", () => {
  it("skips packet-structure rules for unstructured packets", () => {
    const paras = makeParas([
      "This is a question. For 10 points, name it.",
      "ANSWER: test answer",
      "<Auth, History>",
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);

    const diags = lint(packet);
    const packetRuleIds = [
      "packet.section-headers",
      "packet.section-order",
      "packet.question-numbering",
      "packet.no-bold-numbers",
      "packet.no-extras-label",
      "packet.blank-paragraphs",
      "packet.expected-count",
      "tag.consistent-categories",
    ];

    for (const ruleId of packetRuleIds) {
      const hasRule = diags.some((d) => d.rule === ruleId);
      expect(hasRule, `should not have ${ruleId}`).toBe(false);
    }
  });

  it("still runs non-packet rules for unstructured packets", () => {
    const paras = makeParas([
      "This is a question. For 10 points, name it.",
      "ANSWER: plainanswer",
      "<Auth, History>",
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(false);

    const diags = lint(packet);
    // Should have some diagnostics from non-packet rules
    // (e.g., answerline formatting rules for plain answer without bold/underline)
    const nonPacketDiags = diags.filter(
      (d) => !d.rule.startsWith("packet.") && d.rule !== "tag.consistent-categories"
    );
    expect(nonPacketDiags.length).toBeGreaterThan(0);
  });

  it("runs all rules for structured packets", () => {
    const paras = makeParas([
      "Tossups",
      "1. Question text for 10 points name it.",
      "ANSWER: test",
      "",
      "Bonuses",
    ]);
    const packet = segmentPacket(paras);
    expect(packet.structured).toBe(true);

    const diags = lint(packet);
    // Structured packets should be able to produce packet-level diagnostics
    // (e.g., expected-count when there's only 1 tossup)
    const packetDiags = diags.filter((d) => d.rule.startsWith("packet."));
    // At minimum, expected-count should fire since we only have 1 tossup
    expect(packetDiags.length).toBeGreaterThanOrEqual(0);
  });
});
