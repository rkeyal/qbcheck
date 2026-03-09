import { describe, it, expect } from 'vitest';
import {
  parseIgnoreFile,
  matchesPattern,
  shouldIgnore,
} from '../src/core/ignore.js';

describe('parseIgnoreFile', () => {
  it('parses valid ignore rules', () => {
    const content = `
# Comment line
2023_IQBT_UG/*.docx tag.tag-present
**/*.docx formatting.smart-quotes
    `;

    const rules = parseIgnoreFile(content);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      pattern: '2023_IQBT_UG/*.docx',
      ruleId: 'tag.tag-present',
    });
    expect(rules[1]).toEqual({
      pattern: '**/*.docx',
      ruleId: 'formatting.smart-quotes',
    });
  });

  it('skips empty lines and comments', () => {
    const content = `
# This is a comment


# Another comment
Packet*.docx packet.expected-count
    `;

    const rules = parseIgnoreFile(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe('Packet*.docx');
  });

  it('handles lines with extra whitespace', () => {
    const content = '   2023_IQBT_UG/*.docx   tag.tag-present   ';
    const rules = parseIgnoreFile(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].pattern).toBe('2023_IQBT_UG/*.docx');
    expect(rules[0].ruleId).toBe('tag.tag-present');
  });
});

describe('matchesPattern', () => {
  it('matches exact paths', () => {
    expect(matchesPattern('foo.docx', 'foo.docx')).toBe(true);
    expect(matchesPattern('foo.docx', 'bar.docx')).toBe(false);
  });

  it('matches * wildcard within segment', () => {
    expect(matchesPattern('Packet 1.docx', 'Packet*.docx')).toBe(true);
    expect(matchesPattern('Packet 10.docx', 'Packet*.docx')).toBe(true);
    expect(matchesPattern('foo/Packet 1.docx', 'Packet*.docx')).toBe(false); // * doesn't match /
  });

  it('matches ** wildcard across segments', () => {
    expect(matchesPattern('2023_IQBT_UG/Round 01.docx', '**/*.docx')).toBe(
      true
    );
    expect(
      matchesPattern('ExamplePackets/2023_IQBT_UG/Round 01.docx', '**/*.docx')
    ).toBe(true);
    expect(matchesPattern('foo.docx', '**/*.docx')).toBe(true);
  });

  it('matches specific directory patterns', () => {
    expect(
      matchesPattern('2023_IQBT_UG/Round 01.docx', '2023_IQBT_UG/*.docx')
    ).toBe(true);
    expect(
      matchesPattern('2023_ACF_Winter/Packet A.docx', '2023_IQBT_UG/*.docx')
    ).toBe(false);
  });

  it('normalizes path separators', () => {
    expect(matchesPattern('foo\\bar\\baz.docx', 'foo/bar/*.docx')).toBe(true);
    expect(matchesPattern('foo/bar/baz.docx', 'foo\\bar\\*.docx')).toBe(true);
  });

  it('matches ? wildcard for single character', () => {
    expect(matchesPattern('Packet A.docx', 'Packet ?.docx')).toBe(true);
    expect(matchesPattern('Packet AB.docx', 'Packet ?.docx')).toBe(false);
  });
});

describe('shouldIgnore', () => {
  const ignoreRules = [
    { pattern: '2023_IQBT_UG/*.docx', ruleId: 'tag.tag-present' },
    { pattern: '**/*.docx', ruleId: 'formatting.smart-quotes' },
    { pattern: 'WinterClosed/*', ruleId: 'packet.expected-count' },
  ];

  it('returns true when file and rule match', () => {
    expect(
      shouldIgnore('2023_IQBT_UG/Round 01.docx', 'tag.tag-present', ignoreRules)
    ).toBe(true);
  });

  it('returns true when file matches via wildcard pattern', () => {
    // The file matches **/*.docx pattern, which ignores formatting.smart-quotes
    expect(
      shouldIgnore(
        '2023_IQBT_UG/Round 01.docx',
        'formatting.smart-quotes',
        ignoreRules
      )
    ).toBe(true);
  });

  it('returns false when file matches pattern but different rule', () => {
    // File matches 2023_IQBT_UG/*.docx pattern, but that's only for tag.tag-present
    expect(
      shouldIgnore(
        '2023_IQBT_UG/Round 01.docx',
        'writing.no-contractions',
        ignoreRules
      )
    ).toBe(false);
  });

  it('returns false when rule matches but file does not', () => {
    expect(
      shouldIgnore(
        '2023_ACF_Winter/Packet A.docx',
        'tag.tag-present',
        ignoreRules
      )
    ).toBe(false);
  });

  it('returns true for wildcard patterns', () => {
    expect(
      shouldIgnore(
        'any/path/to/file.docx',
        'formatting.smart-quotes',
        ignoreRules
      )
    ).toBe(true);
  });

  it('returns false when no rules match', () => {
    expect(
      shouldIgnore('foo.docx', 'writing.no-contractions', ignoreRules)
    ).toBe(false);
  });
});
