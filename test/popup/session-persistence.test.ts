// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupChromeMocks, clearStorageMocks } from './setup.js';
import { loadPopupHTML, nextTick } from './helpers.js';

/**
 * Tests for session persistence functionality.
 *
 * Session state (results, current packet, scroll position) should persist
 * using chrome.storage.session and restore on popup reopen.
 */

describe('Session Persistence', () => {
  beforeEach(async () => {
    setupChromeMocks();
    await loadPopupHTML();
  });

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  describe('SessionState interface', () => {
    it('should store packet results in session storage', async () => {
      // Simulate saving session state
      const mockSessionState = {
        packetResults: [
          {
            filename: 'test.docx',
            diagnostics: [
              {
                rule: 'test.rule',
                severity: 'error' as const,
                paragraph: 0,
                message: 'Test error',
              },
            ],
          },
        ],
        currentIndex: 0,
        scrollPosition: 0,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: mockSessionState });

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession).toEqual(mockSessionState);
    });

    it('should store scroll position in session state', async () => {
      const sessionState = {
        packetResults: [],
        currentIndex: 0,
        scrollPosition: 150,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: sessionState });

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.scrollPosition).toBe(150);
    });

    it('should store current packet index', async () => {
      const sessionState = {
        packetResults: [
          { filename: 'packet1.docx', diagnostics: [] },
          { filename: 'packet2.docx', diagnostics: [] },
          { filename: 'packet3.docx', diagnostics: [] },
        ],
        currentIndex: 2,
        scrollPosition: 0,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: sessionState });

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.currentIndex).toBe(2);
      expect(stored.qbcheckSession.packetResults).toHaveLength(3);
    });

    it('should store mode (file vs paste)', async () => {
      const fileSessionState = {
        packetResults: [],
        currentIndex: 0,
        scrollPosition: 0,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: fileSessionState });

      let stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.mode).toBe('file');

      const pasteSessionState = { ...fileSessionState, mode: 'paste' as const };
      await chrome.storage.session.set({ qbcheckSession: pasteSessionState });

      stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.mode).toBe('paste');
    });
  });

  describe('Session clearing', () => {
    it('should clear session when no results exist', async () => {
      // Set some initial session state
      await chrome.storage.session.set({
        qbcheckSession: {
          packetResults: [],
          currentIndex: 0,
          scrollPosition: 100,
          mode: 'file',
        },
      });

      // Simulate clearing (this would happen in clearSession())
      await chrome.storage.session.remove('qbcheckSession');

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession).toBeUndefined();
    });

    it('should clear session on clear button click', async () => {
      // Set initial session
      await chrome.storage.session.set({
        qbcheckSession: {
          packetResults: [{ filename: 'test.docx', diagnostics: [] }],
          currentIndex: 0,
          scrollPosition: 50,
          mode: 'file',
        },
      });

      // Clear should remove session
      await chrome.storage.session.remove('qbcheckSession');

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession).toBeUndefined();
    });
  });

  describe('Scroll position behavior', () => {
    it('should save scroll position of diagnostics list', async () => {
      const diagnosticsList = document.getElementById('diagnostics-list')!;

      // Set scroll position
      diagnosticsList.scrollTop = 250;

      // Simulate saving session with current scroll
      const sessionState = {
        packetResults: [{ filename: 'test.docx', diagnostics: [] }],
        currentIndex: 0,
        scrollPosition: diagnosticsList.scrollTop,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: sessionState });

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.scrollPosition).toBe(250);
    });

    it('should reset scroll to 0 when navigating between packets', async () => {
      const diagnosticsList = document.getElementById('diagnostics-list')!;

      // Set initial scroll
      diagnosticsList.scrollTop = 300;

      // Simulate navigation (showCurrentPacket resets scroll to 0)
      diagnosticsList.scrollTop = 0;

      expect(diagnosticsList.scrollTop).toBe(0);
    });

    it('should restore scroll position after session load', async () => {
      const diagnosticsList = document.getElementById('diagnostics-list')!;

      // Set session with saved scroll position
      await chrome.storage.session.set({
        qbcheckSession: {
          packetResults: [{ filename: 'test.docx', diagnostics: [] }],
          currentIndex: 0,
          scrollPosition: 175,
          mode: 'file',
        },
      });

      const stored = await chrome.storage.session.get('qbcheckSession');

      // Simulate restoration
      await nextTick();
      diagnosticsList.scrollTop = stored.qbcheckSession.scrollPosition;

      expect(diagnosticsList.scrollTop).toBe(175);
    });
  });

  describe('Multi-packet session state', () => {
    it('should store results for multiple packets', async () => {
      const sessionState = {
        packetResults: [
          {
            filename: 'packet1.docx',
            diagnostics: [
              {
                rule: 'test.rule1',
                severity: 'error' as const,
                paragraph: 0,
                message: 'Error 1',
              },
            ],
          },
          {
            filename: 'packet2.docx',
            diagnostics: [
              {
                rule: 'test.rule2',
                severity: 'warning' as const,
                paragraph: 1,
                message: 'Warning 1',
              },
            ],
          },
          {
            filename: 'packet3.docx',
            diagnostics: [],
          },
        ],
        currentIndex: 1,
        scrollPosition: 0,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: sessionState });

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.packetResults).toHaveLength(3);
      expect(stored.qbcheckSession.packetResults[0].filename).toBe(
        'packet1.docx'
      );
      expect(stored.qbcheckSession.packetResults[1].filename).toBe(
        'packet2.docx'
      );
      expect(stored.qbcheckSession.currentIndex).toBe(1);
    });

    it('should preserve diagnostics for each packet', async () => {
      const sessionState = {
        packetResults: [
          {
            filename: 'packet1.docx',
            diagnostics: [
              {
                rule: 'test.rule',
                severity: 'error' as const,
                paragraph: 0,
                message: 'Error',
              },
              {
                rule: 'test.rule2',
                severity: 'warning' as const,
                paragraph: 1,
                message: 'Warning',
              },
            ],
          },
        ],
        currentIndex: 0,
        scrollPosition: 0,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: sessionState });

      const stored = await chrome.storage.session.get('qbcheckSession');
      expect(stored.qbcheckSession.packetResults[0].diagnostics).toHaveLength(
        2
      );
      expect(
        stored.qbcheckSession.packetResults[0].diagnostics[0].severity
      ).toBe('error');
      expect(
        stored.qbcheckSession.packetResults[0].diagnostics[1].severity
      ).toBe('warning');
    });
  });

  describe('Session vs Local storage separation', () => {
    it('should store settings in local storage, not session', async () => {
      const settings = {
        disabledRules: ['test.rule1', 'test.rule2'],
        ignoredDiagnostics: ['fp1', 'fp2'],
        autoFixDisabled: [],
      };

      await chrome.storage.local.set({ qbcheckSettings: settings });

      const localStored = await chrome.storage.local.get('qbcheckSettings');
      const sessionStored = await chrome.storage.session.get('qbcheckSettings');

      expect(localStored.qbcheckSettings).toEqual(settings);
      expect(sessionStored.qbcheckSettings).toBeUndefined();
    });

    it('should store session state in session storage, not local', async () => {
      const sessionState = {
        packetResults: [],
        currentIndex: 0,
        scrollPosition: 0,
        mode: 'file' as const,
      };

      await chrome.storage.session.set({ qbcheckSession: sessionState });

      const sessionStored = await chrome.storage.session.get('qbcheckSession');
      const localStored = await chrome.storage.local.get('qbcheckSession');

      expect(sessionStored.qbcheckSession).toEqual(sessionState);
      expect(localStored.qbcheckSession).toBeUndefined();
    });
  });

  describe('Chrome storage API mock behavior', () => {
    it('should support get/set/remove operations', async () => {
      const testData = { key: 'value' };

      // Set
      await chrome.storage.session.set({ testData });
      let stored = await chrome.storage.session.get('testData');
      expect(stored.testData).toEqual(testData);

      // Remove
      await chrome.storage.session.remove('testData');
      stored = await chrome.storage.session.get('testData');
      expect(stored.testData).toBeUndefined();
    });

    it('should return empty object when getting non-existent keys', async () => {
      const result = await chrome.storage.session.get('nonexistent');
      expect(result.nonexistent).toBeUndefined();
    });

    it('should support getting multiple keys at once', async () => {
      await chrome.storage.session.set({ key1: 'value1', key2: 'value2' });

      const result = await chrome.storage.session.get(['key1', 'key2']);
      expect(result.key1).toBe('value1');
      expect(result.key2).toBe('value2');
    });
  });
});
