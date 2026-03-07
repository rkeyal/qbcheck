---
name: analyze-lint-results
description: Run the qblint pipeline against example quizbowl packets, analyze the results, identify patterns (false positives, noisy rules, coverage gaps), and propose rule modifications or new rules. Use when the user wants to evaluate linter performance, review lint output, or suggest rule improvements.
---

# Analyze Lint Results

Run the lint pipeline on real packets, study the output, and produce an actionable
report with proposed rule changes.

## Pipeline

1. **Run the linter** against a packet directory
2. **Study the output** for patterns
3. **Report findings** with proposals

## Step 1 — Run the linter

Use the CLI script. Generate both a summary and raw JSON:

```bash
npx tsx scripts/lint-packets.ts --dir <DIR> --summary
npx tsx scripts/lint-packets.ts --dir <DIR> --json
```

If the user specifies a directory, use it. Otherwise default to `ExamplePackets`
(all tournaments). The `--json` flag writes `lint-results.json`.

To drill into a specific rule with context:

```bash
npx tsx scripts/lint-packets.ts --dir <DIR> --rule <rule-id> --context --examples 20
```

To inspect raw paragraphs from a specific file:

```bash
npx tsx scripts/inspect-paragraphs.ts <file.docx> [startPara] [endPara]
```

## Step 2 — Study the output

Read `lint-results.json`. Focus on **highest-count rules first**.

### 2a. Volume analysis

For each rule compute: total hits, distinct files, hits-per-file ratio.

Flag rules where:
- **Count > 100** — may be too noisy, review examples for false positives
- **Count = 0** — may be dead or too narrow
- **Hits-per-file > 5** — may need tightening or severity downgrade

### 2b. False positive review

For the **top 10 rules by count**, examine 10–20 `paragraphText` examples.
Classify each as true positive, false positive, or borderline.
Estimate a FP rate. Rules above ~30% need attention.

Common FP sources:
- Quoted/cited text being flagged for style rules
- Proper names or titles triggering word-replacement rules
- Answer lines being checked by rules meant for question text (or vice versa)
- Pronunciation guides containing characters that trigger formatting rules

### 2c. Pattern detection

Look for:
- Same paragraph triggering multiple overlapping rules
- Entire files triggering a rule on every question (structural, not per-question)
- Rules firing on the wrong paragraph type (answer vs question vs tag)
- Patterns in `questionLabel` (e.g., only bonuses affected, or only high-numbered questions)

### 2d. Coverage gaps

Scan 10–20 raw paragraphs from sample packets using `inspect-paragraphs.ts`.
Look for style issues no rule catches. Cross-reference the ACF Style Guide
(`ACF Style Guide 4_13_2024.md`) if available.

See `references/rules-inventory.md` for the full list of current rules.

## Step 3 — Report findings

Present the analysis directly in conversation using this structure:

```
## Lint Analysis: <tournament/directory>

### Summary
- X files analyzed, Y total diagnostics, Z distinct rules fired

### Volume Table
| Rule | Count | Files | Avg/File | Assessment |
|------|-------|-------|----------|------------|

### False Positive Review
For each reviewed rule:
- **rule.id** (N hits) — ~X% FP rate
  - Example FP: "..." → why it's wrong
  - Recommendation: ...

### Proposed Rule Modifications
Numbered list. For each: rule ID, what to change, why, expected impact.

### Proposed New Rules
Numbered list. For each: proposed ID, severity, what it catches, example,
which rule file it belongs in.

### Dead/Zero-Hit Rules
Rules with 0 results — too narrow, test data doesn't exercise them, or remove.
```

## Important notes

- Do NOT modify any rule files during analysis. Only analyze and propose.
- Always examine `paragraphText` for context when assessing diagnostics.
- `questionLabel` (T1, B5) distinguishes tossups from bonuses.
- For rules with >500 hits, sample 20 examples rather than reading all.
- Cross-reference proposals against the ACF Style Guide when available.
