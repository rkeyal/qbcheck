import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeGas, type GasHandle } from './fake-gas.js';
import { revealNearIssue } from '../../src/apps-script/main.js';
import type { LintDiagnostic } from '../../src/core/model.js';

function diag(overrides: Partial<LintDiagnostic>): LintDiagnostic {
  return {
    rule: 'formatting.smart-quotes',
    severity: 'warning',
    paragraph: 0,
    message: 'msg',
    ...overrides,
  };
}

// Five "questions" starting at paragraphs 0, 10, 20, 30, and 40 in a
// 50-paragraph doc.
const QUESTION_STARTS = [0, 10, 20, 30, 40];

describe('revealNearIssue', () => {
  let gas: GasHandle;
  beforeEach(() => {
    gas = installFakeGas();
    gas.setDocument(Array.from({ length: 50 }, (_, i) => ({ text: 'para ' + i })));
  });

  it('aims at the issue’s own question start when the cursor is below the issue', () => {
    // Cursor at 25 is below the issue at 12; approaching that question start
    // (10) from below lands it at the top edge with the issue just under it.
    gas.setCursorAtParagraph(25);

    const out = revealNearIssue(diag({ paragraph: 12 }), QUESTION_STARTS);

    expect(out.revealed).toBe(true);
    expect(gas.lastCursorParagraph()).toBe(10);
  });

  it('aims two question starts ahead when the cursor is above the issue', () => {
    // Cursor at 3 is above the issue at 12 (question start 10); aiming two starts
    // ahead (30) lands it at the bottom edge, leaving the issue’s own question
    // comfortably inside the viewport rather than hugging the bottom.
    gas.setCursorAtParagraph(3);

    const out = revealNearIssue(diag({ paragraph: 12 }), QUESTION_STARTS);

    expect(out.revealed).toBe(true);
    expect(gas.lastCursorParagraph()).toBe(30);
  });

  it('treats an unknown cursor like being above the issue (aims two ahead)', () => {
    gas.clearCursor();

    const out = revealNearIssue(diag({ paragraph: 12 }), QUESTION_STARTS);

    expect(out.revealed).toBe(true);
    expect(gas.lastCursorParagraph()).toBe(30);
  });

  it('falls back to one question ahead when only one remains', () => {
    // Issue at 32 (question start 30) has just one later start (40), so aiming
    // "two ahead" falls back to that single question ahead.
    gas.setCursorAtParagraph(3);

    const out = revealNearIssue(diag({ paragraph: 32 }), QUESTION_STARTS);

    expect(out.revealed).toBe(true);
    expect(gas.lastCursorParagraph()).toBe(40);
  });

  it('clamps to the last paragraph when there is no later question', () => {
    // Issue in the final question (starts at 40), cursor above it → aim past,
    // but there is no next start, so it clamps to the document end.
    gas.setCursorAtParagraph(3);

    const out = revealNearIssue(diag({ paragraph: 42 }), QUESTION_STARTS);

    expect(out.revealed).toBe(true);
    expect(gas.lastCursorParagraph()).toBe(49);
  });

  it('frames by question boundary (never selects) even when the diagnostic has a span', () => {
    // A span (offset/length) does not change the behavior: we always frame the
    // question rather than highlighting the offending text.
    gas.setCursorAtParagraph(25);

    const out = revealNearIssue(
      diag({ paragraph: 12, offset: 0, length: 4 }),
      QUESTION_STARTS
    );

    expect(out.revealed).toBe(true);
    expect(gas.lastCursorParagraph()).toBe(10);
    expect(gas.lastSelection()).toBeNull();
  });

  it('reports not-revealed for an empty document', () => {
    gas.setDocument([]);
    gas.clearCursor();

    const out = revealNearIssue(diag({ paragraph: 0 }), []);

    expect(out.revealed).toBe(false);
    expect(out.reason).toContain('no paragraphs');
    expect(gas.lastCursorOffset()).toBeNull();
  });
});
