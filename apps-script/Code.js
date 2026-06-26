function parseGoogleDoc() {
  Logger.log("parseGoogleDoc: getting active document");
  const doc = DocumentApp.getActiveDocument();
  Logger.log("parseGoogleDoc: doc name = " + doc.getName());
  const body = doc.getBody();
  const numChildren = body.getNumChildren();
  Logger.log("parseGoogleDoc: body has " + numChildren + " children");
  const paragraphs = [];
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.PARAGRAPH && child.getType() !== DocumentApp.ElementType.LIST_ITEM) {
      continue;
    }
    const para = child.asParagraph();
    const text = para.editAsText();
    const rawText = text.getText();
    const hasPageBreak = detectPageBreak(para);
    const runs = extractRuns(text, rawText);
    paragraphs.push({
      index: paragraphs.length,
      runs,
      rawText,
      hasPageBreak
    });
  }
  return paragraphs;
}
function extractRuns(text, rawText) {
  if (rawText.length === 0) {
    return [
      {
        text: "",
        bold: false,
        italic: false,
        underline: false,
        superscript: false,
        subscript: false
      }
    ];
  }
  const indices = text.getTextAttributeIndices();
  const runs = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : rawText.length;
    const fmt = getFormattingAt(text, start);
    runs.push({
      text: rawText.substring(start, end),
      bold: fmt.bold,
      italic: fmt.italic,
      underline: fmt.underline,
      superscript: fmt.superscript,
      subscript: fmt.subscript
    });
  }
  return runs;
}
function getFormattingAt(text, offset) {
  const vertAlign = text.getTextAlignment(offset);
  return {
    bold: text.isBold(offset) ?? false,
    italic: text.isItalic(offset) ?? false,
    underline: text.isUnderline(offset) ?? false,
    superscript: vertAlign === DocumentApp.TextAlignment.SUPERSCRIPT,
    subscript: vertAlign === DocumentApp.TextAlignment.SUBSCRIPT
  };
}
function detectPageBreak(para) {
  const numChildren = para.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    if (para.getChild(i).getType() === DocumentApp.ElementType.PAGE_BREAK) {
      return true;
    }
  }
  return false;
}
const QUESTION_NUMBER = /^\s*(\d+)\.\s/;
const ANSWER = /^\s*ANSWER\s*:\s*/i;
const TAG = /^\s*<[^>]+>\s*(?:[[{][^]}]*[\]}])?\s*$/;
const BONUS_PART = /^\s*\[(10[emh]?|[EMH])\]\s*/i;
const EDITORIAL_SUFFIX = /\s*[[{][^]}]*[\]}]\s*$/;
const TAG_WITH_AUTHOR = /^<([^,]+),\s*(.+)>$/;
const TAG_CATEGORY_ONLY = /^<([^,>]+)>$/;
const FTPE = /for\s+10\s+points?\s+each|FTPE/i;
const FTP_MARKER = /for\s+10\s+points/i;
function segmentPacket(paragraphs) {
  const processed = preprocessParagraphs(paragraphs);
  const packet = {
    header: [],
    tossupHeader: null,
    bonusHeader: null,
    tossups: [],
    bonuses: [],
    allParagraphs: processed,
    structured: false
  };
  let tossupIdx = -1;
  let bonusIdx = -1;
  for (let i = 0; i < processed.length; i++) {
    const text = processed[i].rawText.trim().toLowerCase();
    if (/\btoss[-\s]?ups?:?\s*$/.test(text) && tossupIdx === -1) {
      tossupIdx = i;
      packet.tossupHeader = processed[i];
    } else if (/\bbonus(?:es)?:?\s*$/.test(text) && bonusIdx === -1) {
      bonusIdx = i;
      packet.bonusHeader = processed[i];
    }
  }
  if (tossupIdx === -1 && bonusIdx === -1) {
    return segmentFlatList(processed);
  }
  packet.structured = true;
  const headerEnd = tossupIdx !== -1 ? tossupIdx : processed.length;
  packet.header = processed.slice(0, headerEnd);
  if (tossupIdx !== -1) {
    const tossupEnd = bonusIdx !== -1 ? bonusIdx : processed.length;
    const tossupParas = processed.slice(tossupIdx + 1, tossupEnd);
    packet.tossups = parseQuestions(tossupParas, "tossup");
  }
  if (bonusIdx !== -1) {
    const bonusParas = processed.slice(bonusIdx + 1);
    packet.bonuses = parseQuestions(bonusParas, "bonus");
  }
  return packet;
}
function parseQuestions(paragraphs, type) {
  const questions = [];
  let current = null;
  for (const para of paragraphs) {
    const text = para.rawText.trim();
    if (!text) {
      if (current) {
        questions.push(current);
        current = null;
      }
      continue;
    }
    const numMatch = text.match(QUESTION_NUMBER);
    if (numMatch && !current) {
      current = {
        type,
        number: parseInt(numMatch[1], 10),
        numberParagraph: para,
        paragraphs: [para],
        answerLine: null,
        tag: null,
        parts: []
      };
    } else if (numMatch && current) {
      questions.push(current);
      current = {
        type,
        number: parseInt(numMatch[1], 10),
        numberParagraph: para,
        paragraphs: [para],
        answerLine: null,
        tag: null,
        parts: []
      };
    } else if (current) {
      current.paragraphs.push(para);
      if (ANSWER.test(text)) {
        if (type === "bonus" && current.parts.length > 0) {
          current.parts[current.parts.length - 1].answerLine = para;
        } else {
          current.answerLine = para;
        }
      } else if (TAG.test(text)) {
        current.tag = para;
      } else if (type === "bonus" && BONUS_PART.test(text)) {
        const markerMatch = text.match(BONUS_PART);
        const restOfText = text.slice(markerMatch[0].length);
        const hasEmbeddedAnswer = /ANSWER\s*:/i.test(restOfText);
        current.parts.push({
          marker: markerMatch[0].trim(),
          textParagraph: para,
          answerLine: hasEmbeddedAnswer ? para : null
        });
      }
    }
  }
  if (current) {
    questions.push(current);
  }
  return questions;
}
const FTPE_RE = FTPE;
function segmentFlatList(processed) {
  const packet = {
    header: [],
    tossupHeader: null,
    bonusHeader: null,
    tossups: [],
    bonuses: [],
    allParagraphs: processed,
    structured: false
  };
  const answerIndices = [];
  for (let i = 0; i < processed.length; i++) {
    if (ANSWER.test(processed[i].rawText.trim())) {
      answerIndices.push(i);
    }
  }
  if (answerIndices.length === 0) return packet;
  const assigned = /* @__PURE__ */ new Set();
  const questionGroups = [];
  let gi = 0;
  while (gi < answerIndices.length) {
    const firstAnswer = answerIndices[gi];
    let start = firstAnswer;
    for (let j = firstAnswer - 1; j >= 0; j--) {
      const text = processed[j].rawText.trim();
      if (!text) break;
      if (ANSWER.test(text)) break;
      if (TAG.test(text) && assigned.has(j)) break;
      start = j;
    }
    const answerLines = [firstAnswer];
    let lastIdx = firstAnswer;
    let ni = gi + 1;
    while (ni < answerIndices.length) {
      const nextAnswer = answerIndices[ni];
      let gapHasBlank = false;
      for (let k = lastIdx + 1; k < nextAnswer; k++) {
        const text = processed[k].rawText.trim();
        if (!text) {
          gapHasBlank = true;
          break;
        }
      }
      if (gapHasBlank) break;
      const betweenLines = processed.slice(lastIdx + 1, nextAnswer);
      const hasBonusPartMarker = betweenLines.some(
        (p) => BONUS_PART.test(p.rawText.trim())
      );
      if (!hasBonusPartMarker && betweenLines.length > 0) {
        const firstChunkText = processed.slice(start, firstAnswer + 1).map((p) => p.rawText).join(" ");
        if (!BONUS_PART.test(firstChunkText) && !FTPE_RE.test(firstChunkText)) {
          break;
        }
      }
      answerLines.push(nextAnswer);
      lastIdx = nextAnswer;
      ni++;
    }
    let end = lastIdx;
    if (lastIdx + 1 < processed.length) {
      const nextText = processed[lastIdx + 1].rawText.trim();
      if (TAG.test(nextText)) {
        end = lastIdx + 1;
      }
    }
    for (let k = start; k <= end; k++) assigned.add(k);
    questionGroups.push({ start, end, answerLines });
    gi = ni;
  }
  let tossupNum = 1;
  let bonusNum = 1;
  for (const group of questionGroups) {
    const paras = processed.slice(group.start, group.end + 1);
    const fullText = paras.map((p) => p.rawText).join(" ");
    const hasBonusPartMarkers = paras.some(
      (p) => BONUS_PART.test(p.rawText.trim())
    );
    const hasFTPE = FTPE_RE.test(fullText);
    const multipleAnswers = group.answerLines.length > 1;
    const isBonus = hasBonusPartMarkers || hasFTPE || multipleAnswers;
    const type = isBonus ? "bonus" : "tossup";
    const number = type === "tossup" ? tossupNum++ : bonusNum++;
    const q = {
      type,
      number,
      numberParagraph: paras[0],
      paragraphs: paras,
      answerLine: null,
      tag: null,
      parts: []
    };
    const lastPara = paras[paras.length - 1];
    if (TAG.test(lastPara.rawText.trim())) {
      q.tag = lastPara;
    }
    if (type === "bonus") {
      for (const para of paras) {
        const text = para.rawText.trim();
        if (BONUS_PART.test(text)) {
          const markerMatch = text.match(BONUS_PART);
          const restOfText = text.slice(markerMatch[0].length);
          const hasEmbeddedAnswer = /ANSWER\s*:/i.test(restOfText);
          q.parts.push({
            marker: markerMatch[0].trim(),
            textParagraph: para,
            answerLine: hasEmbeddedAnswer ? para : null
          });
        } else if (ANSWER.test(text)) {
          if (q.parts.length > 0 && !q.parts[q.parts.length - 1].answerLine) {
            q.parts[q.parts.length - 1].answerLine = para;
          } else {
            q.answerLine = para;
          }
        }
      }
    } else {
      for (const para of paras) {
        if (ANSWER.test(para.rawText.trim())) {
          q.answerLine = para;
          break;
        }
      }
    }
    if (type === "tossup") {
      packet.tossups.push(q);
    } else {
      packet.bonuses.push(q);
    }
  }
  return packet;
}
function preprocessParagraphs(paragraphs) {
  const result = [];
  for (const para of paragraphs) {
    const splits = splitConcatenatedParagraph(para);
    result.push(...splits);
  }
  for (let i = 0; i < result.length; i++) {
    result[i] = { ...result[i], index: i };
  }
  return result;
}
function splitConcatenatedParagraph(para) {
  const text = para.rawText;
  if (!text.trim()) return [para];
  const splitPoints = [];
  let match;
  const answerRe = /ANSWER\s*:/gi;
  while ((match = answerRe.exec(text)) !== null) {
    if (match.index > 0 && text.substring(0, match.index).trim().length > 0) {
      splitPoints.push(match.index);
    }
  }
  const partRe = /\[(10[emh]?|[EMH])\]/gi;
  while ((match = partRe.exec(text)) !== null) {
    if (match.index > 0 && text.substring(0, match.index).trim().length > 0) {
      splitPoints.push(match.index);
    }
  }
  const tagMatch = text.match(/<[A-Z][^>]{2,}>\s*(?:[[{][^]}]*[\]}])?\s*$/i);
  if (tagMatch && tagMatch.index > 0 && text.substring(0, tagMatch.index).trim().length > 0) {
    splitPoints.push(tagMatch.index);
  }
  if (splitPoints.length === 0) return [para];
  const positions = [...new Set(splitPoints)].sort((a, b) => a - b);
  const subParas = [];
  let prevPos = 0;
  for (const pos of positions) {
    if (pos <= prevPos) continue;
    const subText = text.substring(prevPos, pos);
    if (subText.trim()) {
      subParas.push({
        index: para.index,
        // will be re-indexed later
        runs: sliceRuns(para.runs, prevPos, pos),
        rawText: subText,
        hasPageBreak: prevPos === 0 ? para.hasPageBreak : false
      });
    }
    prevPos = pos;
  }
  const lastText = text.substring(prevPos);
  if (lastText.trim()) {
    subParas.push({
      index: para.index,
      runs: sliceRuns(para.runs, prevPos, text.length),
      rawText: lastText,
      hasPageBreak: subParas.length === 0 ? para.hasPageBreak : false
    });
  }
  return subParas.length > 1 ? subParas : [para];
}
function sliceRuns(runs, startChar, endChar) {
  const result = [];
  let pos = 0;
  for (const run of runs) {
    const runEnd = pos + run.text.length;
    if (runEnd <= startChar) {
      pos = runEnd;
      continue;
    }
    if (pos >= endChar) break;
    const sliceStart = Math.max(0, startChar - pos);
    const sliceEnd = Math.min(run.text.length, endChar - pos);
    const slicedText = run.text.substring(sliceStart, sliceEnd);
    if (slicedText) {
      result.push({ ...run, text: slicedText });
    }
    pos = runEnd;
  }
  return result;
}
function stripQuotedText(text) {
  return text.replace(/\u201c[^\u201d]*\u201d/g, (m) => " ".repeat(m.length)).replace(/"[^"]*"/g, (m) => " ".repeat(m.length)).replace(/\u2018[^\u2019]*\u2019/g, (m) => " ".repeat(m.length));
}
function buildItalicMap(para) {
  const map = [];
  for (const run of para.runs) {
    for (let i = 0; i < run.text.length; i++) {
      map.push(run.italic);
    }
  }
  return map;
}
function stripItalicOnly(para) {
  return stripItalicText(para.rawText, buildItalicMap(para));
}
function stripItalicText(text, italicMap) {
  const chars = text.split("");
  for (let i = 0; i < chars.length && i < italicMap.length; i++) {
    if (italicMap[i]) chars[i] = " ";
  }
  return chars.join("");
}
function stripTitleText(para) {
  let text = stripQuotedText(para.rawText);
  const italicMap = buildItalicMap(para);
  text = stripItalicText(text, italicMap);
  return text;
}
function* allQuestions(packet) {
  yield* packet.tossups;
  yield* packet.bonuses;
}
function getAnswerLines(packet) {
  const lines = [];
  for (const q of packet.tossups) {
    if (q.answerLine) lines.push(q.answerLine);
  }
  for (const q of packet.bonuses) {
    if (q.answerLine) lines.push(q.answerLine);
    for (const part of q.parts) {
      if (part.answerLine) lines.push(part.answerLine);
    }
  }
  return lines;
}
function getQuestionParagraphs(packet, filter) {
  const paras = [];
  for (const q of allQuestions(packet)) {
    for (const p of q.paragraphs) {
      const text = p.rawText.trim();
      if (filter === "non-answer" || filter === "text-only") {
        if (ANSWER.test(text)) continue;
      }
      if (filter === "text-only") {
        if (/^\s*<[^>]+>\s*$/.test(text)) continue;
      }
      paras.push(p);
    }
  }
  return paras;
}
function findOffsetInRawText(rawText, searchText, approximateIndex) {
  if (approximateIndex !== void 0 && approximateIndex > 0) {
    const searchStart = Math.max(0, approximateIndex - 10);
    const nearbyMatch = rawText.indexOf(searchText, searchStart);
    if (nearbyMatch !== -1) return nearbyMatch;
  }
  return rawText.indexOf(searchText);
}
function createDiagnostic(rule, para, message, opts) {
  return {
    rule,
    severity: (opts == null ? void 0 : opts.severity) ?? "warning",
    paragraph: para.index,
    message,
    sourceText: para.rawText,
    offset: opts == null ? void 0 : opts.offset,
    length: opts == null ? void 0 : opts.length,
    suggestion: opts == null ? void 0 : opts.suggestion,
    fix: opts == null ? void 0 : opts.fix
  };
}
function buildFormattingMap(runs) {
  const map = [];
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      map.push({ bold: run.bold, underline: run.underline });
    }
  }
  return map;
}
function hasBoldUnderline(fmtMap, startIdx, endIdx, rawText) {
  for (let i = startIdx; i < endIdx; i++) {
    if (i < fmtMap.length && fmtMap[i].bold && fmtMap[i].underline && rawText[i].trim()) {
      return true;
    }
  }
  return false;
}
function hasUnderline(fmtMap, startIdx, endIdx, rawText) {
  for (let i = startIdx; i < endIdx; i++) {
    if (i < fmtMap.length && fmtMap[i].underline && rawText[i].trim()) {
      return true;
    }
  }
  return false;
}
function checkSectionHeaders(packet) {
  const diags = [];
  if (!packet.tossupHeader) {
    diags.push({
      rule: "packet.section-headers",
      severity: "error",
      paragraph: 0,
      message: 'Missing "Tossups" section header.'
    });
  }
  if (!packet.bonusHeader) {
    diags.push({
      rule: "packet.section-headers",
      severity: "error",
      paragraph: 0,
      message: 'Missing "Bonuses" section header.'
    });
  }
  return diags;
}
function checkSectionOrder(packet) {
  if (!packet.tossupHeader || !packet.bonusHeader) return [];
  if (packet.tossupHeader.index > packet.bonusHeader.index) {
    return [
      {
        rule: "packet.section-order",
        severity: "error",
        paragraph: packet.bonusHeader.index,
        message: '"Bonuses" section appears before "Tossups" section.'
      }
    ];
  }
  return [];
}
function checkQuestionNumbering(packet) {
  const diags = [];
  for (const [label, questions] of [
    ["Tossup", packet.tossups],
    ["Bonus", packet.bonuses]
  ]) {
    let runStart = -1;
    let runOffset = 0;
    const flushRun = (runEnd) => {
      if (runStart === -1) return;
      const len = runEnd - runStart;
      if (len === 1) {
        const expected = runStart + 1;
        diags.push({
          rule: "packet.question-numbering",
          severity: "error",
          paragraph: questions[runStart].numberParagraph.index,
          message: `${label} ${expected} is numbered ${questions[runStart].number} (expected ${expected}).`
        });
      } else {
        const firstExpected = runStart + 1;
        const lastExpected = runEnd;
        const firstActual = questions[runStart].number;
        const lastActual = questions[runEnd - 1].number;
        diags.push({
          rule: "packet.question-numbering",
          severity: "error",
          paragraph: questions[runStart].numberParagraph.index,
          message: `${label}s ${firstExpected}–${lastExpected} are numbered ${firstActual}–${lastActual} (off by ${runOffset > 0 ? "+" : ""}${runOffset}).`
        });
      }
      runStart = -1;
    };
    for (let i = 0; i < questions.length; i++) {
      const expected = i + 1;
      const offset = questions[i].number - expected;
      if (offset !== 0) {
        if (runStart !== -1 && offset === runOffset) ;
        else {
          flushRun(i);
          runStart = i;
          runOffset = offset;
        }
      } else {
        flushRun(i);
      }
    }
    flushRun(questions.length);
  }
  return diags;
}
function checkBoldNumbers(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    const firstRun = q.numberParagraph.runs[0];
    if (firstRun && firstRun.bold && /^\s*\d+\.\s/.test(firstRun.text)) {
      diags.push({
        rule: "packet.no-bold-numbers",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `Question number ${q.number} should not be bold.`
      });
    }
  }
  return diags;
}
function checkBlankParagraphs(packet) {
  var _a, _b;
  const paras = packet.allParagraphs;
  const startIndex = ((_a = packet.tossupHeader) == null ? void 0 : _a.index) ?? 0;
  const sectionHeaderIndices = /* @__PURE__ */ new Set();
  if (packet.tossupHeader) sectionHeaderIndices.add(packet.tossupHeader.index);
  if (packet.bonusHeader) sectionHeaderIndices.add(packet.bonusHeader.index);
  let groupCount = 0;
  let firstGroupPara = -1;
  for (let i = 0; i < paras.length - 1; i++) {
    if (paras[i].index < startIndex) continue;
    if (paras[i].rawText.trim() === "" && ((_b = paras[i + 1]) == null ? void 0 : _b.rawText.trim()) === "") {
      const nearHeader = [i - 1, i, i + 1, i + 2].some(
        (j) => j >= 0 && j < paras.length && sectionHeaderIndices.has(j)
      );
      if (nearHeader) continue;
      let blankEnd = i + 1;
      while (blankEnd + 1 < paras.length && paras[blankEnd + 1].rawText.trim() === "") {
        blankEnd++;
      }
      groupCount++;
      if (firstGroupPara === -1) firstGroupPara = paras[i].index;
      i = blankEnd;
    }
  }
  if (groupCount > 0) {
    return [
      {
        rule: "packet.blank-paragraphs",
        severity: "info",
        paragraph: firstGroupPara,
        message: `${groupCount} group${groupCount > 1 ? "s" : ""} of consecutive blank paragraphs.`
      }
    ];
  }
  return [];
}
function checkExpectedCount(packet) {
  var _a, _b;
  const diags = [];
  const EXPECTED = 20;
  if (packet.tossups.length > 0 && packet.tossups.length !== EXPECTED) {
    diags.push({
      rule: "packet.expected-count",
      severity: "warning",
      paragraph: ((_a = packet.tossupHeader) == null ? void 0 : _a.index) ?? 0,
      message: `Found ${packet.tossups.length} tossup${packet.tossups.length === 1 ? "" : "s"} (expected ${EXPECTED}).`
    });
  }
  if (packet.bonuses.length > 0 && packet.bonuses.length !== EXPECTED) {
    diags.push({
      rule: "packet.expected-count",
      severity: "warning",
      paragraph: ((_b = packet.bonusHeader) == null ? void 0 : _b.index) ?? 0,
      message: `Found ${packet.bonuses.length} bonus${packet.bonuses.length === 1 ? "" : "es"} (expected ${EXPECTED}).`
    });
  }
  return diags;
}
function checkNumberingSequence(packet) {
  const diags = [];
  for (const [label, questions] of [
    ["Tossup", packet.tossups],
    ["Bonus", packet.bonuses]
  ]) {
    for (let i = 1; i < questions.length; i++) {
      if (questions[i].number <= questions[i - 1].number) {
        diags.push({
          rule: "packet.numbering-sequence",
          severity: "error",
          paragraph: questions[i].numberParagraph.index,
          message: `${label} ${questions[i].number} does not increase from previous ${label.toLowerCase()} ${questions[i - 1].number}. Downstream parsers use number resets to detect the tossup/bonus boundary.`,
          sourceText: questions[i].numberParagraph.rawText
        });
      }
    }
  }
  return diags;
}
const packetRules = [
  checkSectionHeaders,
  checkSectionOrder,
  checkQuestionNumbering,
  checkNumberingSequence,
  checkBoldNumbers,
  checkBlankParagraphs,
  checkExpectedCount
];
function checkFtpFormat(packet) {
  const diags = [];
  for (const q of packet.tossups) {
    const text = q.numberParagraph.rawText;
    const ftenMatch = text.match(/for ten points/i);
    if (ftenMatch && !/for 10 points/i.test(text)) {
      const orig = ftenMatch[0];
      const fixNew = orig[0] === orig[0].toUpperCase() ? "For 10 points" : "for 10 points";
      diags.push({
        rule: "question.ftp-format",
        severity: "error",
        paragraph: q.numberParagraph.index,
        message: 'Use "For 10 points" with numerals, not "For ten points".',
        sourceText: text,
        offset: ftenMatch.index,
        length: ftenMatch[0].length,
        fix: { oldText: orig, newText: fixNew, offset: ftenMatch.index }
      });
    } else if (!/for 10 points/i.test(text)) {
      diags.push({
        rule: "question.ftp-format",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: 'Tossup is missing "For 10 points" marker.',
        sourceText: text
      });
    }
    const ftpMatch = text.match(/For 10 points([^,])/i);
    if (ftpMatch && ftpMatch[1] !== ",") {
      diags.push({
        rule: "question.ftp-format",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: '"For 10 points" should be followed by a comma.',
        sourceText: text,
        offset: ftpMatch.index,
        length: ftpMatch[0].length
      });
    }
  }
  return diags;
}
function checkFtpePlacement(packet) {
  const diags = [];
  for (const q of packet.bonuses) {
    const text = q.numberParagraph.rawText;
    if (!/for 10 points each/i.test(text)) {
      diags.push({
        rule: "question.ftpe-format",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: 'Bonus lead-in should contain "For 10 points each".',
        sourceText: text
      });
    }
  }
  return diags;
}
function checkBonusPartMarkers(packet) {
  const diags = [];
  for (const q of packet.bonuses) {
    if (q.parts.length === 0) {
      diags.push({
        rule: "question.bonus-part-marker",
        severity: "error",
        paragraph: q.numberParagraph.index,
        message: "Bonus has no part markers ([10], [E], [M], [H])."
      });
    }
    for (let i = 0; i < q.parts.length; i++) {
      const part = q.parts[i];
      const text = part.textParagraph.rawText;
      if (!/^\s*\[(10[emh]?|[EMH])\]\s/i.test(text)) {
        diags.push({
          rule: "question.bonus-part-marker",
          severity: "warning",
          paragraph: part.textParagraph.index,
          message: `Bonus ${q.number}, part ${i + 1}: marker "${part.marker}" has unexpected format.`
        });
      }
    }
  }
  return diags;
}
function checkPowerMark(packet) {
  const diags = [];
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
          sourceText: text
        });
      }
      continue;
    }
    if (powerIdx > 0 && text[powerIdx - 1] !== " ") {
      diags.push({
        rule: "question.power-mark",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: "Power mark (*) should be preceded by a space.",
        sourceText: text,
        offset: powerIdx,
        length: 3,
        fix: { oldText: "(*)", newText: " (*)", offset: powerIdx }
      });
    }
  }
  return diags;
}
function checkMissingAnswerLine(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    if (q.type === "tossup" && !q.answerLine) {
      diags.push({
        rule: "question.missing-answer",
        severity: "error",
        paragraph: q.numberParagraph.index,
        message: `Tossup ${q.number} has no answer line.`
      });
    }
    if (q.type === "bonus") {
      for (let i = 0; i < q.parts.length; i++) {
        if (!q.parts[i].answerLine) {
          diags.push({
            rule: "question.missing-answer",
            severity: "error",
            paragraph: q.parts[i].textParagraph.index,
            message: `Bonus ${q.number}, part ${i + 1} has no answer line.`
          });
        }
      }
    }
  }
  return diags;
}
function isGeneralInstruction(text) {
  const body = text.replace(/^\s*\d+\.\s*/, "").trim();
  const stripped = body.replace(/^note to \w+:\s*[^.]*\.\s*/i, "").trim();
  if (/^(answer|name|identify|give|list|describe|provide)\b/i.test(stripped)) {
    return true;
  }
  if (/^for each\b/i.test(stripped)) {
    return true;
  }
  if (/\banswer the following\b/i.test(stripped)) {
    return true;
  }
  return false;
}
function checkBonusLeadinPunctuation(packet) {
  const diags = [];
  for (const q of packet.bonuses) {
    const text = q.numberParagraph.rawText.trim();
    const ftpeMatch = text.match(/for\s+10\s+points\s+each\s*([.,:;!?]?)\s*$/i);
    if (!ftpeMatch) continue;
    const endChar = ftpeMatch[1];
    const general = isGeneralInstruction(text);
    if (endChar !== "." && endChar !== ":") {
      const expected = general ? "period" : "colon";
      diags.push({
        rule: "question.bonus-leadin-punctuation",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `Bonus lead-in should end with a ${expected} after "for 10 points each."`
      });
    } else if (general && endChar === ":") {
      diags.push({
        rule: "question.bonus-leadin-punctuation",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: 'General-instruction lead-ins (e.g. "Name these…") should end with a period, not a colon.'
      });
    } else if (!general && endChar === ".") {
      diags.push({
        rule: "question.bonus-leadin-punctuation",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: 'Specific-clue lead-ins should end with a colon, not a period, after "for 10 points each."'
      });
    }
  }
  return diags;
}
function checkBonusDifficultySpread(packet) {
  const diags = [];
  for (const q of packet.bonuses) {
    if (q.parts.length === 0) continue;
    const markers = q.parts.map((p) => p.marker.toLowerCase());
    const hasEasy = markers.some((m) => m.includes("e"));
    const hasMedium = markers.some((m) => m.includes("m"));
    const hasHard = markers.some((m) => m.includes("h"));
    const missing = [];
    if (!hasEasy) missing.push("easy");
    if (!hasMedium) missing.push("medium");
    if (!hasHard) missing.push("hard");
    if (missing.length > 0) {
      const existing = q.parts.map((p) => `[${p.marker}]`).join(", ");
      diags.push({
        rule: "question.bonus-difficulty-spread",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `Bonus is missing ${missing.join(" and ")} difficulty marker${missing.length > 1 ? "s" : ""} (has ${existing}). Each bonus should have [10e], [10m], and [10h] parts.`
      });
    }
  }
  return diags;
}
function checkFtpMidSentence(packet) {
  const diags = [];
  for (const q of packet.tossups) {
    const text = q.numberParagraph.rawText;
    const ftpMatch = text.match(/,\s*for\s+10\s+points\s*,/i) || text.match(/\u2013\s*for\s+10\s+points\s*\u2013/i);
    if (!ftpMatch) continue;
    const ftpIdx = ftpMatch.index;
    const afterFtp = text.substring(ftpIdx + ftpMatch[0].length);
    const hasSentenceAfter = /[.!?]\s+[A-Z]/.test(afterFtp);
    if (hasSentenceAfter) {
      diags.push({
        rule: "question.no-ftp-midsentence",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: 'Do not interject "for 10 points" in the middle of the tossup. It should appear in the final sentence.',
        sourceText: text,
        offset: ftpIdx,
        length: ftpMatch[0].length
      });
    }
  }
  return diags;
}
function checkMultilineAnswer(packet) {
  const diags = [];
  const answerParaIndices = /* @__PURE__ */ new Set();
  for (const q of allQuestions(packet)) {
    if (q.answerLine) answerParaIndices.add(q.answerLine.index);
    for (const part of q.parts) {
      if (part.answerLine) answerParaIndices.add(part.answerLine.index);
    }
  }
  const paras = packet.allParagraphs;
  for (let i = 0; i < paras.length - 1; i++) {
    if (!answerParaIndices.has(paras[i].index)) continue;
    const next = paras[i + 1];
    const nextText = next.rawText.trim();
    if (!nextText) continue;
    if (ANSWER.test(nextText)) continue;
    if (QUESTION_NUMBER.test(nextText)) continue;
    if (TAG.test(nextText)) continue;
    if (BONUS_PART.test(nextText)) continue;
    const answerText = paras[i].rawText;
    let depth = 0;
    for (const ch of answerText) {
      if (ch === "[") depth++;
      if (ch === "]") depth--;
    }
    const unbalanced = depth !== 0;
    const looksLikeContinuation = unbalanced || /^[a-z]/.test(nextText) || /^\[/.test(nextText) || /^(accept|or|prompt|reject)\b/i.test(nextText);
    if (looksLikeContinuation) {
      diags.push({
        rule: "question.multiline-answer",
        severity: "error",
        paragraph: next.index,
        message: "This line appears to be a continuation of the previous answer. Answer lines must be a single paragraph; downstream parsers cannot handle multi-line answers.",
        sourceText: next.rawText
      });
    }
  }
  return diags;
}
function checkNoteFormatting(packet) {
  return [
    ...checkPreQuestionNoteItalics(packet),
    ...checkNoteToModeratorFormat(packet)
  ];
}
function checkPreQuestionNoteItalics(packet) {
  const diags = [];
  const notePatterns = [
    /^(Description acceptable\.?)/i,
    /^(Note to (players?|moderators?|readers?):\s*[^.]*\.)/i,
    /^(Two answers? required\.?)/i,
    /^(Names? acceptable\.?)/i
  ];
  for (const q of allQuestions(packet)) {
    const text = q.numberParagraph.rawText;
    const body = text.replace(/^\s*\d+\.\s*/, "");
    for (const pattern of notePatterns) {
      const match = body.match(pattern);
      if (!match) continue;
      const noteText = match[1];
      const noteStart = text.indexOf(noteText);
      if (noteStart === -1) continue;
      let isItalic = false;
      let charPos = 0;
      for (const run of q.numberParagraph.runs) {
        const runEnd = charPos + run.text.length;
        if (charPos <= noteStart && noteStart < runEnd) {
          isItalic = run.italic;
          break;
        }
        charPos = runEnd;
      }
      if (!isItalic) {
        diags.push({
          rule: "question.note-formatting",
          severity: "info",
          paragraph: q.numberParagraph.index,
          message: `Pre-question notes like "${noteText}" should be italicized.`,
          sourceText: text,
          offset: noteStart,
          length: noteText.length
        });
        break;
      }
    }
  }
  return diags;
}
function checkBonusPartOrder(packet) {
  const diags = [];
  for (const q of packet.bonuses) {
    if (q.parts.length === 0) continue;
    let expectingAnswer = false;
    let partCount = 0;
    for (const para of q.paragraphs) {
      const text = para.rawText.trim();
      if (!text) continue;
      const isPart = BONUS_PART.test(text);
      const isAnswer = ANSWER.test(text);
      if (isPart && expectingAnswer) {
        partCount++;
        diags.push({
          rule: "question.bonus-part-order",
          severity: "error",
          paragraph: para.index,
          message: `Bonus ${q.number}, part ${partCount}: appears before part ${partCount - 1}’s answer line. Each [value] part must be followed by its ANSWER: before the next part.`,
          sourceText: para.rawText
        });
        expectingAnswer = true;
      } else if (isPart) {
        partCount++;
        expectingAnswer = true;
      } else if (isAnswer && expectingAnswer) {
        expectingAnswer = false;
      }
    }
  }
  return diags;
}
function checkPostQuestionNote(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    const parasToCheck = [];
    if (q.type === "tossup") {
      parasToCheck.push({ para: q.numberParagraph });
    } else {
      for (let i = 0; i < q.parts.length; i++) {
        parasToCheck.push({ para: q.parts[i].textParagraph, partLabel: `part ${i + 1}` });
      }
    }
    for (const { para, partLabel } of parasToCheck) {
      const text = para.rawText;
      const noteMatches = [...text.matchAll(/\(([^)]+)\)(?:\s*[.?!]?\s*)?$/g)];
      for (const match of noteMatches) {
        const fullMatch = match[0];
        const content = match[1].trim();
        if (/"[^"]*"/.test(content) || /\u201c[^\u201d]*\u201d/.test(content)) {
          continue;
        }
        if (/^[A-Z-]+$/.test(content) || /[a-z]+-[A-Z]+/.test(content)) {
          continue;
        }
        if (/^by\s+/i.test(content)) {
          continue;
        }
        const issues = [];
        const firstAlphaMatch = content.match(/[a-zA-Z]/);
        if (firstAlphaMatch) {
          const firstAlpha = firstAlphaMatch[0];
          if (firstAlpha === firstAlpha.toLowerCase()) {
            issues.push("capitalize the first letter");
          }
        }
        if (!content.endsWith(".")) {
          issues.push("end with a period");
        }
        if (issues.length > 0) {
          const prefix = partLabel ? `Bonus ${q.number}, ${partLabel}: ` : "";
          const message = `${prefix}Post-question note should be styled as a sentence: ${issues.join(" and ")}.`;
          diags.push({
            rule: "question.post-question-note-sentence",
            severity: "warning",
            paragraph: para.index,
            message,
            sourceText: text,
            offset: match.index,
            length: fullMatch.length
          });
        }
      }
    }
  }
  return diags;
}
function checkSeparateNoteParagraph(packet) {
  const diags = [];
  const notePatterns = [
    /^Note to (players?|moderators?|readers?):\s*.+/i,
    /^Description acceptable\.?$/i,
    /^Two answers? required\.?$/i,
    /^Names? acceptable\.?$/i
  ];
  for (const q of allQuestions(packet)) {
    const text = q.numberParagraph.rawText;
    const body = text.replace(/^\s*\d+\.\s*/, "").trim();
    const isNote = notePatterns.some((p) => p.test(body));
    if (!isNote) continue;
    const specialParas = /* @__PURE__ */ new Set();
    specialParas.add(q.numberParagraph.index);
    if (q.answerLine) specialParas.add(q.answerLine.index);
    if (q.tag) specialParas.add(q.tag.index);
    for (const part of q.parts) {
      specialParas.add(part.textParagraph.index);
      if (part.answerLine) specialParas.add(part.answerLine.index);
    }
    const hasExtraBody = q.paragraphs.some((p) => !specialParas.has(p.index));
    if (hasExtraBody) {
      diags.push({
        rule: "question.separate-note-paragraph",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: "Pre-question note should be on the same line as the question text, not a separate paragraph.",
        sourceText: text
      });
    }
  }
  return diags;
}
function checkNoteToModeratorFormat(packet) {
  const diags = [];
  const nonstandardPatterns = [
    [/^(Note to readers?:)/i, "Note to reader:"],
    [/^(Moderator note:)/i, "Moderator note:"],
    [/^(Reader note:)/i, "Reader note:"],
    [/^(Mod note:)/i, "Mod note:"],
    [/^(NTM:)/i, "NTM:"]
  ];
  for (const q of allQuestions(packet)) {
    const parasToCheck = [
      { para: q.numberParagraph }
    ];
    for (let i = 0; i < q.parts.length; i++) {
      parasToCheck.push({ para: q.parts[i].textParagraph, partLabel: `part ${i + 1}` });
    }
    for (const { para, partLabel } of parasToCheck) {
      const text = para.rawText;
      const body = text.replace(/^\s*(\d+\.\s*|\[[^\]]*\]\s*)/, "");
      for (const [re, label] of nonstandardPatterns) {
        const m = body.match(re);
        if (!m) continue;
        const noteStart = text.indexOf(m[1]);
        if (noteStart === -1) continue;
        const isReader = label === "Note to reader:";
        const prefix = q.type === "bonus" && partLabel ? `Bonus ${q.number}, ${partLabel}: ` : "";
        const message = isReader ? `${prefix}Use "Note to moderator:" instead of "${m[1]}" — the person reading the question is the moderator.` : `${prefix}Use "Note to moderator:" instead of "${m[1]}".`;
        diags.push({
          rule: "question.note-formatting",
          severity: "info",
          paragraph: para.index,
          message,
          sourceText: text,
          offset: noteStart,
          length: m[1].length
        });
        break;
      }
    }
  }
  return diags;
}
const ABBREVIATIONS = /(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Gen|Gov|Rev|Prof|Sgt|Cpl|Pvt|Lt|Capt|Maj|Col|Ave|Blvd|Vol|No|Inc|Ltd|Corp|Dept|Univ|Assoc|Pres|Rep|Sen|Fig|vs|approx|est)\.\s+$/;
const SINGLE_INITIAL = /(?:[A-Z][a-z]+\s+|[A-Z]\.\s*|(?:^|[\s,(]))[A-Z]\.\s+$|(?:^|\s)v\.\s+$/;
const CLUE_PRONOUN = /\b(?:this|these)\b/i;
const FTP_PRONOUN = /\b(?:this|what|which|these|give)\b/i;
function isRangeItalic(para, start, length) {
  const raw = para.rawText.substring(start, start + length);
  const trimmed = raw.replace(/[\s.!?,;:]+$/, "");
  if (trimmed.length === 0) return false;
  const end = start + trimmed.length;
  let runOffset = 0;
  for (const run of para.runs) {
    const runEnd = runOffset + run.text.length;
    const overlapStart = Math.max(runOffset, start);
    const overlapEnd = Math.min(runEnd, end);
    if (overlapStart < overlapEnd && !run.italic) {
      const slice = para.rawText.substring(overlapStart, overlapEnd);
      if (slice.trim().length > 0) return false;
    }
    runOffset = runEnd;
  }
  return true;
}
function quoteDepthAt(text, pos) {
  let depth = 0;
  for (let i = 0; i < pos; i++) {
    const ch = text[i];
    if (ch === "“") depth++;
    else if (ch === "”") depth = Math.max(0, depth - 1);
    else if (ch === '"') depth = depth > 0 ? depth - 1 : depth + 1;
  }
  return depth;
}
function splitSentences(text) {
  const sentences = [];
  const re = /[.!?]\s+(?=[A-Z])/g;
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const candidateEnd = m.index + m[0].length;
    const before = text.substring(0, candidateEnd);
    if (ABBREVIATIONS.test(before) || SINGLE_INITIAL.test(before)) continue;
    if (quoteDepthAt(text, m.index) > 0) continue;
    sentences.push({
      text: text.substring(lastIdx, candidateEnd),
      offset: lastIdx,
      insideQuote: quoteDepthAt(text, lastIdx) > 0
    });
    lastIdx = candidateEnd;
  }
  if (lastIdx < text.length) {
    sentences.push({
      text: text.substring(lastIdx),
      offset: lastIdx,
      insideQuote: quoteDepthAt(text, lastIdx) > 0
    });
  }
  return sentences;
}
function checkMissingPronoun(packet) {
  const diags = [];
  for (const q of packet.tossups) {
    const rawText = q.numberParagraph.rawText;
    const numMatch = rawText.match(/^\s*\d+\.\s*/);
    const numPrefixLen = numMatch ? numMatch[0].length : 0;
    const body = rawText.substring(numPrefixLen);
    if (!FTP_MARKER.test(body)) continue;
    const stripped = stripItalicOnly(q.numberParagraph);
    const strippedBody = stripped.substring(numPrefixLen);
    const sentences = splitSentences(body);
    let firstContentIdx = 0;
    for (const sent of sentences) {
      const absOffset = numPrefixLen + sent.offset;
      const trimmed = sent.text.trim();
      if (trimmed.length > 0 && isRangeItalic(q.numberParagraph, absOffset, trimmed.length)) {
        firstContentIdx++;
      } else {
        break;
      }
    }
    for (let i = firstContentIdx; i < sentences.length; i++) {
      const sent = sentences[i];
      if (sent.text.trim().length < 20) continue;
      if (sent.insideQuote) continue;
      const strippedSent = strippedBody.substring(
        sent.offset,
        sent.offset + sent.text.length
      );
      const isFtp = FTP_MARKER.test(sent.text);
      const pronounRe = isFtp ? FTP_PRONOUN : CLUE_PRONOUN;
      if (!pronounRe.test(strippedSent)) {
        const absOffset = numPrefixLen + sent.offset;
        diags.push({
          rule: "question.missing-pronoun",
          severity: "info",
          paragraph: q.numberParagraph.index,
          message: isFtp ? 'FTP sentence lacks a pronoun ("this"/"what") referring to the answer.' : 'Clue sentence lacks a pronoun ("this"/"these") referring to the answer.',
          sourceText: rawText,
          offset: absOffset,
          length: sent.text.trimEnd().length
        });
      }
    }
  }
  for (const q of packet.bonuses) {
    for (const part of q.parts) {
      const rawText = part.textParagraph.rawText;
      const markerMatch = rawText.match(/^\s*\[(10[emh]?|[EMH])\]\s*/i);
      const markerLen = markerMatch ? markerMatch[0].length : 0;
      const body = rawText.substring(markerLen);
      if (body.trim().length < 20) continue;
      const stripped = stripItalicOnly(part.textParagraph);
      const strippedBody = stripped.substring(markerLen);
      if (!FTP_PRONOUN.test(strippedBody)) {
        diags.push({
          rule: "question.missing-pronoun",
          severity: "info",
          paragraph: part.textParagraph.index,
          message: 'Bonus part lacks a pronoun ("this"/"what") referring to the answer.',
          sourceText: rawText,
          offset: markerLen,
          length: body.trimEnd().length
        });
      }
    }
  }
  return diags;
}
const questionRules = [
  checkFtpFormat,
  checkFtpePlacement,
  checkBonusPartMarkers,
  checkPowerMark,
  checkMissingAnswerLine,
  checkMultilineAnswer,
  checkBonusLeadinPunctuation,
  checkBonusDifficultySpread,
  checkFtpMidSentence,
  checkNoteFormatting,
  checkBonusPartOrder,
  checkPostQuestionNote,
  checkSeparateNoteParagraph,
  checkMissingPronoun
];
function findBracketSpans(rawText) {
  const spans = [];
  for (const m of rawText.matchAll(/\[([^\]]*)\]/g)) {
    spans.push({
      start: m.index,
      end: m.index + m[0].length - 1,
      content: m[1]
    });
  }
  return spans;
}
function parseSubDirectives(bracket, _rawText) {
  const results = [];
  const innerStart = bracket.start + 1;
  const parts = bracket.content.split(";");
  let offset = innerStart;
  for (const part of parts) {
    const trimmed = part.trimStart();
    const leadingSpaces = part.length - trimmed.length;
    const partStart = offset + leadingSpaces;
    const trimmedEnd = trimmed.trimEnd();
    const patterns = [
      { type: "do not accept or prompt on", regex: /^do\s+not\s+accept\s+or\s+prompt\s+(on\s+)?/i },
      { type: "do not accept", regex: /^do\s+not\s+accept\s+/i },
      { type: "do not prompt", regex: /^do\s+not\s+prompt\s+/i },
      { type: "anti-prompt", regex: /^anti-?prompt\s+(on\s+)?/i },
      { type: "prompt", regex: /^prompt\s+(on\s+)?/i },
      { type: "accept", regex: /^accept\s+/i },
      { type: "reject", regex: /^reject\s+/i },
      { type: "or", regex: /^or\s+/i }
    ];
    let matched = false;
    for (const p of patterns) {
      const m = trimmedEnd.match(p.regex);
      if (m) {
        const contentStartInPart = m[0].length;
        results.push({
          type: p.type,
          contentStart: partStart + contentStartInPart,
          contentEnd: partStart + trimmedEnd.length,
          contentText: trimmedEnd.slice(contentStartInPart),
          fullText: trimmedEnd,
          fullStart: partStart
        });
        matched = true;
        break;
      }
    }
    if (!matched && trimmedEnd.length > 0) {
      results.push({
        type: "unknown",
        contentStart: partStart,
        contentEnd: partStart + trimmedEnd.length,
        contentText: trimmedEnd,
        fullText: trimmedEnd,
        fullStart: partStart
      });
    }
    offset += part.length + 1;
  }
  return results;
}
function isMetaInstruction(content) {
  const normalized = content.trim().toLowerCase();
  return /^(either|any|both|all)\b/.test(normalized) || /^(in\s+(either|any)\s+order|names?\s+in\s+(either|any)\s+order)\b/.test(
    normalized
  ) || /^answers?\s+in\s+(either|any)\s+order\b/.test(normalized) || /\b(partial|equivalent|reasonable|similar|obvious|clear|specific|either|any)\s+(answer|response|mention|description|form)s?\b/.test(
    normalized
  ) || /\b(equivalents|partial answers?|either answer|any answer|word forms?)\b/.test(
    normalized
  ) || // Substitution instructions: "X" in place of "Y" or "X" instead of "Y"
  /\b(in\s+place\s+of|instead\s+of)\b/.test(normalized) || // Descriptive class-level accepts: "answers (that) describe/indicating/mentioning X"
  /^(answers?|other\s+answers?|the\s+aforementioned\s+answers?)\s+(that\s+)?(describ|indicat|mention|involv|such\s+as)\w*\b/.test(
    normalized
  ) || // "other answers" without qualification is always meta
  /^other\s+answers?\b/.test(normalized);
}
function checkAnswerPrefix(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    if (!/^\s*ANSWER:\s/.test(text)) {
      if (/^\s*ANSWER\s*:/i.test(text)) {
        let hadCaseFix = false;
        if (!/^\s*ANSWER:/.test(text)) {
          const prefixMatch = text.match(/^\s*(ANSWER\s*:)/i);
          hadCaseFix = true;
          diags.push({
            rule: "answerline.answer-prefix",
            severity: "error",
            paragraph: para.index,
            message: '"ANSWER" must be in all caps.',
            suggestion: "ANSWER:",
            sourceText: text,
            offset: prefixMatch.index + prefixMatch[0].length - prefixMatch[1].length,
            length: prefixMatch[1].length,
            fix: {
              oldText: prefixMatch[1],
              newText: "ANSWER:",
              offset: prefixMatch.index + prefixMatch[0].length - prefixMatch[1].length
            }
          });
        }
        if (!hadCaseFix && !/ANSWER:\s/.test(text)) {
          const colonMatch = text.match(/ANSWER:/i);
          diags.push({
            rule: "answerline.answer-prefix",
            severity: "warning",
            paragraph: para.index,
            message: 'Missing space after "ANSWER:".',
            sourceText: text,
            offset: colonMatch.index,
            length: colonMatch[0].length,
            fix: {
              oldText: colonMatch[0],
              newText: "ANSWER: ",
              offset: colonMatch.index
            }
          });
        }
      } else if (/^\s*answer/i.test(text)) {
        const prefixMatch = text.match(/^\s*(answer\s*:\s*|answer\s+)/i);
        if (prefixMatch) {
          diags.push({
            rule: "answerline.answer-prefix",
            severity: "error",
            paragraph: para.index,
            message: 'Answer line must start with "ANSWER: ".',
            suggestion: "ANSWER: ",
            sourceText: text,
            offset: prefixMatch.index + prefixMatch[0].length - prefixMatch[1].length,
            length: prefixMatch[1].length,
            fix: {
              oldText: prefixMatch[1],
              newText: "ANSWER: ",
              offset: prefixMatch.index + prefixMatch[0].length - prefixMatch[1].length
            }
          });
        }
      }
    }
  }
  return diags;
}
function checkRequiredAnswerFormatting(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const runs = para.runs;
    const fmtMap = buildFormattingMap(runs);
    const answerColonMatch = para.rawText.match(/ANSWER:\s*/);
    if (!answerColonMatch) continue;
    const answerStart = answerColonMatch.index + answerColonMatch[0].length;
    const firstBracket = para.rawText.indexOf("[", answerStart);
    const answerEnd = firstBracket === -1 ? para.rawText.length : firstBracket;
    const foundBoldUnderline = hasBoldUnderline(
      fmtMap,
      answerStart,
      answerEnd,
      para.rawText
    );
    if (!foundBoldUnderline) {
      let hasUnderline2 = false;
      let hasBold = false;
      for (let i = answerStart; i < answerEnd; i++) {
        if (i < fmtMap.length && para.rawText[i].trim()) {
          if (fmtMap[i].underline) hasUnderline2 = true;
          if (fmtMap[i].bold) hasBold = true;
        }
      }
      let message;
      if (!hasUnderline2 && !hasBold) {
        message = "The required (primary) answer should be bold and underlined.";
      } else if (!hasBold) {
        message = "The required (primary) answer should be bold and underlined (missing bold).";
      } else {
        message = "The required (primary) answer should be bold and underlined (missing underline).";
      }
      diags.push({
        rule: "answerline.answer-formatting",
        severity: "error",
        paragraph: para.index,
        message,
        sourceText: para.rawText,
        offset: answerStart,
        length: answerEnd - answerStart
      });
    }
  }
  return diags;
}
function checkBracketBalance(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    let depth = 0;
    let unmatchedPos = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "[") {
        if (depth === 0) unmatchedPos = i;
        depth++;
      }
      if (text[i] === "]") {
        depth--;
        if (depth === 0) unmatchedPos = -1;
      }
      if (depth < 0) {
        unmatchedPos = i;
        break;
      }
    }
    if (depth !== 0) {
      diags.push({
        rule: "answerline.bracket-balance",
        severity: "error",
        paragraph: para.index,
        message: "Unbalanced brackets in answer line.",
        sourceText: text,
        offset: unmatchedPos !== -1 ? unmatchedPos : void 0,
        length: unmatchedPos !== -1 ? 1 : void 0
      });
    }
  }
  return diags;
}
function checkAcceptRejectFormat(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    const brackets = [...text.matchAll(/\[([^\]]*)\]/g)];
    for (const match of brackets) {
      const content = match[1].trim().toLowerCase();
      const validStarts = [
        "accept",
        "or",
        "prompt",
        "do not accept",
        "do not prompt",
        "reject",
        "anti-prompt",
        "antiprompt",
        "read"
      ];
      const hasValidStart = validStarts.some((s) => content.startsWith(s));
      if (!hasValidStart && content.length > 0) {
        if (/^(acept|accpet|promt|rejct)/i.test(content)) {
          diags.push({
            rule: "answerline.directive-typo",
            severity: "warning",
            paragraph: para.index,
            message: `Possible typo in answer line directive: "[${match[1]}]".`,
            sourceText: text,
            offset: match.index,
            length: match[0].length
          });
        }
      }
    }
  }
  return diags;
}
function checkAcceptFormatting(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const fmtMap = buildFormattingMap(para.runs);
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "accept" && sub.type !== "or") continue;
        if (isMetaInstruction(sub.contentText)) continue;
        const foundBoldUnderline = hasBoldUnderline(
          fmtMap,
          sub.contentStart,
          sub.contentEnd,
          para.rawText
        );
        if (!foundBoldUnderline) {
          const directive = sub.type === "or" ? "or" : "accept";
          diags.push({
            rule: "answerline.accept-formatting",
            severity: "warning",
            paragraph: para.index,
            message: `Text in [${directive}] directive should have bold and underlined formatting: "${sub.contentText}".`,
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length
          });
        }
      }
    }
  }
  return diags;
}
function checkPromptFormatting(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const fmtMap = buildFormattingMap(para.runs);
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "prompt" && sub.type !== "anti-prompt") continue;
        if (isMetaInstruction(sub.contentText)) continue;
        const byAskingMatch = sub.contentText.match(/\s+by\s+asking\s+/i);
        const checkEnd = byAskingMatch ? sub.contentStart + byAskingMatch.index : sub.contentEnd;
        const foundUnderline = hasUnderline(
          fmtMap,
          sub.contentStart,
          checkEnd,
          para.rawText
        );
        if (!foundUnderline) {
          const directive = sub.type === "anti-prompt" ? "anti-prompt" : "prompt";
          diags.push({
            rule: "answerline.prompt-formatting",
            severity: "warning",
            paragraph: para.index,
            message: `Text in [${directive}] directive should have underlined formatting: "${sub.contentText}".`,
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length
          });
        }
      }
    }
  }
  return diags;
}
function checkRejectQuotes(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "reject" && sub.type !== "do not accept") continue;
        const content = sub.contentText.trim();
        if (!content) continue;
        const lower = content.toLowerCase();
        if (/^answers?\s+(like|that|describing|mentioning|involving|such\s+as)\b/.test(
          lower
        ))
          continue;
        if (/[\u201c\u201d"'].*[\u201c\u201d"']/.test(content) && !/^[\u201c\u201d"']/.test(content))
          continue;
        if (/^[\u201c\u201d"'][^"'\u201c\u201d]+[\u201c\u201d"']\s+(alone|without)\b/.test(
          content
        ))
          continue;
        if (/\bor\s+(other|any)\b/.test(lower)) continue;
        if (/\buntil\b.*\bread\b/.test(lower)) continue;
        if (/^partial\s+answers?\b/.test(lower)) continue;
        const quotePattern = /^[\u201c\u201d"'].+[\u201c\u201d"']$/;
        if (!quotePattern.test(content)) {
          const directive = sub.type === "do not accept" ? "do not accept" : "reject";
          diags.push({
            rule: "answerline.reject-quotes",
            severity: "warning",
            paragraph: para.index,
            message: `Text in [${directive}] directive should be wrapped in quotes: "${content}".`,
            sourceText: para.rawText,
            offset: sub.contentStart,
            length: sub.contentText.length
          });
        }
      }
    }
  }
  return diags;
}
function checkPromptQuestionQuotes(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "prompt" && sub.type !== "anti-prompt") continue;
        const byAskingMatch = sub.contentText.match(/by\s+asking\s+(.*)/i);
        if (!byAskingMatch) continue;
        const askingContent = byAskingMatch[1].trim();
        if (!askingContent) continue;
        const quotePattern = /^[\u201c\u201d"'].+[\u201c\u201d"']$/;
        if (!quotePattern.test(askingContent)) {
          const askingOffset = sub.contentStart + byAskingMatch.index + byAskingMatch[0].length - byAskingMatch[1].length;
          diags.push({
            rule: "answerline.prompt-question-quotes",
            severity: "warning",
            paragraph: para.index,
            message: `The "by asking" question should be wrapped in quotes: "${askingContent}".`,
            sourceText: para.rawText,
            offset: askingOffset,
            length: askingContent.length
          });
        }
      }
    }
  }
  return diags;
}
function checkPostNotes(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    const lastBracket = text.lastIndexOf("]");
    if (lastBracket === -1) continue;
    const afterBracket = text.slice(lastBracket + 1);
    const withoutTag = afterBracket.replace(/<[^>]+>\s*$/, "");
    const trimmed = withoutTag.trim();
    if (!trimmed) continue;
    if (!(trimmed.startsWith("(") && trimmed.endsWith(")"))) {
      const noteOffset = text.indexOf(trimmed, lastBracket + 1);
      diags.push({
        rule: "answerline.post-notes",
        severity: "info",
        paragraph: para.index,
        message: `Text after the last bracket should be wrapped in parentheses: "${trimmed}".`,
        sourceText: text,
        offset: noteOffset !== -1 ? noteOffset : void 0,
        length: noteOffset !== -1 ? trimmed.length : void 0
      });
    }
  }
  return diags;
}
function checkDeprecatedDirectives(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type === "anti-prompt") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message: `"anti-prompt" is deprecated. Use a directed prompt instead, e.g. "prompt on X by asking 'can you be less specific?'".`
          });
        }
        if (sub.type === "do not accept or prompt on") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message: '"do not accept or prompt on" is deprecated. Use "reject" instead.',
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
            fix: {
              oldText: sub.fullText,
              newText: "reject " + sub.contentText,
              offset: sub.fullStart
            }
          });
        }
        if (sub.type === "do not accept") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message: '"do not accept" is deprecated. Use "reject" instead.',
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
            fix: {
              oldText: sub.fullText,
              newText: "reject " + sub.contentText,
              offset: sub.fullStart
            }
          });
        }
        if (sub.type === "do not prompt") {
          diags.push({
            rule: "answerline.deprecated-directive",
            severity: "warning",
            paragraph: para.index,
            message: '"do not prompt" is deprecated. Use "reject" instead.',
            sourceText: para.rawText,
            offset: sub.fullStart,
            length: sub.fullText.length,
            fix: {
              oldText: sub.fullText,
              newText: "reject " + sub.contentText,
              offset: sub.fullStart
            }
          });
        }
      }
    }
    if (/\baccept\s+in\s+(either|any)\s+order\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message: '"accept in either order" is unnecessary. It is implicit that multiple answers can be accepted in any order.'
      });
    }
    if (/\baccept\s+(either|any)\s+underlined\s+(part|portion)\b/i.test(
      para.rawText
    )) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message: '"accept either underlined part" is deprecated. List acceptable alternatives explicitly instead.'
      });
    }
    if (/\bnames?\s+in\s+(either|any)\s+order\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message: '"names in either order" is deprecated. List acceptable name orderings explicitly (e.g. [or Murakami Haruki]).'
      });
    }
    if (/\b(begrudgingly|grudgingly|reluctantly)\s+accept\b/i.test(para.rawText)) {
      diags.push({
        rule: "answerline.deprecated-directive",
        severity: "warning",
        paragraph: para.index,
        message: 'Do not include "begrudgingly accept." Either an answer is acceptable, or it is not.'
      });
    }
  }
  return diags;
}
function checkParentheticalOptional(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    const answerMatch = text.match(/ANSWER:\s*/i);
    if (!answerMatch) continue;
    const answerStart = answerMatch.index + answerMatch[0].length;
    const firstBracket = text.indexOf("[", answerStart);
    const answerEnd = firstBracket === -1 ? text.length : firstBracket;
    const answerText = text.substring(answerStart, answerEnd);
    for (const m of answerText.matchAll(/\(([^)]{1,20})\)/g)) {
      const content = m[1].trim();
      if (content === "*") continue;
      if (/^".*"$/.test(content)) continue;
      if (/^[\u201c].*[\u201d]$/.test(content)) continue;
      if (/^[A-Z-]+$/.test(content)) continue;
      if (content.includes("-") && /[A-Z]/.test(content)) continue;
      if (/^[a-zA-Z0-9]$/.test(content)) continue;
      if (/^[IVX]+$/.test(content)) continue;
      if (/\b(or|and|also)\b/i.test(content)) continue;
      if (/[:,.]/.test(content)) continue;
      if (/^(by|from)\s/i.test(content)) continue;
      const matchPos = m.index;
      const beforeParen = answerText.substring(0, matchPos).trim();
      if (beforeParen.length < 5) continue;
      if (content.split(/\s+/).length <= 3) {
        diags.push({
          rule: "answerline.no-parenthetical-optional",
          severity: "info",
          paragraph: para.index,
          message: `Avoid parentheses for optional parts in answers: "(${content})". List alternatives explicitly with [or] or [accept] instead.`
        });
        break;
      }
    }
  }
  return diags;
}
function checkPromptWithNotByAsking(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "prompt" && sub.type !== "anti-prompt") continue;
        const withMatch = sub.contentText.match(/\s+with\s+[\u201c\u201d"']/i);
        if (withMatch) {
          diags.push({
            rule: "answerline.prompt-with-not-by-asking",
            severity: "info",
            paragraph: para.index,
            message: 'Directed prompts should use "by asking" instead of "with".',
            sourceText: para.rawText
          });
        }
      }
    }
  }
  return diags;
}
function checkPromptPartialAnswers(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "prompt" && sub.type !== "anti-prompt") continue;
        if (/\bpartial\s+answers?\b/i.test(sub.contentText)) {
          diags.push({
            rule: "answerline.prompt-partial-answers",
            severity: "info",
            paragraph: para.index,
            message: 'Avoid "prompt on partial answers". Spell out what exactly is promptable.',
            sourceText: para.rawText
          });
        }
      }
    }
  }
  return diags;
}
function checkNonstandardPrefix(packet) {
  const diags = [];
  const knownAnswerIndices = /* @__PURE__ */ new Set();
  for (const para of getAnswerLines(packet)) {
    knownAnswerIndices.add(para.index);
  }
  const NONSTANDARD_RE = /^\s*(ans\s*[:.]\s*|answer\s*\.\s*)/i;
  for (const para of packet.allParagraphs) {
    if (knownAnswerIndices.has(para.index)) continue;
    const text = para.rawText;
    const match = text.match(NONSTANDARD_RE);
    if (!match) continue;
    const prefix = match[1].trim();
    diags.push({
      rule: "answerline.no-nonstandard-prefix",
      severity: "error",
      paragraph: para.index,
      message: `"${prefix}" is not recognized as an answer line. Use "ANSWER: " (all caps, colon, space).`,
      suggestion: "ANSWER: ",
      sourceText: text,
      offset: match.index,
      length: match[1].length,
      fix: {
        oldText: match[1],
        newText: "ANSWER: ",
        offset: match.index
      }
    });
  }
  return diags;
}
const DIRECTIVE_SKIP_WORDS = /* @__PURE__ */ new Set(["and", "or", "but", "don't", "dont"]);
function checkDirectiveSeparator(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const content = bracket.content;
      const directivePattern = /\b(do\s+not\s+accept\s+or\s+prompt(\s+on)?|do\s+not\s+accept|do\s+not\s+prompt|anti-?prompt|accept|prompt|reject)\s+/gi;
      const matches = [...content.matchAll(directivePattern)];
      if (matches.length <= 1) continue;
      for (let i = 1; i < matches.length; i++) {
        const match = matches[i];
        const matchPos = match.index;
        let j = matchPos - 1;
        while (j >= 0 && content[j] === " ") j--;
        if (j >= 0 && content[j] === ";") continue;
        if (j < 0) continue;
        let tokenBefore = "";
        if (/\w/.test(content[j]) || content[j] === "'") {
          while (j >= 0 && (/\w/.test(content[j]) || content[j] === "'")) {
            tokenBefore = content[j] + tokenBefore;
            j--;
          }
        } else {
          tokenBefore = content[j];
        }
        if (DIRECTIVE_SKIP_WORDS.has(tokenBefore.toLowerCase())) continue;
        const absPos = bracket.start + 1 + matchPos;
        const directiveName = match[1].toLowerCase().trim();
        diags.push({
          rule: "answerline.directive-separator",
          severity: "warning",
          paragraph: para.index,
          message: `Secondary directive "${directiveName}" should be preceded by a semicolon, not "${tokenBefore}".`,
          sourceText: para.rawText,
          offset: absPos,
          length: match[0].length
        });
      }
    }
  }
  return diags;
}
function checkRejectAlone(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const brackets = findBracketSpans(para.rawText);
    for (const bracket of brackets) {
      const subs = parseSubDirectives(bracket, para.rawText);
      for (const sub of subs) {
        if (sub.type !== "reject" && sub.type !== "do not accept") continue;
        const content = sub.contentText.trim();
        if (!content) continue;
        const aloneMatch = content.match(
          /^[\u201c\u201d"']([^"'\u201c\u201d]+)[\u201c\u201d"']\s+alone$/i
        );
        if (aloneMatch) {
          const directive = sub.type === "do not accept" ? "do not accept" : "reject";
          const fixedContent = content.replace(/\s+alone$/i, "");
          diags.push({
            rule: "answerline.reject-no-alone",
            severity: "warning",
            paragraph: para.index,
            message: `The word "alone" should not appear after a quoted phrase in [${directive}] directive. Remove "alone".`,
            sourceText: para.rawText,
            offset: sub.contentStart,
            length: content.length,
            fix: {
              oldText: content,
              newText: fixedContent,
              offset: sub.contentStart
            }
          });
        }
      }
    }
  }
  return diags;
}
function checkDirectiveParentheses(packet) {
  const diags = [];
  for (const para of getAnswerLines(packet)) {
    const text = para.rawText;
    for (const match of text.matchAll(/\(([^)]+)\)/g)) {
      const content = match[1].trim();
      if (!content) continue;
      const directivePattern = /^(do\s+not\s+accept|do\s+not\s+prompt|anti-?prompt|accept|reject|prompt|or)\s+/i;
      const directiveMatch = content.match(directivePattern);
      if (directiveMatch) {
        const offset = match.index;
        diags.push({
          rule: "answerline.directive-brackets",
          severity: "error",
          paragraph: para.index,
          message: `Answerline directives must use square brackets, not parentheses. Change "(${content})" to "[${content}]".`,
          sourceText: text,
          offset,
          length: match[0].length,
          fix: {
            oldText: match[0],
            newText: `[${match[1]}]`,
            offset
          }
        });
      }
    }
  }
  return diags;
}
const answerlineRules = [
  checkNonstandardPrefix,
  checkAnswerPrefix,
  checkRequiredAnswerFormatting,
  checkBracketBalance,
  checkAcceptRejectFormat,
  checkAcceptFormatting,
  checkPromptFormatting,
  checkRejectQuotes,
  checkPromptQuestionQuotes,
  checkPromptWithNotByAsking,
  checkPromptPartialAnswers,
  checkPostNotes,
  checkDeprecatedDirectives,
  checkParentheticalOptional,
  checkDirectiveSeparator,
  checkRejectAlone,
  checkDirectiveParentheses
];
const PRON_SQUARE_RE = /\["([^"]+)"\]/g;
function getAllTextParagraphs(packet) {
  return packet.allParagraphs.filter((p) => p.rawText.trim().length > 0);
}
function checkPronunciationDelimiters(packet) {
  const diags = [];
  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;
    const squareMatches = [...text.matchAll(PRON_SQUARE_RE)];
    for (const match of squareMatches) {
      const content = match[1];
      if (content.includes("-") || /^[a-zA-Z\s-]+$/.test(content)) {
        const oldText = match[0];
        const newText = `("${content}")`;
        diags.push({
          rule: "pronunciation.paren-delimiter",
          severity: "warning",
          paragraph: para.index,
          message: `Pronunciation guide should use parentheses with double quotes: ("${content}"), not ["${content}"].`,
          sourceText: text,
          offset: match.index,
          length: oldText.length,
          fix: { oldText, newText, offset: match.index }
        });
      }
    }
  }
  return diags;
}
function checkTrailingPunctuation(packet) {
  const diags = [];
  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;
    const badTrailing = [...text.matchAll(/\("([^"]+[.,;:!?])"\)/g)];
    for (const match of badTrailing) {
      const content = match[1];
      if (content.includes("-") || /^[a-zA-Z\s-]+[.,;:!?]$/.test(content)) {
        const lastChar = content[content.length - 1];
        diags.push({
          rule: "pronunciation.trailing-punct",
          severity: "info",
          paragraph: para.index,
          message: `Punctuation "${lastChar}" should come after the pronunciation guide, not inside it.`,
          sourceText: text,
          offset: match.index,
          length: match[0].length
        });
      }
    }
  }
  return diags;
}
function checkPronunciationQuotes(packet) {
  const diags = [];
  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;
    const unquotedMatches = [...text.matchAll(/\(([A-Z-]+|[a-z]+-[A-Z]+)\)/g)];
    for (const match of unquotedMatches) {
      const content = match[1];
      if (/^[A-Z]$/.test(content)) continue;
      if (/^[IVX]+$/.test(content)) continue;
      if (/^\d+$/.test(content)) continue;
      if (content.includes("-") || /^[A-Z]+$/.test(content)) {
        const oldText = match[0];
        const newText = `("${content}")`;
        diags.push({
          rule: "pronunciation.quotes-required",
          severity: "warning",
          paragraph: para.index,
          message: `Pronunciation guide should have quotes around it: ("${content}"), not (${content}).`,
          sourceText: text,
          offset: match.index,
          length: match[0].length,
          fix: { oldText, newText, offset: match.index }
        });
      }
    }
  }
  return diags;
}
function checkPossessivePronunciation(packet) {
  const diags = [];
  for (const para of getAllTextParagraphs(packet)) {
    const text = para.rawText;
    const possessiveMatches = [...text.matchAll(/'s\s*\(["']([^"']+)["']\)/g)];
    for (const match of possessiveMatches) {
      const pgContent = match[1];
      if (!/['']s$|[sz]$/i.test(pgContent)) {
        diags.push({
          rule: "pronunciation.possessive-ending",
          severity: "warning",
          paragraph: para.index,
          message: `Pronunciation guide following a possessive ('s) should end with 's, s, or z: "${pgContent}".`,
          sourceText: text,
          offset: match.index,
          length: match[0].length
        });
      }
    }
  }
  return diags;
}
const pronunciationRules = [
  checkPronunciationDelimiters,
  checkTrailingPunctuation,
  checkPronunciationQuotes,
  checkPossessivePronunciation
];
function checkSmartQuotes(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "non-answer")) {
    const text = para.rawText;
    const withoutPron = text.replace(/\("[^"]*"\)/g, "");
    if (withoutPron.includes('"')) {
      const idx = text.indexOf('"');
      diags.push(
        createDiagnostic(
          "formatting.smart-quotes",
          para,
          "Use typographic (smart/curly) quotes instead of straight quotes.",
          {
            suggestion: 'Replace " with “ or ”',
            offset: idx !== -1 ? idx : void 0,
            length: idx !== -1 ? 1 : void 0
          }
        )
      );
    }
    if (new RegExp("(?<![(\\w])'(?![)\\w])").test(withoutPron) || withoutPron.includes("'")) {
      if (withoutPron.includes("'")) {
        const idx = text.indexOf("'");
        diags.push({
          rule: "formatting.smart-quotes",
          severity: "info",
          paragraph: para.index,
          message: "Possible straight apostrophe detected. Use typographic (curly) apostrophe ’ instead.",
          sourceText: text,
          offset: idx !== -1 ? idx : void 0,
          length: idx !== -1 ? 1 : void 0
        });
      }
    }
  }
  return diags;
}
function checkEmDash(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    const stripped = stripTitleText(para);
    const idx = text.indexOf("—");
    if (idx !== -1 && stripped.includes("—")) {
      const hasPrecedingSpace = idx > 0 && text[idx - 1] === " ";
      const hasFollowingSpace = idx < text.length - 1 && text[idx + 1] === " ";
      const oldText = text.substring(
        hasPrecedingSpace ? idx - 1 : idx,
        hasFollowingSpace ? idx + 2 : idx + 1
      );
      const newText = (hasPrecedingSpace ? " " : "") + " – " + (hasFollowingSpace ? " " : "");
      const fixOld = oldText;
      const fixNew = newText.replace(/ {2,}/g, " ");
      const fixOffset = hasPrecedingSpace ? idx - 1 : idx;
      diags.push({
        rule: "formatting.no-em-dash",
        severity: "warning",
        paragraph: para.index,
        message: "Use spaced en dashes (–) instead of em dashes (—) for parenthetical breaks.",
        suggestion: "Replace — with – (en dash)",
        sourceText: text,
        offset: idx,
        length: 1,
        fix: { oldText: fixOld, newText: fixNew, offset: fixOffset }
      });
    }
  }
  return diags;
}
function checkSubscriptSuperscript(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    let charPos = 0;
    for (const run of para.runs) {
      if (run.superscript || run.subscript) {
        const kind = run.superscript ? "Superscripts" : "Subscripts";
        const example = run.superscript ? "x-squared" : "x-sub-two";
        diags.push({
          rule: "formatting.no-sub-superscript",
          severity: "warning",
          paragraph: para.index,
          message: `${kind} should not be used. Write out in prose instead (e.g. "${example}").`,
          sourceText: para.rawText,
          offset: charPos,
          length: run.text.length
        });
        break;
      }
      charPos += run.text.length;
    }
  }
  return diags;
}
function checkSpellOutNumbers(packet) {
  const diags = [];
  const skip = /ANSWER:|^<|for 10 points|\[10[emh]?\]|\[[EMH]\]/i;
  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    if (skip.test(text)) continue;
    const stripped = stripTitleText(para);
    const matches = [
      ...stripped.matchAll(new RegExp("(?<!\\d)(?<!\\w)([2-9]|10)(?!\\d)(?=\\s|[,.])", "g"))
    ];
    for (const match of matches) {
      const before = text.substring(
        Math.max(0, match.index - 5),
        match.index
      );
      if (/No\.\s*$|#\s*$|\d/.test(before)) continue;
      if (text.substring(match.index, match.index + 12).includes("10 points"))
        continue;
      const num = match[1];
      const words = {
        "2": "two",
        "3": "three",
        "4": "four",
        "5": "five",
        "6": "six",
        "7": "seven",
        "8": "eight",
        "9": "nine",
        "10": "ten"
      };
      diags.push({
        rule: "formatting.spell-out-small-numbers",
        severity: "info",
        paragraph: para.index,
        message: `Consider spelling out number ${num} as "${words[num]}".`,
        sourceText: text,
        offset: match.index,
        length: num.length
      });
    }
  }
  return diags;
}
function checkNoAmpersand(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "non-answer")) {
    const text = para.rawText;
    if (/^\s*<[^>]+>\s*$/.test(text)) continue;
    const stripped = stripTitleText(para);
    if (stripped.includes("&") && !stripped.includes("&amp;")) {
      const idx = stripped.indexOf("&");
      diags.push({
        rule: "formatting.no-ampersand",
        severity: "info",
        paragraph: para.index,
        message: `Avoid ampersands (&). Use "and" unless it's part of an official name.`,
        sourceText: text,
        offset: idx,
        length: 1
      });
    }
  }
  return diags;
}
function checkPoetrySlash(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "non-answer")) {
    const text = para.rawText;
    const stripped = stripItalicOnly(para);
    const slashCount = (stripped.match(/\//g) || []).length;
    if (slashCount >= 2) {
      const unspaced = [...stripped.matchAll(/(\S)\/(\S)/g)].filter(
        (m) => !/^\d\/\d/.test(m[0])
      );
      for (const match of unspaced) {
        diags.push({
          rule: "formatting.poetry-slash",
          severity: "info",
          paragraph: para.index,
          message: 'Poetry line breaks should use spaced slashes: " / " not "/".',
          sourceText: text,
          offset: match.index,
          length: match[0].length
        });
        break;
      }
    }
  }
  return diags;
}
function checkDoubleSpaces(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    const idx = text.indexOf("  ");
    if (idx !== -1) {
      diags.push({
        rule: "formatting.no-double-spaces",
        severity: "warning",
        paragraph: para.index,
        message: "Do not use two spaces after a period, or anywhere else.",
        sourceText: text,
        offset: idx,
        length: 2,
        fix: { oldText: "  ", newText: " ", offset: idx }
      });
    }
  }
  return diags;
}
function checkAbbreviationPeriods(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    const stripped = stripTitleText(para);
    const matches = [
      ...stripped.matchAll(/\b(U\.S\.A?\.|U\.K\.|U\.N\.|E\.U\.)/g)
    ];
    for (const match of matches) {
      const without = match[1].replace(/\./g, "");
      diags.push({
        rule: "formatting.no-abbreviation-periods",
        severity: "warning",
        paragraph: para.index,
        message: `Omit periods in "${match[1]}". Use "${without}" instead, since periods often cause confusion over the end of a sentence.`,
        sourceText: para.rawText,
        offset: match.index,
        length: match[1].length,
        fix: { oldText: match[1], newText: without, offset: match.index }
      });
    }
  }
  return diags;
}
function checkBceCeSystem(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    const text = para.rawText;
    const stripped = stripTitleText(para);
    const bceMatch = stripped.match(/\b(\d+)\s+BC\b(?!E)/) || stripped.match(/\bAD\s+(\d+)\b/) || stripped.match(/\b(\d+)\s+AD\b/);
    if (bceMatch) {
      const matchText = bceMatch[0];
      const year = bceMatch[1];
      let fixNew;
      if (/BC$/i.test(matchText)) {
        fixNew = `${year} BCE`;
      } else {
        fixNew = `${year} CE`;
      }
      diags.push({
        rule: "formatting.bce-ce-system",
        severity: "warning",
        paragraph: para.index,
        message: "Use the BCE/CE system for years instead of BC/AD.",
        sourceText: text,
        offset: bceMatch.index,
        length: bceMatch[0].length,
        fix: {
          oldText: matchText,
          newText: fixNew,
          offset: bceMatch.index
        }
      });
    }
  }
  return diags;
}
function checkLatinAbbreviations(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    const text = stripTitleText(para);
    const latinAbbrevs = [
      [/\be\.g\./gi, 'Use "for example" or "such as" instead of "e.g."'],
      [/\bi\.e\./gi, 'Use "that is" instead of "i.e."'],
      [/\betc\./gi, 'Avoid "etc." — be specific'],
      [/\bviz\./gi, 'Use "namely" instead of "viz."'],
      [/\bcf\./gi, 'Use "compare" or "see" instead of "cf."']
    ];
    for (const [re, msg] of latinAbbrevs) {
      const m = text.match(re);
      if (m) {
        diags.push({
          rule: "formatting.no-latin-abbrev",
          severity: "warning",
          paragraph: para.index,
          message: msg,
          sourceText: para.rawText,
          offset: m.index,
          length: m[0].length
        });
      }
    }
  }
  return diags;
}
function checkPunctuationInsideQuotes(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "non-answer")) {
    const text = para.rawText;
    if (/^\s*<[^>]+>/.test(text)) continue;
    const withoutPron = text.replace(/\("[^"]*"\)/g, "").replace(/\(\u201c[^\u201d]*\u201d\)/g, "");
    const piqMatch = withoutPron.match(new RegExp('(?<![?!])[\\u201d"][.,]'));
    if (piqMatch) {
      const origMatch = text.match(new RegExp('(?<![?!])[\\u201d"][.,]'));
      diags.push({
        rule: "formatting.punctuation-inside-quotes",
        severity: "info",
        paragraph: para.index,
        message: "Commas and periods should go inside closing quotation marks (American style).",
        sourceText: text,
        offset: origMatch ? origMatch.index : void 0,
        length: origMatch ? 2 : void 0
      });
    }
  }
  return diags;
}
const isPronunciationGuideOpening = (text) => /^\([""\u201c]/.test(text);
const isPronunciationGuideClosing = (text) => /[""\u201d]\)$/.test(text);
const isInstructionDirectiveOpening = (text) => /^\[(emphasize|prompt on|or equivalent|do not (accept|prompt))/i.test(text);
const isInstructionDirectiveClosing = (text) => /(emphasize|prompt on|or equivalent|do not (accept|prompt))[^\]]*\]$/i.test(
  text
);
function findFormatBleeding(packet, underlineOnly) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet)) {
    let charPos = 0;
    for (let i = 0; i < para.runs.length; i++) {
      const run = para.runs[i];
      const hasFormatting = run.bold || run.underline || run.italic;
      if (!hasFormatting) {
        charPos += run.text.length;
        continue;
      }
      if (underlineOnly !== run.underline) {
        charPos += run.text.length;
        continue;
      }
      const hasLeadingSpace = run.text.length > 0 && run.text[0] === " ";
      const hasTrailingSpace = run.text.length > 0 && run.text[run.text.length - 1] === " ";
      const prevRun = i > 0 ? para.runs[i - 1] : null;
      const nextRun = i < para.runs.length - 1 ? para.runs[i + 1] : null;
      const wouldRemainFormatted = (adjacentRun, _checkType) => {
        if (!adjacentRun) return false;
        if (run.bold && !adjacentRun.bold) return false;
        if (run.underline && !adjacentRun.underline) return false;
        if (run.italic && !adjacentRun.italic) return false;
        return true;
      };
      const isPureWhitespace = /^\s+$/.test(run.text);
      const isNextToPronunciationGuideOpening = hasTrailingSpace && nextRun && isPronunciationGuideOpening(nextRun.text);
      const isNextToPronunciationGuideClosing = hasLeadingSpace && prevRun && isPronunciationGuideClosing(prevRun.text);
      const isNextToInstructionDirectiveOpening = hasTrailingSpace && isPureWhitespace && nextRun && isInstructionDirectiveOpening(nextRun.text);
      const isNextToInstructionDirectiveClosing = hasLeadingSpace && isPureWhitespace && prevRun && isInstructionDirectiveClosing(prevRun.text);
      const shouldFlagLeading = hasLeadingSpace && !wouldRemainFormatted(prevRun) && !isNextToPronunciationGuideClosing && !isNextToInstructionDirectiveClosing;
      const shouldFlagTrailing = hasTrailingSpace && !wouldRemainFormatted(nextRun) && !isNextToPronunciationGuideOpening && !isNextToInstructionDirectiveOpening;
      if (shouldFlagLeading || shouldFlagTrailing) {
        const formatTypes = [];
        if (run.bold) formatTypes.push("bold");
        if (run.underline) formatTypes.push("underline");
        if (run.italic) formatTypes.push("italic");
        const formatDesc = formatTypes.join("/");
        const spaceType = shouldFlagLeading ? shouldFlagTrailing ? "leading and trailing" : "leading" : "trailing";
        const spaceOffset = shouldFlagLeading ? charPos : charPos + run.text.length - 1;
        const ranges = [];
        if (shouldFlagLeading) {
          ranges.push({ offset: charPos, length: 1 });
        }
        if (shouldFlagTrailing) {
          ranges.push({ offset: charPos + run.text.length - 1, length: 1 });
        }
        diags.push({
          rule: underlineOnly ? "formatting.no-format-bleeding-underline" : "formatting.no-format-bleeding",
          severity: underlineOnly ? "warning" : "info",
          paragraph: para.index,
          message: `Formatting (${formatDesc}) should not include ${spaceType} spaces.`,
          sourceText: para.rawText,
          offset: spaceOffset,
          length: 1,
          formatFix: { ranges }
        });
      }
      charPos += run.text.length;
    }
  }
  return diags;
}
function checkFormattingBleeding(packet) {
  return findFormatBleeding(packet, false);
}
function checkFormattingBleedingUnderline(packet) {
  return findFormatBleeding(packet, true);
}
const formattingRules = [
  checkSmartQuotes,
  checkEmDash,
  checkSpellOutNumbers,
  checkNoAmpersand,
  checkPoetrySlash,
  checkLatinAbbreviations,
  checkDoubleSpaces,
  checkSubscriptSuperscript,
  checkAbbreviationPeriods,
  checkBceCeSystem,
  checkPunctuationInsideQuotes,
  checkFormattingBleeding,
  checkFormattingBleedingUnderline
];
const VALID_CATEGORIES = /* @__PURE__ */ new Set([
  // Literature by region
  "American Literature",
  "British Literature",
  "Classical Literature",
  "European Literature",
  "World Literature",
  "Other Literature",
  // Literature by genre
  "Drama",
  "Poetry",
  "Long Fiction",
  "Short Fiction",
  "Misc. Literature",
  "Misc Literature",
  // History
  "American History",
  "Ancient History",
  "British History",
  "European History",
  "World History",
  "Other History",
  "Historiography",
  "Archaeology",
  // Science
  "Biology",
  "Chemistry",
  "Physics",
  "Math",
  "Astronomy",
  "Computer Science",
  "Earth Science",
  "Engineering",
  "Other Science",
  // Arts
  "Painting",
  "Sculpture",
  "Painting and Sculpture",
  "Painting & Sculpture",
  "Music",
  "Classical Music",
  "Other Fine Arts",
  "Other Arts",
  "Architecture",
  "Photography",
  "Film",
  "Jazz",
  "Opera",
  "Dance",
  "Auditory Fine Arts",
  "Visual Fine Arts",
  "Visual Arts",
  // RMPSS
  "Religion",
  "Mythology",
  "Philosophy",
  "Social Science",
  "Economics",
  "Psychology",
  "Linguistics",
  "Sociology",
  "Anthropology",
  // RMPSS compound
  "Beliefs",
  // Other
  "Current Events",
  "Geography",
  "Other Academic",
  "Trash",
  "Popular Culture",
  "Pop Culture",
  // Compound / variant categories used across tournaments
  "Math/Computer Science",
  "Ancient/Other History",
  "Modern World",
  "British/Commonwealth Literature",
  "Other Visual Fine Arts",
  "Other Auditory Fine Arts",
  "Other Science (Computer Science)",
  "Other Science (Astronomy)"
]);
const WEASEL_WORDS = [
  "famous",
  "famously",
  "notable",
  "well-known",
  "well known",
  "best known",
  "best-known",
  "important",
  "iconic",
  "renowned",
  "prominent"
];
const WORD_REPLACEMENTS = {
  "as well as": "and",
  employ: "use",
  execute: "do/carry out",
  following: "after",
  "in order to": "to",
  "located in": "in",
  possess: "have",
  sans: "without",
  upon: "on",
  utilize: "use",
  utilizes: "uses",
  utilized: "used",
  utilizing: "using",
  utilization: "use"
};
const CONTRACTION_RE = /\b(can't|won't|shouldn't|couldn't|wouldn't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|hasn't|haven't|hadn't|I'm|I've|I'll|I'd|he's|she's|it's|we're|we've|we'll|they're|they've|they'll|there's|that's|who's|what's|where's|how's|let's)\b/gi;
function stripEditorialSuffix(text) {
  return text.replace(EDITORIAL_SUFFIX, "");
}
function extractBaseCategory(category) {
  const colonIdx = category.indexOf(":");
  if (colonIdx !== -1) return category.substring(0, colonIdx).trim();
  const dashIdx = category.indexOf(" - ");
  if (dashIdx !== -1) return category.substring(0, dashIdx).trim();
  const parenIdx = category.indexOf("(");
  if (parenIdx > 0) return category.substring(0, parenIdx).trim();
  return category;
}
function extractTagCategory(tagRawText) {
  const text = stripEditorialSuffix(tagRawText.trim());
  const match = text.match(TAG_WITH_AUTHOR);
  const catOnlyMatch = !match ? text.match(TAG_CATEGORY_ONLY) : null;
  if (!match && !catOnlyMatch) return null;
  return match ? match[2].trim() : catOnlyMatch[1].trim();
}
function checkTagExists(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    if (!q.tag) {
      diags.push({
        rule: "tag.tag-present",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: `${q.type === "tossup" ? "Tossup" : "Bonus"} ${q.number} has no tag line.`
      });
    }
  }
  return diags;
}
function checkTagFormat(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    if (!q.tag) continue;
    const rawText = q.tag.rawText.trim();
    const text = stripEditorialSuffix(rawText);
    if (!TAG_WITH_AUTHOR.test(text) && !TAG_CATEGORY_ONLY.test(text)) {
      diags.push({
        rule: "tag.tag-format",
        severity: "warning",
        paragraph: q.tag.index,
        message: `Tag "${rawText}" does not match expected format <Author, Category> or <Category>.`
      });
    }
  }
  return diags;
}
function checkNestedAngleBrackets(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    if (!q.tag) continue;
    const rawText = q.tag.rawText.trim();
    const inner = rawText.replace(EDITORIAL_SUFFIX, "");
    const openBracket = inner.indexOf("<");
    if (openBracket === -1) continue;
    const afterFirst = inner.substring(openBracket + 1);
    if (afterFirst.includes("<") || afterFirst.indexOf(">") < afterFirst.lastIndexOf(">")) {
      diags.push({
        rule: "tag.no-nested-brackets",
        severity: "error",
        paragraph: q.tag.index,
        message: `Tag contains nested angle brackets, which will break downstream parsers: "${rawText}".`,
        sourceText: rawText
      });
    }
  }
  return diags;
}
function checkValidCategory(packet) {
  const diags = [];
  for (const q of allQuestions(packet)) {
    if (!q.tag) continue;
    const category = extractTagCategory(q.tag.rawText);
    if (!category) continue;
    const baseCategory = extractBaseCategory(category);
    if (!VALID_CATEGORIES.has(baseCategory)) {
      diags.push({
        rule: "tag.valid-category",
        severity: "warning",
        paragraph: q.tag.index,
        message: `Base category "${baseCategory}" is not a standard QMOS category.`
      });
    }
  }
  return diags;
}
function checkConsistentCategories(packet) {
  const diags = [];
  const categoryVariants = /* @__PURE__ */ new Map();
  for (const q of allQuestions(packet)) {
    if (!q.tag) continue;
    const text = stripEditorialSuffix(q.tag.rawText.trim());
    const match = text.match(TAG_WITH_AUTHOR);
    const catOnlyMatch = !match ? text.match(TAG_CATEGORY_ONLY) : null;
    if (!match && !catOnlyMatch) continue;
    const category = match ? match[2].trim() : catOnlyMatch[1].trim();
    const normalized = category.toLowerCase();
    if (!categoryVariants.has(normalized)) {
      categoryVariants.set(normalized, []);
    }
    const variants = categoryVariants.get(normalized);
    if (!variants.includes(category)) {
      variants.push(category);
    }
  }
  for (const [, variants] of categoryVariants) {
    if (variants.length > 1) {
      diags.push({
        rule: "tag.consistent-categories",
        severity: "warning",
        paragraph: 0,
        message: `Inconsistent category naming: ${variants.map((v) => `"${v}"`).join(" vs ")}. Pick one and use it consistently.`
      });
    }
  }
  return diags;
}
const tagRules = [
  checkTagExists,
  checkTagFormat,
  checkNestedAngleBrackets,
  checkValidCategory,
  checkConsistentCategories
];
function checkContractions(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "text-only")) {
    const text = stripTitleText(para);
    const matches = [...text.matchAll(CONTRACTION_RE)];
    for (const match of matches) {
      const offset = findOffsetInRawText(para.rawText, match[1], match.index);
      diags.push(
        createDiagnostic(
          "writing.no-contractions",
          para,
          `Avoid contraction "${match[1]}". Spell it out.`,
          {
            offset: offset !== -1 ? offset : match.index,
            length: match[1].length
          }
        )
      );
    }
  }
  return diags;
}
const WEASEL_WORD_PATTERNS = new Map(
  WEASEL_WORDS.map((word) => [
    word,
    new RegExp(`\\b${word.replace(/-/g, "[-\\s]?")}\\b`, "gi")
  ])
);
function checkWeaselWords(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "text-only")) {
    const stripped = stripTitleText(para);
    for (const word of WEASEL_WORDS) {
      const re = WEASEL_WORD_PATTERNS.get(word);
      re.lastIndex = 0;
      const m = stripped.match(re);
      if (m) {
        const offset = findOffsetInRawText(para.rawText, m[0]);
        diags.push(
          createDiagnostic(
            "writing.no-weasel-words",
            para,
            `Avoid "${word}" — if it appears in quizbowl, it's already notable.`,
            {
              severity: "info",
              offset: offset !== -1 ? offset : void 0,
              length: m[0].length
            }
          )
        );
        break;
      }
    }
  }
  return diags;
}
const UPON_PHRASAL_VERBS = /\b(called|stumbled|relied|based|bestow(?:ed)?|confer(?:red)?|impose[ds]?|inflict(?:ed)?|look(?:ed|ing)?|act(?:ed|ing)?|draw[ns]?|built?|expand(?:ed|ing)?|improv(?:e[ds]?|ing)|decided?|agree[ds]?|embark(?:ed|ing)?|depend(?:ed|s|ing)?|hit|come|came|happen(?:ed|s)?|chance[ds]?|settle[ds]?|insist(?:ed|s|ing)?|enter(?:ed)?|seize[ds]?|descend(?:ed)?|reflect(?:ed|ing)?|verge[ds]?)\s+upon\b/i;
const WORD_REPLACEMENT_PATTERNS = new Map(
  Object.keys(WORD_REPLACEMENTS).map((bad) => [
    bad,
    new RegExp(`\\b${bad}\\b`, "gi")
  ])
);
function checkWordReplacements(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "text-only")) {
    const text = stripTitleText(para);
    for (const [bad, good] of Object.entries(WORD_REPLACEMENTS)) {
      if (bad === "following") {
        if (/\bthe following\b/i.test(text)) continue;
        if (/\banswer the following\b/i.test(text)) continue;
        if (/\b(was|were|is|are)\s+following\b/i.test(text)) continue;
        if (/\bfollowing\s+(the|this|that|a|an)\s+(same|similar|method|approach|pattern|model|technique|procedure)\b/i.test(
          text
        ))
          continue;
      }
      if (bad === "upon") {
        if (UPON_PHRASAL_VERBS.test(text)) continue;
        if (/\bupon\s+[a-z]+ing\b/i.test(text)) continue;
      }
      const re = WORD_REPLACEMENT_PATTERNS.get(bad);
      re.lastIndex = 0;
      const matches = [...text.matchAll(re)];
      const flaggable = matches.filter((m) => {
        const matched = m[0];
        if (matched[0] === matched[0].toLowerCase()) return true;
        const before = text.substring(0, m.index);
        return /(?:^|[.!?]\s*)$/.test(before.trimEnd());
      });
      if (flaggable.length > 0) {
        const first = flaggable[0];
        const offset = findOffsetInRawText(para.rawText, first[0], first.index);
        diags.push(
          createDiagnostic(
            "writing.word-replacements",
            para,
            `Consider replacing "${bad}" with "${good}".`,
            {
              severity: "info",
              offset: offset !== -1 ? offset : void 0,
              length: first[0].length
            }
          )
        );
      }
    }
  }
  return diags;
}
function checkAbsoluteTime(packet) {
  const diags = [];
  const relativeTime = /\b(recently|last year|this year|last month|currently|presently|nowadays|at present|to date)\b/gi;
  for (const para of getQuestionParagraphs(packet, "text-only")) {
    const stripped = stripTitleText(para);
    const matches = [...stripped.matchAll(relativeTime)];
    for (const match of matches) {
      const word = match[1].toLowerCase();
      if (word === "to date") {
        const before = stripped.substring(
          Math.max(0, match.index - 15),
          match.index
        );
        if (/\bto\s*$/i.test(before)) continue;
      }
      if (word === "this year" || word === "last year") {
        const before = stripped.substring(
          Math.max(0, match.index - 20),
          match.index
        );
        const after = stripped.substring(
          match.index + match[1].length,
          match.index + match[1].length + 20
        );
        if (/\b(in|during|of|from|since)\s*$/i.test(before)) continue;
        if (/\b(name|what|identify)\b/i.test(before) || /\b(name|what|identify)\b/i.test(after))
          continue;
      }
      if (word === "recently") {
        const context = stripped.substring(
          Math.max(0, match.index - 50),
          match.index + match[1].length + 50
        );
        if (/\b(had|was|were|did|became|moved|wrote|created|established|founded)\s+(recently\s+)?(moved|stepped|emerged|opened)/i.test(
          context
        ))
          continue;
      }
      const offset = findOffsetInRawText(para.rawText, match[1], match.index);
      diags.push({
        rule: "writing.absolute-time",
        severity: "warning",
        paragraph: para.index,
        message: `Use absolute dates instead of "${match[1]}".`,
        sourceText: para.rawText,
        offset: offset !== -1 ? offset : match.index,
        length: match[1].length
      });
    }
  }
  return diags;
}
function checkAnswerSomeQuestions(packet) {
  const diags = [];
  for (const q of packet.bonuses) {
    const text = q.numberParagraph.rawText;
    const asqMatch = text.match(/\banswer\s+some\s+questions?\s+about\b/i);
    if (asqMatch) {
      const matched = asqMatch[0];
      const startsUpper = matched[0] === matched[0].toUpperCase();
      const replacement = startsUpper ? "Answer the following about" : "answer the following about";
      diags.push({
        rule: "writing.answer-some-questions",
        severity: "warning",
        paragraph: q.numberParagraph.index,
        message: 'Use "Answer the following about" instead of "Answer some questions about".',
        sourceText: text,
        offset: asqMatch.index,
        length: asqMatch[0].length,
        fix: {
          oldText: matched,
          newText: replacement,
          offset: asqMatch.index
        }
      });
    }
  }
  return diags;
}
function checkWouldGoOnTo(packet) {
  const diags = [];
  for (const para of getQuestionParagraphs(packet, "text-only")) {
    const text = stripTitleText(para);
    const wgotMatch = text.match(/\bwould\s+go\s+on\s+to\b/i);
    if (wgotMatch) {
      const offset = findOffsetInRawText(para.rawText, wgotMatch[0]);
      diags.push({
        rule: "writing.would-go-on-to",
        severity: "info",
        paragraph: para.index,
        message: 'Avoid "would go on to." Use simple past tense instead (e.g. "He wrote" not "He would go on to write").',
        sourceText: para.rawText,
        offset: offset !== -1 ? offset : wgotMatch.index,
        length: wgotMatch[0].length
      });
    }
    const wotMatch = text.match(/\bwent\s+on\s+to\b/i);
    if (wotMatch) {
      const offset = findOffsetInRawText(para.rawText, wotMatch[0]);
      diags.push({
        rule: "writing.would-go-on-to",
        severity: "info",
        paragraph: para.index,
        message: 'Avoid "went on to." Use simple past tense instead (e.g. "He wrote" not "He went on to write").',
        sourceText: para.rawText,
        offset: offset !== -1 ? offset : wotMatch.index,
        length: wotMatch[0].length
      });
    }
  }
  return diags;
}
const writingRules = [
  checkContractions,
  checkWeaselWords,
  checkWordReplacements,
  checkAbsoluteTime,
  checkAnswerSomeQuestions,
  checkWouldGoOnTo
];
const allRules = [
  ...packetRules,
  ...questionRules,
  ...answerlineRules,
  ...pronunciationRules,
  ...formattingRules,
  ...tagRules,
  ...writingRules
];
const PACKET_STRUCTURE_RULES = /* @__PURE__ */ new Set([
  "packet.section-headers",
  "packet.section-order",
  "packet.question-numbering",
  "packet.numbering-sequence",
  "packet.no-bold-numbers",
  "packet.blank-paragraphs",
  "packet.expected-count",
  "tag.consistent-categories"
]);
function lint(packet, disabledRules) {
  const diagnostics = [];
  for (const rule of allRules) {
    const results = rule(packet);
    for (const d of results) {
      if (disabledRules && disabledRules.has(d.rule)) continue;
      if (!packet.structured && PACKET_STRUCTURE_RULES.has(d.rule)) continue;
      diagnostics.push(d);
    }
  }
  diagnostics.sort((a, b) => a.paragraph - b.paragraph);
  enrichDiagnostics(diagnostics, packet);
  return diagnostics;
}
const ANSWER_PREVIEW_MAX = 60;
function extractAnswerText(q) {
  const answers = [];
  if (q.type === "tossup" && q.answerLine) {
    answers.push(truncateAnswer(q.answerLine.rawText));
  } else if (q.type === "bonus") {
    for (const part of q.parts) {
      if (part.answerLine) {
        answers.push(truncateAnswer(part.answerLine.rawText));
      }
    }
  }
  return answers;
}
function truncateAnswer(raw) {
  let text = raw.replace(/^\s*ANSWER:\s*/i, "").trim();
  const bracketIdx = text.indexOf("[");
  if (bracketIdx !== -1) {
    text = text.substring(0, bracketIdx).trim();
  }
  if (text.length > ANSWER_PREVIEW_MAX) {
    text = text.substring(0, ANSWER_PREVIEW_MAX) + "…";
  }
  return text;
}
function enrichDiagnostics(diagnostics, packet) {
  const paraToQuestion = /* @__PURE__ */ new Map();
  for (const q of packet.tossups) {
    const label = `T${q.number}`;
    const answers = extractAnswerText(q);
    for (const p of q.paragraphs) {
      paraToQuestion.set(p.index, { label, answers });
    }
  }
  for (const q of packet.bonuses) {
    const label = `B${q.number}`;
    const answers = extractAnswerText(q);
    for (const p of q.paragraphs) {
      paraToQuestion.set(p.index, { label, answers });
    }
  }
  for (const d of diagnostics) {
    const info = paraToQuestion.get(d.paragraph);
    if (info) {
      d.questionLabel = info.label;
      d.answerPreview = info.answers.join(" / ");
    }
  }
}
const RULE_REGISTRY = [
  // packet (8 rules)
  {
    id: "packet.section-headers",
    category: "packet",
    description: "Tossups/Bonuses section headers present",
    defaultSeverity: "error"
  },
  {
    id: "packet.section-order",
    category: "packet",
    description: "Tossups section appears before Bonuses",
    defaultSeverity: "error"
  },
  {
    id: "packet.question-numbering",
    category: "packet",
    description: "Questions numbered sequentially",
    defaultSeverity: "warning"
  },
  {
    id: "packet.no-bold-numbers",
    category: "packet",
    description: "Question numbers should not be bold",
    defaultSeverity: "info"
  },
  {
    id: "packet.blank-paragraphs",
    category: "packet",
    description: "No consecutive blank paragraphs",
    defaultSeverity: "info"
  },
  {
    id: "packet.expected-count",
    category: "packet",
    description: "Expected number of tossups and bonuses",
    defaultSeverity: "warning"
  },
  {
    id: "packet.numbering-sequence",
    category: "packet",
    description: "Question numbers strictly increase",
    defaultSeverity: "error"
  },
  // question (15 rules)
  {
    id: "question.ftp-format",
    category: "question",
    description: "FTP clue formatting",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "question.ftpe-format",
    category: "question",
    description: "FTPE bonus formatting",
    defaultSeverity: "warning"
  },
  {
    id: "question.bonus-part-marker",
    category: "question",
    description: "Bonus part value markers present",
    defaultSeverity: "error"
  },
  {
    id: "question.power-mark",
    category: "question",
    description: "Power mark formatting",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "question.missing-answer",
    category: "question",
    description: "Every question has an answer line",
    defaultSeverity: "error"
  },
  {
    id: "question.bonus-leadin-punctuation",
    category: "question",
    description: "Bonus lead-in punctuation",
    defaultSeverity: "warning"
  },
  {
    id: "question.bonus-difficulty-spread",
    category: "question",
    description: "Bonus difficulty value spread",
    defaultSeverity: "warning"
  },
  {
    id: "question.no-ftp-midsentence",
    category: "question",
    description: "FTP not mid-sentence",
    defaultSeverity: "warning"
  },
  {
    id: "question.note-formatting",
    category: "question",
    description: "Pre-question and moderator note formatting",
    defaultSeverity: "info"
  },
  {
    id: "question.multiline-answer",
    category: "question",
    description: "Answer lines must be single paragraph",
    defaultSeverity: "error"
  },
  {
    id: "question.bonus-part-order",
    category: "question",
    description: "Bonus parts interleaved with answers",
    defaultSeverity: "error"
  },
  {
    id: "question.post-question-note-sentence",
    category: "question",
    description: "Post-question notes styled as sentences",
    defaultSeverity: "warning"
  },
  {
    id: "question.separate-note-paragraph",
    category: "question",
    description: "Pre-question notes inline with question text",
    defaultSeverity: "warning"
  },
  {
    id: "question.missing-pronoun",
    category: "question",
    description: "Clue sentence or FTP references the answer with a pronoun",
    defaultSeverity: "info"
  },
  // answerline (16 rules)
  {
    id: "answerline.answer-prefix",
    category: "answerline",
    description: "ANSWER: prefix format",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "answerline.answer-formatting",
    category: "answerline",
    description: "Answer has required bold/underline",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.bracket-balance",
    category: "answerline",
    description: "Brackets are balanced",
    defaultSeverity: "error"
  },
  {
    id: "answerline.directive-typo",
    category: "answerline",
    description: "No typos in accept/prompt/reject",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.accept-formatting",
    category: "answerline",
    description: "Accept directive formatting",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.prompt-formatting",
    category: "answerline",
    description: "Prompt directive formatting",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.reject-quotes",
    category: "answerline",
    description: "Reject directive quoting",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.prompt-question-quotes",
    category: "answerline",
    description: "Prompt question in quotes",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.prompt-with-not-by-asking",
    category: "answerline",
    description: "Directed prompts use 'by asking' not 'with'",
    defaultSeverity: "info"
  },
  {
    id: "answerline.prompt-partial-answers",
    category: "answerline",
    description: "Avoid 'prompt on partial answers'",
    defaultSeverity: "info"
  },
  {
    id: "answerline.post-notes",
    category: "answerline",
    description: "Post-note formatting",
    defaultSeverity: "info"
  },
  {
    id: "answerline.deprecated-directive",
    category: "answerline",
    description: "No deprecated directives",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "answerline.no-parenthetical-optional",
    category: "answerline",
    description: "No parenthetical optional text",
    defaultSeverity: "info"
  },
  {
    id: "answerline.no-nonstandard-prefix",
    category: "answerline",
    description: "No nonstandard answer prefixes (Ans:, Answer.)",
    defaultSeverity: "error",
    autoFixable: true
  },
  {
    id: "answerline.directive-separator",
    category: "answerline",
    description: "Directives after first separated by semicolon",
    defaultSeverity: "warning"
  },
  {
    id: "answerline.reject-no-alone",
    category: "answerline",
    description: 'No "alone" after quoted reject directive',
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "answerline.directive-brackets",
    category: "answerline",
    description: "Directives must use square brackets, not parentheses",
    defaultSeverity: "error",
    autoFixable: true
  },
  // pronunciation (4 rules)
  {
    id: "pronunciation.paren-delimiter",
    category: "pronunciation",
    description: "Pronunciation guide delimiters",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "pronunciation.trailing-punct",
    category: "pronunciation",
    description: "No trailing punctuation in guides",
    defaultSeverity: "warning"
  },
  {
    id: "pronunciation.quotes-required",
    category: "pronunciation",
    description: "Pronunciation guides must have quotes",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "pronunciation.possessive-ending",
    category: "pronunciation",
    description: "PG after possessive ends with 's, s, or z",
    defaultSeverity: "warning"
  },
  // formatting (12 rules)
  {
    id: "formatting.smart-quotes",
    category: "formatting",
    description: "Use smart (curly) quotes",
    defaultSeverity: "info"
  },
  {
    id: "formatting.no-em-dash",
    category: "formatting",
    description: "Use en dashes, not em dashes",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "formatting.no-sub-superscript",
    category: "formatting",
    description: "No subscript/superscript",
    defaultSeverity: "info"
  },
  {
    id: "formatting.spell-out-small-numbers",
    category: "formatting",
    description: "Spell out numbers under 10",
    defaultSeverity: "info"
  },
  {
    id: "formatting.no-ampersand",
    category: "formatting",
    description: "No ampersands in text",
    defaultSeverity: "warning"
  },
  {
    id: "formatting.poetry-slash",
    category: "formatting",
    description: "Poetry line break slash formatting",
    defaultSeverity: "warning"
  },
  {
    id: "formatting.no-double-spaces",
    category: "formatting",
    description: "No double spaces",
    defaultSeverity: "info",
    autoFixable: true
  },
  {
    id: "formatting.no-abbreviation-periods",
    category: "formatting",
    description: "No periods in abbreviations",
    defaultSeverity: "info",
    autoFixable: true
  },
  {
    id: "formatting.bce-ce-system",
    category: "formatting",
    description: "Use BCE/CE date system",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "formatting.no-latin-abbrev",
    category: "formatting",
    description: "No Latin abbreviations (e.g., i.e.)",
    defaultSeverity: "warning"
  },
  {
    id: "formatting.punctuation-inside-quotes",
    category: "formatting",
    description: "Punctuation inside quotation marks",
    defaultSeverity: "warning"
  },
  {
    id: "formatting.no-format-bleeding",
    category: "formatting",
    description: "No formatting on leading/trailing spaces (bold/italic)",
    defaultSeverity: "info",
    autoFixable: true
  },
  {
    id: "formatting.no-format-bleeding-underline",
    category: "formatting",
    description: "No underline formatting on leading/trailing spaces",
    defaultSeverity: "warning",
    autoFixable: true
  },
  // tag (5 rules)
  {
    id: "tag.tag-present",
    category: "tag",
    description: "Author tag present on each question",
    defaultSeverity: "warning"
  },
  {
    id: "tag.tag-format",
    category: "tag",
    description: "Tag format: <Author, Category>",
    defaultSeverity: "warning"
  },
  {
    id: "tag.valid-category",
    category: "tag",
    description: "Category is recognized",
    defaultSeverity: "warning"
  },
  {
    id: "tag.no-nested-brackets",
    category: "tag",
    description: "No nested angle brackets in tags",
    defaultSeverity: "error"
  },
  {
    id: "tag.consistent-categories",
    category: "tag",
    description: "Consistent tossup/bonus category pairing",
    defaultSeverity: "warning"
  },
  // writing (6 rules)
  {
    id: "writing.no-contractions",
    category: "writing",
    description: "No contractions in question text",
    defaultSeverity: "warning"
  },
  {
    id: "writing.no-weasel-words",
    category: "writing",
    description: "No weasel words (some, various, etc.)",
    defaultSeverity: "info"
  },
  {
    id: "writing.word-replacements",
    category: "writing",
    description: "Preferred word choices",
    defaultSeverity: "info"
  },
  {
    id: "writing.absolute-time",
    category: "writing",
    description: "No absolute time references (currently)",
    defaultSeverity: "warning"
  },
  {
    id: "writing.answer-some-questions",
    category: "writing",
    description: "No 'answer some questions'",
    defaultSeverity: "warning",
    autoFixable: true
  },
  {
    id: "writing.would-go-on-to",
    category: "writing",
    description: "No 'would go on to' phrasing",
    defaultSeverity: "warning"
  }
];
function insertCommentsForDiagnostics(diagnostics) {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  const numChildren = body.getNumChildren();
  const parIndexToElement = buildParagraphMap(body, numChildren);
  let inserted = 0;
  for (const d of diagnostics) {
    const element = parIndexToElement.get(d.paragraph);
    if (!element) continue;
    const commentText = formatCommentBody(d);
    const text = element.editAsText();
    const anchor = findAnchorPosition(text, d);
    try {
      const rangeBuilder = doc.newRange();
      if (anchor.offset >= 0 && anchor.length > 0) {
        rangeBuilder.addElement(
          text,
          anchor.offset,
          Math.min(anchor.offset + anchor.length - 1, text.getText().length - 1)
        );
      } else {
        rangeBuilder.addElement(element);
      }
      insertDriveComment(doc.getId(), commentText, element, anchor);
      inserted++;
    } catch {
    }
  }
  return inserted;
}
function buildParagraphMap(body, numChildren) {
  const map = /* @__PURE__ */ new Map();
  let paraIndex = 0;
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH || child.getType() === DocumentApp.ElementType.LIST_ITEM) {
      map.set(paraIndex, child.asParagraph());
      paraIndex++;
    }
  }
  return map;
}
function formatCommentBody(d) {
  let body = `[${d.rule}] ${d.message}`;
  if (d.suggestion) {
    body += `

Suggested fix: ${d.suggestion}`;
  } else if (d.fix) {
    body += `

Suggested fix: replace "${d.fix.oldText}" with "${d.fix.newText}"`;
  }
  return body;
}
function findAnchorPosition(text, d) {
  if (d.offset != null && d.length != null && d.length > 0) {
    return { offset: d.offset, length: d.length };
  }
  return { offset: 0, length: text.getText().length };
}
function insertDriveComment(docId, commentText, _element, anchor) {
  const quotedContent = _element.editAsText().getText().substring(anchor.offset, anchor.offset + Math.min(anchor.length, 100));
  const resource = {
    content: commentText,
    quotedFileContent: {
      value: quotedContent
    }
  };
  Drive.Comments.create(resource, docId, { fields: "id" });
}
const CROSS_PACKET_RULES = /* @__PURE__ */ new Set(["tag.consistent-categories"]);
function onOpen() {
  DocumentApp.getUi().createMenu("qbcheck").addItem("Lint packet", "showSidebar").addToUi();
}
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("Sidebar").setTitle("qbcheck").setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}
function runLint() {
  Logger.log("runLint: starting");
  const paragraphs = parseGoogleDoc();
  Logger.log("runLint: parsed " + paragraphs.length + " paragraphs");
  const packet = segmentPacket(paragraphs);
  Logger.log(
    "runLint: " + packet.tossups.length + " tossups, " + packet.bonuses.length + " bonuses"
  );
  const disabledRules = /* @__PURE__ */ new Set();
  for (const rule of CROSS_PACKET_RULES) {
    disabledRules.add(rule);
  }
  const savedDisabled = PropertiesService.getUserProperties().getProperty(
    "disabledRules"
  );
  if (savedDisabled) {
    for (const rule of JSON.parse(savedDisabled)) {
      disabledRules.add(rule);
    }
  }
  const diagnostics = lint(packet, disabledRules);
  Logger.log("runLint: found " + diagnostics.length + " diagnostics");
  const rulesMeta = RULE_REGISTRY.filter(
    (r) => !CROSS_PACKET_RULES.has(r.id)
  ).map((r) => ({ id: r.id, description: r.description }));
  return { diagnostics, rulesMeta };
}
function insertComments(selected) {
  return insertCommentsForDiagnostics(selected);
}
function saveDisabledRules(rules) {
  PropertiesService.getUserProperties().setProperty(
    "disabledRules",
    JSON.stringify(rules)
  );
}
function getDisabledRules() {
  const saved = PropertiesService.getUserProperties().getProperty("disabledRules");
  return saved ? JSON.parse(saved) : [];
}
