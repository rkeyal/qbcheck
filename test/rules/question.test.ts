import { describe, it, expect } from "vitest";
import { lint } from "../../src/core/engine.js";
import { makePacket, makeQuestion, makeBonusPart, hasDiag, findDiag } from "../helpers.js";

describe("question.ftp-format", () => {
  it("flags 'For ten points' (words instead of numerals)", () => {
    const t = makeQuestion("tossup", 1, "For ten points, name this thing.", "ANSWER: thing", { numberParagraphIndex: 1 });
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = findDiag(diags, "question.ftp-format");
    expect(d).toBeDefined();
    expect(d!.message).toContain("numerals");
  });

  it("passes 'For 10 points,'", () => {
    const t = makeQuestion("tossup", 1, "For 10 points, name this thing.", "ANSWER: thing", { numberParagraphIndex: 1 });
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    // Should not have the "missing FTP" or "ten points" errors
    const ftpDiags = diags.filter((d) => d.rule === "question.ftp-format");
    const hasMissing = ftpDiags.some((d) => d.message.includes("missing") || d.message.includes("numerals"));
    expect(hasMissing).toBe(false);
  });
});

describe("question.missing-answer", () => {
  it("flags tossup without answer line", () => {
    const t = makeQuestion("tossup", 1, "For 10 points, name this.", "ANSWER: x", { numberParagraphIndex: 1 });
    t.answerLine = null;
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "question.missing-answer")).toBe(true);
  });

  it("passes tossup with answer line", () => {
    const t = makeQuestion("tossup", 1, "For 10 points, name this.", "ANSWER: x", { numberParagraphIndex: 1 });
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "question.missing-answer")).toBe(false);
  });
});

describe("question.power-mark", () => {
  it("flags missing power mark when packet uses power", () => {
    const t1 = makeQuestion("tossup", 1, "Clue one (*) For 10 points, name this.", "ANSWER: x", { numberParagraphIndex: 10 });
    const t2 = makeQuestion("tossup", 2, "For 10 points, name that.", "ANSWER: y", { numberParagraphIndex: 20 });
    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });
    const diags = lint(packet);
    expect(hasDiag(diags, "question.power-mark")).toBe(true);
  });
});

describe("question.bonus-part-marker", () => {
  it("flags bonus with no part markers", () => {
    const b = makeQuestion("bonus", 1, "Answer the following for 10 points each.", "", {
      numberParagraphIndex: 100,
      parts: [],
    });
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "question.bonus-part-marker")).toBe(true);
  });
});

describe("question.bonus-difficulty-spread", () => {
  it("flags bonus missing difficulty markers", () => {
    const b = makeQuestion("bonus", 1, "Answer the following for 10 points each.", "", {
      numberParagraphIndex: 100,
      parts: [
        makeBonusPart("[10]", "Part one.", "a1", 110),
        makeBonusPart("[10]", "Part two.", "a2", 120),
        makeBonusPart("[10]", "Part three.", "a3", 130),
      ],
    });
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "question.bonus-difficulty-spread")).toBe(true);
  });

  it("passes bonus with e/m/h markers", () => {
    const b = makeQuestion("bonus", 1, "Answer the following for 10 points each.", "", {
      numberParagraphIndex: 100,
      parts: [
        makeBonusPart("[10e]", "Easy.", "a1", 110),
        makeBonusPart("[10m]", "Medium.", "a2", 120),
        makeBonusPart("[10h]", "Hard.", "a3", 130),
      ],
    });
    const packet = makePacket({ bonuses: [b], allParagraphs: b.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "question.bonus-difficulty-spread")).toBe(false);
  });
});
