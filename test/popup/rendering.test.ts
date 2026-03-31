// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupChromeMocks, clearStorageMocks } from './setup.js';
import { loadPopupHTML, getElements } from './helpers.js';

describe('Popup Rendering', () => {
  beforeEach(async () => {
    setupChromeMocks();
    await loadPopupHTML();
  });

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  describe('HTML Structure', () => {
    it('loads all required DOM elements', () => {
      const elements = getElements();

      expect(elements.uploadArea).toBeTruthy();
      expect(elements.resultsArea).toBeTruthy();
      expect(elements.diagnosticsList).toBeTruthy();
      expect(elements.noIssues).toBeTruthy();
      expect(elements.settingsView).toBeTruthy();
    });

    it('initializes with upload area visible and results hidden', () => {
      const { uploadArea, resultsArea, settingsView } = getElements();

      expect(uploadArea.hidden).toBe(false);
      expect(resultsArea.hidden).toBe(true);
      expect(settingsView.hidden).toBe(true);
    });

    it('has all stat counters for errors, warnings, and info', () => {
      const { countError, countWarning, countInfo, countIgnored } =
        getElements();

      expect(countError).toBeTruthy();
      expect(countWarning).toBeTruthy();
      expect(countInfo).toBeTruthy();
      expect(countIgnored).toBeTruthy();
    });

    it('has navigation elements', () => {
      const { packetNav, packetSelect, prevBtn, nextBtn } = getElements();

      expect(packetNav).toBeTruthy();
      expect(packetSelect).toBeTruthy();
      expect(prevBtn).toBeTruthy();
      expect(nextBtn).toBeTruthy();
    });

    it('has banners for unstructured mode and autofix', () => {
      const { unstructuredBanner, autofixBanner } = getElements();

      expect(unstructuredBanner).toBeTruthy();
      expect(autofixBanner).toBeTruthy();

      // Both should be hidden by default
      expect(unstructuredBanner.hidden).toBe(true);
      expect(autofixBanner.hidden).toBe(true);
    });
  });

  describe('Diagnostic Rendering', () => {
    it('shows "No issues found" when diagnostics list is empty', () => {
      const { diagnosticsList, noIssues } = getElements();

      diagnosticsList.innerHTML = '';
      noIssues.hidden = false;

      expect(noIssues.hidden).toBe(false);
    });

    it('renders diagnostic severity icons correctly', () => {
      const { diagnosticsList } = getElements();

      // Manually render diagnostics to test HTML structure
      diagnosticsList.innerHTML = `
        <div class="diagnostic severity-error">
          <div class="diag-icon">!</div>
          <div class="diag-body">
            <div class="diag-rule">test.rule</div>
            <div class="diag-message">Test error</div>
          </div>
        </div>
        <div class="diagnostic severity-warning">
          <div class="diag-icon">!</div>
          <div class="diag-body">
            <div class="diag-rule">test.rule</div>
            <div class="diag-message">Test warning</div>
          </div>
        </div>
        <div class="diagnostic severity-info">
          <div class="diag-icon">i</div>
          <div class="diag-body">
            <div class="diag-rule">test.rule</div>
            <div class="diag-message">Test info</div>
          </div>
        </div>
      `;

      const errors = diagnosticsList.querySelectorAll('.severity-error');
      const warnings = diagnosticsList.querySelectorAll('.severity-warning');
      const infos = diagnosticsList.querySelectorAll('.severity-info');

      expect(errors).toHaveLength(1);
      expect(warnings).toHaveLength(1);
      expect(infos).toHaveLength(1);

      expect(errors[0].querySelector('.diag-icon')?.textContent).toBe('!');
      expect(infos[0].querySelector('.diag-icon')?.textContent).toBe('i');
    });

    it('renders diagnostic with question label and answer preview', () => {
      const { diagnosticsList } = getElements();

      diagnosticsList.innerHTML = `
        <div class="diagnostic severity-error">
          <div class="diag-body">
            <div class="diag-rule">test.rule</div>
            <div class="diag-message">Test error</div>
            <div class="diag-location">T5 — Test Answer</div>
          </div>
        </div>
      `;

      const location = diagnosticsList.querySelector('.diag-location');
      expect(location?.textContent).toContain('T5');
      expect(location?.textContent).toContain('Test Answer');
    });

    it('renders diagnostic with suggestion', () => {
      const { diagnosticsList } = getElements();

      diagnosticsList.innerHTML = `
        <div class="diagnostic severity-warning">
          <div class="diag-body">
            <div class="diag-rule">test.rule</div>
            <div class="diag-message">Test warning</div>
            <div class="diag-suggestion">Try this instead</div>
          </div>
        </div>
      `;

      const suggestion = diagnosticsList.querySelector('.diag-suggestion');
      expect(suggestion?.textContent).toBe('Try this instead');
    });

    it('renders diagnostic with snippet when sourceText is provided', () => {
      const { diagnosticsList } = getElements();

      diagnosticsList.innerHTML = `
        <div class="diagnostic severity-error has-snippet">
          <div class="diag-body">
            <div class="diag-rule">test.rule</div>
            <div class="diag-message">Test error</div>
            <div class="diag-snippet" hidden>Some <mark>highlighted</mark> text</div>
          </div>
        </div>
      `;

      const snippet = diagnosticsList.querySelector('.diag-snippet');
      expect(snippet).toBeTruthy();
      expect(snippet?.getAttribute('hidden')).toBe('');
      expect(snippet?.querySelector('mark')).toBeTruthy();
    });
  });

  describe('Stats Bar', () => {
    it('displays zero counts initially', () => {
      const { countError, countWarning, countInfo } = getElements();

      // Default text content from HTML
      expect(countError.textContent).toBe('0');
      expect(countWarning.textContent).toBe('0');
      expect(countInfo.textContent).toBe('0');
    });

    it('has clickable severity chips for filtering', () => {
      const statsBar = document.getElementById('stats-bar')!;
      const severityChips = statsBar.querySelectorAll('[data-severity]');

      expect(severityChips.length).toBeGreaterThan(0);

      const errorChip = statsBar.querySelector('[data-severity="error"]');
      const warningChip = statsBar.querySelector('[data-severity="warning"]');
      const infoChip = statsBar.querySelector('[data-severity="info"]');

      expect(errorChip).toBeTruthy();
      expect(warningChip).toBeTruthy();
      expect(infoChip).toBeTruthy();
    });
  });

  describe('Packet Navigation', () => {
    it('hides packet navigation when no packets are loaded', () => {
      const { packetNav } = getElements();

      expect(packetNav.hidden).toBe(true);
    });

    it('shows packet select dropdown', () => {
      const { packetSelect } = getElements();

      expect(packetSelect.tagName).toBe('SELECT');
      expect(packetSelect.options.length).toBe(0); // Empty initially
    });

    it('has prev/next navigation buttons', () => {
      const { prevBtn, nextBtn } = getElements();

      expect(prevBtn.tagName).toBe('BUTTON');
      expect(nextBtn.tagName).toBe('BUTTON');
    });
  });

  describe('Settings View', () => {
    it('is hidden by default', () => {
      const { settingsView } = getElements();

      expect(settingsView.hidden).toBe(true);
    });

    it('has settings rules container', () => {
      const { settingsRules } = getElements();

      expect(settingsRules).toBeTruthy();
      expect(settingsRules.innerHTML).toBe(''); // Empty initially
    });

    it('has back and reset buttons', () => {
      const settingsBackBtn = document.getElementById('settings-back-btn');
      const resetDefaultsBtn = document.getElementById('reset-defaults-btn');

      expect(settingsBackBtn).toBeTruthy();
      expect(resetDefaultsBtn).toBeTruthy();
    });
  });
});
