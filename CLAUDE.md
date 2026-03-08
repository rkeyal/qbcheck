# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

qbcheck is a Chrome extension that lints quizbowl question packets for QMOS style compliance. It runs entirely client-side, processing .docx files and clipboard HTML through a four-stage pipeline: Parse → Segment → Check → Display.

## Commands

```bash
# Development
npm run dev              # watch mode (rebuilds on file changes)
npm run build            # production build to dist/
npm test                 # run all tests
npm run test:watch       # watch mode for tests

# Code Quality
npm run lint             # ESLint (fails on warnings)
npm run lint:fix         # auto-fix ESLint issues
npm run format           # format all code with Prettier
npm run format:check     # verify formatting

# Analysis
npm run lint-packets     # run linter against ExamplePackets/ (outputs to lint-results.json)
```

## .qblintignore File

The `.qblintignore` file allows suppressing specific rules for specific files or directories. This is useful for tournament-specific style differences (e.g., IQBT doesn't use author tags).

**Format**:
```
# Comment lines start with #
<file-pattern> <rule-id>
```

**Glob patterns supported**:
- `*` matches any characters within a path segment (not `/`)
- `**` matches any number of path segments
- `?` matches a single character

**Example**:
```
# Disable tag requirement for IQBT packets
2023_IQBT_UG/*.docx tag.tag-present

# Disable expected count for tiebreakers
**/Tiebreaker*.docx packet.expected-count
```

The CLI script `scripts/lint-packets.ts` automatically loads `.qblintignore` from the current directory if present. See `.qblintignore.example` for more examples.

**Loading the extension**: After `npm run build`, go to `chrome://extensions`, enable Developer mode, and load the `dist/` folder as an unpacked extension.

**Running a single test file**: `npm test -- test/rules/answerline.test.ts`

**Running tests matching a pattern**: `npm test -- -t "checkAnswerPrefix"`

## Architecture

### 4-Stage Pipeline

The linter follows a strict data flow from raw input to structured diagnostics:

```
Input (.docx or HTML) → Parser → Segmenter → Linter → Display
                          ↓         ↓          ↓         ↓
                      Paragraph[]  Packet  Diagnostic[]  UI
```

#### 1. Parser (`src/core/parser.ts`)

- **parseDocx()**: Unzips .docx with jszip, walks Word XML to extract paragraphs with run-level formatting
- **parseHtml()**: Parses clipboard HTML with DOMParser, reading inline CSS and semantic tags for formatting
- Output: `Paragraph[]` - each paragraph contains `Run[]` with text and formatting flags (bold, italic, underline, superscript, subscript)

Key insight: Formatting is preserved at the **run level** (character ranges), not paragraph level. This enables precise checks like "primary answer must be bold+underlined."

#### 2. Segmenter (`src/core/segmenter.ts`)

- **segmentPacket()**: Groups paragraphs into a structured `Packet` with tossups and bonuses
- Detects section headers ("Tossups", "Bonuses"), numbered questions, ANSWER: lines, and tags
- **Structured mode**: Expects headers and question numbers (standard packet format)
- **Unstructured mode**: Falls back to inferring question boundaries from ANSWER: lines when headers/numbers are missing (for pasted snippets)

The `Packet` structure is the **single source of truth** for all rules. It includes:
- `header`: Pre-section paragraphs
- `tossupHeader`, `bonusHeader`: Section header paragraphs
- `tossups`, `bonuses`: Arrays of `Question` objects with paragraphs, answer lines, tags, and bonus parts
- `structured`: Boolean flag that determines which rules apply

#### 3. Linter (`src/core/engine.ts`)

- **lint()**: Runs all enabled rules against the packet and returns diagnostics
- Rules are independent pure functions: `(Packet) => LintDiagnostic[]`
- Packet-structure rules (headers, numbering, section order) are **skipped** when `packet.structured === false`
- Diagnostics include severity, message, paragraph index, optional source text highlighting

#### 4. Display (`src/popup/popup.ts`)

- Renders diagnostics grouped by severity with question labels (T5, B12) and answer previews
- Settings persist disabled rules and ignored instances via `chrome.storage.local`
- Supports multi-packet uploads with cross-packet category validation

### Data Model (`src/core/model.ts`)

Core types that flow through the pipeline:

- **Run**: Formatted text segment (text + boolean flags for bold/italic/underline/super/subscript)
- **Paragraph**: Container for runs with rawText and formatting metadata
- **Question**: Tossup or bonus with number, paragraphs, answer line, tag, and bonus parts
- **Packet**: Complete document structure with headers, questions, and metadata
- **LintDiagnostic**: Rule violation with severity, message, location, and optional highlighting

### Rules Architecture

Rules are organized by category in `src/core/rules/`:
- `packet.ts` - Packet structure (headers, numbering, section order)
- `question.ts` - Question text (FTP format, bonus markers, missing answers)
- `answerline.ts` - Answer line formatting and directives
- `tag.ts` - Author/category tags
- `formatting.ts` - Typography (quotes, dashes, abbreviations)
- `pronunciation.ts` - Pronunciation guide formatting
- `writing.ts` - Style (contractions, weasel words, tense)

**Adding a new rule**:
1. Write a function in the appropriate rule file: `(packet: Packet) => LintDiagnostic[]`
2. Add it to the exported rule array (e.g., `packetRules`)
3. Register metadata in `src/core/rule-registry.ts` (id, category, description, defaultSeverity)
4. Write tests in `test/rules/<category>.test.ts`

**Rule pattern**:
```typescript
function checkSomething(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const question of packet.tossups) {
    // check logic
    if (violation) {
      diags.push({
        rule: 'category.rule-name',
        severity: 'error' | 'warning' | 'info',
        paragraph: paragraph.index,
        message: 'Description of the issue',
        sourceText: paragraph.rawText,  // optional: enables snippet highlighting
        offset: matchStart,              // optional: highlight start position
        length: matchLength,             // optional: highlight length
      });
    }
  }

  return diags;
}
```

### Formatting Detection

The parser preserves run-level formatting from two sources:

**Word XML (.docx)**:
- Bold: `<w:b/>` in run properties
- Italic: `<w:i/>` in run properties
- Underline: `<w:u>` with non-"none" value
- Super/subscript: `w:vertAlign` attribute

**HTML (clipboard)**:
- Inline styles: `font-weight: 700`, `font-style: italic`, `text-decoration: underline`, `vertical-align: super/sub`
- Semantic tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<sup>`, `<sub>`
- Supports both `text-decoration` and `text-decoration-line` for Microsoft Word HTML compatibility

This dual-format support enables copy/paste from both Google Docs and Microsoft Word.

### Test Helpers (`test/helpers.ts`)

- `makePacket()`: Construct test packets with minimal boilerplate
- `makeQuestion()`: Build tossup or bonus questions with answers and tags
- `makeParagraph()`: Create paragraphs with run-level formatting
- `hasDiag()`: Check if a specific rule fired
- `findDiag()`: Extract diagnostic by rule ID

Tests use Vitest with jsdom for DOM parsing. Each rule file has a corresponding test file in `test/rules/`.

## Chrome Extension Build

Vite bundles `src/popup/popup.html` (entry point) into `dist/`, copying `manifest.json` as a build artifact. The extension has two main permissions:
- `storage`: Persist settings (disabled rules, ignored instances)
- `clipboardRead`: Support paste-from-clipboard workflow

The popup is a single-page app that processes files entirely client-side—no network requests.

## Important Patterns

**Unstructured mode**: When users paste questions without headers/numbers, the segmenter infers boundaries from ANSWER: lines. Packet-structure rules are skipped to avoid false positives. This is signaled by `packet.structured = false`.

**Category validation**: The `tag.consistent-categories` rule is cross-packet—it only runs when multiple packets are loaded and flags categories that appear in <50% of packets as potentially non-standard.

**Rule registry**: Rules are registered twice: once as functions in rule arrays (for execution) and once as metadata in `RULE_REGISTRY` (for UI display). Keep these in sync when adding rules.

**Auto-formatting hook**: `.claude/settings.json` configures a PostToolUse hook that runs Prettier after Write/Edit operations. This keeps code formatted during development.

## Key Files to Understand

- `src/core/model.ts` - Type definitions for the entire pipeline
- `src/core/segmenter.ts` - Question boundary detection (most complex logic)
- `src/core/engine.ts` - Rule orchestration and packet-structure rule filtering
- `src/shared/constants.ts` - QMOS categories, directive keywords, regex patterns
- `.claude/skills/analyze-lint-results/` - Skill for evaluating linter performance on example packets
