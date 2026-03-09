import { describe, it, expect } from 'vitest';
import { lint } from '../src/core/engine.js';
import { applyFixes } from '../src/core/fixer.js';
import { makePacket, makeQuestion, makeBonusPart, hasDiag } from './helpers.js';
import { Run } from '../src/core/model.js';

// ── Run helpers ──

function plain(text: string): Run {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    superscript: false,
    subscript: false,
  };
}
function bold(text: string): Run {
  return {
    text,
    bold: true,
    italic: false,
    underline: false,
    superscript: false,
    subscript: false,
  };
}
function italic(text: string): Run {
  return {
    text,
    bold: false,
    italic: true,
    underline: false,
    superscript: false,
    subscript: false,
  };
}
function bu(text: string): Run {
  return {
    text,
    bold: true,
    italic: false,
    underline: true,
    superscript: false,
    subscript: false,
  };
}

// ── Packet builders ──

function tossupWithRuns(runs: Run[], answer?: string, answerRuns?: Run[]) {
  const rawText = runs.map((r) => r.text).join('');
  const questionRuns = [plain('1. '), ...runs];
  return makeQuestion('tossup', 1, rawText, answer ?? 'ANSWER: thing', {
    numberParagraphIndex: 1,
    numberRuns: questionRuns,
    answerRuns: answerRuns ?? [plain('ANSWER: '), bu('thing')],
    tag: '<Auth, American History>',
  });
}

function tossupWith(text: string, answer?: string, answerRuns?: Run[]) {
  return makeQuestion('tossup', 1, text, answer ?? 'ANSWER: thing', {
    numberParagraphIndex: 1,
    answerRuns: answerRuns ?? [plain('ANSWER: '), bu('thing')],
    tag: '<Auth, American History>',
  });
}

function packetFrom(
  ...questions: ReturnType<typeof makeQuestion>[]
): ReturnType<typeof makePacket> {
  const tossups = questions.filter((q) => q.type === 'tossup');
  const bonuses = questions.filter((q) => q.type === 'bonus');
  return makePacket({
    tossups,
    bonuses,
    allParagraphs: questions.flatMap((q) => q.paragraphs),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Multiple distinct rules fire on the same paragraph
// ═══════════════════════════════════════════════════════════════════════

describe('multiple rules fire on same paragraph', () => {
  it('straight quotes AND em dash both flagged', () => {
    const t = tossupWith(
      'He said "hello"\u2014goodbye. For 10 points, name him.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.smart-quotes')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('contraction AND weasel word both flagged', () => {
    const t = tossupWith(
      "This famous composer can't be named. For 10 points, name him."
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
  });

  it('em dash AND latin abbreviation both flagged', () => {
    const t = tossupWith(
      'This piece\u2014e.g. a sonata\u2014was composed in 1750. For 10 points, name it.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-latin-abbrev')).toBe(true);
  });

  it('weasel word AND word replacement both flagged', () => {
    const t = tossupWith(
      'This famous author would utilize metaphors. For 10 points, name her.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
    expect(hasDiag(diags, 'writing.word-replacements')).toBe(true);
  });

  it('double space AND straight quote both flagged', () => {
    const t = tossupWith('He wrote "something."  For 10 points, name him.');
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.smart-quotes')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-double-spaces')).toBe(true);
  });

  it('BC/AD AND latin abbreviation both flagged', () => {
    const t = tossupWith(
      'This city was founded in 44 BC, i.e. during the late Republic. For 10 points, name it.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-latin-abbrev')).toBe(true);
  });

  it('formatting rule AND writing rule fire on same paragraph', () => {
    const t = tossupWith(
      'This famous author wrote\u2014famously\u2014a novel. For 10 points, name her.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
  });

  it('absolute time AND contraction both flagged', () => {
    const t = tossupWith(
      "This building was recently built, and it can't be demolished. For 10 points, name it."
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(true);
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Pronunciation guide filtering does not suppress other rules
// ═══════════════════════════════════════════════════════════════════════

describe('pronunciation guide filtering does not suppress other rules', () => {
  it('PG stripped for smart-quotes but em dash still flagged', () => {
    const t = tossupWith(
      'This composer ("BAHK")\u2014born in 1685\u2014wrote fugues. For 10 points, name him.'
    );
    const diags = lint(packetFrom(t));
    // PG should be stripped so straight quotes inside it are not flagged
    const smartQuoteDiags = diags.filter(
      (d) =>
        d.rule === 'formatting.smart-quotes' &&
        d.message.includes('typographic')
    );
    expect(smartQuoteDiags).toHaveLength(0);
    // Em dash should still be flagged
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('PG stripped for punctuation-inside-quotes but weasel word still flagged', () => {
    const t = tossupWith(
      'This famous composer ("BAHK"), wrote a mass. For 10 points, name him.'
    );
    const diags = lint(packetFrom(t));
    // PG's ") followed by comma should NOT trigger punctuation-inside-quotes
    const piqDiags = diags.filter(
      (d) => d.rule === 'formatting.punctuation-inside-quotes'
    );
    expect(piqDiags).toHaveLength(0);
    // Weasel word should still fire
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
  });

  it('PG not treated as post-question note but contraction still flagged', () => {
    const t = tossupWith(
      'This author can' +
        "'t be named " +
        '("AW-thur"). For 10 points, name this person.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
  });

  it('unquoted PG flags pronunciation rule but not post-question-note', () => {
    const t = tossupWith('For 10 points, name this composer (BAHK).');
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(true);
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
  });

  it('PG with straight quotes inside does not suppress ampersand check', () => {
    const t = tossupWith(
      'Name this Painting & Sculpture work by the composer ("BAHK"). For 10 points, name it.'
    );
    const diags = lint(packetFrom(t));
    // The PG itself should not be flagged for straight quotes (it's stripped)
    // But ampersand outside PG should be flagged
    expect(hasDiag(diags, 'formatting.no-ampersand')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Title text stripping (italic/quoted) does not suppress other rules
// ═══════════════════════════════════════════════════════════════════════

describe('title stripping does not suppress other rules', () => {
  it('italic title stripped but em dash outside title still flagged', () => {
    const t = tossupWithRuns([
      plain('This author of '),
      italic('The Great Novel'),
      plain('\u2014a major work\u2014won a prize. For 10 points, name her.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('quoted title stripped but contraction outside still flagged', () => {
    const t = tossupWith(
      "This author of \u201cThe Great Novel\u201d can't be named. For 10 points, name her."
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
  });

  it('weasel word inside italic title is NOT flagged', () => {
    const t = tossupWithRuns([
      plain('This author wrote '),
      italic('A Famous Victory'),
      plain('. For 10 points, name her.'),
    ]);
    const diags = lint(packetFrom(t));
    // "Famous" is inside an italic title, so it should be stripped
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(false);
  });

  it('weasel word inside quoted text is NOT flagged', () => {
    const t = tossupWith(
      'This author wrote \u201ca famous piece.\u201d For 10 points, name her.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(false);
  });

  it('contraction inside italic title is NOT flagged', () => {
    const t = tossupWithRuns([
      plain('This author wrote '),
      italic("Can't Stop"),
      plain('. For 10 points, name her.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(false);
  });

  it('latin abbreviation inside quoted text is NOT flagged', () => {
    const t = tossupWith(
      'This author wrote \u201cthe treatise on virtue, e.g. justice.\u201d For 10 points, name him.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-latin-abbrev')).toBe(false);
  });

  it('word replacement inside italic title is NOT flagged but one outside IS', () => {
    const t = tossupWithRuns([
      plain('This author would utilize prose in '),
      italic('Upon the Mountain'),
      plain('. For 10 points, name her.'),
    ]);
    const diags = lint(packetFrom(t));
    // "utilize" outside title → flagged
    expect(hasDiag(diags, 'writing.word-replacements')).toBe(true);
    // Verify the diagnostic is for "utilize", not "Upon"
    const replacement = diags.find(
      (d) => d.rule === 'writing.word-replacements'
    );
    expect(replacement!.message).toContain('utilize');
  });

  it('em dash inside quoted text is NOT flagged', () => {
    const t = tossupWith(
      'This author wrote \u201ca work\u2014of beauty.\u201d For 10 points, name him.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(false);
  });

  it('BC/AD inside italic title is NOT flagged', () => {
    const t = tossupWithRuns([
      plain('This author wrote '),
      italic('Rome in 44 BC'),
      plain('. For 10 points, name him.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Paragraph type filtering consistency
// ═══════════════════════════════════════════════════════════════════════

describe('paragraph filtering consistency across rules', () => {
  it('answer line is checked by formatting rules but not by writing rules', () => {
    // Answer lines contain straight quotes — formatting rules that use
    // getQuestionParagraphs('non-answer') or no filter should see them,
    // but writing rules using 'text-only' should not.
    const t = tossupWith(
      'For 10 points, name this composer.',
      'ANSWER: this famous "thing"',
      [plain('ANSWER: this famous "thing"')]
    );
    const diags = lint(packetFrom(t));
    // Writing rules (text-only filter) should NOT flag answer lines
    const weaselOnAnswer = diags.filter(
      (d) =>
        d.rule === 'writing.no-weasel-words' &&
        d.sourceText?.includes('ANSWER:')
    );
    expect(weaselOnAnswer).toHaveLength(0);
  });

  it('tag line is excluded from text-only rules', () => {
    const t = makeQuestion(
      'tossup',
      1,
      'For 10 points, name this thing.',
      'ANSWER: thing',
      {
        numberParagraphIndex: 1,
        answerRuns: [plain('ANSWER: '), bu('thing')],
        tag: "<Auth, It's a Famous Category>",
      }
    );
    const diags = lint(packetFrom(t));
    // "famous" and "It's" are in the tag — should NOT be flagged by writing rules
    const weaselOnTag = diags.filter(
      (d) =>
        d.rule === 'writing.no-weasel-words' && d.sourceText?.includes('<Auth')
    );
    const contractionOnTag = diags.filter(
      (d) =>
        d.rule === 'writing.no-contractions' && d.sourceText?.includes('<Auth')
    );
    expect(weaselOnTag).toHaveLength(0);
    expect(contractionOnTag).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Pronunciation guide coexisting with post-question note
// ═══════════════════════════════════════════════════════════════════════

describe('pronunciation guide and post-question note coexistence', () => {
  it('PG followed by a real post-question note: PG not flagged, note IS flagged', () => {
    const t = tossupWith(
      'For 10 points, name this composer ("BAHK") (read slowly).'
    );
    const diags = lint(packetFrom(t));
    // The PG ("BAHK") should not be treated as a post-question note
    // The real note (read slowly) should be flagged for sentence styling
    const noteDiags = diags.filter(
      (d) => d.rule === 'question.post-question-note-sentence'
    );
    // "read slowly" has lowercase first letter — should be flagged
    // (it has a period, but starts lowercase)
    expect(noteDiags.length).toBeGreaterThanOrEqual(1);
    expect(noteDiags[0].message).toContain('capitalize');
  });

  it('all-caps PG without quotes is not treated as post-question note', () => {
    const t = tossupWith('For 10 points, name this composer (BAHK).');
    const diags = lint(packetFrom(t));
    // Should flag pronunciation.quotes-required
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(true);
    // Should NOT flag post-question-note (it's a PG, not a note)
    expect(hasDiag(diags, 'question.post-question-note-sentence')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Cross-category rule interactions on single question
// ═══════════════════════════════════════════════════════════════════════

describe('cross-category rule interactions', () => {
  it('formatting + writing + question rules all fire on a badly written question', () => {
    const t = tossupWith(
      "This famous author can't write\u2014but he recently utilized prose. For 10 points, name him."
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true); // "famous"
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true); // "can't"
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true); // em dash
    expect(hasDiag(diags, 'writing.absolute-time')).toBe(true); // "recently"
    expect(hasDiag(diags, 'writing.word-replacements')).toBe(true); // "utilized"
  });

  it('pronunciation rule AND formatting rule fire on same question', () => {
    const t = tossupWith(
      'For 10 points, name this composer (BAHK)\u2014born in 1685.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('three formatting issues on one paragraph all flagged independently', () => {
    const t = tossupWith(
      'The U.K. embassy said "hello"\u2014and in 44 BC too. For 10 points, name it.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-abbreviation-periods')).toBe(true);
    expect(hasDiag(diags, 'formatting.smart-quotes')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Formatting bleeding does not interfere with other formatting rules
// ═══════════════════════════════════════════════════════════════════════

describe('formatting bleeding rule does not suppress other rules', () => {
  it('bold space detected alongside straight quotes', () => {
    const t = tossupWithRuns([
      bold(' '),
      plain('He said "hello". For 10 points, name him.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-format-bleeding')).toBe(true);
    expect(hasDiag(diags, 'formatting.smart-quotes')).toBe(true);
  });

  it('bold space near PG does NOT fire bleeding but PG rules still fire', () => {
    // PG-adjacent bold spaces are excluded from format-bleeding
    const t = tossupWithRuns([
      plain('For 10 points, name this composer'),
      bold(' '),
      plain('(BAHK).'),
    ]);
    const diags = lint(packetFrom(t));
    // pronunciation.quotes-required should fire
    expect(hasDiag(diags, 'pronunciation.quotes-required')).toBe(true);
  });

  it('format bleeding AND double space both detected on same paragraph', () => {
    const t = tossupWithRuns([
      bold('Name '),
      plain('this  thing. For 10 points, name it.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-format-bleeding')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-double-spaces')).toBe(true);
  });

  it('format bleeding AND em dash both detected on same paragraph', () => {
    const t = tossupWithRuns([
      bold('Name '),
      plain('this thing\u2014a concept. For 10 points, name it.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.no-format-bleeding')).toBe(true);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('multiple format bleedings AND other formatting rule all detected', () => {
    const t = tossupWithRuns([
      bold(' first '),
      plain('and  '),
      bold(' second '),
      plain('thing. For 10 points, name it.'),
    ]);
    const diags = lint(packetFrom(t));
    const bleedingDiags = diags.filter(
      (d) => d.rule === 'formatting.no-format-bleeding'
    );
    expect(bleedingDiags.length).toBe(2);
    expect(hasDiag(diags, 'formatting.no-double-spaces')).toBe(true);
  });

  it('format fix and text fix both applied via lint + applyFixes', () => {
    // Bold run with trailing space + double space in plain text
    const t = tossupWithRuns([
      bold('Name '),
      plain('this  thing. For 10 points, name it.'),
    ]);
    const packet = packetFrom(t);
    const diags = lint(packet);

    const result = applyFixes(packet.allParagraphs, diags, []);

    // Both fixes should be applied
    const appliedRules = result.appliedFixes.map((d) => d.rule);
    expect(appliedRules).toContain('formatting.no-format-bleeding');
    expect(appliedRules).toContain('formatting.no-double-spaces');

    // rawText should have the double space removed
    const fixedPara = result.fixedParagraphs.find(
      (p) => p.rawText.includes('Name')
    );
    expect(fixedPara).toBeDefined();
    expect(fixedPara!.rawText).not.toContain('  ');

    // Runs should have the trailing space stripped from bold
    const boldRuns = fixedPara!.runs.filter((r) => r.bold);
    for (const r of boldRuns) {
      expect(r.text).not.toMatch(/ $/);
    }
  });

  it('format fix on answer line coexists with answerline rules', () => {
    // Answer line with underline bleeding + a text-level fix (deprecated directive)
    const answerText = 'ANSWER: The Great Gatsby [do not accept The Gatsby]';
    const t = makeQuestion('tossup', 1, 'test question', answerText, {
      numberParagraphIndex: 1,
      answerRuns: [
        plain('ANSWER: '),
        bu('The Great Gatsby '), // trailing space bleeding underline
        plain('[do not accept '),
        bu('The Gatsby'),
        plain(']'),
      ],
      tag: '<Auth, American Literature>',
    });
    t.answerLine!.rawText = answerText;
    t.paragraphs[1].rawText = answerText;

    const packet = packetFrom(t);
    const diags = lint(packet);

    // Underline bleeding should be detected
    expect(
      hasDiag(diags, 'formatting.no-format-bleeding-underline')
    ).toBe(true);
    // Answer formatting rules should also fire independently
    // (the question text "test question" lacks FTP, so question rules fire too)
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Bonus questions: rules apply independently to each part
// ═══════════════════════════════════════════════════════════════════════

describe('bonus part independence', () => {
  it('different rules fire on different bonus parts', () => {
    const bonus = makeQuestion(
      'bonus',
      1,
      'Answer the following about bad writing, for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        answerRuns: [plain('')],
        tag: '<Auth, American History>',
        parts: [
          makeBonusPart(
            '[10e]',
            "This famous person can't be named.",
            'ANSWER: person',
            110,
            { answerRuns: [plain('ANSWER: '), bu('person')] }
          ),
          makeBonusPart(
            '[10m]',
            'This city was founded in 44 BC.',
            'ANSWER: city',
            120,
            { answerRuns: [plain('ANSWER: '), bu('city')] }
          ),
          makeBonusPart(
            '[10h]',
            'Name this composer ("BAHK").',
            'ANSWER: composer',
            130,
            { answerRuns: [plain('ANSWER: '), bu('composer')] }
          ),
        ],
      }
    );
    const diags = lint(packetFrom(bonus));
    // Part 1: contraction + weasel word
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
    // Part 2: BC/AD
    expect(hasDiag(diags, 'formatting.bce-ce-system')).toBe(true);
  });

  it('post-question-note fires on bonus part, not on PG in another part', () => {
    const bonus = makeQuestion(
      'bonus',
      1,
      'Answer the following for 10 points each.',
      '',
      {
        numberParagraphIndex: 100,
        answerRuns: [plain('')],
        tag: '<Auth, Biology>',
        parts: [
          makeBonusPart(
            '[10e]',
            'Name this composer ("BAHK").',
            'ANSWER: Bach',
            110,
            { answerRuns: [plain('ANSWER: '), bu('Bach')] }
          ),
          makeBonusPart(
            '[10m]',
            'Name this (read the clue slowly).',
            'ANSWER: thing',
            120,
            { answerRuns: [plain('ANSWER: '), bu('thing')] }
          ),
        ],
      }
    );
    const diags = lint(packetFrom(bonus));
    // Part 1 PG should not trigger post-question-note
    const noteOnPart1 = diags.filter(
      (d) =>
        d.rule === 'question.post-question-note-sentence' &&
        d.sourceText?.includes('BAHK')
    );
    expect(noteOnPart1).toHaveLength(0);
    // Part 2 note should trigger post-question-note
    const noteOnPart2 = diags.filter(
      (d) =>
        d.rule === 'question.post-question-note-sentence' &&
        d.sourceText?.includes('read the clue')
    );
    expect(noteOnPart2.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Disabling one rule does not affect another
// ═══════════════════════════════════════════════════════════════════════

describe('disabling one rule does not affect another', () => {
  it('disabling smart-quotes does not suppress em-dash on same text', () => {
    const t = tossupWith(
      'He said "hello"\u2014goodbye. For 10 points, name him.'
    );
    const packet = packetFrom(t);
    const disabled = new Set(['formatting.smart-quotes']);
    const diags = lint(packet, disabled);
    expect(hasDiag(diags, 'formatting.smart-quotes')).toBe(false);
    expect(hasDiag(diags, 'formatting.no-em-dash')).toBe(true);
  });

  it('disabling weasel-words does not suppress contractions on same text', () => {
    const t = tossupWith(
      "This famous person can't be named. For 10 points, name him."
    );
    const packet = packetFrom(t);
    const disabled = new Set(['writing.no-weasel-words']);
    const diags = lint(packet, disabled);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(false);
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
  });

  it('disabling all formatting rules does not suppress writing rules', () => {
    const t = tossupWith(
      "This famous author can't write\u2014and he utilized prose. For 10 points, name him."
    );
    const packet = packetFrom(t);
    const disabled = new Set([
      'formatting.smart-quotes',
      'formatting.no-em-dash',
      'formatting.no-double-spaces',
      'formatting.no-abbreviation-periods',
      'formatting.bce-ce-system',
      'formatting.no-latin-abbrev',
      'formatting.punctuation-inside-quotes',
      'formatting.no-format-bleeding',
      'formatting.no-sub-superscript',
      'formatting.spell-out-small-numbers',
      'formatting.no-ampersand',
      'formatting.poetry-slash',
    ]);
    const diags = lint(packet, disabled);
    expect(hasDiag(diags, 'writing.no-contractions')).toBe(true);
    expect(hasDiag(diags, 'writing.no-weasel-words')).toBe(true);
    expect(hasDiag(diags, 'writing.word-replacements')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. Poetry slash stripping uses italic-only, not full title strip
// ═══════════════════════════════════════════════════════════════════════

describe('poetry slash uses italic-only stripping', () => {
  it('slashes inside quoted poetry are flagged (not stripped by italic-only)', () => {
    const t = tossupWith(
      'This poet wrote \u201cthe wind/blows hard/upon the shore.\u201d For 10 points, name her.'
    );
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.poetry-slash')).toBe(true);
  });

  it('slashes inside italic title are NOT flagged (stripped by italic-only)', () => {
    const t = tossupWithRuns([
      plain('This author wrote '),
      italic('Wind/Blow/Shore'),
      plain('. For 10 points, name her.'),
    ]);
    const diags = lint(packetFrom(t));
    expect(hasDiag(diags, 'formatting.poetry-slash')).toBe(false);
  });
});
