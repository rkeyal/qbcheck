# qbcheck

A Chrome extension that checks quizbowl question packets for style and formatting issues.

## Features

- Upload `.docx` packets or paste directly from Google Docs / Microsoft Word
- 68 rules across 7 categories: packet structure, question text, answer lines, pronunciation, formatting, tags, and writing style
- Auto-fix for 16 common issues with one-click copy back to your editor
- Runs entirely in the browser -- no data leaves your machine
- Multi-packet support with cross-packet category validation
- Export diagnostic reports as plain text

## Installation

1. Download `qbcheck-v<version>.zip` from the [Releases](../../releases) page
2. Extract the zip to a folder on your computer
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the extracted folder
6. qbcheck will appear in your extensions toolbar

To update, download the latest release, extract it to the same folder (overwriting the old files), and click the reload button on the extension card in `chrome://extensions`.

For development setup, see [Contributing](docs/contributing.md).

## Usage

Click the qbcheck icon in your toolbar to open the popup. From there you can:

- **Upload packets**: Drag and drop `.docx` files, choose individual files, or select an entire folder
- **Paste from Docs/Word**: Copy questions and paste into the qbcheck paste area — formatting is preserved
- **Auto-fix** (paste mode): Common issues are fixed automatically; use the Copy button to paste corrected text back into your editor

Results show each issue with its severity, the rule that flagged it, and the question location. Filter by severity or category, disable rules, or ignore individual diagnostics via settings.

Use `Ctrl+Shift+Q` (Mac) or `Alt+Shift+Q` (Windows/Linux) to open qbcheck and lint your clipboard in one step.

See the [Usage Guide](docs/usage.md) for the full feature walkthrough and a list of all 68 rules.

## Documentation

- [Usage Guide](docs/usage.md) -- how to use the extension, what it checks
- [Internals](docs/internals.md) -- how the five-stage pipeline works
- [Contributing](docs/contributing.md) -- development setup, adding rules, running tests
- [Changelog](CHANGELOG.md) -- release history

## Google Docs add-on (Apps Script)

The same linter runs inside Google Docs as a sidebar add-on. The core pipeline
is shared with the Chrome extension; a thin glue layer in `src/apps-script/`
adapts it to the Apps Script `DocumentApp` API, applies fixes to the live
document, and lets you click a finding to scroll its question to the top of the
doc.

The add-on is built with Vite, bundling `src/apps-script/main.ts` into a single
`apps-script/Code.js`.

```
npm run typecheck:apps-script   # type-check the Apps Script sources + shared core
npm run build:apps-script       # type-check, then bundle into apps-script/Code.js + Sidebar.html
```

The glue layer has integration tests under `test/apps-script/` that run the real
shipping code against a fake `DocumentApp` runtime (`fake-gas.ts`) — no Google
account or deployment needed. They run as part of `npm test`.

### Deploying

After `npm run build:apps-script`, copy the build outputs into an Apps Script
project bound to your Google Doc (**Extensions → Apps Script** from the doc):

- Paste `apps-script/Code.js` into the script editor's `Code.gs`.
- Add an HTML file named `Sidebar` and paste in `apps-script/Sidebar.html`.
- Copy `apps-script/appsscript.json` into the project manifest (enable
  **Show "appsscript.json" manifest file** under Project Settings first).

Then reload the doc and open the add-on from the **qbcheck** menu.

## License

MIT. See [LICENSE](LICENSE) for details.

jszip is used under the MIT license. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
