/**
 * Inspect paragraphs around a given index in a packet.
 * Usage: npx tsx scripts/inspect-paragraphs.ts <file> <start> <end>
 */
import { readFileSync } from "fs";
import { parseDocx } from "../src/core/parser.js";

async function main() {
  const [file, startStr, endStr] = process.argv.slice(2);
  if (!file) { console.error("Usage: npx tsx scripts/inspect-paragraphs.ts <file> <start> <end>"); process.exit(1); }
  const start = parseInt(startStr || "0", 10);
  const end = parseInt(endStr || String(start + 10), 10);

  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const paras = await parseDocx(ab);

  for (let i = start; i <= Math.min(end, paras.length - 1); i++) {
    const text = paras[i].rawText;
    const display = text.length > 80 ? text.slice(0, 80) + "…" : text;
    const empty = text.trim() === "" ? " [BLANK]" : "";
    console.log(`${String(i).padStart(4)}: ${JSON.stringify(display)}${empty}`);
  }
}
main();
