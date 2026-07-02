// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupChromeMocks, clearStorageMocks } from './setup.js';
import { loadPopupHTML, getElements } from './helpers.js';
import { PopupController } from '../../src/popup/popup-controller.js';

describe('Lint Clipboard via Shortcut', () => {
  beforeEach(async () => {
    setupChromeMocks();
    await loadPopupHTML();
  });

  afterEach(() => {
    clearStorageMocks();
    document.body.innerHTML = '';
  });

  function makeClipboardItem(html: string, plain: string): ClipboardItem {
    const blobs: Record<string, Blob> = {};
    const types: string[] = [];
    if (html) {
      blobs['text/html'] = new Blob([html], { type: 'text/html' });
      types.push('text/html');
    }
    if (plain) {
      blobs['text/plain'] = new Blob([plain], { type: 'text/plain' });
      types.push('text/plain');
    }
    return {
      types,
      getType: (t: string) => Promise.resolve(blobs[t]),
    } as unknown as ClipboardItem;
  }

  it('auto-lints clipboard when lintClipboardPending flag is set', async () => {
    vi.useFakeTimers();
    await chrome.storage.session.set({ lintClipboardPending: true });

    const html =
      '<p>1. This is a tossup question about science.</p>' +
      '<p>ANSWER: <b><u>Test Answer</u></b></p>';
    const plain = '1. This is a tossup question about science.\nANSWER: Test Answer';

    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeClipboardItem(html, plain),
    ]);

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();
    vi.runAllTimers();

    expect(elements.resultsArea.hidden).toBe(false);
    expect(elements.uploadArea.hidden).toBe(true);
    expect(controller.packetResults.length).toBe(1);
    expect(controller.packetResults[0].filename).toBe('Pasted text');
    vi.useRealTimers();
  });

  it('does not auto-lint when flag is not set', async () => {
    const html = '<p>Content</p>';
    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeClipboardItem(html, 'Content'),
    ]);

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();

    expect(elements.resultsArea.hidden).toBe(true);
    expect(elements.uploadArea.hidden).toBe(false);
    expect(navigator.clipboard.read).not.toHaveBeenCalled();
  });

  it('clears the flag after consuming it', async () => {
    await chrome.storage.session.set({ lintClipboardPending: true });

    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockResolvedValue(
      []
    );

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();

    const stored = await chrome.storage.session.get('lintClipboardPending');
    expect(stored.lintClipboardPending).toBeUndefined();
  });

  it('falls back to upload screen when clipboard is empty and flag is set', async () => {
    await chrome.storage.session.set({ lintClipboardPending: true });

    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockResolvedValue(
      []
    );

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();

    expect(elements.resultsArea.hidden).toBe(true);
    expect(elements.uploadArea.hidden).toBe(false);
  });

  it('falls back to upload screen when clipboard.read() throws', async () => {
    await chrome.storage.session.set({ lintClipboardPending: true });

    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Permission denied')
    );

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();

    expect(elements.resultsArea.hidden).toBe(true);
    expect(elements.uploadArea.hidden).toBe(false);
  });

  it('does not save auto-lint results to session storage', async () => {
    vi.useFakeTimers();
    await chrome.storage.session.set({ lintClipboardPending: true });

    const html =
      '<p>1. A question.</p><p>ANSWER: <b><u>Answer</u></b></p>';
    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeClipboardItem(html, '1. A question.\nANSWER: Answer'),
    ]);

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();
    vi.runAllTimers();

    expect(elements.resultsArea.hidden).toBe(false);

    const stored = await chrome.storage.session.get('qbcheckSession');
    expect(stored.qbcheckSession).toBeUndefined();
    vi.useRealTimers();
  });

  it('manual paste after shortcut auto-lint saves to session', async () => {
    vi.useFakeTimers();
    await chrome.storage.session.set({ lintClipboardPending: true });

    const html = '<p>1. Auto-lint content.</p><p>ANSWER: <b><u>Auto</u></b></p>';
    (navigator.clipboard.read as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeClipboardItem(html, '1. Auto-lint content.\nANSWER: Auto'),
    ]);

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();
    vi.runAllTimers();

    // Auto-lint results are NOT saved
    let stored = await chrome.storage.session.get('qbcheckSession');
    expect(stored.qbcheckSession).toBeUndefined();

    // Now simulate a manual paste
    const manualHtml =
      '<p>1. Manual paste content.</p><p>ANSWER: <b><u>Manual</u></b></p>';
    controller.handlePaste(manualHtml, '1. Manual paste content.\nANSWER: Manual');
    vi.runAllTimers();

    // Manual paste results ARE saved
    stored = await chrome.storage.session.get('qbcheckSession');
    expect(stored.qbcheckSession).toBeDefined();
    vi.useRealTimers();
  });

  it('manual paste session persists across popup reopen', async () => {
    vi.useFakeTimers();

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();

    // Simulate manual paste
    const html =
      '<p>1. A tossup about history.</p><p>ANSWER: <b><u>Answer</u></b></p>';
    controller.handlePaste(html, '1. A tossup about history.\nANSWER: Answer');
    vi.runAllTimers();

    // Verify results are showing
    expect(elements.resultsArea.hidden).toBe(false);
    expect(controller.packetResults[0].diagnostics.length).toBeGreaterThan(0);

    // Verify session was saved
    const stored = await chrome.storage.session.get('qbcheckSession');
    expect(stored.qbcheckSession).toBeDefined();
    const savedSession = stored.qbcheckSession as {
      packetResults: { filename: string; diagnostics: unknown[] }[];
      mode: string;
    };
    expect(savedSession.mode).toBe('paste');
    expect(savedSession.packetResults[0].diagnostics.length).toBeGreaterThan(0);

    // Simulate popup reopen: fresh DOM + controller
    document.body.innerHTML = '';
    await loadPopupHTML();
    const elements2 = getElements();
    const controller2 = new PopupController(elements2, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller2.initialize();

    // Results should be restored with diagnostics
    expect(elements2.resultsArea.hidden).toBe(false);
    expect(controller2.packetResults[0].filename).toBe('Pasted text');
    expect(controller2.packetResults[0].diagnostics.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it('restores saved session even when flag is set', async () => {
    const session = {
      packetResults: [
        {
          filename: 'saved.docx',
          diagnostics: [],
        },
      ],
      currentIndex: 0,
      scrollPosition: 0,
      mode: 'file' as const,
    };
    await chrome.storage.session.set({
      qbcheckSession: session,
      lintClipboardPending: true,
    });

    const readSpy = navigator.clipboard.read as ReturnType<typeof vi.fn>;

    const elements = getElements();
    const controller = new PopupController(elements, {
      chromeStorage: chrome.storage,
      clipboard: navigator.clipboard,
    });

    await controller.initialize();

    expect(readSpy).not.toHaveBeenCalled();
    expect(controller.packetResults[0].filename).toBe('saved.docx');
  });
});
