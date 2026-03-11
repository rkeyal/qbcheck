// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  getElements,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Clear + State Reset', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 43
  describe('Clear button resets all runtime state', () => {
    beforeEach(async () => {
      controller = await createTestController({
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
          scrollPosition: 100,
          mode: 'file',
        },
      });
    });

    it('resets packetResults to empty', () => {
      controller.clear();
      expect(controller.packetResults).toHaveLength(0);
    });

    it('resets currentIndex to 0', () => {
      controller.clear();
      expect(controller.currentIndex).toBe(0);
    });

    it('clears lastParsedPackets', () => {
      controller.clear();
      expect(controller.lastParsedPackets).toHaveLength(0);
    });

    it('shows upload area and hides results', () => {
      const el = getElements();
      controller.clear();
      expect(el.uploadArea.hidden).toBe(false);
      expect(el.resultsArea.hidden).toBe(true);
    });

    it('hides settings view', () => {
      const el = getElements();
      controller.openSettings();
      expect(el.settingsView.hidden).toBe(false);

      controller.clear();
      expect(el.settingsView.hidden).toBe(true);
    });

    it('clears session storage', async () => {
      controller.clear();
      // Wait for async clearSession
      await new Promise((r) => setTimeout(r, 0));

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession).toBeUndefined();
    });

    it('resets file inputs', () => {
      const el = getElements();
      controller.clear();
      expect(el.fileInput.value).toBe('');
      expect(el.folderInput.value).toBe('');
    });
  });

  // Scenario 44
  describe('Clear does not reset settings', () => {
    it('preserves disabled rules after clear', async () => {
      controller = await createTestController({
        settings: {
          disabledRules: ['formatting.no-em-dash'],
          darkMode: true,
        },
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

      controller.clear();

      // Settings should not be affected by clear
      expect(controller.settings.disabledRules).toContain(
        'formatting.no-em-dash'
      );
      expect(controller.settings.darkMode).toBe(true);
    });

    it('preserves dark mode class after clear', async () => {
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
      controller.clear();
      expect(document.body.classList.contains('dark')).toBe(true);
    });
  });

  // Scenario 45
  describe('Clear during paste mode resets auto-fix state', () => {
    it('resets isPasteMode, lastFixedParagraphs, and lastAppliedFixes', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [
                makeDiagnostic({ rule: 'test.rule', message: 'Test' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      expect(controller.isPasteMode).toBe(true);

      controller.clear();

      expect(controller.isPasteMode).toBe(false);
      expect(controller.lastFixedParagraphs).toBeNull();
      expect(controller.lastAppliedFixes).toHaveLength(0);
    });
  });
});
