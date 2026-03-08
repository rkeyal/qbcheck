/**
 * Pipeline for running sample packets through the linter, compiling errors,
 * and identifying false positives to improve rules.
 *
 * Usage:
 *   npx tsx scripts/lint-packets.ts [options]
 *
 * Options:
 *   --dir <path>        Directory of .docx files (default: ExamplePackets/)
 *   --rule <rule-id>    Filter to a specific rule (e.g. answerline.deprecated-directive)
 *   --severity <level>  Filter by severity: error, warning, info
 *   --summary           Show only rule summary counts (no examples)
 *   --examples <n>      Number of example diagnostics per rule (default: 5)
 *   --verbose           Show every diagnostic (no grouping)
 *   --context           Show surrounding paragraph text for each diagnostic
 *   --json              Output raw JSON for further processing
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'fs';
import { join, relative } from 'path';
import { parseDocx } from '../src/core/parser.js';
import { segmentPacket } from '../src/core/segmenter.js';
import { lint } from '../src/core/engine.js';
import { LintDiagnostic, Packet } from '../src/core/model.js';
import {
  parseIgnoreFile,
  shouldIgnore,
  IgnoreRule,
} from '../src/core/ignore.js';

// ── CLI argument parsing ────────────────────────────────────────────

interface Options {
  dir: string;
  rule: string | null;
  severity: string | null;
  summaryOnly: boolean;
  examples: number;
  verbose: boolean;
  context: boolean;
  json: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {
    dir: 'ExamplePackets',
    rule: null,
    severity: null,
    summaryOnly: false,
    examples: 5,
    verbose: false,
    context: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dir':
        opts.dir = args[++i];
        break;
      case '--rule':
        opts.rule = args[++i];
        break;
      case '--severity':
        opts.severity = args[++i];
        break;
      case '--summary':
        opts.summaryOnly = true;
        break;
      case '--examples':
        opts.examples = parseInt(args[++i], 10);
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--context':
        opts.context = true;
        break;
      case '--json':
        opts.json = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return opts;
}

// ── File discovery ──────────────────────────────────────────────────

function findDocxFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(d: string) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.docx') && !entry.startsWith('~$')) {
        files.push(full);
      }
    }
  }

  walk(dir);
  files.sort();
  return files;
}

// ── Main pipeline ───────────────────────────────────────────────────

interface FileDiagnostic extends LintDiagnostic {
  file: string;
  paragraphText?: string;
}

async function processFile(
  filePath: string,
  baseDir: string
): Promise<{
  diags: FileDiagnostic[];
  packet: Packet | null;
  error: string | null;
}> {
  const relPath = relative(baseDir, filePath);

  try {
    const buffer = readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    const paragraphs = await parseDocx(arrayBuffer);
    const packet = segmentPacket(paragraphs);
    const rawDiags = lint(packet);

    const diags: FileDiagnostic[] = rawDiags.map((d) => ({
      ...d,
      file: relPath,
      paragraphText: packet.allParagraphs[d.paragraph]?.rawText?.trim(),
    }));

    return { diags, packet, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { diags: [], packet: null, error: `${relPath}: ${message}` };
  }
}

// ── Reporting ───────────────────────────────────────────────────────

interface RuleSummary {
  rule: string;
  severity: string;
  count: number;
  files: Set<string>;
  examples: FileDiagnostic[];
}

function buildSummary(diags: FileDiagnostic[]): Map<string, RuleSummary> {
  const map = new Map<string, RuleSummary>();

  for (const d of diags) {
    let entry = map.get(d.rule);
    if (!entry) {
      entry = {
        rule: d.rule,
        severity: d.severity,
        count: 0,
        files: new Set(),
        examples: [],
      };
      map.set(d.rule, entry);
    }
    entry.count++;
    entry.files.add(d.file);
    entry.examples.push(d);
  }

  return map;
}

function printSummaryTable(summary: Map<string, RuleSummary>) {
  const rows = [...summary.values()].sort((a, b) => b.count - a.count);

  console.log('');
  console.log(
    '┌─────────────────────────────────────────────┬──────────┬───────┬───────┐'
  );
  console.log(
    '│ Rule                                        │ Severity │ Count │ Files │'
  );
  console.log(
    '├─────────────────────────────────────────────┼──────────┼───────┼───────┤'
  );

  for (const row of rows) {
    const rule = row.rule.padEnd(43);
    const sev = row.severity.padEnd(8);
    const count = String(row.count).padStart(5);
    const files = String(row.files.size).padStart(5);
    console.log(`│ ${rule} │ ${sev} │ ${count} │ ${files} │`);
  }

  console.log(
    '└─────────────────────────────────────────────┴──────────┴───────┴───────┘'
  );

  const total = rows.reduce((s, r) => s + r.count, 0);
  console.log(`\nTotal: ${total} diagnostics across ${rows.length} rules`);
}

function printExamples(
  summary: Map<string, RuleSummary>,
  maxExamples: number,
  showContext: boolean
) {
  const rules = [...summary.values()].sort((a, b) => b.count - a.count);

  for (const rule of rules) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(
      `  ${rule.rule}  (${rule.severity})  —  ${rule.count} occurrences in ${rule.files.size} files`
    );
    console.log('═'.repeat(70));

    const examples = rule.examples.slice(0, maxExamples);
    for (const ex of examples) {
      const label = ex.questionLabel ? ` [${ex.questionLabel}]` : '';
      console.log(`\n  📄 ${ex.file}${label}  (para ${ex.paragraph})`);
      console.log(`     ${ex.message}`);
      if (ex.suggestion) {
        console.log(`     💡 ${ex.suggestion}`);
      }
      if (showContext && ex.paragraphText) {
        const truncated =
          ex.paragraphText.length > 120
            ? ex.paragraphText.slice(0, 120) + '…'
            : ex.paragraphText;
        console.log(`     ▸ ${truncated}`);
      }
      if (ex.answerPreview) {
        console.log(`     ▸ Answer: ${ex.answerPreview}`);
      }
    }

    if (rule.count > maxExamples) {
      console.log(`\n  … and ${rule.count - maxExamples} more`);
    }
  }
}

function printVerbose(diags: FileDiagnostic[], showContext: boolean) {
  for (const d of diags) {
    const label = d.questionLabel ? ` [${d.questionLabel}]` : '';
    const ctx =
      showContext && d.paragraphText
        ? `  ▸ ${d.paragraphText.length > 100 ? d.paragraphText.slice(0, 100) + '…' : d.paragraphText}`
        : '';
    console.log(
      `${d.severity.toUpperCase().padEnd(7)} ${d.rule.padEnd(42)} ${d.file}${label} (para ${d.paragraph})`
    );
    console.log(`        ${d.message}`);
    if (ctx) console.log(`      ${ctx}`);
  }
}

// ── Entry point ─────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  const files = findDocxFiles(opts.dir);

  if (files.length === 0) {
    console.error(`No .docx files found in ${opts.dir}`);
    process.exit(1);
  }

  // Load .qblintignore if it exists
  let ignoreRules: IgnoreRule[] = [];
  const ignorePath = '.qblintignore';
  if (existsSync(ignorePath)) {
    const ignoreContent = readFileSync(ignorePath, 'utf-8');
    ignoreRules = parseIgnoreFile(ignoreContent);
    if (ignoreRules.length > 0) {
      console.log(
        `Loaded ${ignoreRules.length} ignore rule(s) from ${ignorePath}`
      );
    }
  }

  console.log(`Linting ${files.length} packets from ${opts.dir}…\n`);

  let allDiags: FileDiagnostic[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const relPath = relative(opts.dir, file);
    const { diags, error } = await processFile(file, opts.dir);

    if (error) {
      errors.push(error);
      process.stderr.write(`  ✗ ${relPath}\n`);
    } else {
      process.stderr.write(`  ✓ ${relPath}  (${diags.length} diagnostics)\n`);
      allDiags = allDiags.concat(diags);
    }
  }

  // Apply ignore rules
  if (ignoreRules.length > 0) {
    const beforeCount = allDiags.length;
    allDiags = allDiags.filter(
      (d) => !shouldIgnore(d.file, d.rule, ignoreRules)
    );
    const ignoredCount = beforeCount - allDiags.length;
    if (ignoredCount > 0) {
      console.log(`\nIgnored ${ignoredCount} diagnostic(s) via .qblintignore`);
    }
  }

  // Apply CLI filters
  if (opts.rule) {
    allDiags = allDiags.filter((d) => d.rule === opts.rule);
  }
  if (opts.severity) {
    allDiags = allDiags.filter((d) => d.severity === opts.severity);
  }

  // Output
  if (opts.json) {
    const output = allDiags.map(
      ({
        file,
        rule,
        severity,
        paragraph,
        message,
        paragraphText,
        questionLabel,
        answerPreview,
      }) => ({
        file,
        rule,
        severity,
        paragraph,
        message,
        paragraphText,
        questionLabel,
        answerPreview,
      })
    );
    const outPath = 'lint-results.json';
    writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nWrote ${output.length} diagnostics to ${outPath}`);
    return;
  }

  const summary = buildSummary(allDiags);

  if (errors.length > 0) {
    console.log(`\n⚠ ${errors.length} file(s) failed to parse:`);
    for (const e of errors) {
      console.log(`  ${e}`);
    }
  }

  if (opts.verbose) {
    printVerbose(allDiags, opts.context);
  } else {
    printSummaryTable(summary);
    if (!opts.summaryOnly) {
      printExamples(summary, opts.examples, opts.context);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
