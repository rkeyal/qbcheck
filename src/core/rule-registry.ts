import { Severity } from './model.js';

export interface RuleMeta {
  id: string;
  category: string;
  description: string;
  defaultSeverity: Severity;
  autoFixable?: boolean;
}

/**
 * Rules disabled by default in a fresh install. Both the Chrome extension and
 * the Apps Script add-on start with these off so their out-of-the-box behavior
 * matches. Cross-packet rules (e.g. tag.consistent-categories) are handled
 * separately by the engine / add-on and are not listed here.
 */
export const DEFAULT_DISABLED_RULES: string[] = [
  'formatting.smart-quotes',
  'formatting.no-format-bleeding',
  'writing.word-replacements',
  'writing.no-weasel-words',
  'packet.blank-paragraphs',
];

export const RULE_REGISTRY: RuleMeta[] = [
  // packet (8 rules)
  {
    id: 'packet.section-headers',
    category: 'packet',
    description: 'Tossups/Bonuses section headers present',
    defaultSeverity: 'error',
  },
  {
    id: 'packet.section-order',
    category: 'packet',
    description: 'Tossups section appears before Bonuses',
    defaultSeverity: 'error',
  },
  {
    id: 'packet.question-numbering',
    category: 'packet',
    description: 'Questions numbered sequentially',
    defaultSeverity: 'warning',
  },
  {
    id: 'packet.no-bold-numbers',
    category: 'packet',
    description: 'Question numbers should not be bold',
    defaultSeverity: 'info',
  },
  {
    id: 'packet.blank-paragraphs',
    category: 'packet',
    description: 'No consecutive blank paragraphs',
    defaultSeverity: 'info',
  },
  {
    id: 'packet.expected-count',
    category: 'packet',
    description: 'Expected number of tossups and bonuses',
    defaultSeverity: 'warning',
  },
  {
    id: 'packet.numbering-sequence',
    category: 'packet',
    description: 'Question numbers strictly increase',
    defaultSeverity: 'error',
  },
  // question (15 rules)
  {
    id: 'question.ftp-format',
    category: 'question',
    description: 'FTP clue formatting',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'question.ftpe-format',
    category: 'question',
    description: 'FTPE bonus formatting',
    defaultSeverity: 'warning',
  },
  {
    id: 'question.bonus-part-marker',
    category: 'question',
    description: 'Bonus part value markers present',
    defaultSeverity: 'error',
  },
  {
    id: 'question.power-mark',
    category: 'question',
    description: 'Power mark formatting',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'question.missing-answer',
    category: 'question',
    description: 'Every question has an answer line',
    defaultSeverity: 'error',
  },
  {
    id: 'question.bonus-leadin-punctuation',
    category: 'question',
    description: 'Bonus lead-in punctuation',
    defaultSeverity: 'warning',
  },
  {
    id: 'question.bonus-difficulty-spread',
    category: 'question',
    description: 'Bonus difficulty value spread',
    defaultSeverity: 'warning',
  },
  {
    id: 'question.no-ftp-midsentence',
    category: 'question',
    description: 'FTP not mid-sentence',
    defaultSeverity: 'warning',
  },
  {
    id: 'question.note-formatting',
    category: 'question',
    description: 'Pre-question and moderator note formatting',
    defaultSeverity: 'info',
  },
  {
    id: 'question.multiline-answer',
    category: 'question',
    description: 'Answer lines must be single paragraph',
    defaultSeverity: 'error',
  },
  {
    id: 'question.bonus-part-order',
    category: 'question',
    description: 'Bonus parts interleaved with answers',
    defaultSeverity: 'error',
  },
  {
    id: 'question.post-question-note-sentence',
    category: 'question',
    description: 'Post-question notes styled as sentences',
    defaultSeverity: 'warning',
  },
  {
    id: 'question.separate-note-paragraph',
    category: 'question',
    description: 'Pre-question notes inline with question text',
    defaultSeverity: 'warning',
  },
  {
    id: 'question.missing-pronoun',
    category: 'question',
    description: 'Clue sentence or FTP references the answer with a pronoun',
    defaultSeverity: 'info',
  },
  // answerline (16 rules)
  {
    id: 'answerline.answer-prefix',
    category: 'answerline',
    description: 'ANSWER: prefix format',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'answerline.answer-formatting',
    category: 'answerline',
    description: 'Answer has required bold/underline',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.bracket-balance',
    category: 'answerline',
    description: 'Brackets are balanced',
    defaultSeverity: 'error',
  },
  {
    id: 'answerline.directive-typo',
    category: 'answerline',
    description: 'No typos in accept/prompt/reject',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.accept-formatting',
    category: 'answerline',
    description: 'Accept directive formatting',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.prompt-formatting',
    category: 'answerline',
    description: 'Prompt directive formatting',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.reject-quotes',
    category: 'answerline',
    description: 'Reject directive quoting',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.prompt-question-quotes',
    category: 'answerline',
    description: 'Prompt question in quotes',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.prompt-with-not-by-asking',
    category: 'answerline',
    description: "Directed prompts use 'by asking' not 'with'",
    defaultSeverity: 'info',
  },
  {
    id: 'answerline.prompt-partial-answers',
    category: 'answerline',
    description: "Avoid 'prompt on partial answers'",
    defaultSeverity: 'info',
  },
  {
    id: 'answerline.post-notes',
    category: 'answerline',
    description: 'Post-note formatting',
    defaultSeverity: 'info',
  },
  {
    id: 'answerline.deprecated-directive',
    category: 'answerline',
    description: 'No deprecated directives',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'answerline.no-parenthetical-optional',
    category: 'answerline',
    description: 'No parenthetical optional text',
    defaultSeverity: 'info',
  },
  {
    id: 'answerline.no-nonstandard-prefix',
    category: 'answerline',
    description: 'No nonstandard answer prefixes (Ans:, Answer.)',
    defaultSeverity: 'error',
    autoFixable: true,
  },
  {
    id: 'answerline.directive-separator',
    category: 'answerline',
    description: 'Directives after first separated by semicolon',
    defaultSeverity: 'warning',
  },
  {
    id: 'answerline.reject-no-alone',
    category: 'answerline',
    description: 'No "alone" after quoted reject directive',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'answerline.directive-brackets',
    category: 'answerline',
    description: 'Directives must use square brackets, not parentheses',
    defaultSeverity: 'error',
    autoFixable: true,
  },
  // pronunciation (4 rules)
  {
    id: 'pronunciation.paren-delimiter',
    category: 'pronunciation',
    description: 'Pronunciation guide delimiters',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'pronunciation.trailing-punct',
    category: 'pronunciation',
    description: 'No trailing punctuation in guides',
    defaultSeverity: 'warning',
  },
  {
    id: 'pronunciation.quotes-required',
    category: 'pronunciation',
    description: 'Pronunciation guides must have quotes',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'pronunciation.possessive-ending',
    category: 'pronunciation',
    description: "PG after possessive ends with 's, s, or z",
    defaultSeverity: 'warning',
  },
  // formatting (12 rules)
  {
    id: 'formatting.smart-quotes',
    category: 'formatting',
    description: 'Use smart (curly) quotes',
    defaultSeverity: 'info',
  },
  {
    id: 'formatting.no-em-dash',
    category: 'formatting',
    description: 'Use en dashes, not em dashes',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'formatting.no-sub-superscript',
    category: 'formatting',
    description: 'No subscript/superscript',
    defaultSeverity: 'info',
  },
  {
    id: 'formatting.spell-out-small-numbers',
    category: 'formatting',
    description: 'Spell out numbers under 10',
    defaultSeverity: 'info',
  },
  {
    id: 'formatting.no-ampersand',
    category: 'formatting',
    description: 'No ampersands in text',
    defaultSeverity: 'warning',
  },
  {
    id: 'formatting.poetry-slash',
    category: 'formatting',
    description: 'Poetry line break slash formatting',
    defaultSeverity: 'warning',
  },
  {
    id: 'formatting.no-double-spaces',
    category: 'formatting',
    description: 'No double spaces',
    defaultSeverity: 'info',
    autoFixable: true,
  },
  {
    id: 'formatting.no-abbreviation-periods',
    category: 'formatting',
    description: 'No periods in abbreviations',
    defaultSeverity: 'info',
    autoFixable: true,
  },
  {
    id: 'formatting.bce-ce-system',
    category: 'formatting',
    description: 'Use BCE/CE date system',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'formatting.no-latin-abbrev',
    category: 'formatting',
    description: 'No Latin abbreviations (e.g., i.e.)',
    defaultSeverity: 'warning',
  },
  {
    id: 'formatting.punctuation-inside-quotes',
    category: 'formatting',
    description: 'Punctuation inside quotation marks',
    defaultSeverity: 'warning',
  },
  {
    id: 'formatting.no-format-bleeding',
    category: 'formatting',
    description: 'No formatting on leading/trailing spaces (bold/italic)',
    defaultSeverity: 'info',
    autoFixable: true,
  },
  {
    id: 'formatting.no-format-bleeding-underline',
    category: 'formatting',
    description: 'No underline formatting on leading/trailing spaces',
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  // tag (5 rules)
  {
    id: 'tag.tag-present',
    category: 'tag',
    description: 'Author tag present on each question',
    defaultSeverity: 'warning',
  },
  {
    id: 'tag.tag-format',
    category: 'tag',
    description: 'Tag format: <Author, Category>',
    defaultSeverity: 'warning',
  },
  {
    id: 'tag.valid-category',
    category: 'tag',
    description: 'Category is recognized',
    defaultSeverity: 'warning',
  },
  {
    id: 'tag.no-nested-brackets',
    category: 'tag',
    description: 'No nested angle brackets in tags',
    defaultSeverity: 'error',
  },
  {
    id: 'tag.consistent-categories',
    category: 'tag',
    description: 'Consistent tossup/bonus category pairing',
    defaultSeverity: 'warning',
  },
  // writing (6 rules)
  {
    id: 'writing.no-contractions',
    category: 'writing',
    description: 'No contractions in question text',
    defaultSeverity: 'warning',
  },
  {
    id: 'writing.no-weasel-words',
    category: 'writing',
    description: 'No weasel words (some, various, etc.)',
    defaultSeverity: 'info',
  },
  {
    id: 'writing.word-replacements',
    category: 'writing',
    description: 'Preferred word choices',
    defaultSeverity: 'info',
  },
  {
    id: 'writing.absolute-time',
    category: 'writing',
    description: 'No absolute time references (currently)',
    defaultSeverity: 'warning',
  },
  {
    id: 'writing.answer-some-questions',
    category: 'writing',
    description: "No 'answer some questions'",
    defaultSeverity: 'warning',
    autoFixable: true,
  },
  {
    id: 'writing.would-go-on-to',
    category: 'writing',
    description: "No 'would go on to' phrasing",
    defaultSeverity: 'warning',
  },
];
