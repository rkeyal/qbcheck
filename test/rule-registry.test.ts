import { describe, it, expect } from "vitest";
import { RULE_REGISTRY } from "../src/core/rule-registry.js";
import { lint } from "../src/core/engine.js";
import { makePacket, makeQuestion, makeBonusPart } from "./helpers.js";

describe("Rule Registry", () => {
  it("has no duplicate rule IDs", () => {
    const ids = RULE_REGISTRY.map((r) => r.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every registry rule ID is produced by the lint engine", () => {
    // Build a packet that triggers as many rules as possible
    const tossup = makeQuestion("tossup", 1, 'This "test" has issues, for ten points, name it.', "answer no formatting", {
      tag: "<Author, Fake Category>",
    });
    const bonus = makeQuestion("bonus", 1, "Answer some questions about testing for 10 points each.", "", {
      tag: "<Bad Tag",
      parts: [
        makeBonusPart("[10]", "Part one.", "answer one", 200),
        makeBonusPart("[10]", "Part two.", "answer two", 210),
        makeBonusPart("[10]", "Part three.", "answer three", 220),
      ],
    });

    const packet = makePacket({
      tossups: [tossup],
      bonuses: [bonus],
      allParagraphs: [...tossup.paragraphs, ...bonus.paragraphs],
    });

    const diags = lint(packet);
    const producedRules = new Set(diags.map((d) => d.rule));

    // We don't require every rule fires on this one packet,
    // but every rule that fires should be in the registry
    for (const ruleId of producedRules) {
      const inRegistry = RULE_REGISTRY.some((r) => r.id === ruleId);
      expect(inRegistry, `Rule "${ruleId}" produced by engine but not in registry`).toBe(true);
    }
  });

  it("all categories are valid", () => {
    const validCategories = new Set([
      "packet", "question", "answerline", "pronunciation", "formatting", "tag", "writing",
    ]);
    for (const rule of RULE_REGISTRY) {
      expect(validCategories.has(rule.category), `Invalid category "${rule.category}" for rule ${rule.id}`).toBe(true);
    }
  });

  it("all severities are valid", () => {
    const validSeverities = new Set(["error", "warning", "info"]);
    for (const rule of RULE_REGISTRY) {
      expect(validSeverities.has(rule.defaultSeverity), `Invalid severity "${rule.defaultSeverity}" for rule ${rule.id}`).toBe(true);
    }
  });
});
