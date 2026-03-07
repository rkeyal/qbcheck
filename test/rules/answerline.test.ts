import { describe, it, expect } from "vitest";
import { lint } from "../../src/core/engine.js";
import { makePacket, makeQuestion, makeParagraph, hasDiag, findDiag } from "../helpers.js";
import { Run } from "../../src/core/model.js";

function bu(text: string): Run {
  return { text, bold: true, italic: false, underline: true, superscript: false, subscript: false };
}
function plain(text: string): Run {
  return { text, bold: false, italic: false, underline: false, superscript: false, subscript: false };
}
function ul(text: string): Run {
  return { text, bold: false, italic: false, underline: true, superscript: false, subscript: false };
}

function tossupWithAnswer(answer: string, answerRuns?: Run[]) {
  return makeQuestion("tossup", 1, "For 10 points, name this.", answer, {
    numberParagraphIndex: 1,
    answerRuns,
  });
}

describe("answerline.answer-prefix", () => {
  it("flags lowercase 'answer:'", () => {
    const t = tossupWithAnswer("answer: thing");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.answer-prefix")).toBe(true);
  });

  it("passes 'ANSWER: '", () => {
    const t = tossupWithAnswer("ANSWER: thing", [plain("ANSWER: "), bu("thing")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.answer-prefix")).toBe(false);
  });
});

describe("answerline.bracket-balance", () => {
  it("flags unbalanced brackets", () => {
    const t = tossupWithAnswer("ANSWER: thing [accept stuff", [plain("ANSWER: "), bu("thing"), plain(" [accept stuff")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.bracket-balance")).toBe(true);
  });

  it("passes balanced brackets", () => {
    const t = tossupWithAnswer("ANSWER: thing [accept stuff]", [plain("ANSWER: "), bu("thing"), plain(" [accept "), bu("stuff"), plain("]")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.bracket-balance")).toBe(false);
  });
});

describe("answerline.answer-formatting", () => {
  it("flags answer without bold/underline", () => {
    const t = tossupWithAnswer("ANSWER: thing", [plain("ANSWER: thing")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.answer-formatting")).toBe(true);
  });

  it("passes bold+underlined answer", () => {
    const t = tossupWithAnswer("ANSWER: thing", [plain("ANSWER: "), bu("thing")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.answer-formatting")).toBe(false);
  });
});

describe("answerline.directive-typo", () => {
  it("flags typo in directive", () => {
    const t = tossupWithAnswer("ANSWER: thing [acept other]", [plain("ANSWER: "), bu("thing"), plain(" [acept other]")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "answerline.directive-typo")).toBe(true);
  });
});

describe("answerline.deprecated-directive", () => {
  it("flags 'do not accept'", () => {
    const t = tossupWithAnswer("ANSWER: thing [do not accept other]", [plain("ANSWER: "), bu("thing"), plain(" [do not accept other]")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    const d = diags.filter((d) => d.rule === "answerline.deprecated-directive");
    expect(d.length).toBeGreaterThan(0);
    expect(d.some((dd) => dd.message.includes("do not accept"))).toBe(true);
  });

  it("flags 'anti-prompt'", () => {
    const t = tossupWithAnswer("ANSWER: thing [anti-prompt on other]", [plain("ANSWER: "), bu("thing"), plain(" [anti-prompt on "), ul("other"), plain("]")]);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(diags.some((d) => d.rule === "answerline.deprecated-directive" && d.message.includes("anti-prompt"))).toBe(true);
  });
});
