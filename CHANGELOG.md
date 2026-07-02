# Changelog

All notable changes to qbcheck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Lower absolute-time from warning to info severity
- Raise prompt-partial-answers from info to warning severity
- Lower no-double-spaces to info severity (matching its registry default)

### Fixed

- Relax the reject-quotes rule to accept multiple quoted alternatives, pronunciations, "or equivalents" qualifiers, and descriptive class rejects (e.g. `reject synonyms`, `reject answers mentioning "X"`) while still flagging a quoted answer glued to explanatory prose
- Relax the prompt-question-quotes rule to accept directed-prompt questions that open with a quote, ignoring trailing punctuation, follow-up directives, or explanations
- Report an unbalanced or unclosed quote distinctly from other issues in the reject-quotes and prompt-question-quotes diagnostics
- Fix directive-separator false positive when "don’t accept/prompt" uses a curly apostrophe

## [0.2.0] - 2026-07-01

### Added

- Add keyboard shortcut (Ctrl+Shift+Q / Alt+Shift+Q) to open extension and auto-lint clipboard contents
- Add "Classical Music and Opera" as a valid QMOS category

### Changed

- Show "Tossup" / "Bonus" label instead of "T1" / "B1" when only one question is pasted
- Promote missing-pronoun rule from info to warning severity
- Disable bce-ce-system rule by default
- Split README into focused documentation files

### Fixed

- Fix absolute-time false positive on "this year" when question asks about a year
- Scope poetry-slash rule to only flag unspaced slashes inside quoted text
- Highlight the relevant phrase in prompt-with-not-by-asking and prompt-partial-answers diagnostics
- Fix trailing punctuation in post-notes diagnostic message

## [0.1.0] - 2026-06-28

### Added

- Initial release with 68 lint rules across 7 categories (packet structure, question text, answer lines, pronunciation, formatting, tags, writing style)
- .docx file upload (single, multi-file, and folder)
- Paste from Google Docs / Microsoft Word with formatting preservation
- Auto-fix for 16 rules in paste mode with copy-to-clipboard
- Multi-packet support with cross-packet category validation
- Dark mode
- Keyboard shortcuts for severity filtering and packet navigation
- Export plain-text diagnostic report
- Session persistence across popup open/close cycles
- `.qblintignore` support for suppressing rules per file
