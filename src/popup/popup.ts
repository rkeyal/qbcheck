import { PopupController, PopupElements } from './popup-controller.js';
import { collectDocxFiles, readEntriesRecursive } from './popup-utils.js';

// --- DOM element lookups ---

const elements: PopupElements = {
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

// --- Controller instantiation ---

const controller = new PopupController(elements, {
  chromeStorage: chrome.storage,
  clipboard: navigator.clipboard,
});

// --- Initialization ---

controller.initialize().catch((e) => {
  console.warn('Failed to initialize popup:', e);
});

// --- Event wiring ---

// File input handler
elements.fileInput.addEventListener('change', () => {
  const files = collectDocxFiles(elements.fileInput.files);
  if (files.length > 0) controller.processFiles(files);
});

// Folder input handler
elements.folderInput.addEventListener('change', () => {
  const files = collectDocxFiles(elements.folderInput.files);
  if (files.length > 0) controller.processFiles(files);
});

// Drag and drop
elements.dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  elements.dropZone.classList.add('drag-over');
});

elements.dropZone.addEventListener('dragleave', () => {
  elements.dropZone.classList.remove('drag-over');
});

elements.dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  elements.dropZone.classList.remove('drag-over');
  elements.dropError.hidden = true;

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
        controller.processFiles(docx);
        return;
      }
      if (files.length > 0) {
        elements.dropError.textContent = 'Only .docx files are supported.';
        elements.dropError.hidden = false;
      }
      return;
    }
  }

  const droppedCount = e.dataTransfer?.files?.length ?? 0;
  const files = collectDocxFiles(e.dataTransfer?.files ?? null);
  if (files.length > 0) {
    controller.processFiles(files);
  } else if (droppedCount > 0) {
    elements.dropError.textContent = 'Only .docx files are supported.';
    elements.dropError.hidden = false;
  }
});

// Paste from clipboard
elements.pasteTarget.addEventListener('click', () => {
  elements.pasteTarget.focus();
  elements.pasteTarget.classList.add('paste-active');
});

elements.pasteTarget.addEventListener('blur', () => {
  elements.pasteTarget.classList.remove('paste-active');
});

elements.pasteTarget.addEventListener('paste', (e) => {
  e.preventDefault();
  const clipboardData = (e as ClipboardEvent).clipboardData;
  if (!clipboardData) return;

  const html = clipboardData.getData('text/html');
  const plainText = clipboardData.getData('text/plain');
  controller.handlePaste(html, plainText);
});

// Help button
elements.helpBtn.addEventListener('click', () => controller.showKeyboardHelp());

// Dark mode toggle
elements.darkModeToggle.addEventListener('click', () =>
  controller.toggleDarkMode()
);

// Comfortable mode toggle
elements.comfortableToggle.addEventListener('click', () =>
  controller.toggleComfortableMode()
);

// Clear button
elements.clearBtn.addEventListener('click', () => controller.clear());

// Severity filters
elements.statsBar.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest(
    '[data-severity]'
  ) as HTMLElement | null;
  if (!btn) return;
  const sev = btn.dataset.severity!;

  if (sev === 'ignored') {
    controller.showIgnored = !controller.showIgnored;
    btn.classList.toggle('active', controller.showIgnored);
    controller.renderDiagnostics();
  } else {
    controller.toggleSeverity(sev);
  }
});

// Navigation
elements.prevBtn.addEventListener('click', () => controller.navigatePrev());
elements.nextBtn.addEventListener('click', () => controller.navigateNext());

elements.packetSelect.addEventListener('change', () => {
  controller.navigateToPacket(parseInt(elements.packetSelect.value, 10));
});

// Debounce scroll saves
let scrollSaveTimeout: number | null = null;
elements.diagnosticsList.addEventListener('scroll', () => {
  if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
  scrollSaveTimeout = window.setTimeout(() => {
    controller.saveSession();
  }, 500);
});

// Settings view
elements.settingsBtn.addEventListener('click', () => {
  if (!elements.settingsView.hidden) {
    controller.closeSettings();
    return;
  }
  controller.openSettings();
});

elements.settingsBackBtn.addEventListener('click', () =>
  controller.closeSettings()
);

elements.resetDefaultsBtn.addEventListener('click', () =>
  controller.showResetConfirm()
);

elements.resetConfirmBtn.addEventListener('click', () =>
  controller.resetToDefaults()
);

// Auto-fix toggle/copy
elements.autofixToggle.addEventListener('click', () => {
  const willExpand = elements.autofixDetails.hidden;
  elements.autofixDetails.hidden = !willExpand;
  elements.autofixToggle.classList.toggle('expanded', willExpand);
});

elements.autofixCopy.addEventListener('click', () =>
  controller.copyFixedText()
);

// Master auto-fix toggle
elements.autofixMasterToggle.addEventListener('change', () =>
  controller.toggleAllAutoFixes()
);

// Close menus on click outside
document.addEventListener('click', () => controller.closeAllMenus());

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

  const resultsVisible = !elements.resultsArea.hidden;
  const settingsVisible = !elements.settingsView.hidden;

  switch (e.key) {
    case 'ArrowLeft':
      if (
        resultsVisible &&
        controller.packetResults.length > 1 &&
        controller.currentIndex > 0
      ) {
        e.preventDefault();
        controller.navigatePrev();
      }
      break;

    case 'ArrowRight':
      if (
        resultsVisible &&
        controller.packetResults.length > 1 &&
        controller.currentIndex < controller.packetResults.length - 1
      ) {
        e.preventDefault();
        controller.navigateNext();
      }
      break;

    case 'e':
    case 'E':
      if (resultsVisible && !settingsVisible) {
        e.preventDefault();
        controller.toggleSeverity('error');
      }
      break;

    case 'w':
    case 'W':
      if (resultsVisible && !settingsVisible) {
        e.preventDefault();
        controller.toggleSeverity('warning');
      }
      break;

    case 'i':
    case 'I':
      if (resultsVisible && !settingsVisible) {
        e.preventDefault();
        controller.toggleSeverity('info');
      }
      break;

    case 'Escape': {
      const helpModal = document.getElementById('keyboard-help-modal');
      if (helpModal) {
        e.preventDefault();
        helpModal.remove();
      } else if (settingsVisible) {
        e.preventDefault();
        controller.closeSettings();
      } else if (resultsVisible) {
        controller.closeAllMenus();
        if (document.activeElement === elements.pasteTarget) {
          elements.pasteTarget.blur();
        }
      }
      break;
    }

    case '?':
      if (resultsVisible || settingsVisible) {
        e.preventDefault();
        controller.showKeyboardHelp();
      }
      break;
  }

  // Handle number keys 1-9 for packet jumping
  if (resultsVisible && !settingsVisible && /^[1-9]$/.test(e.key)) {
    const packetNum = parseInt(e.key, 10);
    if (packetNum <= controller.packetResults.length) {
      e.preventDefault();
      controller.navigateToPacket(packetNum - 1);
    }
  }
});
