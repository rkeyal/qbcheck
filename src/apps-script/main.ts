import { parseGoogleDoc } from './parser.js';
import { segmentPacket } from '../core/segmenter.js';
import { lint, describeQuestion } from '../core/engine.js';
import { LintDiagnostic } from '../core/model.js';
import { RULE_REGISTRY, DEFAULT_DISABLED_RULES } from '../core/rule-registry.js';
import {
  applyFixForDiagnostic,
  applyFixesForDiagnostics,
  FixOutcome,
} from './fixes.js';
import { detectCurrentQuestion } from './question-detect.js';

const CROSS_PACKET_RULES = new Set(['tag.consistent-categories']);

/**
 * The set of rules to skip for a lint run: always the cross-packet rules (a
 * single Google Doc is one packet), plus the user's saved choices. When the
 * user has never saved settings, fall back to DEFAULT_DISABLED_RULES so a fresh
 * add-on install lints the same way as a fresh Chrome extension install.
 */
function computeDisabledRules(): Set<string> {
  const disabled = new Set<string>(CROSS_PACKET_RULES);
  const saved = PropertiesService.getUserProperties().getProperty(
    'disabledRules'
  );
  const rules: string[] = saved ? JSON.parse(saved) : DEFAULT_DISABLED_RULES;
  for (const rule of rules) {
    disabled.add(rule);
  }
  return disabled;
}

export function onOpen(
  _e?: GoogleAppsScript.Events.DocsOnOpen
): void {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Open sidebar', 'showSidebar')
    .addToUi();
}

/**
 * Runs once when a user installs the add-on. Building the menu here means it
 * appears immediately after install without the user having to reopen the
 * document. Google Workspace Marketplace editor add-ons are expected to provide
 * this trigger.
 */
export function onInstall(_e?: GoogleAppsScript.Events.AddonOnInstall): void {
  onOpen();
}

/** Rule metadata for the sidebar, excluding cross-packet-only rules. */
function buildRulesMeta(): {
  id: string;
  category: string;
  description: string;
}[] {
  return RULE_REGISTRY.filter((r) => !CROSS_PACKET_RULES.has(r.id)).map((r) => ({
    id: r.id,
    category: r.category,
    description: r.description,
  }));
}

/**
 * No-op the sidebar can call to warm the server runtime (load the script, start
 * an execution) so a subsequent real call — notably "jump to issue" — doesn't
 * pay the cold-start cost. The work is irrelevant; triggering the execution is
 * the point.
 */
export function warmUp(): void {
  // Intentionally empty.
}

export function showSidebar(): void {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('qbcheck')
    .setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}

export function runLint(): {
  diagnostics: LintDiagnostic[];
  rulesMeta: { id: string; category: string; description: string }[];
  questionStarts: number[];
} {
  Logger.log('runLint: starting');
  const paragraphs = parseGoogleDoc();
  Logger.log('runLint: parsed ' + paragraphs.length + ' paragraphs');
  const packet = segmentPacket(paragraphs);
  Logger.log(
    'runLint: ' + packet.tossups.length + ' tossups, ' +
      packet.bonuses.length + ' bonuses'
  );

  const diagnostics = lint(packet, computeDisabledRules());
  Logger.log('runLint: found ' + diagnostics.length + ' diagnostics');

  return {
    diagnostics,
    rulesMeta: buildRulesMeta(),
    questionStarts: collectQuestionStarts(packet),
  };
}

/**
 * Paragraph indices where each question begins, ascending. Sent to the sidebar
 * so "jump to issue" can aim at a question boundary in a single round-trip (see
 * revealNearIssue) without re-parsing the document.
 */
function collectQuestionStarts(packet: {
  tossups: { numberParagraph: { index: number } }[];
  bonuses: { numberParagraph: { index: number } }[];
}): number[] {
  const starts: number[] = [];
  for (const q of packet.tossups) starts.push(q.numberParagraph.index);
  for (const q of packet.bonuses) starts.push(q.numberParagraph.index);
  starts.sort((a, b) => a - b);
  return starts;
}

/** "Tossup 7" → "T7", "Bonus 12" → "B12", "Question 7" → "Q7". */
function shortQuestionLabel(label: string | null): string | null {
  if (!label) return null;
  const m = label.match(/^(Tossup|Bonus|Question)\s+(\d+)$/i);
  if (!m) return label;
  const kind = m[1].toLowerCase();
  const prefix = kind === 'tossup' ? 'T' : kind === 'bonus' ? 'B' : 'Q';
  return prefix + m[2];
}

export function lintCurrentQuestion(): {
  diagnostics: LintDiagnostic[];
  label: string | null;
  answerPreview: string;
  questionStarts: number[];
} | { error: string } {
  Logger.log('lintCurrentQuestion: starting');
  const detected = detectCurrentQuestion();

  if (!detected) {
    return { error: 'Place your cursor inside a question to lint it.' };
  }

  Logger.log(
    'lintCurrentQuestion: detected ' +
      detected.paragraphs.length +
      ' paragraphs, label=' +
      detected.label
  );

  const packet = segmentPacket(detected.paragraphs);

  const diagnostics = lint(packet, computeDisabledRules());
  Logger.log('lintCurrentQuestion: found ' + diagnostics.length + ' diagnostics');

  // detected.paragraphs is re-indexed from zero, so diagnostics reference
  // range-relative paragraph indices. Shift them back onto absolute document
  // indices so comment insertion anchors to the right paragraph.
  // (Assumes the segmenter did not split any paragraph in the range, which
  // holds for real Google Doc paragraphs — splits only occur on pasted text
  // where newlines were lost.)
  const adjusted = diagnostics.map((d) => ({
    ...d,
    paragraph: d.paragraph + detected.startIndex,
  }));

  // Question starts are range-relative too; shift onto absolute doc indices so
  // "jump to issue" can aim at the question boundary.
  const questionStarts = collectQuestionStarts(packet).map(
    (i) => i + detected.startIndex
  );

  // Describe the checked question for the sidebar (shown even when clean).
  // Use detected.label for the number (parsed from the "N." text) and the
  // segmented question for the answer preview.
  const question = packet.tossups[0] ?? packet.bonuses[0] ?? null;
  const answerPreview = question ? describeQuestion(question).answerPreview : '';

  return {
    diagnostics: adjusted,
    label: shortQuestionLabel(detected.label),
    answerPreview,
    questionStarts,
  };
}

/** Apply a single diagnostic's auto-fix directly to the document. */
export function applyFix(diag: LintDiagnostic): FixOutcome {
  return applyFixForDiagnostic(diag);
}

/**
 * Find the Nth paragraph/list-item, or the last one if `index` is past the end
 * (so a target index computed past the last question clamps to the document
 * end). Stops walking as soon as the target is reached — no full-document scan
 * for issues near the top.
 */
function paragraphAtOrLast(
  body: GoogleAppsScript.Document.Body,
  index: number
): GoogleAppsScript.Document.Paragraph | null {
  const numChildren = body.getNumChildren();
  let count = 0;
  let last: GoogleAppsScript.Document.Paragraph | null = null;
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();
    if (
      type === DocumentApp.ElementType.PARAGRAPH ||
      type === DocumentApp.ElementType.LIST_ITEM
    ) {
      last = child.asParagraph();
      if (count === index) return last;
      count++;
    }
  }
  return last;
}

/** Place the user's cursor at the start of a paragraph (by index), which scrolls it into view. */
function cursorToParagraph(paraIndex: number): {
  revealed: boolean;
  reason?: string;
} {
  const doc = DocumentApp.getActiveDocument();
  const para = paragraphAtOrLast(doc.getBody(), paraIndex);
  if (!para) {
    return { revealed: false, reason: 'Document has no paragraphs.' };
  }
  doc.setCursor(doc.newPosition(para.editAsText(), 0));
  return { revealed: true };
}

/** The paragraph index the user's cursor is currently in, or null if unknown. */
function currentCursorParagraphIndex(
  doc: GoogleAppsScript.Document.Document
): number | null {
  const cursor = doc.getCursor();
  if (!cursor) return null;

  // Walk up from the cursor's element to its containing paragraph/list-item.
  let el: GoogleAppsScript.Document.Element | null = cursor.getElement();
  while (
    el &&
    el.getType() !== DocumentApp.ElementType.PARAGRAPH &&
    el.getType() !== DocumentApp.ElementType.LIST_ITEM
  ) {
    el = el.getParent() as GoogleAppsScript.Document.Element | null;
  }
  if (!el) return null;

  const body = doc.getBody();
  const numChildren = body.getNumChildren();
  let count = 0;
  for (let i = 0; i < numChildren; i++) {
    const child = body.getChild(i);
    const type = child.getType();
    if (
      type === DocumentApp.ElementType.PARAGRAPH ||
      type === DocumentApp.ElementType.LIST_ITEM
    ) {
      if (body.getChildIndex(el) === i) return count;
      count++;
    }
  }
  return null;
}

/** The start of the question containing (or just before) `idx`; `idx` itself if none. */
function questionStartAtOrBefore(starts: number[], idx: number): number {
  let best = idx;
  for (const s of starts) {
    if (s <= idx) best = s;
    else break;
  }
  return best;
}

/**
 * The `n`-th question start after `idx` (n=1 is the next one). If fewer than `n`
 * remain, returns the furthest one that exists; if none do, returns a
 * past-the-end index (paragraphAtOrLast clamps it to the last paragraph).
 */
function questionStartAfter(starts: number[], idx: number, n = 1): number {
  const ahead = starts.filter((s) => s > idx);
  if (ahead.length === 0) return Number.MAX_SAFE_INTEGER;
  return ahead[Math.min(n, ahead.length) - 1];
}

/**
 * "Jump to issue" in a single server round-trip: frame the whole question at the
 * top of the viewport (no text highlight — the sidebar snippet points at the
 * exact span).
 *
 * Reading the cursor and moving it happen in the same execution, so we pick the
 * target by approach direction. A single setCursor pins to the viewport's bottom
 * edge when approached from above and the top edge when approached from below:
 *
 *   - Cursor BELOW the issue → aim at the issue's own question start. Approached
 *     from below, it lands at the TOP edge, so the question reads from the top.
 *   - Cursor ABOVE the issue (or unknown) → aim two question starts ahead.
 *     Approached from above, it lands at the BOTTOM edge; aiming two ahead
 *     (rather than one) leaves the issue's own question comfortably inside the
 *     viewport instead of hugging the bottom edge. Falls back to one ahead (or
 *     the document end) near the end of the packet.
 *
 * questionStarts comes from the sidebar (computed at lint time) so this call
 * doesn't re-parse the document.
 */
export function revealNearIssue(
  diag: LintDiagnostic,
  questionStarts: number[]
): { revealed: boolean; reason?: string } {
  const issueIdx = diag.paragraph;
  const doc = DocumentApp.getActiveDocument();
  const currentIdx = currentCursorParagraphIndex(doc);
  const targetIdx =
    currentIdx != null && currentIdx > issueIdx
      ? questionStartAtOrBefore(questionStarts, issueIdx)
      : questionStartAfter(questionStarts, issueIdx, 2);

  return cursorToParagraph(targetIdx);
}

/**
 * Apply every supplied auto-fix AND re-lint in a single execution — the
 * sidebar's "Fix all".
 *
 * The sidebar previously made two server round-trips (apply, then a separate
 * re-lint). Collapsing them into one call roughly halves the latency of "Fix
 * all": the client fires one `google.script.run`, and gets both the fix tally
 * and a fresh diagnostic list back together. Re-linting after fixing keeps the
 * displayed diagnostics (and their offsets) accurate.
 */
export function applyFixesAndRelint(
  diags: LintDiagnostic[],
  mode: 'doc' | 'question'
): {
  applied: number;
  failed: number;
  diagnostics: LintDiagnostic[];
  rulesMeta?: { id: string; category: string; description: string }[];
  label?: string | null;
  answerPreview?: string;
  questionStarts?: number[];
  error?: string;
} {
  const { applied, failed } = applyFixesForDiagnostics(diags);

  if (mode === 'question') {
    const result = lintCurrentQuestion();
    if ('error' in result) {
      return { applied, failed, diagnostics: [], error: result.error };
    }
    return {
      applied,
      failed,
      diagnostics: result.diagnostics,
      label: result.label,
      answerPreview: result.answerPreview,
      questionStarts: result.questionStarts,
    };
  }

  const result = runLint();
  return {
    applied,
    failed,
    diagnostics: result.diagnostics,
    rulesMeta: result.rulesMeta,
    questionStarts: result.questionStarts,
  };
}

export function saveDisabledRules(rules: string[]): void {
  PropertiesService.getUserProperties().setProperty(
    'disabledRules',
    JSON.stringify(rules)
  );
}

/**
 * Everything the settings panel needs in one round-trip: the rule list (with
 * categories, for grouping) and the user's currently disabled rules. The
 * sidebar prefetches this on load so opening settings is instant rather than
 * waiting on a server call each time.
 */
export function getSettings(): {
  rulesMeta: { id: string; category: string; description: string }[];
  disabledRules: string[];
} {
  const saved =
    PropertiesService.getUserProperties().getProperty('disabledRules');
  return {
    rulesMeta: buildRulesMeta(),
    disabledRules: saved ? JSON.parse(saved) : [...DEFAULT_DISABLED_RULES],
  };
}
