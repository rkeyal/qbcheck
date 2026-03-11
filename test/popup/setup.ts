import { vi } from 'vitest';

/**
 * Chrome API mocks for popup UI tests.
 *
 * These mocks provide in-memory storage for chrome.storage.local and
 * chrome.storage.session, allowing tests to verify persistence behavior
 * without requiring a real Chrome extension context.
 */

interface StorageArea {
  [key: string]: unknown;
}

// In-memory storage for chrome.storage.local
const localStorageData: StorageArea = {};

// In-memory storage for chrome.storage.session
const sessionStorageData: StorageArea = {};

export function setupChromeMocks(_globalOverrides?: boolean) {
  // Mock ClipboardItem (not available in jsdom)
  if (!globalThis.ClipboardItem) {
    (globalThis as Record<string, unknown>).ClipboardItem = class MockClipboardItem {
      constructor(public items: Record<string, Blob>) {}
    };
  }

  // Mock chrome.storage API
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | null) => {
          if (!keys) return { ...localStorageData };
          if (typeof keys === 'string') {
            return { [keys]: localStorageData[keys] };
          }
          const result: StorageArea = {};
          for (const key of keys) {
            result[key] = localStorageData[key];
          }
          return result;
        }),
        set: vi.fn(async (items: StorageArea) => {
          Object.assign(localStorageData, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const keysArray = typeof keys === 'string' ? [keys] : keys;
          for (const key of keysArray) {
            delete localStorageData[key];
          }
        }),
      },
      session: {
        get: vi.fn(async (keys?: string | string[] | null) => {
          if (!keys) return { ...sessionStorageData };
          if (typeof keys === 'string') {
            return { [keys]: sessionStorageData[keys] };
          }
          const result: StorageArea = {};
          for (const key of keys) {
            result[key] = sessionStorageData[key];
          }
          return result;
        }),
        set: vi.fn(async (items: StorageArea) => {
          Object.assign(sessionStorageData, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          const keysArray = typeof keys === 'string' ? [keys] : keys;
          for (const key of keysArray) {
            delete sessionStorageData[key];
          }
        }),
      },
    },
  } as typeof chrome;

  // Mock navigator.clipboard API
  global.navigator.clipboard = {
    write: vi.fn(async () => {}),
    writeText: vi.fn(async () => {}),
    read: vi.fn(async () => []),
    readText: vi.fn(async () => ''),
  } as typeof navigator.clipboard;
}

export function clearStorageMocks() {
  // Clear in-memory storage
  Object.keys(localStorageData).forEach((key) => delete localStorageData[key]);
  Object.keys(sessionStorageData).forEach(
    (key) => delete sessionStorageData[key]
  );

  // Clear mock call history
  vi.clearAllMocks();
}

export function getLocalStorage(): StorageArea {
  return { ...localStorageData };
}

export function getSessionStorage(): StorageArea {
  return { ...sessionStorageData };
}
