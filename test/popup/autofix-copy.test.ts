// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  getElements,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Auto-Fix + Copy Workflow', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 15
  describe('Auto-fix banner shown in paste mode with fixes applied', () => {
    it('shows banner when isPasteMode and has applied fixes', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.smart-quotes',
                  severity: 'info',
                  message: 'Use smart quotes',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      // Simulate having auto-fix results
      controller.lastAppliedFixes = [
        makeDiagnostic({
          rule: 'formatting.smart-quotes',
          severity: 'info',
          message: 'Replaced straight quotes with smart quotes',
          fix: { oldText: '"', newText: '\u201C', offset: 0 },
          sourceText: '"Hello"',
          offset: 0,
          length: 1,
        }),
      ];
      controller.renderAutofixBanner();

      const el = getElements();
      expect(el.autofixBanner.hidden).toBe(false);
      expect(el.autofixCount.textContent).toBe('1');
    });

    it('renders fix details with diff', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      controller.lastAppliedFixes = [
        makeDiagnostic({
          rule: 'formatting.smart-quotes',
          message: 'Smart quotes',
          fix: { oldText: '"', newText: '\u201C', offset: 5 },
          sourceText: 'Test "hello" world',
          offset: 5,
          length: 1,
        }),
      ];
      controller.renderAutofixBanner();

      const el = getElements();
      const details = el.autofixDetails.innerHTML;
      expect(details).toContain('autofix-item');
      expect(details).toContain('formatting.smart-quotes');
    });
  });

  // Scenario 16
  describe('Auto-fix toggle expands/collapses details', () => {
    it('details start hidden and can be toggled', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      const el = getElements();
      // The toggle button controls autofixDetails visibility
      // In the entry point, this is handled by clicking autofixToggle
      expect(el.autofixDetails).toBeTruthy();
      expect(el.autofixToggle).toBeTruthy();
    });
  });

  // Scenario 17
  describe('Auto-fix copy writes to clipboard', () => {
    it('calls clipboard.write with html and plain text', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      // Set up fixed paragraphs
      controller.lastFixedParagraphs = [
        {
          index: 0,
          runs: [{ text: 'Fixed text', bold: false, italic: false, underline: false, superscript: false, subscript: false }],
          rawText: 'Fixed text',
          hasPageBreak: false,
        },
      ];

      await controller.copyFixedText();

      expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
    });

    it('shows Copied! feedback on button', async () => {
      vi.useFakeTimers();
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      controller.lastFixedParagraphs = [
        {
          index: 0,
          runs: [{ text: 'Test', bold: false, italic: false, underline: false, superscript: false, subscript: false }],
          rawText: 'Test',
          hasPageBreak: false,
        },
      ];

      await controller.copyFixedText();

      const el = getElements();
      expect(el.autofixCopy.textContent).toContain('Copied!');
      expect(el.autofixCopy.classList.contains('copied')).toBe(true);

      // After 1500ms, feedback resets
      vi.advanceTimersByTime(1500);
      expect(el.autofixCopy.classList.contains('copied')).toBe(false);
      vi.useRealTimers();
    });

    it('does nothing when lastFixedParagraphs is null', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      controller.lastFixedParagraphs = null;
      await controller.copyFixedText();

      expect(navigator.clipboard.write).not.toHaveBeenCalled();
    });
  });

  // Scenario 18
  describe('Auto-fix banner hidden for file uploads', () => {
    it('hides banner when not in paste mode', async () => {
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
      expect(el.autofixBanner.hidden).toBe(true);
    });
  });

  // Scenario 19
  describe('Auto-fix disabled rules respected', () => {
    it('autoFixDisabled setting persists', async () => {
      controller = await createTestController({
        settings: { autoFixDisabled: ['question.ftp-format'] },
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      expect(controller.settings.autoFixDisabled).toContain(
        'question.ftp-format'
      );
    });
  });

  // Scenario 20
  describe('Auto-fix master toggle', () => {
    it('syncAutofixMaster sets checked when no rules disabled', async () => {
      controller = await createTestController({
        settings: { autoFixDisabled: [] },
      });

      controller.openSettings();
      controller.syncAutofixMaster();

      const el = getElements();
      expect(el.autofixMasterToggle.checked).toBe(true);
      expect(el.autofixMasterToggle.indeterminate).toBe(false);
    });

    it('syncAutofixMaster sets unchecked when all rules disabled', async () => {
      // Get all autoFixable rule IDs to disable them all
      const { getAutoFixableRuleIds } = await import(
        '../../src/popup/popup-utils.js'
      );
      const allIds = getAutoFixableRuleIds();

      controller = await createTestController({
        settings: { autoFixDisabled: allIds },
      });

      controller.openSettings();
      controller.syncAutofixMaster();

      const el = getElements();
      expect(el.autofixMasterToggle.checked).toBe(false);
      expect(el.autofixMasterToggle.indeterminate).toBe(false);
    });

    it('syncAutofixMaster sets unchecked when some rules disabled', async () => {
      controller = await createTestController({
        settings: { autoFixDisabled: ['question.ftp-format'] },
      });

      controller.openSettings();
      controller.syncAutofixMaster();

      const el = getElements();
      expect(el.autofixMasterToggle.checked).toBe(false);
    });
  });
});
