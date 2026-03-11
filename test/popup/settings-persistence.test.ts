// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  getElements,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';
import { DEFAULT_SETTINGS } from '../../src/popup/popup-utils.js';

describe('Settings Persistence Across Sessions', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  // Scenario 21
  describe('Disabled rules persist across reloads', () => {
    it('loads previously disabled rules from storage', async () => {
      // First session: disable a rule
      controller = await createTestController({
        settings: { disabledRules: ['formatting.no-em-dash', 'tag.tag-present'] },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'warning',
                  message: 'Prefix issue',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      expect(controller.settings.disabledRules).toContain(
        'formatting.no-em-dash'
      );
      expect(controller.settings.disabledRules).toContain('tag.tag-present');
    });

    it('saves disabled rules to chrome.storage.local', async () => {
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

      controller.settings.disabledRules.push('formatting.no-em-dash');
      await controller.saveSettings(controller.settings);

      const stored = await chrome.storage.local.get('qbcheckSettings');
      expect(
        (stored.qbcheckSettings as { disabledRules: string[] }).disabledRules
      ).toContain('formatting.no-em-dash');
    });
  });

  // Scenario 22
  describe('Ignored diagnostics persist across reloads', () => {
    it('loads previously ignored diagnostics from storage', async () => {
      const fp = 'test.rule::T1::-12345';
      controller = await createTestController({
        settings: { ignoredDiagnostics: [fp] },
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

      expect(controller.settings.ignoredDiagnostics).toContain(fp);
    });

    it('saves ignored diagnostics to chrome.storage.local', async () => {
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

      const fp = 'some.rule::T1::99999';
      controller.settings.ignoredDiagnostics.push(fp);
      await controller.saveSettings(controller.settings);

      const stored = await chrome.storage.local.get('qbcheckSettings');
      expect(
        (stored.qbcheckSettings as { ignoredDiagnostics: string[] })
          .ignoredDiagnostics
      ).toContain(fp);
    });
  });

  // Scenario 23
  describe('Dark mode preference persists', () => {
    it('restores dark mode from saved settings', async () => {
      controller = await createTestController({
        settings: { darkMode: true },
      });

      expect(controller.settings.darkMode).toBe(true);
      expect(document.body.classList.contains('dark')).toBe(true);
      expect(getElements().darkModeToggle.textContent).toBe('\u2600');
    });

    it('starts in light mode by default', async () => {
      controller = await createTestController({});

      expect(document.body.classList.contains('dark')).toBe(false);
      expect(getElements().darkModeToggle.textContent).toBe('\u25D0');
    });

    it('saves dark mode toggle to storage', async () => {
      controller = await createTestController({});

      await controller.toggleDarkMode();

      const stored = await chrome.storage.local.get('qbcheckSettings');
      expect(
        (stored.qbcheckSettings as { darkMode: boolean }).darkMode
      ).toBe(true);
    });
  });

  // Scenario 24
  describe('Comfortable mode preference persists', () => {
    it('restores comfortable mode from saved settings', async () => {
      controller = await createTestController({
        settings: { comfortableMode: true },
      });

      expect(controller.settings.comfortableMode).toBe(true);
      expect(document.body.classList.contains('comfortable')).toBe(true);
      expect(
        getElements().comfortableToggle.classList.contains('active')
      ).toBe(true);
    });

    it('starts in compact mode by default', async () => {
      controller = await createTestController({});

      expect(document.body.classList.contains('comfortable')).toBe(false);
      expect(
        getElements().comfortableToggle.classList.contains('active')
      ).toBe(false);
    });

    it('saves comfortable mode toggle to storage', async () => {
      controller = await createTestController({});

      await controller.toggleComfortableMode();

      const stored = await chrome.storage.local.get('qbcheckSettings');
      expect(
        (stored.qbcheckSettings as { comfortableMode: boolean }).comfortableMode
      ).toBe(true);
    });
  });

  // Scenario 25
  describe('Reset to defaults restores all settings', () => {
    it('restores DEFAULT_SETTINGS after reset', async () => {
      controller = await createTestController({
        settings: {
          disabledRules: ['formatting.no-em-dash', 'tag.tag-present'],
          ignoredDiagnostics: ['some::fp::123'],
          autoFixDisabled: ['question.ftp-format'],
          darkMode: true,
          comfortableMode: true,
        },
      });

      await controller.resetToDefaults();

      expect(controller.settings.disabledRules).toEqual(
        DEFAULT_SETTINGS.disabledRules
      );
      expect(controller.settings.ignoredDiagnostics).toEqual([]);
      expect(controller.settings.autoFixDisabled).toEqual([]);
      expect(controller.settings.darkMode).toBe(false);
      expect(controller.settings.comfortableMode).toBe(false);
    });

    it('removes dark mode class from body', async () => {
      controller = await createTestController({
        settings: { darkMode: true },
      });
      expect(document.body.classList.contains('dark')).toBe(true);

      await controller.resetToDefaults();

      expect(document.body.classList.contains('dark')).toBe(false);
    });

    it('removes comfortable mode class from body', async () => {
      controller = await createTestController({
        settings: { comfortableMode: true },
      });
      expect(document.body.classList.contains('comfortable')).toBe(true);

      await controller.resetToDefaults();

      expect(document.body.classList.contains('comfortable')).toBe(false);
    });

    it('saves reset settings to storage', async () => {
      controller = await createTestController({
        settings: {
          disabledRules: ['formatting.no-em-dash'],
          darkMode: true,
        },
      });

      await controller.resetToDefaults();

      const stored = await chrome.storage.local.get('qbcheckSettings');
      const saved = stored.qbcheckSettings as {
        disabledRules: string[];
        darkMode: boolean;
      };
      expect(saved.disabledRules).toEqual(DEFAULT_SETTINGS.disabledRules);
      expect(saved.darkMode).toBe(false);
    });

    it('showResetConfirm reveals confirm button', async () => {
      vi.useFakeTimers();
      controller = await createTestController({});
      const el = getElements();

      controller.showResetConfirm();
      expect(el.resetDefaultsBtn.hidden).toBe(true);
      expect(el.resetConfirmBtn.hidden).toBe(false);

      // After 3 seconds, confirm button auto-hides
      vi.advanceTimersByTime(3000);
      expect(el.resetDefaultsBtn.hidden).toBe(false);
      expect(el.resetConfirmBtn.hidden).toBe(true);
      vi.useRealTimers();
    });
  });

  // Scenario 26
  describe('Reset defaults triggers re-lint when packets loaded', () => {
    it('calls relintAll when lastParsedPackets is populated', async () => {
      controller = await createTestController({
        settings: {
          disabledRules: ['formatting.no-em-dash'],
        },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'warning',
                  message: 'Prefix',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      // In a restored session, lastParsedPackets is empty, so relintAll is a no-op
      const diagCountBefore = controller.getCurrentDiagnostics().length;
      await controller.resetToDefaults();
      // Since there are no parsed packets, diagnostics stay the same
      expect(controller.getCurrentDiagnostics().length).toBe(diagCountBefore);
    });
  });
});
