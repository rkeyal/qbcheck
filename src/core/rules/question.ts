import { Packet, LintDiagnostic, LintRule, Question } from "../model.js";

function checkFtpFormat(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.tossups) {
    const text = q.numberParagraph.rawText;

    // Check for "For ten points" (words instead of numerals)
    const ftenMatch = text.match(/for ten points/i);
    if (ftenMatch && !/for 10 points/i.test(text)) {
      diags.push({
        rule: "question.ftp-format",
        severity: "error",
        paragraph: q.numberParagraph.index,
        message:
          'Use "For 10 points" with numerals, not "For ten points".',
        sourceText: text,
        offset: ftenMatch.index!,
        length: ftenMatch[0].length,
      });
    }

    // Check FTP exists
    if (!/for 10 points/i.test(text)) {
      diags.push({
        rule: "question.ftp-format",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Tossup is missing "For 10 points" marker.',
        sourceText: text,
      });
    }

    // Check FTP is followed by a comma
    const ftpMatch = text.match(/For 10 points([^,])/i);
    if (ftpMatch && ftpMatch[1] !== ",") {
      diags.push({
        rule: "question.ftp-format",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          '"For 10 points" should be followed by a comma.',
        sourceText: text,
        offset: ftpMatch.index!,
        length: ftpMatch[0].length,
      });
    }
  }

  return diags;
}

function checkFtpePlacement(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.bonuses) {
    // The lead-in is the first paragraph (the numbered one)
    const text = q.numberParagraph.rawText;

    if (!/for 10 points each/i.test(text)) {
      diags.push({
        rule: "question.ftpe-format",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Bonus lead-in should contain "For 10 points each".',
        sourceText: text,
      });
    }
  }

  return diags;
}

function checkBonusPartMarkers(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.bonuses) {
    if (q.parts.length === 0) {
      diags.push({
        rule: "question.bonus-part-marker",
        severity: "error",
        paragraph: q.numberParagraph.index,
        message:
          "Bonus has no part markers ([10], [E], [M], [H]).",
      });
    }

    for (const part of q.parts) {
      const text = part.textParagraph.rawText;
      // Check marker format
      if (!/^\s*\[(10[emh]?|[EMH])\]\s/i.test(text)) {
        diags.push({
          rule: "question.bonus-part-marker",
          severity: "warning",
          paragraph: part.textParagraph.index,
          message: `Bonus part marker "${part.marker}" has unexpected format.`,
        });
      }
    }
  }

  return diags;
}

function checkPowerMark(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  // Only warn about missing power marks if at least one tossup uses them
  const packetUsesPower = packet.tossups.some(
    (q) => q.numberParagraph.rawText.includes("(*)")
  );

  for (const q of packet.tossups) {
    const text = q.numberParagraph.rawText;
    const powerIdx = text.indexOf("(*)");

    if (powerIdx === -1) {
      if (packetUsesPower) {
        diags.push({
          rule: "question.power-mark",
          severity: "info",
          paragraph: q.numberParagraph.index,
          message: "Tossup has no power mark (*).",
          sourceText: text,
        });
      }
      continue;
    }

    // Check that (*) is not in the middle of a word
    if (powerIdx > 0 && text[powerIdx - 1] !== " ") {
      diags.push({
        rule: "question.power-mark",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: "Power mark (*) should be preceded by a space.",
        sourceText: text,
        offset: powerIdx,
        length: 3,
      });
    }
  }

  return diags;
}

function checkMissingAnswerLine(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of [...packet.tossups, ...packet.bonuses]) {
    if (q.type === "tossup" && !q.answerLine) {
      diags.push({
        rule: "question.missing-answer",
        severity: "error",
        paragraph: q.numberParagraph.index,
        message: `Tossup ${q.number} has no answer line.`,
      });
    }

    if (q.type === "bonus") {
      for (let i = 0; i < q.parts.length; i++) {
        if (!q.parts[i].answerLine) {
          diags.push({
            rule: "question.missing-answer",
            severity: "error",
            paragraph: q.parts[i].textParagraph.index,
            message: `Bonus ${q.number}, part ${i + 1} has no answer line.`,
          });
        }
      }
    }
  }

  return diags;
}

/**
 * Detect whether a bonus lead-in is a "general instruction" (imperative
 * directing the player, e.g. "Name these…") or a "specific clue" (a
 * declarative sentence giving information about part 1).
 *
 * General instructions end with a period; specific clues end with a colon.
 */
function isGeneralInstruction(text: string): boolean {
  // Strip the leading question number  e.g. "1. "
  const body = text.replace(/^\s*\d+\.\s*/, "").trim();
  // Also strip leading moderator notes  e.g. "Note to moderator: ... "
  const stripped = body.replace(/^note to \w+:\s*[^.]*\.\s*/i, "").trim();

  // Imperative verb openings typical of general instructions
  // e.g. "Name these composers...", "Answer the following about...",
  //       "Identify these characters from...", "For each of the following..."
  if (/^(answer|name|identify|give|list|describe|provide)\b/i.test(stripped)) {
    return true;
  }

  // "For each ..." or "For 10 points each, name/identify..."
  if (/^for each\b/i.test(stripped)) {
    return true;
  }

  // "Answer the following" can appear after a leading specific clue sentence
  // e.g. "The 1912 convention was chaotic. Answer the following about..."
  if (/\banswer the following\b/i.test(stripped)) {
    return true;
  }

  return false;
}

function checkBonusLeadinPunctuation(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.bonuses) {
    const text = q.numberParagraph.rawText.trim();

    // Only check if the lead-in contains "for 10 points each"
    const ftpeMatch = text.match(/for\s+10\s+points\s+each\s*([.,:;!?]?)\s*$/i);
    if (!ftpeMatch) continue;

    const endChar = ftpeMatch[1];
    const general = isGeneralInstruction(text);

    if (endChar !== "." && endChar !== ":") {
      // Neither valid ending
      const expected = general ? "period" : "colon";
      diags.push({
        rule: "question.bonus-leadin-punctuation",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `Bonus lead-in should end with a ${expected} after "for 10 points each."`,
      });
    } else if (general && endChar === ":") {
      diags.push({
        rule: "question.bonus-leadin-punctuation",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'General-instruction lead-ins (e.g. "Name these…") should end with a period, not a colon.',
      });
    } else if (!general && endChar === ".") {
      diags.push({
        rule: "question.bonus-leadin-punctuation",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Specific-clue lead-ins should end with a colon, not a period, after "for 10 points each."',
      });
    }
  }

  return diags;
}

function checkBonusDifficultySpread(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.bonuses) {
    if (q.parts.length === 0) continue;

    const markers = q.parts.map((p) => p.marker.toLowerCase());
    const hasEasy = markers.some((m) => m.includes("e"));
    const hasMedium = markers.some((m) => m.includes("m"));
    const hasHard = markers.some((m) => m.includes("h"));

    const missing: string[] = [];
    if (!hasEasy) missing.push("easy");
    if (!hasMedium) missing.push("medium");
    if (!hasHard) missing.push("hard");

    if (missing.length > 0) {
      diags.push({
        rule: "question.bonus-difficulty-spread",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `Bonus is missing ${missing.join(" and ")} difficulty marker${missing.length > 1 ? "s" : ""}. Each bonus should have [10e], [10m], and [10h] parts.`,
      });
    }
  }

  return diags;
}

function checkFtpMidSentence(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const q of packet.tossups) {
    const text = q.numberParagraph.rawText;

    // Match comma-embedded or en-dash-embedded FTP
    const ftpMatch =
      text.match(/,\s*for\s+10\s+points\s*,/i) ||
      text.match(/\u2013\s*for\s+10\s+points\s*\u2013/i);
    if (!ftpMatch) continue;

    // Check whether this FTP is in the final sentence.
    // Find the last sentence boundary (.!?) before the FTP position.
    const ftpIdx = ftpMatch.index!;
    const beforeFtp = text.substring(0, ftpIdx);

    // Find the last sentence-ending punctuation before FTP
    // (look for ". " or "? " or "! " patterns, skipping abbreviations)
    const sentenceEndRe = /[.!?]\s+(?=[A-Z])/g;
    let lastSentenceEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = sentenceEndRe.exec(beforeFtp)) !== null) {
      lastSentenceEnd = m.index;
    }

    // Check if there's a sentence-ending punctuation AFTER the FTP
    // (meaning more sentences follow — so FTP is truly mid-paragraph)
    const afterFtp = text.substring(ftpIdx + ftpMatch[0].length);
    const hasSentenceAfter = /[.!?]\s+[A-Z]/.test(afterFtp);

    // Only flag if the FTP is NOT in the final sentence
    // (i.e., there are full sentences after it)
    if (hasSentenceAfter) {
      diags.push({
        rule: "question.no-ftp-midsentence",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message:
          'Do not interject "for 10 points" in the middle of the tossup. It should appear in the final sentence.',
        sourceText: text,
        offset: ftpIdx,
        length: ftpMatch[0].length,
      });
    }
  }

  return diags;
}

export const questionRules: LintRule[] = [
  checkFtpFormat,
  checkFtpePlacement,
  checkBonusPartMarkers,
  checkPowerMark,
  checkMissingAnswerLine,
  checkBonusLeadinPunctuation,
  checkBonusDifficultySpread,
  checkFtpMidSentence,
];
