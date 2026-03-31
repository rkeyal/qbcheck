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
import {
  PacketResult,
  QBLintSettings,
  SessionState,
  DEFAULT_SETTINGS,
  escapeHtml,
  buildSnippet,
  diagnosticFingerprint,
  restoreBlankLines,
  getAutoFixableRuleIds,
} from './popup-utils.js';

export interface PopupElements {
  uploadArea: HTMLElement;
  resultsArea: HTMLElement;
  fileInput: HTMLInputElement;
  folderInput: HTMLInputElement;
  dropZone: HTMLElement;
  fileNameEl: HTMLElement;
  clearBtn: HTMLElement;
  countError: HTMLElement;
  countWarning: HTMLElement;
  countInfo: HTMLElement;
  countIgnored: HTMLElement;
  statsBar: HTMLElement;
  diagnosticsList: HTMLElement;
  noIssues: HTMLElement;
  packetNav: HTMLElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  packetSelect: HTMLSelectElement;
  packetCounter: HTMLElement;
  settingsBtn: HTMLElement;
  settingsView: HTMLElement;
  settingsRules: HTMLElement;
  settingsBackBtn: HTMLElement;
  resetDefaultsBtn: HTMLElement;
  ignoredChip: HTMLButtonElement;
  pasteTarget: HTMLElement;
  unstructuredBanner: HTMLElement;
  autofixBanner: HTMLElement;
  autofixCount: HTMLElement;
  autofixToggle: HTMLButtonElement;
  autofixCopy: HTMLButtonElement;
  autofixDetails: HTMLElement;
  darkModeToggle: HTMLButtonElement;
  comfortableToggle: HTMLButtonElement;
  autofixMasterToggle: HTMLInputElement;
  helpBtn: HTMLElement;
  toastEl: HTMLElement;
  dropError: HTMLElement;
  parseErrorBanner: HTMLElement;
  parseErrorMessage: HTMLElement;
  relintWarning: HTMLElement;
  resetConfirmBtn: HTMLButtonElement;
}

export interface PopupDeps {
  chromeStorage: {
    local: {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
    session: {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
  clipboard: {
    write(items: ClipboardItem[]): Promise<void>;
    writeText(text: string): Promise<void>;
  };
}

export class PopupController {
  private el: PopupElements;
  private deps: PopupDeps;

  packetResults: PacketResult[] = [];
  currentIndex: number = 0;
  settings: QBLintSettings = { ...DEFAULT_SETTINGS };
  activeSeverities = new Set<string>(['error', 'warning', 'info']);
  showIgnored = false;
  lastParsedPackets: (Packet | null)[] = [];
  lastFixedParagraphs: Paragraph[] | null = null;
  lastAppliedFixes: LintDiagnostic[] = [];
  isPasteMode = false;
  needsRelint = false;
  resetConfirmTimeout: number | null = null;
  toastTimeout: number | null = null;

  constructor(elements: PopupElements, deps: PopupDeps) {
    this.el = elements;
    this.deps = deps;
  }

  // --- Settings persistence ---

  async loadSettings(): Promise<QBLintSettings> {
    try {
      const result = await this.deps.chromeStorage.local.get([
        'qbcheckSettings',
        'qblintSettings',
      ]);
      const stored =
        (result.qbcheckSettings as QBLintSettings | undefined) ??
        (result.qblintSettings as QBLintSettings | undefined);
      if (!stored) {
        return {
          disabledRules: [...DEFAULT_SETTINGS.disabledRules],
          ignoredDiagnostics: [],
          autoFixDisabled: [],
          darkMode: false,
          comfortableMode: false,
        };
      }
      return {
        disabledRules: stored.disabledRules ?? [],
        ignoredDiagnostics: stored.ignoredDiagnostics ?? [],
        autoFixDisabled: stored.autoFixDisabled ?? [],
        darkMode: stored.darkMode ?? false,
        comfortableMode: stored.comfortableMode ?? false,
      };
    } catch {
      return {
        disabledRules: [...DEFAULT_SETTINGS.disabledRules],
        ignoredDiagnostics: [],
        autoFixDisabled: [],
        darkMode: false,
        comfortableMode: false,
      };
    }
  }

  async saveSettings(s: QBLintSettings): Promise<void> {
    try {
      await this.deps.chromeStorage.local.set({ qbcheckSettings: s });
    } catch {
      // Storage unavailable (e.g., dev mode without extension context)
    }
  }

  // --- Session persistence ---

  async saveSession(): Promise<void> {
    if (this.packetResults.length === 0) {
      await this.clearSession();
      return;
    }

    const scrollPos = this.el.diagnosticsList.scrollTop || 0;

    const sessionState: SessionState = {
      packetResults: this.packetResults,
      currentIndex: this.currentIndex,
      scrollPosition: scrollPos,
      mode: this.isPasteMode ? 'paste' : 'file',
    };

    try {
      await this.deps.chromeStorage.session.set({
        qbcheckSession: sessionState,
      });
    } catch (e) {
      console.warn('Failed to save session:', e);
    }
  }

  async loadSession(): Promise<SessionState | null> {
    try {
      const result =
        await this.deps.chromeStorage.session.get('qbcheckSession');
      const session = result.qbcheckSession as SessionState | undefined;
      return session || null;
    } catch {
      return null;
    }
  }

  async clearSession(): Promise<void> {
    try {
      await this.deps.chromeStorage.session.remove('qbcheckSession');
    } catch {
      // Ignore errors
    }
  }

  // --- Core helpers ---

  getCurrentDiagnostics(): LintDiagnostic[] {
    return this.packetResults[this.currentIndex]?.diagnostics ?? [];
  }

  isRestoredSession(): boolean {
    return (
      this.packetResults.length > 0 && this.lastParsedPackets.length === 0
    );
  }

  // --- Initialization ---

  async initialize(): Promise<void> {
    const [s, session] = await Promise.all([
      this.loadSettings(),
      this.loadSession(),
    ]);
    this.settings = s;

    // Apply dark mode
    if (this.settings.darkMode) {
      document.body.classList.add('dark');
    }
    this.el.darkModeToggle.textContent = this.settings.darkMode
      ? '\u2600'
      : '\u25D0';

    // Apply comfortable mode
    if (this.settings.comfortableMode) {
      document.body.classList.add('comfortable');
    }
    this.el.comfortableToggle.classList.toggle(
      'active',
      this.settings.comfortableMode
    );

    if (session) {
      // Restore UI state
      this.packetResults = session.packetResults;
      this.currentIndex = session.currentIndex;
      this.isPasteMode = session.mode === 'paste';

      // Show results UI
      this.el.uploadArea.hidden = true;
      this.el.resultsArea.hidden = false;
      this.populatePacketSelect();
      this.showCurrentPacket();

      // Restore scroll position after render
      setTimeout(() => {
        this.el.diagnosticsList.scrollTop = session.scrollPosition || 0;
      }, 0);
    } else {
      // No session to restore — auto-focus paste target so Ctrl+V works immediately
      this.el.pasteTarget.focus();
    }
  }

  // --- State management ---

  toggleSeverity(severity: string): void {
    if (this.activeSeverities.has(severity)) {
      if (this.activeSeverities.size === 1) return;
      this.activeSeverities.delete(severity);
    } else {
      this.activeSeverities.add(severity);
    }

    const btn = document.querySelector(`[data-severity="${severity}"]`);
    if (btn) {
      btn.classList.toggle('active', this.activeSeverities.has(severity));
    }

    this.renderDiagnostics();
  }

  filterOutRule(ruleId: string): void {
    for (const pr of this.packetResults) {
      pr.diagnostics = pr.diagnostics.filter((d) => d.rule !== ruleId);
    }
  }

  relintAll(): void {
    if (this.lastParsedPackets.length === 0) return;

    const useInference = this.lastParsedPackets.length > 3;
    const disabledSet = new Set(this.settings.disabledRules);
    if (useInference) disabledSet.add('tag.valid-category');

    for (let i = 0; i < this.lastParsedPackets.length; i++) {
      const packet = this.lastParsedPackets[i];
      if (!packet) {
        this.packetResults[i] = {
          filename: this.packetResults[i].filename,
          diagnostics: [],
        };
        continue;
      }
      this.packetResults[i] = {
        filename: this.packetResults[i].filename,
        diagnostics: lint(packet, disabledSet),
      };
    }

    // Cross-packet inference
    if (useInference) {
      const validPackets = this.lastParsedPackets.filter(
        (p): p is Packet => p !== null
      );
      if (validPackets.length > 3) {
        const crossDiags = inferCrossPacketCategories(validPackets);
        let validIdx = 0;
        for (let i = 0; i < this.lastParsedPackets.length; i++) {
          if (this.lastParsedPackets[i] === null) continue;
          const diags = crossDiags[validIdx++];
          if (diags.length > 0) {
            this.packetResults[i].diagnostics.push(...diags);
            this.packetResults[i].diagnostics.sort(
              (a, b) => a.paragraph - b.paragraph
            );
          }
        }
      }
    }
  }

  syncAutofixMaster(): void {
    this.el.autofixMasterToggle.checked =
      this.settings.autoFixDisabled.length === 0;
  }

  // --- UI transitions ---

  openSettings(): void {
    this.el.uploadArea.hidden = true;
    this.el.resultsArea.hidden = true;
    this.el.settingsView.hidden = false;
    this.el.relintWarning.hidden = true;
    this.renderSettingsRules();
  }

  closeSettings(): void {
    this.el.settingsView.hidden = true;
    if (this.packetResults.length > 0) {
      this.el.resultsArea.hidden = false;
      if (this.needsRelint && this.lastParsedPackets.length > 0) {
        this.relintAll();
        this.needsRelint = false;
      }
      this.showCurrentPacket();
    } else {
      this.el.uploadArea.hidden = false;
    }
  }

  showKeyboardHelp(): void {
    let helpModal = document.getElementById('keyboard-help-modal');

    if (!helpModal) {
      helpModal = document.createElement('div');
      helpModal.id = 'keyboard-help-modal';
      helpModal.className = 'modal-overlay';
      helpModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="help-tabs">
            <button class="help-tab active" data-tab="about">About</button>
            <button class="help-tab" data-tab="shortcuts">Shortcuts</button>
          </div>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="help-tab-content" data-tab-content="about">
            <div class="help-about-section">
              <p>qbcheck proofreads quizbowl questions for style and formatting issues.</p>
              <p>Upload <strong>.docx</strong> packet files, or <strong>paste</strong> questions directly from Google Docs or Word.</p>
            </div>
            <div class="help-about-section">
              <h3>Severity levels</h3>
              <div class="help-severity-row">
                <span class="help-sev-dot help-sev-error"></span>
                <span><strong>Error</strong> &mdash; likely wrong, should be fixed</span>
              </div>
              <div class="help-severity-row">
                <span class="help-sev-dot help-sev-warning"></span>
                <span><strong>Warning</strong> &mdash; probably needs attention</span>
              </div>
              <div class="help-severity-row">
                <span class="help-sev-dot help-sev-info"></span>
                <span><strong>Info</strong> &mdash; stylistic suggestion</span>
              </div>
            </div>
            <div class="help-about-section">
              <h3>Tips</h3>
              <ul class="help-tips">
                <li>When you <strong>paste</strong> questions, some issues are auto-fixed. Click <strong>Copy</strong> to get the corrected text.</li>
                <li>Click <strong>&#x2026;</strong> on any issue to ignore it or disable that rule.</li>
                <li>Click an issue to expand it and see the surrounding text.</li>
              </ul>
            </div>
          </div>
          <div class="help-tab-content" data-tab-content="shortcuts" hidden>
            <div class="shortcut-section">
              <h3>Navigation</h3>
              <div class="shortcut-row">
                <kbd>&#x2190;</kbd> <kbd>&#x2192;</kbd>
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
      </div>
    `;
      document.body.appendChild(helpModal);

      // Tab switching
      const tabs = helpModal.querySelectorAll('.help-tab');
      const contents = helpModal.querySelectorAll('.help-tab-content');
      for (const tab of Array.from(tabs)) {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = (tab as HTMLElement).dataset.tab!;
          for (const t of Array.from(tabs)) t.classList.remove('active');
          tab.classList.add('active');
          for (const c of Array.from(contents)) {
            (c as HTMLElement).hidden =
              (c as HTMLElement).dataset.tabContent !== target;
          }
        });
      }

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

  showToast(message: string, durationMs = 3000): void {
    this.el.toastEl.textContent = message;
    this.el.toastEl.hidden = false;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.el.toastEl.hidden = true;
    }, durationMs);
  }

  closeAllMenus(): void {
    for (const menu of Array.from(document.querySelectorAll('.diag-menu'))) {
      menu.remove();
    }
  }

  toggleActionMenu(actionBtn: HTMLElement): void {
    const existing = actionBtn.parentElement?.querySelector('.diag-menu');
    this.closeAllMenus();
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
        if (!this.settings.ignoredDiagnostics.includes(fp)) {
          this.settings.ignoredDiagnostics.push(fp);
        }
        await this.saveSettings(this.settings);
        this.closeAllMenus();
        this.updateCounts();
        this.renderDiagnostics();
      });

    menu
      .querySelector('[data-action="disable"]')!
      .addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!this.settings.disabledRules.includes(ruleId)) {
          this.settings.disabledRules.push(ruleId);
        }
        await this.saveSettings(this.settings);
        this.closeAllMenus();
        this.filterOutRule(ruleId);
        this.showCurrentPacket();
      });

    actionBtn.parentElement!.appendChild(menu);
  }

  // --- Input processing ---

  async processFiles(files: File[]): Promise<void> {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

    // Reset auto-fix state (not available in packet mode)
    this.lastFixedParagraphs = null;
    this.lastAppliedFixes = [];
    this.isPasteMode = false;

    // Close settings if open
    this.el.settingsView.hidden = true;
    this.el.uploadArea.hidden = true;
    this.el.resultsArea.hidden = false;
    this.el.noIssues.hidden = true;
    this.el.diagnosticsList.innerHTML = `<div class="loading">Analyzing 0 / ${sorted.length}...</div>`;

    const useInference = sorted.length > 3;
    const disabledSet = new Set(this.settings.disabledRules);
    if (useInference) disabledSet.add('tag.valid-category');

    this.packetResults = [];
    const packets: (Packet | null)[] = [];

    for (let i = 0; i < sorted.length; i++) {
      this.el.diagnosticsList.innerHTML = `<div class="loading">Analyzing ${i + 1} / ${sorted.length}...</div>`;

      try {
        const file = sorted[i];
        const buffer = await file.arrayBuffer();
        const paragraphs = await parseDocx(buffer);
        const packet = segmentPacket(paragraphs);
        const diagnostics = lint(packet, disabledSet);
        packets.push(packet);
        this.packetResults.push({ filename: file.name, diagnostics });
      } catch {
        packets.push(null);
        this.packetResults.push({
          filename: sorted[i].name,
          diagnostics: [],
          parseError: `Failed to parse ${sorted[i].name}. The file may be corrupted or not a valid .docx.`,
        });
      }
    }

    this.lastParsedPackets = packets;

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
            this.packetResults[i].diagnostics.push(...diags);
            this.packetResults[i].diagnostics.sort(
              (a, b) => a.paragraph - b.paragraph
            );
          }
        }
      }
    }

    this.currentIndex = 0;
    this.populatePacketSelect();
    this.showCurrentPacket();
    this.saveSession();
  }

  handlePaste(html: string, plainText: string): void {
    if (!html && !plainText) {
      this.showToast('No text found in clipboard. Copy some questions first.');
      return;
    }

    // Show loading state
    this.el.settingsView.hidden = true;
    this.el.uploadArea.hidden = true;
    this.el.resultsArea.hidden = false;
    this.el.diagnosticsList.innerHTML =
      '<div class="loading">Analyzing pasted text...</div>';

    // Defer processing to allow the loading UI to render
    setTimeout(() => {
      try {
        let paragraphs = html
          ? parseHtml(html)
          : parseHtml(
              `<p>${escapeHtml(plainText).split('\n').join('</p><p>')}</p>`
            );

        // Google Docs clipboard HTML may drop blank lines between paragraphs.
        if (html && plainText) {
          paragraphs = restoreBlankLines(paragraphs, plainText);
        }

        if (paragraphs.length === 0) {
          this.showToast('No content found in clipboard.');
          this.el.uploadArea.hidden = false;
          this.el.resultsArea.hidden = true;
          return;
        }

        const packet = segmentPacket(paragraphs);
        const disabledSet = new Set(this.settings.disabledRules);
        const diagnostics = lint(packet, disabledSet);

        // Apply auto-fixes
        const fixResult = applyFixes(
          paragraphs,
          diagnostics,
          this.settings.autoFixDisabled
        );
        this.lastFixedParagraphs =
          fixResult.fixCount > 0 ? fixResult.fixedParagraphs : null;
        this.lastAppliedFixes = fixResult.appliedFixes;
        this.isPasteMode = true;

        this.lastParsedPackets = [packet];
        this.packetResults = [
          {
            filename: 'Pasted text',
            diagnostics: fixResult.remainingDiagnostics,
          },
        ];
        this.currentIndex = 0;

        this.populatePacketSelect();
        this.showCurrentPacket();
        this.saveSession();
      } catch (e) {
        console.warn('Failed to process pasted text:', e);
        this.showToast('Failed to process pasted text. Please try again.');
        this.el.uploadArea.hidden = false;
        this.el.resultsArea.hidden = true;
      }
    }, 0);
  }

  clear(): void {
    this.packetResults = [];
    this.currentIndex = 0;
    this.lastParsedPackets = [];
    this.lastFixedParagraphs = null;
    this.lastAppliedFixes = [];
    this.isPasteMode = false;
    this.el.uploadArea.hidden = false;
    this.el.resultsArea.hidden = true;
    this.el.settingsView.hidden = true;
    this.el.fileInput.value = '';
    this.el.folderInput.value = '';
    this.clearSession();
    this.el.pasteTarget.focus();
  }

  // --- Core rendering ---

  populatePacketSelect(): void {
    this.el.packetSelect.innerHTML = this.packetResults
      .map(
        (r, i) => `<option value="${i}">${escapeHtml(r.filename)}</option>`
      )
      .join('');
  }

  showCurrentPacket(): void {
    const result = this.packetResults[this.currentIndex];
    if (!result) return;

    this.el.fileNameEl.textContent = result.filename;
    this.el.packetSelect.value = String(this.currentIndex);
    this.el.packetCounter.textContent = `${this.currentIndex + 1} / ${this.packetResults.length}`;

    // Show/hide navigation bar
    this.el.packetNav.hidden = this.packetResults.length <= 1;

    // Update button states
    this.el.prevBtn.disabled = this.currentIndex === 0;
    this.el.nextBtn.disabled =
      this.currentIndex === this.packetResults.length - 1;

    // Show/hide parse error banner
    const currentResult = this.packetResults[this.currentIndex];
    if (currentResult?.parseError) {
      this.el.parseErrorBanner.hidden = false;
      this.el.parseErrorMessage.textContent = currentResult.parseError;
    } else {
      this.el.parseErrorBanner.hidden = true;
    }

    // Show/hide unstructured banner
    const currentPacket = this.lastParsedPackets[this.currentIndex];
    this.el.unstructuredBanner.hidden =
      !currentPacket || currentPacket.structured !== false;

    // Show/hide auto-fix banner
    this.renderAutofixBanner();

    // Reset scroll to top when switching packets
    this.el.diagnosticsList.scrollTop = 0;

    this.updateCounts();
    this.renderDiagnostics();

    // Save session after updating state
    this.saveSession();
  }

  updateCounts(): void {
    const diags = this.getCurrentDiagnostics();
    const ignoredFps = new Set(this.settings.ignoredDiagnostics);

    let errors = 0,
      warnings = 0,
      infos = 0,
      ignoredCount = 0;
    for (const d of diags) {
      if (ignoredFps.has(diagnosticFingerprint(d))) {
        ignoredCount++;
      } else {
        if (d.severity === 'error') errors++;
        else if (d.severity === 'warning') warnings++;
        else infos++;
      }
    }

    this.el.countError.textContent = String(errors);
    this.el.countWarning.textContent = String(warnings);
    this.el.countInfo.textContent = String(infos);
    this.el.countIgnored.textContent = String(ignoredCount);
    this.el.ignoredChip.hidden = ignoredCount === 0;
  }

  renderAutofixBanner(): void {
    if (!this.isPasteMode || this.lastAppliedFixes.length === 0) {
      this.el.autofixBanner.hidden = true;
      return;
    }

    this.el.autofixBanner.hidden = false;
    this.el.autofixCount.textContent = String(this.lastAppliedFixes.length);

    // Render fix details
    const CONTEXT = 30;
    this.el.autofixDetails.innerHTML = this.lastAppliedFixes
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
        } else if (d.formatFix) {
          diffHtml = `
          <div class="autofix-item-diff">
            <div class="diff-new">Formatting stripped from space</div>
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

  renderSettingsRules(): void {
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

    this.el.settingsRules.innerHTML = Array.from(groups.entries())
      .map(
        ([cat, rules]) => `
      <div class="rule-group">
        <div class="rule-group-header">${CATEGORY_LABELS[cat] || cat}</div>
        ${rules
          .map((r) => {
            const checked = !this.settings.disabledRules.includes(r.id);
            const shortId = r.id.split('.')[1];
            return `
            <div class="rule-item">
              <input type="checkbox" data-rule-id="${r.id}" ${checked ? 'checked' : ''}>
              <div class="rule-item-text">
                <div class="rule-item-id">${shortId}${r.autoFixable ? ' <span class="rule-autofix-badge">auto-fix</span>' : ''}</div>
                <div class="rule-item-desc">${escapeHtml(r.description)}</div>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    `
      )
      .join('');

    // Bind rule enable/disable handlers
    for (const cb of Array.from(
      this.el.settingsRules.querySelectorAll('input[data-rule-id]')
    )) {
      cb.addEventListener('change', async (e) => {
        const input = e.target as HTMLInputElement;
        const ruleId = input.dataset.ruleId!;
        if (input.checked) {
          this.settings.disabledRules = this.settings.disabledRules.filter(
            (r) => r !== ruleId
          );
          this.needsRelint = true;
          if (this.isRestoredSession()) {
            this.el.relintWarning.hidden = false;
          }
        } else {
          if (!this.settings.disabledRules.includes(ruleId)) {
            this.settings.disabledRules.push(ruleId);
          }
          this.filterOutRule(ruleId);
        }
        await this.saveSettings(this.settings);
      });
    }

    // Sync master auto-fix checkbox state
    this.el.autofixMasterToggle.checked =
      this.settings.autoFixDisabled.length === 0;
  }

  renderDiagnostics(): void {
    const allDiags = this.getCurrentDiagnostics();

    // Close any open menus
    this.closeAllMenus();

    // Separate ignored from visible
    const visible: LintDiagnostic[] = [];
    const ignored: LintDiagnostic[] = [];

    for (const d of allDiags) {
      if (!this.activeSeverities.has(d.severity)) continue;

      if (
        this.settings.ignoredDiagnostics.includes(diagnosticFingerprint(d))
      ) {
        ignored.push(d);
      } else {
        visible.push(d);
      }
    }

    if (
      visible.length === 0 &&
      (!this.showIgnored || ignored.length === 0)
    ) {
      this.el.diagnosticsList.innerHTML = '';
      // Don't show "No issues found" if the file failed to parse
      const hasParseError =
        !!this.packetResults[this.currentIndex]?.parseError;
      this.el.noIssues.hidden = hasParseError;
      if (!hasParseError) {
        this.el.noIssues.querySelector('p')!.textContent =
          this.activeSeverities.size < 3 || allDiags.length > 0
            ? 'No issues match current filters.'
            : 'No issues found.';
      }
      return;
    }

    this.el.noIssues.hidden = true;

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
      <button class="diag-action" data-fp="${escapeHtml(diagnosticFingerprint(d))}" data-rule="${escapeHtml(d.rule)}" title="Actions">&#x2026;</button>
    </div>
  `
      )
      .join('');

    // Render ignored diagnostics if toggled on
    if (this.showIgnored && ignored.length > 0) {
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

    this.el.diagnosticsList.innerHTML = html;

    // Add click handlers for expandable snippets
    for (const el of Array.from(
      this.el.diagnosticsList.querySelectorAll('.has-snippet')
    )) {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.diag-action, .diag-menu'))
          return;
        const snippet = el.querySelector('.diag-snippet') as HTMLElement;
        if (snippet) {
          snippet.hidden = !snippet.hidden;
          el.classList.toggle('expanded');
        }
      });
    }

    // Add action button handlers
    for (const btn of Array.from(
      this.el.diagnosticsList.querySelectorAll('.diag-action')
    )) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const actionBtn = btn as HTMLElement;
        this.toggleActionMenu(actionBtn);
      });
    }

    // Add un-ignore button handlers
    for (const btn of Array.from(
      this.el.diagnosticsList.querySelectorAll('.diag-unignore')
    )) {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fp = (btn as HTMLElement).dataset.fp!;
        this.settings.ignoredDiagnostics =
          this.settings.ignoredDiagnostics.filter((f) => f !== fp);
        await this.saveSettings(this.settings);
        this.updateCounts();
        this.renderDiagnostics();
      });
    }
  }

  // --- Clipboard copy ---

  async copyFixedText(): Promise<void> {
    if (!this.lastFixedParagraphs) return;

    const html = paragraphsToHtml(this.lastFixedParagraphs);
    const plainText = paragraphsToPlainText(this.lastFixedParagraphs);

    try {
      await this.deps.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      // Fallback: write plain text only
      await this.deps.clipboard.writeText(plainText);
    }

    // Show "Copied!" feedback
    const original = this.el.autofixCopy.innerHTML;
    this.el.autofixCopy.textContent = 'Copied! \u2713';
    this.el.autofixCopy.classList.add('copied');
    setTimeout(() => {
      this.el.autofixCopy.innerHTML = original;
      this.el.autofixCopy.classList.remove('copied');
    }, 1500);
  }

  // --- Dark mode / Comfortable mode ---

  async toggleDarkMode(): Promise<void> {
    this.settings.darkMode = !this.settings.darkMode;
    document.body.classList.toggle('dark', this.settings.darkMode);
    this.el.darkModeToggle.textContent = this.settings.darkMode
      ? '\u2600'
      : '\u25D0';
    await this.saveSettings(this.settings);
  }

  async toggleComfortableMode(): Promise<void> {
    this.settings.comfortableMode = !this.settings.comfortableMode;
    document.body.classList.toggle('comfortable', this.settings.comfortableMode);
    this.el.comfortableToggle.classList.toggle(
      'active',
      this.settings.comfortableMode
    );
    await this.saveSettings(this.settings);
  }

  // --- Reset ---

  async resetToDefaults(): Promise<void> {
    if (this.resetConfirmTimeout) clearTimeout(this.resetConfirmTimeout);
    this.el.resetDefaultsBtn.hidden = false;
    this.el.resetConfirmBtn.hidden = true;

    this.settings = {
      disabledRules: [...DEFAULT_SETTINGS.disabledRules],
      ignoredDiagnostics: [],
      autoFixDisabled: [],
      darkMode: false,
      comfortableMode: false,
    };
    await this.saveSettings(this.settings);
    document.body.classList.remove('dark');
    this.el.darkModeToggle.textContent = '\u25D0';
    document.body.classList.remove('comfortable');
    this.el.comfortableToggle.classList.remove('active');
    this.renderSettingsRules();
    if (this.lastParsedPackets.length > 0) {
      this.relintAll();
    }
  }

  showResetConfirm(): void {
    this.el.resetDefaultsBtn.hidden = true;
    this.el.resetConfirmBtn.hidden = false;
    if (this.resetConfirmTimeout) clearTimeout(this.resetConfirmTimeout);
    this.resetConfirmTimeout = window.setTimeout(() => {
      this.el.resetDefaultsBtn.hidden = false;
      this.el.resetConfirmBtn.hidden = true;
    }, 3000);
  }

  // --- Master autofix toggle ---

  async toggleAllAutoFixes(): Promise<void> {
    const allIds = getAutoFixableRuleIds();

    if (this.el.autofixMasterToggle.checked) {
      // Turning on: clear all disabled
      this.settings.autoFixDisabled = [];
    } else {
      // Turning off: disable all
      this.settings.autoFixDisabled = [...allIds];
    }

    await this.saveSettings(this.settings);
  }

  // --- Navigation ---

  navigatePrev(): void {
    this.currentIndex = Math.max(0, this.currentIndex - 1);
    this.showCurrentPacket();
  }

  navigateNext(): void {
    this.currentIndex = Math.min(
      this.packetResults.length - 1,
      this.currentIndex + 1
    );
    this.showCurrentPacket();
  }

  navigateToPacket(index: number): void {
    if (index < 0 || index >= this.packetResults.length) return;
    this.currentIndex = index;
    this.showCurrentPacket();
  }
}
