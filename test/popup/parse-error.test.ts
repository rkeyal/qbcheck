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

describe('Parse Error + Navigation', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 48
  describe('Parse error banner shown for corrupt file', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'corrupt.docx',
              diagnostics: [],
              parseError:
                'Failed to parse corrupt.docx. The file may be corrupted or not a valid .docx.',
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });
    });

    it('shows parse error banner with message', () => {
      const el = getElements();
      expect(el.parseErrorBanner.hidden).toBe(false);
      expect(el.parseErrorMessage.textContent).toContain(
        'Failed to parse corrupt.docx'
      );
    });

    it('shows no diagnostics for corrupt file', () => {
      expect(countVisibleDiagnostics()).toBe(0);
    });

    it('does not show "No issues found" message for corrupt file', () => {
      const el = getElements();
      expect(el.noIssues.hidden).toBe(true);
    });
  });

  // Scenario 49
  describe('Parse error on one packet, valid on another', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'valid.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'warning',
                  message: 'Em dash found',
                  questionLabel: 'T1',
                }),
              ],
            },
            {
              filename: 'corrupt.docx',
              diagnostics: [],
              parseError:
                'Failed to parse corrupt.docx. The file may be corrupted.',
            },
            {
              filename: 'also-valid.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'error',
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

    it('shows diagnostics for valid packet, no error banner', () => {
      const el = getElements();
      expect(el.parseErrorBanner.hidden).toBe(true);
      expect(countVisibleDiagnostics()).toBe(1);
    });

    it('shows error banner when navigating to corrupt packet', () => {
      controller.navigateToPacket(1);

      const el = getElements();
      expect(el.parseErrorBanner.hidden).toBe(false);
      expect(el.parseErrorMessage.textContent).toContain('corrupt.docx');
      expect(countVisibleDiagnostics()).toBe(0);
    });

    it('hides error banner when navigating back to valid packet', () => {
      controller.navigateToPacket(1);
      controller.navigateToPacket(2);

      const el = getElements();
      expect(el.parseErrorBanner.hidden).toBe(true);
      expect(countVisibleDiagnostics()).toBe(1);
    });

    it('navigating back to first packet also hides error banner', () => {
      controller.navigateToPacket(1);
      controller.navigateToPacket(0);

      const el = getElements();
      expect(el.parseErrorBanner.hidden).toBe(true);
      expect(countVisibleDiagnostics()).toBe(1);
    });
  });
});
