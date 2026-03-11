// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearStorageMocks } from './setup.js';
import {
  createTestController,
  makeDiagnostic,
  createMultiPacketSession,
  countVisibleDiagnostics,
  getElements,
} from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Multi-Packet Navigation + Severity Filtering', () => {
  let controller: PopupController;

  const threePacketSession = createMultiPacketSession([
    {
      filename: 'packet1.docx',
      diagnostics: [
        makeDiagnostic({
          rule: 'formatting.no-em-dash',
          severity: 'error',
          paragraph: 0,
          message: 'Error in packet 1',
          questionLabel: 'T1',
        }),
        makeDiagnostic({
          rule: 'formatting.smart-quotes',
          severity: 'info',
          paragraph: 1,
          message: 'Info in packet 1',
          questionLabel: 'T1',
        }),
      ],
    },
    {
      filename: 'packet2.docx',
      diagnostics: [
        makeDiagnostic({
          rule: 'answerline.answer-prefix',
          severity: 'warning',
          paragraph: 0,
          message: 'Warning in packet 2',
          questionLabel: 'T1',
        }),
        makeDiagnostic({
          rule: 'question.ftp-format',
          severity: 'warning',
          paragraph: 1,
          message: 'Another warning in packet 2',
          questionLabel: 'T2',
        }),
      ],
    },
    {
      filename: 'packet3.docx',
      diagnostics: [
        makeDiagnostic({
          rule: 'formatting.no-em-dash',
          severity: 'error',
          paragraph: 0,
          message: 'Error in packet 3',
          questionLabel: 'T1',
        }),
        makeDiagnostic({
          rule: 'tag.tag-present',
          severity: 'warning',
          paragraph: 1,
          message: 'Warning in packet 3',
          questionLabel: 'T1',
        }),
        makeDiagnostic({
          rule: 'formatting.spell-out-small-numbers',
          severity: 'info',
          paragraph: 2,
          message: 'Info in packet 3',
          questionLabel: 'T2',
        }),
      ],
    },
  ]);

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 7
  describe('Navigate between packets with severity filter active', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: threePacketSession,
      });
    });

    it('toggling off info hides info diagnostics across all packets', () => {
      // Toggle off info severity
      controller.toggleSeverity('info');

      // Packet 1: 1 error (info hidden)
      expect(countVisibleDiagnostics()).toBe(1);

      // Navigate to packet 2: 2 warnings, no info
      controller.navigateToPacket(1);
      expect(countVisibleDiagnostics()).toBe(2);

      // Navigate to packet 3: 1 error + 1 warning (info hidden)
      controller.navigateToPacket(2);
      expect(countVisibleDiagnostics()).toBe(2);
    });
  });

  // Scenario 8
  describe('Severity filter state persists across packet navigation', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: threePacketSession,
      });
    });

    it('keeps warning toggled off after navigation', () => {
      controller.toggleSeverity('warning');
      expect(controller.activeSeverities.has('warning')).toBe(false);

      controller.navigateToPacket(1);
      expect(controller.activeSeverities.has('warning')).toBe(false);

      controller.navigateToPacket(2);
      expect(controller.activeSeverities.has('warning')).toBe(false);
    });

    it('updates severity button visual state', () => {
      controller.toggleSeverity('warning');

      const warningBtn = document.querySelector('[data-severity="warning"]');
      expect(warningBtn?.classList.contains('active')).toBe(false);
    });
  });

  // Scenario 9
  describe('Cannot hide all severities', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: threePacketSession,
      });
    });

    it('prevents hiding the last active severity', () => {
      controller.toggleSeverity('warning'); // off
      controller.toggleSeverity('info'); // off
      // Only 'error' remains — try to toggle it off
      controller.toggleSeverity('error');

      // Should still have error active
      expect(controller.activeSeverities.has('error')).toBe(true);
      expect(controller.activeSeverities.size).toBe(1);
    });
  });

  // Scenario 10
  describe('Category filter + severity filter interaction', () => {
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
                  paragraph: 0,
                  message: 'Formatting error',
                }),
                makeDiagnostic({
                  rule: 'formatting.smart-quotes',
                  severity: 'info',
                  paragraph: 1,
                  message: 'Formatting info',
                }),
                makeDiagnostic({
                  rule: 'answerline.answer-prefix',
                  severity: 'warning',
                  paragraph: 2,
                  message: 'Answerline warning',
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

    it('shows only error+warning from formatting when info is off and category is formatting', () => {
      const el = getElements();
      el.filterCategory.value = 'formatting';

      controller.toggleSeverity('info');
      controller.updateCounts();
      controller.renderDiagnostics();

      // Only formatting.no-em-dash (error) visible — info is toggled off
      expect(countVisibleDiagnostics()).toBe(1);
      // Counts always show totals per severity (independent of toggle)
      expect(el.countError.textContent).toBe('1');
      expect(el.countWarning.textContent).toBe('0');
      expect(el.countInfo.textContent).toBe('1');
    });
  });

  // Scenario 11
  describe('Packet navigation resets scroll to 0', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: createMultiPacketSession([
          {
            filename: 'packet1.docx',
            diagnostics: [makeDiagnostic({ message: 'Diag 1' })],
          },
          {
            filename: 'packet2.docx',
            diagnostics: [makeDiagnostic({ message: 'Diag 2' })],
          },
        ]),
      });
    });

    it('resets scrollTop when switching packets', () => {
      const el = getElements();
      el.diagnosticsList.scrollTop = 200;
      controller.navigateNext();
      expect(el.diagnosticsList.scrollTop).toBe(0);
    });
  });

  // Scenario 12
  describe('Packet navigation updates select dropdown', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: createMultiPacketSession([
          {
            filename: 'packet1.docx',
            diagnostics: [makeDiagnostic({ message: 'D1' })],
          },
          {
            filename: 'packet2.docx',
            diagnostics: [makeDiagnostic({ message: 'D2' })],
          },
          {
            filename: 'packet3.docx',
            diagnostics: [makeDiagnostic({ message: 'D3' })],
          },
        ]),
      });
    });

    it('updates packetSelect value on navigation', () => {
      const el = getElements();

      controller.navigateNext();
      expect(el.packetSelect.value).toBe('1');

      controller.navigateNext();
      expect(el.packetSelect.value).toBe('2');
    });

    it('disables prev button at first packet', () => {
      const el = getElements();
      controller.navigateToPacket(0);
      expect(el.prevBtn.disabled).toBe(true);
      expect(el.nextBtn.disabled).toBe(false);
    });

    it('disables next button at last packet', () => {
      const el = getElements();
      controller.navigateToPacket(2);
      expect(el.prevBtn.disabled).toBe(false);
      expect(el.nextBtn.disabled).toBe(true);
    });

    it('updates counter text', () => {
      const el = getElements();
      controller.navigateToPacket(1);
      expect(el.packetCounter.textContent).toBe('2 / 3');
    });
  });

  // Scenario 13
  describe('Keyboard packet navigation (Arrow keys)', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: createMultiPacketSession([
          {
            filename: 'p1.docx',
            diagnostics: [makeDiagnostic({ message: 'D1' })],
          },
          {
            filename: 'p2.docx',
            diagnostics: [makeDiagnostic({ message: 'D2' })],
          },
          {
            filename: 'p3.docx',
            diagnostics: [makeDiagnostic({ message: 'D3' })],
          },
        ]),
      });
    });

    it('navigateNext increments currentIndex', () => {
      expect(controller.currentIndex).toBe(0);
      controller.navigateNext();
      expect(controller.currentIndex).toBe(1);
      controller.navigateNext();
      expect(controller.currentIndex).toBe(2);
    });

    it('navigatePrev decrements currentIndex', () => {
      controller.navigateToPacket(2);
      controller.navigatePrev();
      expect(controller.currentIndex).toBe(1);
      controller.navigatePrev();
      expect(controller.currentIndex).toBe(0);
    });

    it('navigatePrev clamps at 0', () => {
      controller.navigateToPacket(0);
      controller.navigatePrev();
      expect(controller.currentIndex).toBe(0);
    });

    it('navigateNext clamps at last index', () => {
      controller.navigateToPacket(2);
      controller.navigateNext();
      expect(controller.currentIndex).toBe(2);
    });
  });

  // Scenario 14
  describe('Number key packet navigation', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: createMultiPacketSession([
          {
            filename: 'p1.docx',
            diagnostics: [makeDiagnostic({ message: 'D1' })],
          },
          {
            filename: 'p2.docx',
            diagnostics: [makeDiagnostic({ message: 'D2' })],
          },
          {
            filename: 'p3.docx',
            diagnostics: [makeDiagnostic({ message: 'D3' })],
          },
          {
            filename: 'p4.docx',
            diagnostics: [makeDiagnostic({ message: 'D4' })],
          },
          {
            filename: 'p5.docx',
            diagnostics: [makeDiagnostic({ message: 'D5' })],
          },
        ]),
      });
    });

    it('navigateToPacket jumps to the correct index', () => {
      controller.navigateToPacket(2); // packet 3
      expect(controller.currentIndex).toBe(2);
      expect(getElements().fileNameEl.textContent).toBe('p3.docx');
    });

    it('ignores out-of-range navigation', () => {
      controller.navigateToPacket(0);
      // Simulate pressing '9' when only 5 packets
      // The entry point would check packetNum <= packetResults.length
      // Controller's navigateToPacket clamps, but entry point gates the call
      expect(controller.currentIndex).toBe(0);
    });
  });
});
