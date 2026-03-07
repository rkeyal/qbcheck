import { describe, it, expect } from "vitest";
import { lint } from "../../src/core/engine.js";
import { makePacket, makeQuestion, hasDiag, findDiag } from "../helpers.js";
import { Run } from "../../src/core/model.js";

function plain(text: string): Run {
  return { text, bold: false, italic: false, underline: false, superscript: false, subscript: false };
}
function bu(text: string): Run {
  return { text, bold: true, italic: false, underline: true, superscript: false, subscript: false };
}

function tossupWithTag(tag?: string) {
  return makeQuestion("tossup", 1, "For 10 points, name this thing.", "ANSWER: thing", {
    numberParagraphIndex: 1,
    answerRuns: [plain("ANSWER: "), bu("thing")],
    tag,
  });
}

describe("tag.tag-present", () => {
  it("flags missing tag", () => {
    const t = tossupWithTag(undefined);
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.tag-present")).toBe(true);
  });

  it("passes with tag present", () => {
    const t = tossupWithTag("<Author, Biology>");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.tag-present")).toBe(false);
  });
});

describe("tag.tag-format", () => {
  it("flags invalid tag format", () => {
    const t = tossupWithTag("<Bad Tag");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.tag-format")).toBe(true);
  });

  it("passes <Author, Category>", () => {
    const t = tossupWithTag("<Author, Biology>");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.tag-format")).toBe(false);
  });

  it("passes <Category>", () => {
    const t = tossupWithTag("<Biology>");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.tag-format")).toBe(false);
  });
});

describe("tag.valid-category", () => {
  it("flags unrecognized category", () => {
    const t = tossupWithTag("<Author, Fake Category>");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.valid-category")).toBe(true);
  });

  it("passes valid category", () => {
    const t = tossupWithTag("<Author, American History>");
    const packet = makePacket({ tossups: [t], allParagraphs: t.paragraphs });
    const diags = lint(packet);
    expect(hasDiag(diags, "tag.valid-category")).toBe(false);
  });
});
