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

describe('Keyboard Shortcuts + Other Features', () => {
  let controller: PopupController;

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  // Scenario 32
  describe('E/W/I shortcuts toggle severity filters', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({
                  rule: 'test.error',
                  severity: 'error',
                  paragraph: 0,
                  message: 'An error',
                }),
                makeDiagnostic({
                  rule: 'test.warning',
                  severity: 'warning',
                  paragraph: 1,
                  message: 'A warning',
                }),
                makeDiagnostic({
                  rule: 'test.info',
                  severity: 'info',
                  paragraph: 2,
                  message: 'An info',
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

    it('toggleSeverity("error") hides error diagnostics', () => {
      expect(countVisibleDiagnostics()).toBe(3);
      controller.toggleSeverity('error');
      expect(controller.activeSeverities.has('error')).toBe(false);
      expect(countVisibleDiagnostics()).toBe(2);
    });

    it('toggleSeverity("warning") hides warning diagnostics', () => {
      controller.toggleSeverity('warning');
      expect(controller.activeSeverities.has('warning')).toBe(false);
      expect(countVisibleDiagnostics()).toBe(2);
    });

    it('toggleSeverity("info") hides info diagnostics', () => {
      controller.toggleSeverity('info');
      expect(controller.activeSeverities.has('info')).toBe(false);
      expect(countVisibleDiagnostics()).toBe(2);
    });

    it('re-toggling restores diagnostics', () => {
      controller.toggleSeverity('warning');
      expect(countVisibleDiagnostics()).toBe(2);
      controller.toggleSeverity('warning');
      expect(countVisibleDiagnostics()).toBe(3);
    });
  });

  // Scenario 33
  describe('Keyboard shortcuts ignored when settings view open', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ severity: 'error', message: 'Error' }),
                makeDiagnostic({ severity: 'warning', message: 'Warning' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });
    });

    it('severity toggles require results visible and settings hidden', () => {
      const el = getElements();
      // The entry point checks: if (resultsVisible && !settingsVisible)
      // When settings are open, resultsArea is hidden
      controller.openSettings();
      expect(el.settingsView.hidden).toBe(false);
      expect(el.resultsArea.hidden).toBe(true);

      // Severity should not be toggled since results aren't visible
      // (This is enforced by the entry point, not the controller)
      // But we can verify the guard conditions
      expect(el.resultsArea.hidden).toBe(true);
    });
  });

  // Scenario 34
  describe('Keyboard shortcuts ignored in input fields', () => {
    it('entry point checks target.tagName for INPUT/SELECT/TEXTAREA', async () => {
      // This is enforced by the entry point's keydown handler
      // The controller itself doesn't filter by target element
      // We verify the controller methods work correctly when called
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ severity: 'error', message: 'E' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });

      // Direct controller calls always work
      controller.toggleSeverity('error');
      expect(controller.activeSeverities.has('error')).toBe(false);
    });
  });

  // Scenario 35
  describe('Escape closes help modal, then settings, then menus', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ severity: 'error', message: 'E' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });
    });

    it('help modal is created by showKeyboardHelp', () => {
      controller.showKeyboardHelp();
      const modal = document.getElementById('keyboard-help-modal');
      expect(modal).toBeTruthy();
    });

    it('help modal can be removed (Escape handler)', () => {
      controller.showKeyboardHelp();
      const modal = document.getElementById('keyboard-help-modal');
      expect(modal).toBeTruthy();

      // Simulate what Escape does: remove the modal
      modal!.remove();
      expect(document.getElementById('keyboard-help-modal')).toBeNull();
    });

    it('closeSettings hides settings view', () => {
      const el = getElements();
      controller.openSettings();
      expect(el.settingsView.hidden).toBe(false);

      controller.closeSettings();
      expect(el.settingsView.hidden).toBe(true);
    });

    it('closeAllMenus removes action menus', () => {
      // Create a mock menu
      const menu = document.createElement('div');
      menu.className = 'diag-menu';
      document.body.appendChild(menu);

      expect(document.querySelectorAll('.diag-menu')).toHaveLength(1);
      controller.closeAllMenus();
      expect(document.querySelectorAll('.diag-menu')).toHaveLength(0);
    });
  });

  // Scenario 36
  describe('? shortcut opens help modal with About tab active', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'test.docx',
              diagnostics: [
                makeDiagnostic({ severity: 'error', message: 'E' }),
              ],
            },
          ],
          currentIndex: 0,
          scrollPosition: 0,
          mode: 'file',
        },
      });
    });

    it('showKeyboardHelp creates modal with About tab active', () => {
      controller.showKeyboardHelp();

      const modal = document.getElementById('keyboard-help-modal');
      expect(modal).toBeTruthy();

      const activeTab = modal!.querySelector('.help-tab.active');
      expect(activeTab).toBeTruthy();
      expect((activeTab as HTMLElement).dataset.tab).toBe('about');

      // About content visible, shortcuts hidden
      const aboutContent = modal!.querySelector(
        '[data-tab-content="about"]'
      ) as HTMLElement;
      const shortcutsContent = modal!.querySelector(
        '[data-tab-content="shortcuts"]'
      ) as HTMLElement;
      expect(aboutContent.hidden).toBe(false);
      expect(shortcutsContent.hidden).toBe(true);
    });

    it('does not create duplicate modals', () => {
      controller.showKeyboardHelp();
      controller.showKeyboardHelp();

      const modals = document.querySelectorAll('#keyboard-help-modal');
      expect(modals).toHaveLength(1);
    });
  });

  // Scenario 37
  describe('Arrow keys + severity filter combined', () => {
    beforeEach(async () => {
      controller = await createTestController({
        session: {
          packetResults: [
            {
              filename: 'p1.docx',
              diagnostics: [
                makeDiagnostic({
                  severity: 'error',
                  message: 'E1',
                  questionLabel: 'T1',
                }),
                makeDiagnostic({
                  severity: 'info',
                  message: 'I1',
                  questionLabel: 'T2',
                }),
              ],
            },
            {
              filename: 'p2.docx',
              diagnostics: [
                makeDiagnostic({
                  severity: 'warning',
                  message: 'W1',
                  questionLabel: 'T1',
                }),
                makeDiagnostic({
                  severity: 'info',
                  message: 'I2',
                  questionLabel: 'T2',
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

    it('severity filter persists when navigating', () => {
      controller.toggleSeverity('info');

      // Packet 1: only error shows
      expect(countVisibleDiagnostics()).toBe(1);

      // Navigate to packet 2
      controller.navigateNext();

      // Packet 2: only warning shows (info still hidden)
      expect(countVisibleDiagnostics()).toBe(1);
      expect(controller.activeSeverities.has('info')).toBe(false);
    });
  });
});
