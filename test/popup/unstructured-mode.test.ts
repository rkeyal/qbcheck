// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  getElements,
  countVisibleDiagnostics,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Unstructured Mode + Rule Interaction', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 46
  describe('Unstructured banner shown for paste without headers', () => {
    it('shows unstructured banner when packet is unstructured', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'warning',
                  message: 'Em dash found',
                }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'paste',
        },
      });

      // Simulate having an unstructured packet
      // In a restored session, lastParsedPackets is empty, so the banner
      // is controlled by the packet object. Set it directly for testing.
      controller.lastParsedPackets = [
        { structured: false } as unknown as import('../../src/core/model.js').Packet,
      ];
      controller.showCurrentPacket();

      const el = getElements();
      expect(el.unstructuredBanner.hidden).toBe(false);
    });

    it('hides unstructured banner when packet is structured', async () => {
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

      // Simulate structured packet
      controller.lastParsedPackets = [
        { structured: true } as unknown as import('../../src/core/model.js').Packet,
      ];
      controller.showCurrentPacket();

      const el = getElements();
      expect(el.unstructuredBanner.hidden).toBe(true);
    });

    it('hides banner when no parsed packet available (restored session)', async () => {
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

      // Restored session: lastParsedPackets is empty
      const el = getElements();
      expect(el.unstructuredBanner.hidden).toBe(true);
    });
  });

  // Scenario 47
  describe('Unstructured mode + severity filter', () => {
    it('severity filter works on unstructured-mode diagnostics', async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'Pasted text',
              diagnostics: [
                makeDiagnostic({
                  rule: 'formatting.no-em-dash',
                  severity: 'error',
                  message: 'Error',
                }),
                makeDiagnostic({
                  rule: 'formatting.smart-quotes',
                  severity: 'info',
                  message: 'Info',
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
          mode: 'paste',
        },
      });

      expect(countVisibleDiagnostics()).toBe(3);

      controller.toggleSeverity('info');
      expect(countVisibleDiagnostics()).toBe(2);

      controller.toggleSeverity('warning');
      expect(countVisibleDiagnostics()).toBe(1);
    });
  });
});
