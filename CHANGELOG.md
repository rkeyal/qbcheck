# Changelog

All notable changes to qbcheck will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
