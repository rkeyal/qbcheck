import { parseDocx, parseHtml } from '../core/parser.js';
import { segmentPacket } from '../core/segmenter.js';
import { lint, inferCrossPacketCategories } from '../core/engine.js';
import { LintDiagnostic, Severity, Packet, Paragraph } from '../core/model.js';
import { RULE_REGISTRY } from '../core/rule-registry.js';
import {
  applyFixes,
  paragraphsToHtml,
  paragraphsToPlainText,
} from '../core/fixer.js';

const uploadArea = document.getElementById('upload-area')!;
const resultsArea = document.getElementById('results-area')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const folderInput = document.getElementById('folder-input') as HTMLInputElement;
const dropZone = document.getElementById('drop-zone')!;
const fileNameEl = document.getElementById('file-name')!;
const clearBtn = document.getElementById('clear-btn')!;
const countError = document.getElementById('count-error')!;
const countWarning = document.getElementById('count-warning')!;
const countInfo = document.getElementById('count-info')!;
const countIgnored = document.getElementById('count-ignored')!;
const statsBar = document.getElementById('stats-bar')!;
const filterCategory = document.getElementById(
  'filter-category'
) as HTMLSelectElement;

const activeSeverities = new Set<string>(['error', 'warning', 'info']);
const diagnosticsList = document.getElementById('diagnostics-list')!;
const noIssues = document.getElementById('no-issues')!;
const packetNav = document.getElementById('packet-nav')!;
const prevBtn = document.getElementById('prev-btn') as HTMLButtonElement;
const nextBtn = document.getElementById('next-btn') as HTMLButtonElement;
const packetSelect = document.getElementById(
  'packet-select'
) as HTMLSelectElement;
const packetCounter = document.getElementById('packet-counter')!;
const settingsBtn = document.getElementById('settings-btn')!;
const settingsView = document.getElementById('settings-view')!;
const settingsRules = document.getElementById('settings-rules')!;
const settingsBackBtn = document.getElementById('settings-back-btn')!;
const resetDefaultsBtn = document.getElementById('reset-defaults-btn')!;
const ignoredChip = document.querySelector(
  '.stat-ignored'
) as HTMLButtonElement;
const pasteTarget = document.getElementById('paste-target')!;
const unstructuredBanner = document.getElementById('unstructured-banner')!;
const autofixBanner = document.getElementById('autofix-banner')!;
const autofixCount = document.getElementById('autofix-count')!;
const autofixToggle = document.getElementById(
  'autofix-toggle'
) as HTMLButtonElement;
const autofixCopy = document.getElementById(
  'autofix-copy'
) as HTMLButtonElement;
const autofixDetails = document.getElementById('autofix-details')!;
const darkModeToggle = document.getElementById(
  'dark-mode-toggle'
) as HTMLButtonElement;
const autofixMasterToggle = document.getElementById(
  'autofix-master-toggle'
) as HTMLInputElement;
const helpBtn = document.getElementById('help-btn')!;
const toastEl = document.getElementById('toast')!;
const dropError = document.getElementById('drop-error')!;
const parseErrorBanner = document.getElementById('parse-error-banner')!;
const parseErrorMessage = document.getElementById('parse-error-message')!;
const relintWarning = document.getElementById('relint-warning')!;
const resetConfirmBtn = document.getElementById(
  'reset-confirm-btn'
) as HTMLButtonElement;

interface PacketResult {
  filename: string;
  diagnostics: LintDiagnostic[];
  parseError?: string;
}

interface QBLintSettings {
  disabledRules: string[];
  ignoredDiagnostics: string[];
  autoFixDisabled: string[];
  darkMode: boolean;
}

interface SessionState {
  packetResults: PacketResult[];
  currentIndex: number;
  scrollPosition: number;
  mode: 'file' | 'paste';
}

const DEFAULT_SETTINGS: QBLintSettings = {
  disabledRules: [
    'formatting.smart-quotes',
    'formatting.no-format-bleeding',
    'writing.word-replacements',
    'writing.no-weasel-words',
    'packet.blank-paragraphs',
  ],
  ignoredDiagnostics: [],
  autoFixDisabled: [],
  darkMode: false,
};

let packetResults: PacketResult[] = [];
let currentIndex: number = 0;
let settings: QBLintSettings = { ...DEFAULT_SETTINGS };
let showIgnored = false;
// Track raw parsed data for re-linting after rule changes
let lastParsedPackets: (Packet | null)[] = [];
let _lastSortedFiles: File[] = [];
// Auto-fix state
let lastFixedParagraphs: Paragraph[] | null = null;
let lastAppliedFixes: LintDiagnostic[] = [];
let isPasteMode = false;
let needsRelint = false;

function getCurrentDiagnostics(): LintDiagnostic[] {
  return packetResults[currentIndex]?.diagnostics ?? [];
}

// --- Settings persistence ---

async function loadSettings(): Promise<QBLintSettings> {
  try {
    const result = await chrome.storage.local.get('qblintSettings');
    const stored = result.qblintSettings;
    if (!stored) return { ...DEFAULT_SETTINGS };
    return {
      disabledRules: stored.disabledRules ?? [],
      ignoredDiagnostics: stored.ignoredDiagnostics ?? [],
      autoFixDisabled: stored.autoFixDisabled ?? [],
      darkMode: stored.darkMode ?? false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(s: QBLintSettings): Promise<void> {
  try {
    await chrome.storage.local.set({ qblintSettings: s });
  } catch {
    // Storage unavailable (e.g., dev mode without extension context)
  }
}

// --- Session persistence ---

async function saveSession(): Promise<void> {
  // Only save if we have results to preserve
  if (packetResults.length === 0) {
    await clearSession();
    return;
  }

  // Get current scroll position
  const scrollPos = diagnosticsList.scrollTop || 0;

  const sessionState: SessionState = {
    packetResults,
    currentIndex,
    scrollPosition: scrollPos,
    mode: isPasteMode ? 'paste' : 'file',
  };

  try {
    await chrome.storage.session.set({ qbcheckSession: sessionState });
  } catch (e) {
    console.warn('Failed to save session:', e);
  }
}

async function loadSession(): Promise<SessionState | null> {
  try {
    const result = await chrome.storage.session.get('qbcheckSession');
    const session = result.qbcheckSession as SessionState | undefined;
    return session || null;
  } catch {
    return null;
  }
}

async function clearSession(): Promise<void> {
  try {
    await chrome.storage.session.remove('qbcheckSession');
  } catch {
    // Ignore errors
  }
}

// --- Diagnostic fingerprinting ---

function diagnosticFingerprint(d: LintDiagnostic): string {
  const label = d.questionLabel || `p${d.paragraph}`;
  let h = 0;
  for (let i = 0; i < d.message.length; i++) {
    h = (h * 31 + d.message.charCodeAt(i)) | 0;
  }
  return `${d.rule}::${label}::${h}`;
}

// --- Initialization ---

Promise.all([loadSettings(), loadSession()]).then(([s, session]) => {
  settings = s;

  // Apply dark mode
  if (settings.darkMode) {
    document.body.classList.add('dark');
  }
  darkModeToggle.textContent = settings.darkMode ? '\u2600' : '\u25D0';

  if (session) {
    // Restore UI state
    packetResults = session.packetResults;
    currentIndex = session.currentIndex;
    isPasteMode = session.mode === 'paste';

    // Note: lastParsedPackets stays empty (can't re-lint)
    // But that's OK - user can just re-upload to change settings

    // Show results UI
    uploadArea.hidden = true;
    resultsArea.hidden = false;
    populatePacketSelect();
    showCurrentPacket();

    // Restore scroll position after render
    setTimeout(() => {
      diagnosticsList.scrollTop = session.scrollPosition || 0;
    }, 0);
  }
});

// File input handler
fileInput.addEventListener('change', () => {
  const files = collectDocxFiles(fileInput.files);
  if (files.length > 0) processFiles(files);
});

// Folder input handler
folderInput.addEventListener('change', () => {
  const files = collectDocxFiles(folderInput.files);
  if (files.length > 0) processFiles(files);
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  dropError.hidden = true;

  // Try to read directory entries first (handles dropped folders)
  const items = e.dataTransfer?.items;
  if (items) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }

    const hasDirectory = entries.some((e) => e.isDirectory);
    if (hasDirectory) {
      const files = await readEntriesRecursive(entries);
      const docx = files.filter((f) => f.name.endsWith('.docx'));
      if (docx.length > 0) {
        processFiles(docx);
        return;
      }
      if (files.length > 0) {
        dropError.textContent = 'Only .docx files are supported.';
        dropError.hidden = false;
      }
      return;
    }
  }

  const droppedCount = e.dataTransfer?.files?.length ?? 0;
  const files = collectDocxFiles(e.dataTransfer?.files ?? null);
  if (files.length > 0) {
    processFiles(files);
  } else if (droppedCount > 0) {
    dropError.textContent = 'Only .docx files are supported.';
    dropError.hidden = false;
  }
});

// Paste from clipboard — click focuses the target, then user pastes with Ctrl+V/Cmd+V
pasteTarget.addEventListener('click', () => {
  pasteTarget.focus();
  pasteTarget.classList.add('paste-active');
});

pasteTarget.addEventListener('blur', () => {
  pasteTarget.classList.remove('paste-active');
});

pasteTarget.addEventListener('paste', (e) => {
  e.preventDefault();
  const clipboardData = (e as ClipboardEvent).clipboardData;
  if (!clipboardData) return;

  const html = clipboardData.getData('text/html');
  const plainText = clipboardData.getData('text/plain');

  if (!html && !plainText) {
    showToast('No text found in clipboard. Copy some questions first.');
    return;
  }

  // Show loading state
  settingsView.hidden = true;
  uploadArea.hidden = true;
  resultsArea.hidden = false;
  diagnosticsList.innerHTML = '<div class="loading">Analyzing pasted text...</div>';

  // Defer processing to allow the loading UI to render
  setTimeout(() => {
    let paragraphs = html
      ? parseHtml(html)
      : parseHtml(
          `<p>${escapeHtml(plainText).split('\n').join('</p><p>')}</p>`
        );

    // Google Docs clipboard HTML may drop blank lines between paragraphs.
    // Restore them from the plain text, which always preserves \n\n gaps.
    // This must happen BEFORE segmentation because the segmenter uses
    // blank paragraphs as question boundaries in unstructured mode.
    if (html && plainText) {
      paragraphs = restoreBlankLines(paragraphs, plainText);
    }

    if (paragraphs.length === 0) {
      showToast('No content found in clipboard.');
      uploadArea.hidden = false;
      resultsArea.hidden = true;
      return;
    }

    const packet = segmentPacket(paragraphs);
    const disabledSet = new Set(settings.disabledRules);
    const diagnostics = lint(packet, disabledSet);

    // Apply auto-fixes
    const fixResult = applyFixes(
      paragraphs,
      diagnostics,
      settings.autoFixDisabled
    );
    lastFixedParagraphs =
      fixResult.fixCount > 0 ? fixResult.fixedParagraphs : null;
    lastAppliedFixes = fixResult.appliedFixes;
    isPasteMode = true;

    lastParsedPackets = [packet];
    _lastSortedFiles = [];
    packetResults = [
      {
        filename: 'Pasted text',
        diagnostics: fixResult.remainingDiagnostics,
      },
    ];
    currentIndex = 0;

    populatePacketSelect();
    showCurrentPacket();
    saveSession();
  }, 0);
});

// Help button
helpBtn.addEventListener('click', showKeyboardHelp);

// Dark mode toggle
darkModeToggle.addEventListener('click', async () => {
  settings.darkMode = !settings.darkMode;
  document.body.classList.toggle('dark', settings.darkMode);
  darkModeToggle.textContent = settings.darkMode ? '\u2600' : '\u25D0';
  await saveSettings(settings);
});

// Clear button
clearBtn.addEventListener('click', () => {
  packetResults = [];
  currentIndex = 0;
  lastParsedPackets = [];
  _lastSortedFiles = [];
  lastFixedParagraphs = null;
  lastAppliedFixes = [];
  isPasteMode = false;
  uploadArea.hidden = false;
  resultsArea.hidden = true;
  settingsView.hidden = true;
  fileInput.value = '';
  folderInput.value = '';
  clearSession();
});

// Toggle severity filter (used by both click and keyboard shortcuts)
function toggleSeverity(severity: string): void {
  if (activeSeverities.has(severity)) {
    // Don't allow hiding all severities
    if (activeSeverities.size === 1) return;
    activeSeverities.delete(severity);
  } else {
    activeSeverities.add(severity);
  }

  // Update button visual state
  const btn = document.querySelector(`[data-severity="${severity}"]`);
  if (btn) {
    btn.classList.toggle('active', activeSeverities.has(severity));
  }

  renderDiagnostics();
}

// Filters
statsBar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest(
    '[data-severity]'
  ) as HTMLElement | null;
  if (!btn) return;
  const sev = btn.dataset.severity!;

  if (sev === 'ignored') {
    showIgnored = !showIgnored;
    btn.classList.toggle('active', showIgnored);
    renderDiagnostics();
  } else {
    toggleSeverity(sev);
  }
});
filterCategory.addEventListener('change', () => {
  updateCounts();
  renderDiagnostics();
});

// Navigation
prevBtn.addEventListener('click', () => {
  currentIndex = Math.max(0, currentIndex - 1);
  showCurrentPacket();
});

nextBtn.addEventListener('click', () => {
  currentIndex = Math.min(packetResults.length - 1, currentIndex + 1);
  showCurrentPacket();
});

packetSelect.addEventListener('change', () => {
  currentIndex = parseInt(packetSelect.value, 10);
  showCurrentPacket();
});

// Debounce scroll saves to avoid excessive storage writes
let scrollSaveTimeout: number | null = null;
diagnosticsList.addEventListener('scroll', () => {
  if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
  scrollSaveTimeout = window.setTimeout(() => {
    saveSession();
  }, 500); // 500ms debounce
});

// Keyboard shortcuts help modal
function showKeyboardHelp(): void {
  // Check if help modal already exists
  let helpModal = document.getElementById('keyboard-help-modal');

  if (!helpModal) {
    helpModal = document.createElement('div');
    helpModal.id = 'keyboard-help-modal';
    helpModal.className = 'modal-overlay';
    helpModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="shortcut-section">
            <h3>Navigation</h3>
            <div class="shortcut-row">
              <kbd>←</kbd> <kbd>→</kbd>
              <span>Previous/Next packet</span>
            </div>
            <div class="shortcut-row">
              <kbd>1</kbd>-<kbd>9</kbd>
              <span>Jump to packet number</span>
            </div>
          </div>
          <div class="shortcut-section">
            <h3>Filtering</h3>
            <div class="shortcut-row">
              <kbd>E</kbd>
              <span>Toggle errors</span>
            </div>
            <div class="shortcut-row">
              <kbd>W</kbd>
              <span>Toggle warnings</span>
            </div>
            <div class="shortcut-row">
              <kbd>I</kbd>
              <span>Toggle info</span>
            </div>
          </div>
          <div class="shortcut-section">
            <h3>Actions</h3>
            <div class="shortcut-row">
              <kbd>Esc</kbd>
              <span>Close settings/menus</span>
            </div>
            <div class="shortcut-row">
              <kbd>?</kbd>
              <span>Show this help</span>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(helpModal);

    // Close on click outside or close button
    helpModal.addEventListener('click', (e) => {
      if (
        e.target === helpModal ||
        (e.target as HTMLElement).classList.contains('modal-close')
      ) {
        helpModal!.remove();
      }
    });
  }
}

// Global keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ignore keyboard shortcuts when typing in input fields
  const target = e.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return;
  }

  // Only process shortcuts when results are visible
  const resultsVisible = !resultsArea.hidden;
  const settingsVisible = !settingsView.hidden;

  // Handle shortcuts
  switch (e.key) {
    case 'ArrowLeft':
      if (resultsVisible && packetResults.length > 1 && currentIndex > 0) {
        e.preventDefault();
        currentIndex--;
        showCurrentPacket();
      }
      break;

    case 'ArrowRight':
      if (
        resultsVisible &&
        packetResults.length > 1 &&
        currentIndex < packetResults.length - 1
      ) {
        e.preventDefault();
        currentIndex++;
        showCurrentPacket();
      }
      break;

    case 'e':
    case 'E':
      if (resultsVisible && !settingsVisible) {
        e.preventDefault();
        toggleSeverity('error');
      }
      break;

    case 'w':
    case 'W':
      if (resultsVisible && !settingsVisible) {
        e.preventDefault();
        toggleSeverity('warning');
      }
      break;

    case 'i':
    case 'I':
      if (resultsVisible && !settingsVisible) {
        e.preventDefault();
        toggleSeverity('info');
      }
      break;

    case 'Escape': {
      // Check if help modal is open first
      const helpModal = document.getElementById('keyboard-help-modal');
      if (helpModal) {
        e.preventDefault();
        helpModal.remove();
      } else if (settingsVisible) {
        e.preventDefault();
        closeSettings();
      } else if (resultsVisible) {
        // Close any open menus
        closeAllMenus();
        // Remove focus from paste target if focused
        if (document.activeElement === pasteTarget) {
          pasteTarget.blur();
        }
      }
      break;
    }

    case '?':
      if (resultsVisible || settingsVisible) {
        e.preventDefault();
        showKeyboardHelp();
      }
      break;
  }

  // Handle number keys 1-9 for packet jumping
  if (resultsVisible && !settingsVisible && /^[1-9]$/.test(e.key)) {
    const packetNum = parseInt(e.key, 10);
    if (packetNum <= packetResults.length) {
      e.preventDefault();
      currentIndex = packetNum - 1;
      showCurrentPacket();
    }
  }
});

// Settings view
settingsBtn.addEventListener('click', () => {
  if (!settingsView.hidden) {
    closeSettings();
    return;
  }
  openSettings();
});

settingsBackBtn.addEventListener('click', closeSettings);

let resetConfirmTimeout: number | null = null;
resetDefaultsBtn.addEventListener('click', () => {
  // Show confirmation button, hide the original
  resetDefaultsBtn.hidden = true;
  resetConfirmBtn.hidden = false;
  // Auto-cancel after 3 seconds
  if (resetConfirmTimeout) clearTimeout(resetConfirmTimeout);
  resetConfirmTimeout = window.setTimeout(() => {
    resetDefaultsBtn.hidden = false;
    resetConfirmBtn.hidden = true;
  }, 3000);
});

resetConfirmBtn.addEventListener('click', async () => {
  if (resetConfirmTimeout) clearTimeout(resetConfirmTimeout);
  resetDefaultsBtn.hidden = false;
  resetConfirmBtn.hidden = true;

  settings = { ...DEFAULT_SETTINGS };
  await saveSettings(settings);
  document.body.classList.remove('dark');
  darkModeToggle.textContent = '\u25D0';
  renderSettingsRules();
  // Re-lint if we have packets loaded
  if (lastParsedPackets.length > 0) {
    relintAll();
  }
});

function isRestoredSession(): boolean {
  return packetResults.length > 0 && lastParsedPackets.length === 0;
}

function openSettings() {
  uploadArea.hidden = true;
  resultsArea.hidden = true;
  settingsView.hidden = false;
  relintWarning.hidden = true;
  renderSettingsRules();
}

function closeSettings() {
  settingsView.hidden = true;
  if (packetResults.length > 0) {
    resultsArea.hidden = false;
    if (needsRelint && lastParsedPackets.length > 0) {
      relintAll();
      needsRelint = false;
    }
    showCurrentPacket();
  } else {
    uploadArea.hidden = false;
  }
}

function renderSettingsRules() {
  // Group rules by category
  const groups = new Map<string, typeof RULE_REGISTRY>();
  for (const rule of RULE_REGISTRY) {
    if (!groups.has(rule.category)) groups.set(rule.category, []);
    groups.get(rule.category)!.push(rule);
  }

  const CATEGORY_LABELS: Record<string, string> = {
    packet: 'Packet Structure',
    question: 'Question Text',
    answerline: 'Answer Lines',
    pronunciation: 'Pronunciation',
    formatting: 'Formatting',
    tag: 'Tags',
    writing: 'Writing Style',
  };

  settingsRules.innerHTML = Array.from(groups.entries())
    .map(
      ([cat, rules]) => `
      <div class="rule-group">
        <div class="rule-group-header">${CATEGORY_LABELS[cat] || cat}</div>
        ${rules
          .map((r) => {
            const checked = !settings.disabledRules.includes(r.id);
            const shortId = r.id.split('.')[1];
            const autoFixChecked =
              r.autoFixable && !settings.autoFixDisabled.includes(r.id);
            const autoFixHtml = r.autoFixable
              ? `<label class="rule-autofix${!checked ? ' disabled' : ''}" title="Auto-fix this rule when pasting">
                   <input type="checkbox" data-autofix-id="${r.id}" ${autoFixChecked ? 'checked' : ''} ${!checked ? 'disabled' : ''}>
                   Auto
                 </label>`
              : '';
            return `
            <div class="rule-item">
              <input type="checkbox" data-rule-id="${r.id}" ${checked ? 'checked' : ''}>
              <div class="rule-item-text">
                <div class="rule-item-id">${shortId}</div>
                <div class="rule-item-desc">${escapeHtml(r.description)}</div>
              </div>
              ${autoFixHtml}
            </div>`;
          })
          .join('')}
      </div>
    `
    )
    .join('');

  // Bind rule enable/disable handlers
  for (const cb of Array.from(
    settingsRules.querySelectorAll('input[data-rule-id]')
  )) {
    cb.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const ruleId = input.dataset.ruleId!;
      if (input.checked) {
        // Enabling a rule — need to relint to generate its diagnostics
        settings.disabledRules = settings.disabledRules.filter(
          (r) => r !== ruleId
        );
        needsRelint = true;
        if (isRestoredSession()) {
          relintWarning.hidden = false;
        }
      } else {
        // Disabling a rule — filter out its diagnostics immediately
        if (!settings.disabledRules.includes(ruleId)) {
          settings.disabledRules.push(ruleId);
        }
        filterOutRule(ruleId);
      }
      await saveSettings(settings);

      // Update auto-fix checkbox state
      const ruleItem = input.closest('.rule-item');
      const autoFixLabel = ruleItem?.querySelector('.rule-autofix');
      if (autoFixLabel) {
        const autoFixInput = autoFixLabel.querySelector(
          'input'
        ) as HTMLInputElement;
        autoFixLabel.classList.toggle('disabled', !input.checked);
        autoFixInput.disabled = !input.checked;
      }
    });
  }

  // Bind auto-fix toggle handlers
  for (const cb of Array.from(
    settingsRules.querySelectorAll('input[data-autofix-id]')
  )) {
    cb.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const ruleId = input.dataset.autofixId!;
      if (input.checked) {
        settings.autoFixDisabled = settings.autoFixDisabled.filter(
          (r) => r !== ruleId
        );
      } else {
        if (!settings.autoFixDisabled.includes(ruleId)) {
          settings.autoFixDisabled.push(ruleId);
        }
      }
      await saveSettings(settings);
      syncAutofixMaster();
    });
  }

  // Sync master auto-fix checkbox state
  syncAutofixMaster();
}

function getAutoFixableRuleIds(): string[] {
  return RULE_REGISTRY.filter((r) => r.autoFixable).map((r) => r.id);
}

function syncAutofixMaster(): void {
  const allIds = getAutoFixableRuleIds();
  const disabledCount = allIds.filter((id) =>
    settings.autoFixDisabled.includes(id)
  ).length;

  if (disabledCount === 0) {
    autofixMasterToggle.checked = true;
    autofixMasterToggle.indeterminate = false;
  } else if (disabledCount === allIds.length) {
    autofixMasterToggle.checked = false;
    autofixMasterToggle.indeterminate = false;
  } else {
    autofixMasterToggle.checked = false;
    autofixMasterToggle.indeterminate = true;
  }
}

autofixMasterToggle.addEventListener('change', async () => {
  const allIds = getAutoFixableRuleIds();
  const allEnabled = allIds.every(
    (id) => !settings.autoFixDisabled.includes(id)
  );

  if (allEnabled) {
    // All currently enabled → disable all
    for (const id of allIds) {
      if (!settings.autoFixDisabled.includes(id)) {
        settings.autoFixDisabled.push(id);
      }
    }
  } else {
    // Some or all disabled → enable all
    settings.autoFixDisabled = settings.autoFixDisabled.filter(
      (id) => !allIds.includes(id)
    );
  }

  await saveSettings(settings);

  // Update all per-rule Auto checkboxes in the DOM
  for (const cb of Array.from(
    settingsRules.querySelectorAll(
      'input[data-autofix-id]'
    ) as NodeListOf<HTMLInputElement>
  )) {
    const ruleId = cb.dataset.autofixId!;
    cb.checked = !settings.autoFixDisabled.includes(ruleId);
  }

  syncAutofixMaster();
});

// --- Filter / Re-lint helpers ---

function filterOutRule(ruleId: string): void {
  for (const pr of packetResults) {
    pr.diagnostics = pr.diagnostics.filter((d) => d.rule !== ruleId);
  }
}

function relintAll() {
  if (lastParsedPackets.length === 0) return;

  const useInference = lastParsedPackets.length > 3;
  const disabledSet = new Set(settings.disabledRules);
  if (useInference) disabledSet.add('tag.valid-category');

  for (let i = 0; i < lastParsedPackets.length; i++) {
    const packet = lastParsedPackets[i];
    if (!packet) {
      packetResults[i] = {
        filename: packetResults[i].filename,
        diagnostics: [],
      };
      continue;
    }
    packetResults[i] = {
      filename: packetResults[i].filename,
      diagnostics: lint(packet, disabledSet),
    };
  }

  // Cross-packet inference
  if (useInference) {
    const validPackets = lastParsedPackets.filter(
      (p): p is Packet => p !== null
    );
    if (validPackets.length > 3) {
      const crossDiags = inferCrossPacketCategories(validPackets);
      let validIdx = 0;
      for (let i = 0; i < lastParsedPackets.length; i++) {
        if (lastParsedPackets[i] === null) continue;
        const diags = crossDiags[validIdx++];
        if (diags.length > 0) {
          packetResults[i].diagnostics.push(...diags);
          packetResults[i].diagnostics.sort(
            (a, b) => a.paragraph - b.paragraph
          );
        }
      }
    }
  }
}

function readEntriesRecursive(entries: FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];

  function readEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file(
          (f) => {
            files.push(f);
            resolve();
          },
          () => resolve()
        );
      });
    }
    if (entry.isDirectory) {
      return new Promise((resolve) => {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readBatch = () => {
          reader.readEntries(
            async (batch) => {
              if (batch.length === 0) {
                resolve();
                return;
              }
              await Promise.all(batch.map(readEntry));
              readBatch(); // readEntries may return partial results
            },
            () => resolve()
          );
        };
        readBatch();
      });
    }
    return Promise.resolve();
  }

  return Promise.all(entries.map(readEntry)).then(() => files);
}

function collectDocxFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];
  const files: File[] = [];
  for (let i = 0; i < fileList.length; i++) {
    if (fileList[i].name.endsWith('.docx')) {
      files.push(fileList[i]);
    }
  }
  return files;
}

async function processFiles(files: File[]) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  _lastSortedFiles = sorted;

  // Reset auto-fix state (not available in packet mode)
  lastFixedParagraphs = null;
  lastAppliedFixes = [];
  isPasteMode = false;

  // Close settings if open
  settingsView.hidden = true;
  uploadArea.hidden = true;
  resultsArea.hidden = false;
  noIssues.hidden = true;
  diagnosticsList.innerHTML = `<div class="loading">Analyzing 0 / ${sorted.length}...</div>`;

  const useInference = sorted.length > 3;
  const disabledSet = new Set(settings.disabledRules);
  if (useInference) disabledSet.add('tag.valid-category');

  packetResults = [];
  const packets: (Packet | null)[] = [];

  for (let i = 0; i < sorted.length; i++) {
    diagnosticsList.innerHTML = `<div class="loading">Analyzing ${i + 1} / ${sorted.length}...</div>`;

    try {
      const file = sorted[i];
      const buffer = await file.arrayBuffer();
      const paragraphs = await parseDocx(buffer);
      const packet = segmentPacket(paragraphs);
      const diagnostics = lint(packet, disabledSet);
      packets.push(packet);
      packetResults.push({ filename: file.name, diagnostics });
    } catch {
      packets.push(null);
      packetResults.push({
        filename: sorted[i].name,
        diagnostics: [],
        parseError: `Failed to parse ${sorted[i].name}. The file may be corrupted or not a valid .docx.`,
      });
    }
  }

  lastParsedPackets = packets;

  // Cross-packet tag category inference
  if (useInference) {
    const validPackets = packets.filter((p): p is Packet => p !== null);
    if (validPackets.length > 3) {
      const crossDiags = inferCrossPacketCategories(validPackets);

      let validIdx = 0;
      for (let i = 0; i < packets.length; i++) {
        if (packets[i] === null) continue;
        const diags = crossDiags[validIdx++];
        if (diags.length > 0) {
          packetResults[i].diagnostics.push(...diags);
          packetResults[i].diagnostics.sort(
            (a, b) => a.paragraph - b.paragraph
          );
        }
      }
    }
  }

  currentIndex = 0;
  populatePacketSelect();
  showCurrentPacket();
  saveSession();
}

function populatePacketSelect() {
  packetSelect.innerHTML = packetResults
    .map((r, i) => `<option value="${i}">${escapeHtml(r.filename)}</option>`)
    .join('');
}

function showCurrentPacket() {
  const result = packetResults[currentIndex];
  if (!result) return;

  fileNameEl.textContent = result.filename;
  packetSelect.value = String(currentIndex);
  packetCounter.textContent = `${currentIndex + 1} / ${packetResults.length}`;

  // Show/hide navigation bar
  packetNav.hidden = packetResults.length <= 1;

  // Update button states
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === packetResults.length - 1;

  // Show/hide parse error banner
  const currentResult = packetResults[currentIndex];
  if (currentResult?.parseError) {
    parseErrorBanner.hidden = false;
    parseErrorMessage.textContent = currentResult.parseError;
  } else {
    parseErrorBanner.hidden = true;
  }

  // Show/hide unstructured banner
  const currentPacket = lastParsedPackets[currentIndex];
  unstructuredBanner.hidden =
    !currentPacket || currentPacket.structured !== false;

  // Show/hide auto-fix banner
  renderAutofixBanner();

  // Reset scroll to top when switching packets
  diagnosticsList.scrollTop = 0;

  updateCounts();
  renderDiagnostics();

  // Save session after updating state
  saveSession();
}

function updateCounts() {
  const diags = getCurrentDiagnostics();
  const catFilter = filterCategory.value;
  const ignoredFps = new Set(settings.ignoredDiagnostics);

  let errors = 0,
    warnings = 0,
    infos = 0,
    ignoredCount = 0;
  for (const d of diags) {
    if (catFilter !== 'all' && !d.rule.startsWith(catFilter + '.')) continue;
    if (ignoredFps.has(diagnosticFingerprint(d))) {
      ignoredCount++;
    } else {
      if (d.severity === 'error') errors++;
      else if (d.severity === 'warning') warnings++;
      else infos++;
    }
  }

  countError.textContent = String(errors);
  countWarning.textContent = String(warnings);
  countInfo.textContent = String(infos);
  countIgnored.textContent = String(ignoredCount);
  ignoredChip.hidden = ignoredCount === 0;
}

// --- Auto-fix banner ---

function renderAutofixBanner() {
  if (!isPasteMode || lastAppliedFixes.length === 0) {
    autofixBanner.hidden = true;
    return;
  }

  autofixBanner.hidden = false;
  autofixCount.textContent = String(lastAppliedFixes.length);

  // Render fix details
  const CONTEXT = 30;
  autofixDetails.innerHTML = lastAppliedFixes
    .map((d) => {
      let diffHtml = '';
      if (d.fix && d.sourceText != null && d.offset != null) {
        const start = Math.max(0, d.offset - CONTEXT);
        const end = Math.min(
          d.sourceText.length,
          d.offset + d.fix.oldText.length + CONTEXT
        );
        const before = d.sourceText.substring(start, d.offset);
        const after = d.sourceText.substring(
          d.offset + d.fix.oldText.length,
          end
        );
        const prefix = start > 0 ? '\u2026' : '';
        const suffix = end < d.sourceText.length ? '\u2026' : '';

        diffHtml = `
          <div class="autofix-item-diff">
            <div class="diff-old">${prefix}${escapeHtml(before)}<strong>${escapeHtml(d.fix.oldText)}</strong>${escapeHtml(after)}${suffix}</div>
            <div class="diff-new">${prefix}${escapeHtml(before)}<strong>${escapeHtml(d.fix.newText)}</strong>${escapeHtml(after)}${suffix}</div>
          </div>`;
      }

      return `
        <div class="autofix-item">
          <div class="autofix-item-rule">${d.rule}</div>
          <div class="autofix-item-message">${escapeHtml(d.message)}</div>
          <div class="autofix-item-location">${d.questionLabel || 'Paragraph ' + (d.paragraph + 1)}${d.answerPreview ? ' \u2014 ' + escapeHtml(d.answerPreview) : ''}</div>
          ${diffHtml}
        </div>`;
    })
    .join('');
}

autofixToggle.addEventListener('click', () => {
  const willExpand = autofixDetails.hidden;
  autofixDetails.hidden = !willExpand;
  autofixToggle.classList.toggle('expanded', willExpand);
});

autofixCopy.addEventListener('click', async () => {
  if (!lastFixedParagraphs) return;

  const html = paragraphsToHtml(lastFixedParagraphs);
  const plainText = paragraphsToPlainText(lastFixedParagraphs);

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    // Fallback: write plain text only
    await navigator.clipboard.writeText(plainText);
  }

  // Show "Copied!" feedback
  const original = autofixCopy.innerHTML;
  autofixCopy.textContent = 'Copied! \u2713';
  autofixCopy.classList.add('copied');
  setTimeout(() => {
    autofixCopy.innerHTML = original;
    autofixCopy.classList.remove('copied');
  }, 1500);
});

function renderDiagnostics() {
  const catFilter = filterCategory.value;
  const allDiags = getCurrentDiagnostics();

  // Close any open menus
  closeAllMenus();

  // Separate ignored from visible
  const visible: LintDiagnostic[] = [];
  const ignored: LintDiagnostic[] = [];

  for (const d of allDiags) {
    if (!activeSeverities.has(d.severity)) continue;
    if (catFilter !== 'all' && !d.rule.startsWith(catFilter + '.')) continue;

    if (settings.ignoredDiagnostics.includes(diagnosticFingerprint(d))) {
      ignored.push(d);
    } else {
      visible.push(d);
    }
  }

  if (visible.length === 0 && (!showIgnored || ignored.length === 0)) {
    diagnosticsList.innerHTML = '';
    // Don't show "No issues found" if the file failed to parse
    const hasParseError = !!packetResults[currentIndex]?.parseError;
    noIssues.hidden = hasParseError;
    if (!hasParseError) {
      noIssues.querySelector('p')!.textContent =
        catFilter !== 'all' ||
        activeSeverities.size < 3 ||
        allDiags.length > 0
          ? 'No issues match current filters.'
          : 'No issues found.';
    }
    return;
  }

  noIssues.hidden = true;

  const severityIcon: Record<Severity, string> = {
    error: '!',
    warning: '!',
    info: 'i',
  };

  let html = visible
    .map(
      (d, idx) => `
    <div class="diagnostic severity-${d.severity}${d.sourceText ? ' has-snippet' : ''}" data-diag-index="${idx}">
      <div class="diag-icon">${severityIcon[d.severity]}</div>
      <div class="diag-body">
        <div class="diag-rule">${d.rule}</div>
        <div class="diag-message">${escapeHtml(d.message)}</div>
        <div class="diag-location">${d.questionLabel || 'Paragraph ' + (d.paragraph + 1)}${d.answerPreview ? ' \u2014 ' + escapeHtml(d.answerPreview) : ''}</div>
        ${d.suggestion ? `<div class="diag-suggestion">${escapeHtml(d.suggestion)}</div>` : ''}
        ${d.sourceText ? `<div class="diag-snippet" hidden>${buildSnippet(d.sourceText, d.offset, d.length)}</div>` : ''}
      </div>
      <button class="diag-action" data-fp="${escapeHtml(diagnosticFingerprint(d))}" data-rule="${escapeHtml(d.rule)}" title="Actions">\u2026</button>
    </div>
  `
    )
    .join('');

  // Render ignored diagnostics if toggled on
  if (showIgnored && ignored.length > 0) {
    html += `<div class="ignored-separator">Ignored (${ignored.length})</div>`;
    html += ignored
      .map(
        (d) => `
      <div class="diagnostic severity-${d.severity} ignored">
        <div class="diag-icon">${severityIcon[d.severity]}</div>
        <div class="diag-body">
          <div class="diag-rule">${d.rule}</div>
          <div class="diag-message">${escapeHtml(d.message)}</div>
          <div class="diag-location">${d.questionLabel || 'Paragraph ' + (d.paragraph + 1)}${d.answerPreview ? ' \u2014 ' + escapeHtml(d.answerPreview) : ''}</div>
        </div>
        <button class="diag-unignore" data-fp="${escapeHtml(diagnosticFingerprint(d))}" title="Un-ignore">&#x2715;</button>
      </div>
    `
      )
      .join('');
  }

  diagnosticsList.innerHTML = html;

  // Add click handlers for expandable snippets
  for (const el of Array.from(
    diagnosticsList.querySelectorAll('.has-snippet')
  )) {
    el.addEventListener('click', (e) => {
      // Don't toggle snippet when clicking action button
      if ((e.target as HTMLElement).closest('.diag-action, .diag-menu')) return;
      const snippet = el.querySelector('.diag-snippet') as HTMLElement;
      if (snippet) {
        snippet.hidden = !snippet.hidden;
        el.classList.toggle('expanded');
      }
    });
  }

  // Add action button handlers
  for (const btn of Array.from(
    diagnosticsList.querySelectorAll('.diag-action')
  )) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const actionBtn = btn as HTMLElement;
      toggleActionMenu(actionBtn);
    });
  }

  // Add un-ignore button handlers
  for (const btn of Array.from(
    diagnosticsList.querySelectorAll('.diag-unignore')
  )) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fp = (btn as HTMLElement).dataset.fp!;
      settings.ignoredDiagnostics = settings.ignoredDiagnostics.filter(
        (f) => f !== fp
      );
      await saveSettings(settings);
      updateCounts();
      renderDiagnostics();
    });
  }
}

// --- Action menu ---

function closeAllMenus() {
  for (const menu of Array.from(document.querySelectorAll('.diag-menu'))) {
    menu.remove();
  }
}

function toggleActionMenu(actionBtn: HTMLElement) {
  const existing = actionBtn.parentElement?.querySelector('.diag-menu');
  closeAllMenus();
  if (existing) return; // Was open, now closed

  const fp = actionBtn.dataset.fp!;
  const ruleId = actionBtn.dataset.rule!;

  const shortName = ruleId.split('.')[1];

  const menu = document.createElement('div');
  menu.className = 'diag-menu';
  menu.innerHTML = `
    <button data-action="ignore">Ignore this instance</button>
    <button data-action="disable">Disable &ldquo;${escapeHtml(shortName)}&rdquo; rule</button>
  `;

  menu
    .querySelector('[data-action="ignore"]')!
    .addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!settings.ignoredDiagnostics.includes(fp)) {
        settings.ignoredDiagnostics.push(fp);
      }
      await saveSettings(settings);
      closeAllMenus();
      updateCounts();
      renderDiagnostics();
    });

  menu
    .querySelector('[data-action="disable"]')!
    .addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!settings.disabledRules.includes(ruleId)) {
        settings.disabledRules.push(ruleId);
      }
      await saveSettings(settings);
      closeAllMenus();
      filterOutRule(ruleId);
      showCurrentPacket();
    });

  actionBtn.parentElement!.appendChild(menu);
}

// Close menus on click outside
document.addEventListener('click', () => {
  closeAllMenus();
});

function buildSnippet(
  sourceText: string,
  offset?: number,
  length?: number
): string {
  const CONTEXT = 50;

  if (offset != null && length != null) {
    const start = Math.max(0, offset - CONTEXT);
    const end = Math.min(sourceText.length, offset + length + CONTEXT);

    const before = sourceText.substring(start, offset);
    const match = sourceText.substring(offset, offset + length);
    const after = sourceText.substring(offset + length, end);

    return (
      (start > 0 ? '\u2026' : '') +
      escapeHtml(before) +
      `<mark>${escapeHtml(match)}</mark>` +
      escapeHtml(after) +
      (end < sourceText.length ? '\u2026' : '')
    );
  }

  // No offset — show first ~100 chars as preview
  const preview = sourceText.substring(0, 100);
  return escapeHtml(preview) + (sourceText.length > 100 ? '\u2026' : '');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let toastTimeout: number | null = null;
function showToast(message: string, durationMs = 3000): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toastEl.hidden = true;
  }, durationMs);
}

/**
 * Google Docs clipboard HTML often omits empty paragraphs that represent
 * blank lines between questions. The plain text clipboard always preserves
 * them as consecutive newlines. This function walks both representations
 * in parallel and splices empty paragraphs back in where the plain text
 * has blank lines but the HTML paragraphs don't.
 *
 * When the HTML *does* already include the blank paragraph, we consume it
 * instead of inserting a duplicate — this prevents alignment drift that
 * would misassign subsequent paragraphs and break segmentation.
 */
function restoreBlankLines(
  htmlParas: Paragraph[],
  plainText: string
): Paragraph[] {
  const textLines = plainText.split('\n');
  const result: Paragraph[] = [];
  let htmlIdx = 0;

  for (const line of textLines) {
    if (line.trim() === '') {
      // Blank line — check if the HTML already has a matching blank paragraph
      if (
        htmlIdx < htmlParas.length &&
        htmlParas[htmlIdx].rawText.trim() === ''
      ) {
        // HTML already has this blank paragraph; consume it to stay aligned
        const para = htmlParas[htmlIdx];
        para.index = result.length;
        result.push(para);
        htmlIdx++;
      } else {
        // HTML dropped this blank paragraph; insert a synthetic one
        result.push({
          index: result.length,
          runs: [],
          rawText: '',
          hasPageBreak: false,
        });
      }
    } else if (htmlIdx < htmlParas.length) {
      // Content line — use the HTML-parsed paragraph (preserves formatting)
      const para = htmlParas[htmlIdx];
      para.index = result.length;
      result.push(para);
      htmlIdx++;
    }
  }

  // Append any remaining HTML paragraphs not matched to plain text lines
  while (htmlIdx < htmlParas.length) {
    const para = htmlParas[htmlIdx];
    para.index = result.length;
    result.push(para);
    htmlIdx++;
  }

  return result;
}
