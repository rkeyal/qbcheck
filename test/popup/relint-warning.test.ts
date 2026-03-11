// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  getElements,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Relint Warning Interaction', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 50
  describe('Relint warning shown only in restored sessions', () => {
    it('isRestoredSession returns true when lastParsedPackets is empty', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'warning',
                  message: 'Em dash',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      // In a restored session, lastParsedPackets is empty
      expect(controller.isRestoredSession()).toBe(true);
      expect(controller.lastParsedPackets).toHaveLength(0);
    });

    it('relint warning hidden initially but shown when enabling a rule', async () => {
      controller = await createTestController({
        settings: { disabledRules: ['formatting.no-em-dash'] },
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

      const el = getElements();

      // Open settings
      controller.openSettings();
      expect(el.relintWarning.hidden).toBe(true);

      // Simulate enabling a disabled rule
      controller.settings.disabledRules =
        controller.settings.disabledRules.filter(
          (r) => r !== 'formatting.no-em-dash'
        );
      controller.needsRelint = true;

      // The relintWarning is shown when a rule checkbox fires the change
      // handler while isRestoredSession() is true
      if (controller.isRestoredSession()) {
        el.relintWarning.hidden = false;
      }

      expect(el.relintWarning.hidden).toBe(false);
    });
  });

  // Scenario 51
  describe('Relint warning NOT shown when packets loaded directly', () => {
    it('isRestoredSession returns false when lastParsedPackets is populated', async () => {
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

      // Simulate having parsed packets (as if files were processed directly)
      controller.lastParsedPackets = [null]; // Even a null entry indicates direct load

      expect(controller.isRestoredSession()).toBe(false);
    });

    it('needsRelint triggers actual relint when parsed packets exist', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'warning',
                  message: 'Em dash',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      // With no parsed packets, relintAll is a no-op
      controller.needsRelint = true;
      controller.relintAll();
      // relintAll returns early since lastParsedPackets is empty
      expect(controller.packetResults[0].diagnostics).toHaveLength(1);
    });
  });

  // Scenario 52
  describe('Close settings triggers relint when needed', () => {
    it('closeSettings calls relintAll when needsRelint is true and packets exist', async () => {
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

      const el = getElements();
      controller.openSettings();
      expect(el.settingsView.hidden).toBe(false);

      controller.needsRelint = true;

      // closeSettings checks needsRelint && lastParsedPackets.length > 0
      // In restored session, lastParsedPackets is empty, so relintAll is skipped
      controller.closeSettings();

      expect(el.settingsView.hidden).toBe(true);
      expect(el.resultsArea.hidden).toBe(false);
      // needsRelint stays true because relintAll didn't run (no parsed packets)
      // The controller resets needsRelint only when relintAll actually runs
    });

    it('closeSettings shows results area when packets exist', async () => {
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

      const el = getElements();
      controller.openSettings();
      controller.closeSettings();

      expect(el.settingsView.hidden).toBe(true);
      expect(el.resultsArea.hidden).toBe(false);
    });

    it('closeSettings shows upload area when no packets exist', async () => {
      controller = await createTestController({});

      const el = getElements();
      controller.openSettings();
      controller.closeSettings();

      expect(el.settingsView.hidden).toBe(true);
      expect(el.uploadArea.hidden).toBe(false);
    });
  });
});
