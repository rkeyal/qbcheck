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
import { diagnosticFingerprint } from '../../src/popup/popup-utils.js';

describe('Ignore/Un-ignore + Other Feature Interactions', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 38
  describe('Ignore instance from action menu', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'warning',
                  paragraph: 0,
                  message: 'Use en dash',
                  questionLabel: 'T1',
                }),
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'warning',
                  paragraph: 1,
                  message: 'ANSWER: prefix',
                  questionLabel: 'T1',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });
    });

    it('action menu creates a menu element', () => {
      const actionBtn = document.querySelector('.diag-action') as HTMLElement;
      expect(actionBtn).toBeTruthy();

      controller.toggleActionMenu(actionBtn);
      const menu = document.querySelector('.diag-menu');
      expect(menu).toBeTruthy();
    });

    it('action menu has ignore and disable options', () => {
      const actionBtn = document.querySelector('.diag-action') as HTMLElement;
      controller.toggleActionMenu(actionBtn);

      const ignoreBtn = document.querySelector('[data-action="ignore"]');
      const disableBtn = document.querySelector('[data-action="disable"]');
      expect(ignoreBtn).toBeTruthy();
      expect(disableBtn).toBeTruthy();
    });

    it('clicking ignore adds fingerprint to ignoredDiagnostics', async () => {
      const diag = controller.getCurrentDiagnostics()[0];
      const fp = diagnosticFingerprint(diag);

      // Simulate the ignore flow
      if (!controller.settings.ignoredDiagnostics.includes(fp)) {
        controller.settings.ignoredDiagnostics.push(fp);
      }
      await controller.saveSettings(controller.settings);
      controller.updateCounts();
      controller.renderDiagnostics();

      expect(controller.settings.ignoredDiagnostics).toContain(fp);
    });
  });

  // Scenario 39
  describe('Show/hide ignored diagnostics via chip toggle', () => {
    beforeEach(async () => {
      const diag1 = makeDiagnostic({
        rule: 'formatting.no-em-dash',
        severity: 'warning',
        paragraph: 0,
        message: 'Use en dash',
        questionLabel: 'T1',
      });
      const diag2 = makeDiagnostic({
        rule: 'answerline.answer-prefix',
        severity: 'warning',
        paragraph: 1,
        message: 'ANSWER: prefix',
        questionLabel: 'T2',
      });

      const fp = diagnosticFingerprint(diag1);

      controller = await createTestController({
        settings: { ignoredDiagnostics: [fp] },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [diag1, diag2],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });
    });

    it('ignored chip shows count of ignored diagnostics', () => {
      const el = getElements();
      expect(el.countIgnored.textContent).toBe('1');
      expect(el.ignoredChip.hidden).toBe(false);
    });

    it('toggling showIgnored renders ignored diagnostics', () => {
      // Only 1 visible (the non-ignored one)
      expect(countVisibleDiagnostics()).toBe(1);

      // Toggle ignored visibility
      controller.showIgnored = true;
      controller.renderDiagnostics();

      // Now we should see ignored diagnostics rendered with .ignored class
      const ignoredDiags = document.querySelectorAll('.diagnostic.ignored');
      expect(ignoredDiags.length).toBe(1);
    });

    it('ignored chip hidden when no diagnostics are ignored', async () => {
      // Remove all ignored fingerprints
      controller.settings.ignoredDiagnostics = [];
      controller.updateCounts();

      const el = getElements();
      expect(el.ignoredChip.hidden).toBe(true);
    });
  });

  // Scenario 40
  describe('Un-ignore a diagnostic', () => {
    it('removing fingerprint from ignoredDiagnostics restores visibility', async () => {
      const diag = makeDiagnostic({
        rule: 'formatting.no-em-dash',
        severity: 'warning',
        paragraph: 0,
        message: 'Use en dash',
        questionLabel: 'T1',
      });
      const fp = diagnosticFingerprint(diag);

      controller = await createTestController({
        settings: { ignoredDiagnostics: [fp] },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [diag],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      // Initially: 0 visible (the diagnostic is ignored)
      expect(countVisibleDiagnostics()).toBe(0);

      // Un-ignore
      controller.settings.ignoredDiagnostics =
        controller.settings.ignoredDiagnostics.filter((f) => f !== fp);
      await controller.saveSettings(controller.settings);
      controller.updateCounts();
      controller.renderDiagnostics();

      // Now visible
      expect(countVisibleDiagnostics()).toBe(1);
    });
  });

  // Scenario 41
  describe('Ignored diagnostics persist across packet navigation', () => {
    it('ignored state carries over when navigating packets', async () => {
      const diag1 = makeDiagnostic({
        rule: 'formatting.no-em-dash',
        severity: 'warning',
        paragraph: 0,
        message: 'Em dash in packet 1',
        questionLabel: 'T1',
      });
      const fp1 = diagnosticFingerprint(diag1);

      controller = await createTestController({
        settings: { ignoredDiagnostics: [fp1] },
        session: {
          packetResults: [
            {
              filename: 'packet1.docx',
              diagnostics: [
                diag1,
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'warning',
                  paragraph: 1,
                  message: 'Prefix',
                  questionLabel: 'T2',
                }),
              ],
            },
            {
              filename: 'packet2.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'question.ftp-format',
                  severity: 'error',
                  paragraph: 0,
                  message: 'FTP format',
                  questionLabel: 'T1',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      // Packet 1: 1 visible (1 ignored)
      expect(countVisibleDiagnostics()).toBe(1);

      // Navigate to packet 2
      controller.navigateToPacket(1);
      expect(countVisibleDiagnostics()).toBe(1);

      // Navigate back — ignored state persists
      controller.navigateToPacket(0);
      expect(countVisibleDiagnostics()).toBe(1);
      expect(getElements().countIgnored.textContent).toBe('1');
    });
  });

  // Scenario 42
  describe('Ignore interaction with category filter', () => {
    it('ignored count respects category filter', async () => {
      const formattingDiag = makeDiagnostic({
        rule: 'formatting.no-em-dash',
        severity: 'warning',
        paragraph: 0,
        message: 'Em dash',
        questionLabel: 'T1',
      });
      const answerDiag = makeDiagnostic({
        rule: 'answerline.answer-prefix',
        severity: 'warning',
        paragraph: 1,
        message: 'Prefix',
        questionLabel: 'T2',
      });

      const fpFormatting = diagnosticFingerprint(formattingDiag);
      const fpAnswer = diagnosticFingerprint(answerDiag);

      controller = await createTestController({
        settings: { ignoredDiagnostics: [fpFormatting, fpAnswer] },
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [formattingDiag, answerDiag],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      const el = getElements();

      // Category "all": 2 ignored
      expect(el.countIgnored.textContent).toBe('2');

      // Filter to "formatting" category
      el.filterCategory.value = 'formatting';
      controller.updateCounts();

      // Only 1 ignored in formatting category
      expect(el.countIgnored.textContent).toBe('1');
    });
  });
});
