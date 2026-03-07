import { describe, it, expect } from "vitest";
import { lint } from "../../src/core/engine.js";
import { makePacket, makeQuestion, makeBonusPart, makeParagraph, hasDiag, findDiag } from "../helpers.js";

describe("packet.numbering-sequence", () => {
  it("fires when tossup numbers decrease", () => {
    const t1 = makeQuestion("tossup", 1, "Q1. For 10 points, name it.", "ANSWER: **__a1__**", { numberParagraphIndex: 10 });
    const t2 = makeQuestion("tossup", 3, "Q3. For 10 points, name it.", "ANSWER: **__a2__**", { numberParagraphIndex: 20 });
    const t3 = makeQuestion("tossup", 2, "Q2. For 10 points, name it.", "ANSWER: **__a3__**", { numberParagraphIndex: 30 });

    const packet = makePacket({
      tossups: [t1, t2, t3],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs, ...t3.paragraphs],
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "packet.numbering-sequence")).toBe(true);
    const d = findDiag(diags, "packet.numbering-sequence")!;
    expect(d.severity).toBe("error");
  });

  it("does not fire when tossup numbers strictly increase", () => {
    const t1 = makeQuestion("tossup", 1, "Q1. For 10 points, name it.", "ANSWER: **__a1__**", { numberParagraphIndex: 10 });
    const t2 = makeQuestion("tossup", 2, "Q2. For 10 points, name it.", "ANSWER: **__a2__**", { numberParagraphIndex: 20 });

    const packet = makePacket({
      tossups: [t1, t2],
      allParagraphs: [...t1.paragraphs, ...t2.paragraphs],
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "packet.numbering-sequence")).toBe(false);
  });
});

describe("tag.nested-brackets", () => {
  it("fires on nested angle brackets", () => {
    const t = makeQuestion("tossup", 1, "Q. For 10 points, name it.", "ANSWER: **__a__**", {
      tag: "<Author <nickname>, History>",
      numberParagraphIndex: 10,
    });

    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "tag.nested-brackets")).toBe(true);
    expect(findDiag(diags, "tag.nested-brackets")!.severity).toBe("error");
  });

  it("does not fire on normal tags", () => {
    const t = makeQuestion("tossup", 1, "Q. For 10 points, name it.", "ANSWER: **__a__**", {
      tag: "<Author, History>",
      numberParagraphIndex: 10,
    });

    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "tag.nested-brackets")).toBe(false);
  });
});

describe("question.bonus-part-order", () => {
  it("fires when bonus parts are not interleaved with answers", () => {
    const leadinPara = makeParagraph("1. Answer the following for 10 points each.", { index: 100 });
    const part1 = makeParagraph("[10e] Part one question.", { index: 101 });
    const part2 = makeParagraph("[10m] Part two question.", { index: 102 });
    const ans1 = makeParagraph("ANSWER: answer one", { index: 103 });
    const ans2 = makeParagraph("ANSWER: answer two", { index: 104 });

    const bonus = {
      type: "bonus" as const,
      number: 1,
      numberParagraph: leadinPara,
      paragraphs: [leadinPara, part1, part2, ans1, ans2],
      answerLine: null,
      tag: null,
      parts: [
        { marker: "[10e]", textParagraph: part1, answerLine: ans1 },
        { marker: "[10m]", textParagraph: part2, answerLine: ans2 },
      ],
    };

    const packet = makePacket({
      bonuses: [bonus],
      allParagraphs: [leadinPara, part1, part2, ans1, ans2],
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "question.bonus-part-order")).toBe(true);
    expect(findDiag(diags, "question.bonus-part-order")!.severity).toBe("error");
  });

  it("does not fire when parts are properly interleaved", () => {
    const bonus = makeQuestion("bonus", 1,
      "Answer the following for 10 points each.", "", {
      tag: "<Auth, History>",
      numberParagraphIndex: 100,
      parts: [
        makeBonusPart("[10e]", "Part one.", "ans1", 110),
        makeBonusPart("[10m]", "Part two.", "ans2", 120),
        makeBonusPart("[10h]", "Part three.", "ans3", 130),
      ],
    });

    const packet = makePacket({
      bonuses: [bonus],
      allParagraphs: bonus.paragraphs,
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "question.bonus-part-order")).toBe(false);
  });
});

describe("answerline.nonstandard-prefix", () => {
  it("fires on 'Ans:' in non-answer paragraphs", () => {
    const q = makeParagraph("1. A question for 10 points.", { index: 0 });
    const ans = makeParagraph("Ans: some answer", { index: 1 });

    const tossup = {
      type: "tossup" as const,
      number: 1,
      numberParagraph: q,
      paragraphs: [q, ans],
      answerLine: null, // not recognized by segmenter
      tag: null,
      parts: [],
    };

    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: [q, ans],
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.nonstandard-prefix")).toBe(true);
    expect(findDiag(diags, "answerline.nonstandard-prefix")!.severity).toBe("error");
  });

  it("fires on 'Answer.' in non-answer paragraphs", () => {
    const q = makeParagraph("1. A question for 10 points.", { index: 0 });
    const ans = makeParagraph("Answer. some answer", { index: 1 });

    const tossup = {
      type: "tossup" as const,
      number: 1,
      numberParagraph: q,
      paragraphs: [q, ans],
      answerLine: null,
      tag: null,
      parts: [],
    };

    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: [q, ans],
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.nonstandard-prefix")).toBe(true);
  });

  it("does not fire on recognized ANSWER: lines", () => {
    const t = makeQuestion("tossup", 1, "Q for 10 points.", "ANSWER: **__test__**", {
      numberParagraphIndex: 0,
    });

    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.nonstandard-prefix")).toBe(false);
  });
});

describe("question.multiline-answer", () => {
  it("fires when text follows an answer line", () => {
    const q = makeParagraph("1. A question for 10 points.", { index: 0 });
    const ans = makeParagraph("ANSWER: **__start of answer__**", { index: 1 });
    const cont = makeParagraph("[accept other stuff]", { index: 2 });

    const tossup = {
      type: "tossup" as const,
      number: 1,
      numberParagraph: q,
      paragraphs: [q, ans, cont],
      answerLine: ans,
      tag: null,
      parts: [],
    };

    const packet = makePacket({
      tossups: [tossup],
      allParagraphs: [q, ans, cont],
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "question.multiline-answer")).toBe(true);
    expect(findDiag(diags, "question.multiline-answer")!.severity).toBe("error");
  });

  it("does not fire when tag follows answer", () => {
    const t = makeQuestion("tossup", 1, "Q for 10 points.", "ANSWER: **__test__**", {
      tag: "<Auth, History>",
      numberParagraphIndex: 0,
    });

    const packet = makePacket({
      tossups: [t],
      allParagraphs: t.paragraphs,
    });

    const diags = lint(packet);
    expect(hasDiag(diags, "question.multiline-answer")).toBe(false);
  });
});
