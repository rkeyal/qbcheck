# How it works

qbcheck runs entirely in the browser -- no data is sent to any server. The extension popup processes files locally through a five-stage pipeline:

```
Input (.docx or HTML) → Parse → Segment → Check → Fix → Display
```

## 1. Parse

`.docx` files are unzipped (using [jszip](https://github.com/Stuk/jszip)) and the Word XML is walked to extract paragraphs with run-level formatting (bold, italic, underline). Clipboard HTML is parsed with `DOMParser`, reading formatting from inline styles and semantic tags.

Formatting is preserved at the **run level** (character ranges), not paragraph level. This enables precise checks like "primary answer must be bold and underlined."

**Key file**: `src/core/parser.ts`

## 2. Segment

Paragraphs are grouped into a structured packet. The segmenter looks for "Tossups" / "Bonuses" headers and numbered questions. For unstructured input (pasted text without headers), it falls back to inferring question boundaries from `ANSWER:` lines and detecting bonus type from part markers or "For 10 points each."

The resulting `Packet` structure is the single source of truth for all rules. It includes section headers, tossups, bonuses, and a `structured` flag that determines which rules apply.

**Key file**: `src/core/segmenter.ts`

## 3. Check

Each rule function receives the structured packet and returns diagnostics. Rules are independent pure functions and can be individually disabled. Packet-structure rules (headers, numbering, section order) are skipped when the packet is unstructured.

**Key file**: `src/core/engine.ts`

## 4. Fix (paste mode only)

Diagnostics with auto-fix data are applied to produce corrected paragraphs:

- **Text-level fixes** replace strings at specific offsets in `rawText`, then propagate the change into runs to preserve formatting.
- **Format-level fixes** split runs and strip formatting (bold/italic/underline) from specific character ranges without changing `rawText`.

Format fixes are applied first (they don't shift offsets), then text fixes are applied from end to start. Fixed paragraphs can be copied to the clipboard as rich HTML.

**Key file**: `src/core/fixer.ts`

## 5. Display

Diagnostics are sorted, enriched with question labels and answer previews, and rendered in the popup. Settings (disabled rules, ignored instances) persist via `chrome.storage.local`. Session state (results, scroll position) persists via `chrome.storage.session`.

**Key file**: `src/popup/popup.ts`

## Data model

Core types flow through the pipeline and are defined in `src/core/model.ts`:

- **Run** — formatted text segment (text + boolean flags for bold/italic/underline/super/subscript)
- **Paragraph** — container for runs with rawText and formatting metadata
- **Question** — tossup or bonus with number, paragraphs, answer line, tag, and bonus parts
- **Packet** — complete document structure with headers, questions, and metadata
- **LintDiagnostic** — rule violation with severity, message, location, optional fix data
