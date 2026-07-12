import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeGas } from './fake-gas.js';
import { getSettings, saveDisabledRules } from '../../src/apps-script/main.js';
import { DEFAULT_DISABLED_RULES } from '../../src/core/rule-registry.js';

describe('getSettings / saveDisabledRules', () => {
  beforeEach(() => {
    // Installs the fake PropertiesService (and other GAS globals) the settings
    // functions rely on; no document is needed.
    installFakeGas();
  });

  it('returns categorized rule metadata and the default disabled rules', () => {
    const settings = getSettings();

    // A fresh install (no saved settings) starts with the same rules disabled
    // as the Chrome extension so the two lint identically out of the box.
    expect(settings.disabledRules).toEqual([...DEFAULT_DISABLED_RULES]);
    expect(settings.rulesMeta.length).toBeGreaterThan(0);

    // Every rule carries the id, category, and description the sidebar needs to
    // group and label toggles.
    for (const r of settings.rulesMeta) {
      expect(r.id).toBeTruthy();
      expect(r.category).toBeTruthy();
      expect(typeof r.description).toBe('string');
    }

    // Cross-packet-only rules are excluded from the single-doc sidebar list.
    expect(
      settings.rulesMeta.some((r) => r.id === 'tag.consistent-categories')
    ).toBe(false);
  });

  it('round-trips disabled rules through user properties', () => {
    saveDisabledRules(['question.ftp-format', 'formatting.no-format-bleeding']);

    expect(getSettings().disabledRules).toEqual([
      'question.ftp-format',
      'formatting.no-format-bleeding',
    ]);
  });

  it('overwrites the previously saved set on each save', () => {
    saveDisabledRules(['question.ftp-format']);
    saveDisabledRules(['tag.tag-present']);

    expect(getSettings().disabledRules).toEqual(['tag.tag-present']);
  });
});
