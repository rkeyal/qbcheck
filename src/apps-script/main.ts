import { parseGoogleDoc } from './parser.js';
import { segmentPacket } from '../core/segmenter.js';
import { lint } from '../core/engine.js';
import { LintDiagnostic } from '../core/model.js';
import { RULE_REGISTRY } from '../core/rule-registry.js';
import { insertCommentsForDiagnostics } from './comments.js';
import { detectCurrentQuestion } from './question-detect.js';

const CROSS_PACKET_RULES = new Set(['tag.consistent-categories']);

export function onOpen(): void {
  DocumentApp.getUi()
    .createMenu('qbcheck')
    .addItem('Lint packet', 'showSidebar')
    .addToUi();
}

export function showSidebar(): void {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('qbcheck')
    .setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}

export function runLint(): {
  diagnostics: LintDiagnostic[];
  rulesMeta: { id: string; description: string }[];
} {
  Logger.log('runLint: starting');
  const paragraphs = parseGoogleDoc();
  Logger.log('runLint: parsed ' + paragraphs.length + ' paragraphs');
  const packet = segmentPacket(paragraphs);
  Logger.log(
    'runLint: ' + packet.tossups.length + ' tossups, ' +
      packet.bonuses.length + ' bonuses'
  );

  const disabledRules = new Set<string>();
  for (const rule of CROSS_PACKET_RULES) {
    disabledRules.add(rule);
  }

  const savedDisabled = PropertiesService.getUserProperties().getProperty(
    'disabledRules'
  );
  if (savedDisabled) {
    for (const rule of JSON.parse(savedDisabled)) {
      disabledRules.add(rule);
    }
  }

  const diagnostics = lint(packet, disabledRules);
  Logger.log('runLint: found ' + diagnostics.length + ' diagnostics');

  const rulesMeta = RULE_REGISTRY.filter(
    (r) => !CROSS_PACKET_RULES.has(r.id)
  ).map((r) => ({ id: r.id, description: r.description }));

  return { diagnostics, rulesMeta };
}

export function lintCurrentQuestion(): {
  diagnostics: LintDiagnostic[];
  label: string | null;
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

  const disabledRules = new Set<string>();
  for (const rule of CROSS_PACKET_RULES) {
    disabledRules.add(rule);
  }

  const savedDisabled = PropertiesService.getUserProperties().getProperty(
    'disabledRules'
  );
  if (savedDisabled) {
    for (const rule of JSON.parse(savedDisabled)) {
      disabledRules.add(rule);
    }
  }

  const diagnostics = lint(packet, disabledRules);
  Logger.log('lintCurrentQuestion: found ' + diagnostics.length + ' diagnostics');

  return { diagnostics, label: detected.label };
}

export function insertComments(selected: LintDiagnostic[]): number {
  return insertCommentsForDiagnostics(selected);
}

export function saveDisabledRules(rules: string[]): void {
  PropertiesService.getUserProperties().setProperty(
    'disabledRules',
    JSON.stringify(rules)
  );
}

export function getDisabledRules(): string[] {
  const saved =
    PropertiesService.getUserProperties().getProperty('disabledRules');
  return saved ? JSON.parse(saved) : [];
}
