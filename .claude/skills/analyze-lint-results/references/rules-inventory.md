# Current Rule Inventory

## packet.ts (8 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| packet.section-headers | error | Missing "Tossups" or "Bonuses" header |
| packet.section-order | error | Bonuses section appears before Tossups |
| packet.question-numbering | error | Non-sequential question numbers |
| packet.numbering-sequence | error | Question numbers don't increase from previous |
| packet.no-bold-numbers | warning | Question numbers should not be bold |
| packet.no-extras-label | warning | Don't label questions as "Extra"/"TB" |
| packet.blank-paragraphs | info | Consecutive blank paragraphs detected |
| packet.expected-count | warning | Tossup/bonus count != 20 |

## question.ts (11 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| question.ftp-format | error/warning | "For 10 points" format issues |
| question.ftpe-format | warning | Bonus missing "For 10 points each" |
| question.bonus-part-marker | error/warning | Missing or malformed [10]/[E]/[M]/[H] |
| question.bonus-part-order | error | Bonus part appears before previous part's answer |
| question.power-mark | info/warning | Power mark (*) issues |
| question.missing-answer | error | Question has no ANSWER line |
| question.multiline-answer | error | Answer line continuation detected |
| question.bonus-leadin-punctuation | warning | Lead-in ending punctuation (period vs colon) |
| question.bonus-difficulty-spread | warning | Missing e/m/h difficulty markers |
| question.no-ftp-midsentence | warning | "for 10 points" interjected mid-sentence |
| question.pre-question-note-italics | info | Pre-question notes should be italicized |

## answerline.ts (15 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| answerline.answer-prefix | error/warning | ANSWER: prefix formatting |
| answerline.no-nonstandard-prefix | error | Non-standard answer prefix detected |
| answerline.answer-formatting | error | Primary answer not bold+underlined |
| answerline.bracket-balance | error | Unbalanced brackets |
| answerline.directive-typo | warning | Possible typo in directive keyword |
| answerline.accept-formatting | warning | [accept]/[or] content not bold+underlined |
| answerline.prompt-formatting | warning | [prompt] content not underlined |
| answerline.prompt-partial-answers | info | Avoid "prompt on partial answers" |
| answerline.prompt-with-not-by-asking | info | Use "by asking" instead of "with" |
| answerline.reject-quotes | warning | [reject] content not wrapped in quotes |
| answerline.prompt-question-quotes | warning | "by asking" question not quoted |
| answerline.post-notes | info | Post-bracket text not parenthesized |
| answerline.deprecated-directive | warning | anti-prompt, do not accept, etc. |
| answerline.post-note-no-quote-start | info | Post-note starts with quotation mark |
| answerline.no-parenthetical-optional | info | Parenthesized optional parts like (The) |

## tag.ts (5 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| tag.tag-present | warning | Question has no tag line |
| tag.tag-format | warning | Tag doesn't match <Author, Category> |
| tag.no-nested-brackets | error | Nested angle brackets in tag |
| tag.valid-category | warning | Category not in standard QMOS list |
| tag.consistent-categories | warning | Inconsistent category naming variants |

## formatting.ts (11 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| formatting.smart-quotes | warning/info | Straight quotes instead of curly |
| formatting.no-em-dash | warning | Em dash instead of en dash |
| formatting.spell-out-small-numbers | info | Numbers 2-10 not spelled out |
| formatting.no-ampersand | info | Ampersand instead of "and" |
| formatting.poetry-slash | info | Poetry slashes not spaced |
| formatting.no-latin-abbrev | warning | Latin abbreviations (e.g., i.e., etc.) |
| formatting.no-double-spaces | warning | Double spaces detected |
| formatting.no-sub-superscript | warning | Superscript/subscript usage |
| formatting.no-abbreviation-periods | warning | Periods in U.S., U.K., etc. |
| formatting.bce-ce-system | warning | BC/AD instead of BCE/CE |
| formatting.punctuation-inside-quotes | info | Punctuation outside closing quotes |

## pronunciation.ts (2 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| pronunciation.paren-delimiter | warning | Square brackets instead of parens |
| pronunciation.trailing-punct | info | Punctuation inside pronunciation guide |

## writing.ts (6 rules)
| Rule ID | Severity | Description |
|---------|----------|-------------|
| writing.no-contractions | warning | Contraction detected |
| writing.no-weasel-words | info | Weasel words (famous, notable, etc.) |
| writing.word-replacements | info | Verbose word replacements |
| writing.absolute-time | warning | Relative time references |
| writing.answer-some-questions | warning | "Answer some questions about" |
| writing.would-go-on-to | info | "would go on to" / "went on to" |
