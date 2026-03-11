// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  getElements,
  countVisibleDiagnostics,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Dark Mode + Other UI State', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  // Scenario 27
  describe('Dark mode toggle updates button icon', () => {
    beforeEach(async () => {
      controller = await createTestController({});
    });

    it('shows moon icon (◐) in light mode', () => {
      const el = getElements();
      expect(el.darkModeToggle.textContent).toBe('\u25D0');
    });

    it('shows sun icon (☀) after toggling to dark mode', async () => {
      await controller.toggleDarkMode();
      const el = getElements();
      expect(el.darkModeToggle.textContent).toBe('\u2600');
    });

    it('toggles dark class on body', async () => {
      expect(document.body.classList.contains('dark')).toBe(false);

      await controller.toggleDarkMode();
      expect(document.body.classList.contains('dark')).toBe(true);

      await controller.toggleDarkMode();
      expect(document.body.classList.contains('dark')).toBe(false);
    });
  });

  // Scenario 28
  describe('Dark mode persists through settings view', () => {
    it('dark class remains while settings view is open', async () => {
      controller = await createTestController({
        settings: { darkMode: true },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ rule: 'test.rule', message: 'Test' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      expect(document.body.classList.contains('dark')).toBe(true);

      controller.openSettings();
      expect(document.body.classList.contains('dark')).toBe(true);

      controller.closeSettings();
      expect(document.body.classList.contains('dark')).toBe(true);
    });
  });

  // Scenario 29
  describe('Dark mode + session restore', () => {
    it('restores dark mode when session is restored', async () => {
      controller = await createTestController({
        settings: { darkMode: true },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ rule: 'test.rule', message: 'Test' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      expect(document.body.classList.contains('dark')).toBe(true);
      expect(controller.settings.darkMode).toBe(true);
      // Results should also be displayed
      expect(getElements().resultsArea.hidden).toBe(false);
    });
  });

  // Scenario 30
  describe('Comfortable mode + diagnostic rendering', () => {
    it('adds comfortable class when enabled', async () => {
      controller = await createTestController({
        settings: { comfortableMode: true },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'error',
                  message: 'Error',
                }),
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'warning',
                  message: 'Warning',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      expect(document.body.classList.contains('comfortable')).toBe(true);
      // Diagnostics still render normally
      expect(countVisibleDiagnostics()).toBe(2);
    });

    it('toggles comfortable class on body', async () => {
      controller = await createTestController({});

      expect(document.body.classList.contains('comfortable')).toBe(false);

      await controller.toggleComfortableMode();
      expect(document.body.classList.contains('comfortable')).toBe(true);

      await controller.toggleComfortableMode();
      expect(document.body.classList.contains('comfortable')).toBe(false);
    });

    it('toggles active class on button', async () => {
      controller = await createTestController({});

      const el = getElements();
      expect(el.comfortableToggle.classList.contains('active')).toBe(false);

      await controller.toggleComfortableMode();
      expect(el.comfortableToggle.classList.contains('active')).toBe(true);
    });
  });

  // Scenario 31
  describe('Dark mode toggle during settings view', () => {
    it('dark mode can be toggled while in settings', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ rule: 'test.rule', message: 'Test' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      controller.openSettings();
      expect(document.body.classList.contains('dark')).toBe(false);

      await controller.toggleDarkMode();
      expect(document.body.classList.contains('dark')).toBe(true);
      expect(controller.settings.darkMode).toBe(true);

      // Settings view still visible
      expect(getElements().settingsView.hidden).toBe(false);
    });

    it('dark mode setting persists after closing settings', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ rule: 'test.rule', message: 'Test' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      controller.openSettings();
      await controller.toggleDarkMode();
      controller.closeSettings();

      expect(document.body.classList.contains('dark')).toBe(true);

      const stored = await chrome.storage.local.get('qbcheckSettings');
      expect(
        (stored.qbcheckSettings as { darkMode: boolean }).darkMode
      ).toBe(true);
    });
  });
});
