# Popup UI Tests

Automated tests for the Chrome extension popup UI to ensure changes don't break existing functionality.

## Overview

These tests verify the popup's rendering, state management, and session persistence without requiring a real Chrome extension context. They use Vitest with jsdom to simulate the browser environment and mock Chrome APIs.

## Test Files

### `rendering.test.ts` (19 tests)

Tests the HTML structure and rendering logic:

- **HTML Structure**: Verifies all required DOM elements exist and are properly initialized
- **Diagnostic Rendering**: Tests how diagnostics are displayed with severity icons, question labels, snippets, and suggestions
- **Stats Bar**: Verifies error/warning/info counters and filter chips
- **Packet Navigation**: Tests navigation UI for multi-packet uploads
- **Settings View**: Verifies settings modal structure

### `session-persistence.test.ts` (16 tests)

Tests the session persistence feature added in recent commits:

- **SessionState interface**: Verifies packet results, scroll position, and mode are stored correctly
- **Session clearing**: Tests clear button and empty state behavior
- **Scroll position behavior**: Verifies scroll saves within packet but resets on navigation
- **Multi-packet state**: Tests preservation of multiple packets with diagnostics
- **Storage separation**: Ensures settings use local storage while session uses session storage
- **Chrome API mocks**: Verifies get/set/remove operations work correctly

## Test Infrastructure

### `setup.ts`

Provides Chrome API mocks for testing:

- **chrome.storage.local**: In-memory storage for settings persistence
- **chrome.storage.session**: In-memory storage for session state
- **navigator.clipboard**: Mocked clipboard API for auto-fix copy button
- **setupChromeMocks()**: Initialize all mocks before tests
- **clearStorageMocks()**: Clear storage and mock history between tests

### `helpers.ts`

Test utilities for working with the popup DOM:

- **loadPopupHTML()**: Loads popup.html into jsdom for testing
- **getElements()**: Returns commonly used DOM element references
- **makeDiagnostic()**: Creates sample diagnostics for testing
- **nextTick()**: Waits for async DOM updates
- **createMockFile()**: Creates File objects for upload testing
- **countVisibleDiagnostics()**: Counts rendered diagnostic elements

## Running Tests

```bash
# Run all tests
npm test

# Run only popup UI tests
npm test -- test/popup/

# Run tests in watch mode
npm run test:watch test/popup/

# Run a specific test file
npm test -- test/popup/rendering.test.ts
```

## Adding New Tests

1. Create a new test file in `test/popup/` with the pattern `*.test.ts`
2. Add `// @vitest-environment jsdom` at the top to enable DOM APIs
3. Import mocks and helpers:
   ```typescript
   import { setupChromeMocks, clearStorageMocks } from './setup.js';
   import { loadPopupHTML, getElements } from './helpers.js';
   ```
4. Set up/tear down in each test suite:
   ```typescript
   beforeEach(async () => {
     setupChromeMocks();
     await loadPopupHTML();
   });

   afterEach(() => {
     clearStorageMocks();
     document.body.innerHTML = '';
   });
   ```

## Testing Strategy

### What These Tests Cover

- HTML structure and element existence
- Static rendering (diagnostic display, stats, navigation UI)
- Session persistence (chrome.storage.session integration)
- Chrome API mocking (storage get/set/remove)
- Scroll position behavior
- Multi-packet state management

### What These Tests Don't Cover (Yet)

- User interactions (clicks, file uploads, paste events)
- Dynamic rendering functions (integration with popup.ts module)
- Settings changes and re-linting
- Auto-fix workflow
- Drag-and-drop file uploads
- Filter toggling and diagnostic hiding/ignoring

### Future Enhancements

To add full integration testing:

1. **Refactor popup.ts** to export functions instead of executing at module level
2. **Add interaction tests**: Simulate clicks, file uploads, paste events
3. **Test state transitions**: Upload → display → filter → ignore workflow
4. **Add snapshot tests**: Capture rendered HTML for visual regression testing
5. **Mock file reading**: Test parseDocx/parseHtml integration with file uploads

## Notes

- Tests use vanilla DOM APIs (no testing library required)
- Chrome APIs are fully mocked with in-memory storage
- Each test gets a fresh DOM via `loadPopupHTML()`
- Session and local storage are cleared between tests
- Tests run in jsdom environment (Node.js with DOM APIs)

## Test Coverage

Current coverage: **35 tests** across 2 test files

- Rendering: 19 tests
- Session Persistence: 16 tests

Total project test count: **302 tests** (including core linting logic tests)
