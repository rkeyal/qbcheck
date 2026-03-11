import { LintDiagnostic } from '../../src/core/model.js';
import { PopupController, PopupElements } from '../../src/popup/popup-controller.js';
import {
  PacketResult,
  QBLintSettings,
  SessionState,
} from '../../src/popup/popup-utils.js';
import { setupChromeMocks } from './setup.js';

/**
 * Test helpers for popup UI testing.
 *
 * These utilities help load the popup HTML, query elements, and create
 * test fixtures for diagnostics and settings.
 */

/**
 * Loads the popup HTML into the DOM and returns element references.
 * Call this in beforeEach() to get a fresh DOM for each test.
 */
export async function loadPopupHTML(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const htmlPath = path.join(process.cwd(), 'src', 'popup', 'popup.html');
  const html = await fs.readFile(htmlPath, 'utf-8');

  // Extract just the body content (skip <!DOCTYPE> and <html>/<head>)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error('Could not find <body> in popup.html');

  document.body.innerHTML = bodyMatch[1];
}

/**
 * Gets all DOM elements needed by PopupController.
 * Returns the full PopupElements interface for controller instantiation.
 */
export function getElements(): PopupElements {
  return {
    uploadArea: document.getElementById('upload-area')!,
    resultsArea: document.getElementById('results-area')!,
    fileInput: document.getElementById('file-input') as HTMLInputElement,
    folderInput: document.getElementById('folder-input') as HTMLInputElement,
    dropZone: document.getElementById('drop-zone')!,
    fileNameEl: document.getElementById('file-name')!,
    clearBtn: document.getElementById('clear-btn')!,
    countError: document.getElementById('count-error')!,
    countWarning: document.getElementById('count-warning')!,
    countInfo: document.getElementById('count-info')!,
    countIgnored: document.getElementById('count-ignored')!,
    statsBar: document.getElementById('stats-bar')!,
    filterCategory: document.getElementById(
      'filter-category'
    ) as HTMLSelectElement,
    diagnosticsList: document.getElementById('diagnostics-list')!,
    noIssues: document.getElementById('no-issues')!,
    packetNav: document.getElementById('packet-nav')!,
    prevBtn: document.getElementById('prev-btn') as HTMLButtonElement,
    nextBtn: document.getElementById('next-btn') as HTMLButtonElement,
    packetSelect: document.getElementById('packet-select') as HTMLSelectElement,
    packetCounter: document.getElementById('packet-counter')!,
    settingsBtn: document.getElementById('settings-btn')!,
    settingsView: document.getElementById('settings-view')!,
    settingsRules: document.getElementById('settings-rules')!,
    settingsBackBtn: document.getElementById('settings-back-btn')!,
    resetDefaultsBtn: document.getElementById('reset-defaults-btn')!,
    ignoredChip: document.querySelector('.stat-ignored') as HTMLButtonElement,
    pasteTarget: document.getElementById('paste-target')!,
    unstructuredBanner: document.getElementById('unstructured-banner')!,
    autofixBanner: document.getElementById('autofix-banner')!,
    autofixCount: document.getElementById('autofix-count')!,
    autofixToggle: document.getElementById(
      'autofix-toggle'
    ) as HTMLButtonElement,
    autofixCopy: document.getElementById('autofix-copy') as HTMLButtonElement,
    autofixDetails: document.getElementById('autofix-details')!,
    darkModeToggle: document.getElementById(
      'dark-mode-toggle'
    ) as HTMLButtonElement,
    comfortableToggle: document.getElementById(
      'comfortable-toggle'
    ) as HTMLButtonElement,
    autofixMasterToggle: document.getElementById(
      'autofix-master-toggle'
    ) as HTMLInputElement,
    helpBtn: document.getElementById('help-btn')!,
    toastEl: document.getElementById('toast')!,
    dropError: document.getElementById('drop-error')!,
    parseErrorBanner: document.getElementById('parse-error-banner')!,
    parseErrorMessage: document.getElementById('parse-error-message')!,
    relintWarning: document.getElementById('relint-warning')!,
    resetConfirmBtn: document.getElementById(
      'reset-confirm-btn'
    ) as HTMLButtonElement,
  };
}

/**
 * Creates a sample diagnostic for testing.
 */
export function makeDiagnostic(
  overrides: Partial<LintDiagnostic> = {}
): LintDiagnostic {
  return {
    rule: 'test.rule',
    severity: 'error',
    paragraph: 0,
    message: 'Test error message',
    ...overrides,
  };
}

/**
 * Creates multiple diagnostics with different severities.
 */
export function makeDiagnostics(): LintDiagnostic[] {
  return [
    makeDiagnostic({
      rule: 'test.error1',
      severity: 'error',
      paragraph: 0,
      message: 'First error',
      questionLabel: 'T1',
      answerPreview: 'Test Answer',
    }),
    makeDiagnostic({
      rule: 'test.warning1',
      severity: 'warning',
      paragraph: 1,
      message: 'First warning',
      questionLabel: 'T2',
    }),
    makeDiagnostic({
      rule: 'test.info1',
      severity: 'info',
      paragraph: 2,
      message: 'First info',
      questionLabel: 'T3',
      sourceText: 'Some source text for snippet',
      offset: 5,
      length: 6,
    }),
    makeDiagnostic({
      rule: 'test.error2',
      severity: 'error',
      paragraph: 3,
      message: 'Second error',
      questionLabel: 'B1',
      suggestion: 'Try this instead',
    }),
  ];
}

/**
 * Waits for the next tick (useful for async DOM updates).
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Simulates a file selection event.
 */
export function createMockFile(
  name: string,
  content: ArrayBuffer | string,
  type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
): File {
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type })
      : new Blob([content], { type });
  return new File([blob], name, { type });
}

/**
 * Counts visible diagnostic elements in the list.
 */
export function countVisibleDiagnostics(): number {
  const diagnostics = document.querySelectorAll('.diagnostic:not(.ignored)');
  return diagnostics.length;
}

/**
 * Gets the text content of all visible diagnostic messages.
 */
export function getVisibleMessages(): string[] {
  const diagnostics = document.querySelectorAll('.diagnostic:not(.ignored)');
  return Array.from(diagnostics).map(
    (el) => el.querySelector('.diag-message')?.textContent || ''
  );
}

/**
 * Creates and initializes a PopupController for testing.
 * Sets up chrome mocks, loads the popup HTML, optionally pre-seeds
 * settings and session state, then initializes the controller.
 */
export async function createTestController(opts?: {
  settings?: Partial<QBLintSettings>;
  session?: SessionState;
}): Promise<PopupController> {
  setupChromeMocks();
  await loadPopupHTML();

  if (opts?.settings) {
    await chrome.storage.local.set({ qbcheckSettings: opts.settings });
  }
  if (opts?.session) {
    await chrome.storage.session.set({ qbcheckSession: opts.session });
  }

  const elements = getElements();
  const controller = new PopupController(elements, {
    chromeStorage: chrome.storage,
    clipboard: navigator.clipboard,
  });

  await controller.initialize();
  return controller;
}

/**
 * Creates a PacketResult with the given diagnostics.
 */
export function createPacketResult(
  filename: string,
  diagnostics: LintDiagnostic[],
  parseError?: string
): PacketResult {
  return { filename, diagnostics, ...(parseError ? { parseError } : {}) };
}

/**
 * Creates a SessionState with multiple packets containing varied diagnostics.
 */
export function createMultiPacketSession(
  packets: Array<{ filename: string; diagnostics: LintDiagnostic[] }>
): SessionState {
  return {
    packetResults: packets.map((p) => ({
      filename: p.filename,
      diagnostics: p.diagnostics,
    })),
    currentIndex: 0,
    scrollPosition: 0,
    mode: 'file',
  };
}
