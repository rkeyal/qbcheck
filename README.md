# qbcheck

A Chrome extension that checks quizbowl question packets for style and formatting issues. It enforces [QMOS](https://minkowski.space/quizbowl/manuals/style/) conventions and catches problems that would break downstream tools like [YAPP](https://github.com/alopezlago/YetAnotherPacketParser).

## Installation

qbcheck is distributed as an unpacked Chrome extension.

1. Download or clone this repository
2. Install dependencies and build:
   ```
   npm install
   npm run build
   ```
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the `dist/` folder
6. qbcheck will appear in your extensions toolbar

To update, pull the latest changes, run `npm run build` again, and click the reload button on the extension card in `chrome://extensions`.

## Usage

### Upload .docx packets

Click the qbcheck icon in your toolbar. You can:

- **Drag and drop** one or more `.docx` files onto the drop zone
- **Choose Files** to select individual `.docx` packets
- **Choose Folder** to check an entire folder of packets at once

When multiple packets are loaded, use the navigation bar to switch between them. Categories that appear in fewer than half the packets are flagged as potentially non-standard.

### Paste from Google Docs / Microsoft Word

If you're drafting or proofreading questions in Docs / Word:

1. Select and copy your questions (Ctrl+C / Cmd+C)
2. Click the qbcheck paste area
3. Press Ctrl+V / Cmd+V

qbcheck reads the formatted HTML from your clipboard, preserving bold, italic, and underline styling. It works with flat question lists that don't have "Tossups" / "Bonuses" headers or question numbers -- questions are detected from `ANSWER:` lines and bonus type is inferred from part markers.

When pasting unstructured text, packet-level rules (section headers, numbering, expected counts) are automatically skipped, and an info banner explains this.

### Results

Each diagnostic shows:

- **Severity**: error (red), warning (yellow), or info (blue)
- **Rule ID**: which rule flagged the issue
- **Message**: what's wrong and how to fix it
- **Location**: the question label (T5, B12) and a preview of the answer

Click a diagnostic with a source snippet indicator to expand it and see the exact text that triggered the rule, with the relevant portion highlighted.

Filter results by severity (click the error/warning/info chips) or by category (use the dropdown). Individual diagnostics can be ignored, and entire rules can be disabled via the settings gear icon.

## What it checks

qbcheck runs 58 rules across 7 categories.

### Packet structure
Validates that the packet is organized correctly for downstream parsing.

| Rule | Description |
|------|-------------|
| `section-headers` | "Tossups" and "Bonuses" headers must be present |
| `section-order` | Tossups section must come before Bonuses |
| `question-numbering` | Questions must be numbered sequentially (1, 2, 3...) |
| `numbering-sequence` | Question numbers must strictly increase (non-increasing numbers break YAPP) |
| `expected-count` | Expects 20 tossups and 20 bonuses |
| `no-bold-numbers` | Question numbers should not be bold |
| `blank-paragraphs` | No groups of consecutive blank lines in question sections |

### Question text
Checks the structure and markers within question text.

| Rule | Description |
|------|-------------|
| `ftp-format` | "For 10 points" uses numerals and is followed by a comma |
| `ftpe-format` | Bonus lead-ins contain "For 10 points each" |
| `bonus-part-marker` | Bonus parts have `[10e]`, `[10m]`, `[10h]` markers |
| `bonus-difficulty-spread` | Each bonus has easy, medium, and hard parts |
| `bonus-leadin-punctuation` | Lead-ins end with the right punctuation (period or colon) |
| `bonus-part-order` | Each bonus part is followed by its answer before the next part (required by YAPP) |
| `power-mark` | Power marks `(*)` are properly spaced |
| `missing-answer` | Every tossup and bonus part has an `ANSWER:` line |
| `multiline-answer` | Answer lines are a single paragraph (multi-line answers break YAPP) |
| `no-ftp-midsentence` | "For 10 points" appears in the final sentence, not mid-paragraph |
| `pre-question-note-italics` | Pre-question notes like "Description acceptable." should be italicized |

### Answer lines
Validates `ANSWER:` line formatting, directives, and structure.

| Rule | Description |
|------|-------------|
| `answer-prefix` | Answer lines start with `ANSWER: ` (all caps, colon, space) |
| `no-nonstandard-prefix` | Flags `Ans:`, `Answer.`, and other non-standard prefixes |
| `answer-formatting` | Primary answer is bold and underlined |
| `bracket-balance` | Square brackets are balanced |
| `accept-formatting` | Text in `[accept]` / `[or]` directives is bold and underlined |
| `prompt-formatting` | Text in `[prompt]` directives is underlined |
| `reject-quotes` | Text in `[reject]` directives is quoted |
| `prompt-question-quotes` | "by asking" questions are quoted |
| `prompt-with-not-by-asking` | Directed prompts use "by asking" instead of "with" |
| `prompt-partial-answers` | Avoid "prompt on partial answers" — spell out what's promptable |
| `directive-typo` | Catches typos in directive keywords |
| `deprecated-directive` | Flags deprecated directives (anti-prompt, do not accept, etc.) |
| `post-notes` | Text after the last bracket is in parentheses |
| `post-note-no-quote-start` | Post-notes don't start with quotation marks |
| `no-parenthetical-optional` | No parenthesized optional text like "(The) Great Gatsby" |

### Pronunciation
Checks pronunciation guide formatting.

| Rule | Description |
|------|-------------|
| `paren-delimiter` | Guides use parentheses, not square brackets |
| `trailing-punct` | Punctuation goes after the closing parenthesis, not inside |

### Formatting
Enforces typography and text conventions.

| Rule | Description |
|------|-------------|
| `smart-quotes` | Use curly quotes, not straight quotes |
| `no-em-dash` | Use spaced en dashes for parenthetical breaks |
| `spell-out-small-numbers` | Spell out numbers 2 through 10 |
| `no-ampersand` | Write "and" instead of "&" |
| `poetry-slash` | Poetry line breaks have spaces around the slash |
| `no-double-spaces` | No consecutive spaces |
| `no-sub-superscript` | Use prose instead of subscript/superscript characters |
| `no-abbreviation-periods` | Write "US" not "U.S." |
| `bce-ce-system` | Use BCE/CE, not BC/AD |
| `no-latin-abbrev` | Write out Latin abbreviations (e.g., i.e., etc.) |
| `punctuation-inside-quotes` | Punctuation goes inside closing quotation marks |

### Tags
Validates author/category tags.

| Rule | Description |
|------|-------------|
| `tag-present` | Every question has a tag line |
| `tag-format` | Tags match `<Author, Category>` format |
| `valid-category` | Category is a recognized QMOS category |
| `no-nested-brackets` | No nested angle brackets (breaks YAPP) |
| `consistent-categories` | Same category is spelled the same way throughout the packet |

### Writing style
Flags common style issues in question prose.

| Rule | Description |
|------|-------------|
| `no-contractions` | Spell out contractions |
| `no-weasel-words` | Avoid vague qualifiers (some, various, many) |
| `word-replacements` | Preferred word choices (e.g., "on" instead of "upon") |
| `absolute-time` | Use absolute dates, not "recently" or "currently" |
| `answer-some-questions` | Use "answer the following" not "answer some questions" |
| `would-go-on-to` | Use simple past tense instead of "would go on to" |

## How it works

qbcheck runs entirely in the browser -- no data is sent to any server. The extension popup processes files locally through a four-stage pipeline:

1. **Parse**: `.docx` files are unzipped (using [jszip](https://github.com/Stuk/jszip)) and the Word XML is walked to extract paragraphs with run-level formatting (bold, italic, underline). Clipboard HTML is parsed with `DOMParser`, reading formatting from inline styles.

2. **Segment**: Paragraphs are grouped into a packet structure. The segmenter looks for "Tossups" / "Bonuses" headers and numbered questions. For unstructured input (pasted text without headers), it falls back to inferring question boundaries from `ANSWER:` lines and detecting bonus type from part markers or "For 10 points each."

3. **Check**: Each rule function receives the structured packet and returns diagnostics. Rules are independent and can be individually disabled.

4. **Display**: Diagnostics are sorted, enriched with question labels and answer previews, and rendered in the popup. Settings (disabled rules, ignored instances) persist via `chrome.storage.local`.

## Development

```
npm install          # install dependencies
npm test             # run tests
npm run build        # build to dist/
npm run dev          # watch mode (rebuilds on changes)
```

Tests use [Vitest](https://vitest.dev/). The test suite covers the parser, segmenter, all rule categories, and YAPP compatibility rules.

## License

MIT. See [LICENSE](LICENSE) for details.

jszip is used under the MIT license. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
