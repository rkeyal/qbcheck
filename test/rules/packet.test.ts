import { describe, it, expect } from "vitest";
import { lint } from "../../src/core/engine.js";
import { makePacket, makeQuestion, makeParagraph, makeBonusPart, hasDiag, findDiag } from "../helpers.js";

function validTossup(n: number) {
  return makeQuestion("tossup", n, "For 10 points, name this thing.", "ANSWER: thing", {
    tag: "<Auth, American History>",
    numberParagraphIndex: n * 10,
  });
}

function validBonus(n: number) {
  return makeQuestion("bonus", n, "Answer the following about stuff for 10 points each.", "", {
    tag: "<Auth, Biology>",
    numberParagraphIndex: n * 10 + 500,
    parts: [
      makeBonusPart("[10e]", "Easy.", "e", n * 10 + 510),
      makeBonusPart("[10m]", "Med.", "m", n * 10 + 520),
      makeBonusPart("[10h]", "Hard.", "h", n * 10 + 530),
    ],
  });
}

describe("packet.section-headers", () => {
  it("flags missing tossup header", () => {
    const packet = makePacket({ tossupHeader: null });
    const diags = lint(packet);
    const d = findDiag(diags, "packet.section-headers");
    expect(d).toBeDefined();
    expect(d!.message).toContain("Tossups");
  });

  it("flags missing bonus header", () => {
    const packet = makePacket({ bonusHeader: null });
    const diags = lint(packet);
    expect(diags.some((d) => d.rule === "packet.section-headers" && d.message.includes("Bonuses"))).toBe(true);
  });

  it("passes with both headers", () => {
    const packet = makePacket();
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.section-headers")).toBe(false);
  });
});

describe("packet.section-order", () => {
  it("flags bonuses before tossups", () => {
    const packet = makePacket({
      tossupHeader: makeParagraph("Tossups", { index: 50 }),
      bonusHeader: makeParagraph("Bonuses", { index: 10 }),
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.section-order")).toBe(true);
  });

  it("passes with correct order", () => {
    const packet = makePacket();
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.section-order")).toBe(false);
  });
});

describe("packet.question-numbering", () => {
  it("flags non-sequential numbering", () => {
    const t1 = validTossup(1);
    const t3 = makeQuestion("tossup", 3, "For 10 points, name this.", "ANSWER: x", {
      tag: "<Auth, Biology>",
      numberParagraphIndex: 20,
    });
    const packet = makePacket({
      tossups: [t1, t3],
      allParagraphs: [...t1.paragraphs, ...t3.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.question-numbering")).toBe(true);
  });

  it("passes sequential numbering", () => {
    const t1 = validTossup(1);
    const t2 = validTossup(2);
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.question-numbering")).toBe(false);
  });
});

describe("packet.no-bold-numbers", () => {
  it("flags bold question numbers", () => {
    const tossup = makeQuestion("tossup", 1, "For 10 points, name this.", "ANSWER: x", {
      tag: "<Auth, Biology>",
      numberParagraphIndex: 1,
      numberRuns: [{ text: "1. For 10 points, name this.", bold: true, italic: false, underline: false, superscript: false, subscript: false }],
    });
    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: tossup.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.no-bold-numbers")).toBe(true);
  });
});

describe("packet.no-extras-label", () => {
  it("flags Extra label", () => {
    const tossup = makeQuestion("tossup", 1, "For 10 points, name this.", "ANSWER: x", {
      tag: "<Auth, Biology>",
      numberParagraphIndex: 1,
    });
    // Override the rawText to include "Extra" before the number
    tossup.numberParagraph.rawText = "Extra 1. For 10 points, name this.";
    tossup.numberParagraph.runs = [{ text: tossup.numberParagraph.rawText, bold: false, italic: false, underline: false, superscript: false, subscript: false }];
    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: tossup.paragraphs,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.no-extras-label")).toBe(true);
  });
});

describe("packet.blank-paragraphs", () => {
  it("flags consecutive blank paragraphs", () => {
    const t1 = validTossup(1);
    const t2 = validTossup(2);
    const blanks = [
      makeParagraph("", { index: 30 }),
      makeParagraph("", { index: 31 }),
      makeParagraph("", { index: 32 }),
    ];
    const allParas = [...t1.paragraphs, ...blanks, ...t2.paragraphs];
    const packet = makePacket({
      tossups: [t1, t2],
      tossupHeader: makeParagraph("Tossups", { index: 0 }),
      allParagraphs: allParas,
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "packet.blank-paragraphs")).toBe(true);
  });
});

describe("packet.expected-count", () => {
  it("warns when not 20 tossups", () => {
    const tossups = [validTossup(1)];
    const packet = makePacket({
      tossups,
      allParagraphs: tossups.flatMap((t) => t.paragraphs),
    });
    const diags = lint(packet);
    const d = findDiag(diags, "packet.expected-count");
    expect(d).toBeDefined();
    expect(d!.message).toContain("1 tossup");
  });

  it("warns when not 20 bonuses", () => {
    const bonuses = [validBonus(1)];
    const packet = makePacket({
      bonuses,
      allParagraphs: bonuses.flatMap((b) => b.paragraphs),
    });
    const diags = lint(packet);
    expect(diags.some((d) => d.rule === "packet.expected-count" && d.message.includes("bonus"))).toBe(true);
  });
});
