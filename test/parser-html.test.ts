// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseHtml } from "../src/core/parser.js";

describe("parseHtml()", () => {
  it("parses plain text paragraphs", () => {
    const html = "<p>First paragraph</p><p>Second paragraph</p>";
    const result = parseHtml(html);
    expect(result).toHaveLength(2);
    expect(result[0].rawText).toBe("First paragraph");
    expect(result[1].rawText).toBe("Second paragraph");
  });

  it("assigns sequential indices", () => {
    const html = "<p>A</p><p>B</p><p>C</p>";
    const result = parseHtml(html);
    expect(result.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it("detects bold from font-weight style", () => {
    const html = '<p><span style="font-weight:700">bold text</span></p>';
    const result = parseHtml(html);
    expect(result[0].runs[0].bold).toBe(true);
    expect(result[0].runs[0].italic).toBe(false);
  });

  it("detects italic from font-style", () => {
    const html = '<p><span style="font-style:italic">italic text</span></p>';
    const result = parseHtml(html);
    expect(result[0].runs[0].italic).toBe(true);
  });

  it("detects underline from text-decoration", () => {
    const html = '<p><span style="text-decoration:underline">underlined</span></p>';
    const result = parseHtml(html);
    expect(result[0].runs[0].underline).toBe(true);
  });

  it("detects superscript from vertical-align", () => {
    const html = '<p><span style="vertical-align:super">sup</span></p>';
    const result = parseHtml(html);
    expect(result[0].runs[0].superscript).toBe(true);
  });

  it("detects subscript from vertical-align", () => {
    const html = '<p><span style="vertical-align:sub">sub</span></p>';
    const result = parseHtml(html);
    expect(result[0].runs[0].subscript).toBe(true);
  });

  it("handles multiple spans with different formatting", () => {
    const html = `<p><span style="font-weight:700">bold</span><span style="font-style:italic">italic</span></p>`;
    const result = parseHtml(html);
    expect(result[0].runs).toHaveLength(2);
    expect(result[0].runs[0].bold).toBe(true);
    expect(result[0].runs[0].italic).toBe(false);
    expect(result[0].runs[1].bold).toBe(false);
    expect(result[0].runs[1].italic).toBe(true);
    expect(result[0].rawText).toBe("bolditalic");
  });

  it("handles HTML tags like <b>, <i>, <u>", () => {
    const html = "<p><b>bold</b> <i>italic</i> <u>underline</u></p>";
    const result = parseHtml(html);
    const boldRun = result[0].runs.find((r) => r.text.includes("bold"));
    const italicRun = result[0].runs.find((r) => r.text.includes("italic"));
    const underlineRun = result[0].runs.find((r) => r.text.includes("underline"));
    expect(boldRun?.bold).toBe(true);
    expect(italicRun?.italic).toBe(true);
    expect(underlineRun?.underline).toBe(true);
  });

  it("preserves empty paragraphs", () => {
    const html = "<p>Text</p><p></p><p>More text</p>";
    const result = parseHtml(html);
    expect(result).toHaveLength(3);
    expect(result[1].rawText).toBe("");
  });

  it("sets hasPageBreak to false for all paragraphs", () => {
    const html = "<p>test</p>";
    const result = parseHtml(html);
    expect(result[0].hasPageBreak).toBe(false);
  });

  it("handles Google Docs-style nested spans", () => {
    const html = `<p><span style="font-weight:700;font-style:italic">bold italic</span></p>`;
    const result = parseHtml(html);
    expect(result[0].runs[0].bold).toBe(true);
    expect(result[0].runs[0].italic).toBe(true);
  });
});
