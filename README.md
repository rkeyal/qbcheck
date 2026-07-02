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

## License

MIT. See [LICENSE](LICENSE) for details.

jszip is used under the MIT license. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
