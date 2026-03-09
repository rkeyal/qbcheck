import { LintDiagnostic } from '../../src/core/model.js';

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

  const htmlPath = path.join(
    process.cwd(),
    'src',
    'popup',
    'popup.html'
  );
  const html = await fs.readFile(htmlPath, 'utf-8');

  // Extract just the body content (skip <!DOCTYPE> and <html>/<head>)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) throw new Error('Could not find <body> in popup.html');

  document.body.innerHTML = bodyMatch[1];
}

/**
 * Gets commonly used DOM elements for tests.
 */
export function getElements() {
  return {
    uploadArea: document.getElementById('upload-area')!,
    resultsArea: document.getElementById('results-area')!,
    diagnosticsList: document.getElementById('diagnostics-list')!,
    noIssues: document.getElementById('no-issues')!,
    countError: document.getElementById('count-error')!,
    countWarning: document.getElementById('count-warning')!,
    countInfo: document.getElementById('count-info')!,
    countIgnored: document.getElementById('count-ignored')!,
    fileNameEl: document.getElementById('file-name')!,
    packetNav: document.getElementById('packet-nav')!,
    packetSelect: document.getElementById('packet-select') as HTMLSelectElement,
    prevBtn: document.getElementById('prev-btn') as HTMLButtonElement,
    nextBtn: document.getElementById('next-btn') as HTMLButtonElement,
    clearBtn: document.getElementById('clear-btn')!,
    settingsBtn: document.getElementById('settings-btn')!,
    settingsView: document.getElementById('settings-view')!,
    settingsRules: document.getElementById('settings-rules')!,
    unstructuredBanner: document.getElementById('unstructured-banner')!,
    autofixBanner: document.getElementById('autofix-banner')!,
    filterCategory: document.getElementById('filter-category') as HTMLSelectElement,
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
  const blob = typeof content === 'string'
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
