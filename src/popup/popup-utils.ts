import { LintDiagnostic, Paragraph } from '../core/model.js';
import { RULE_REGISTRY } from '../core/rule-registry.js';

// --- Shared interfaces and constants ---

export interface PacketResult {
  filename: string;
  diagnostics: LintDiagnostic[];
  parseError?: string;
}

export interface QBLintSettings {
  disabledRules: string[];
  ignoredDiagnostics: string[];
  autoFixDisabled: string[];
  darkMode: boolean;
  comfortableMode: boolean;
}

export interface SessionState {
  packetResults: PacketResult[];
  currentIndex: number;
  scrollPosition: number;
  mode: 'file' | 'paste';
}

export const DEFAULT_SETTINGS: QBLintSettings = {
  disabledRules: [
    'formatting.smart-quotes',
    'formatting.no-format-bleeding',
    'formatting.bce-ce-system',
    'writing.word-replacements',
    'writing.no-weasel-words',
    'packet.blank-paragraphs',
  ],
  ignoredDiagnostics: [],
  autoFixDisabled: [],
  darkMode: false,
  comfortableMode: false,
};

// --- Pure functions ---

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSnippet(
  sourceText: string,
  offset?: number,
  length?: number
): string {
  const CONTEXT = 50;

  if (offset != null && length != null) {
    const start = Math.max(0, offset - CONTEXT);
    const end = Math.min(sourceText.length, offset + length + CONTEXT);

    const before = sourceText.substring(start, offset);
    const match = sourceText.substring(offset, offset + length);
    const after = sourceText.substring(offset + length, end);

    return (
      (start > 0 ? '\u2026' : '') +
      escapeHtml(before) +
      `<mark>${escapeHtml(match)}</mark>` +
      escapeHtml(after) +
      (end < sourceText.length ? '\u2026' : '')
    );
  }

  // No offset — show first ~100 chars as preview
  const preview = sourceText.substring(0, 100);
  return escapeHtml(preview) + (sourceText.length > 100 ? '\u2026' : '');
}

export function diagnosticFingerprint(d: LintDiagnostic): string {
  const label = d.questionLabel || `p${d.paragraph}`;
  let h = 0;
  for (let i = 0; i < d.message.length; i++) {
    h = (h * 31 + d.message.charCodeAt(i)) | 0;
  }
  return `${d.rule}::${label}::${h}`;
}

/**
 * Google Docs clipboard HTML often omits empty paragraphs that represent
 * blank lines between questions. The plain text clipboard always preserves
 * them as consecutive newlines. This function walks both representations
 * in parallel and splices empty paragraphs back in where the plain text
 * has blank lines but the HTML paragraphs don't.
 *
 * When the HTML *does* already include the blank paragraph, we consume it
 * instead of inserting a duplicate — this prevents alignment drift that
 * would misassign subsequent paragraphs and break segmentation.
 */
export function restoreBlankLines(
  htmlParas: Paragraph[],
  plainText: string
): Paragraph[] {
  const textLines = plainText.split('\n');
  const result: Paragraph[] = [];
  let htmlIdx = 0;

  for (const line of textLines) {
    if (line.trim() === '') {
      // Blank line — check if the HTML already has a matching blank paragraph
      if (
        htmlIdx < htmlParas.length &&
        htmlParas[htmlIdx].rawText.trim() === ''
      ) {
        // HTML already has this blank paragraph; consume it to stay aligned
        const para = htmlParas[htmlIdx];
        para.index = result.length;
        result.push(para);
        htmlIdx++;
      } else {
        // HTML dropped this blank paragraph; insert a synthetic one
        result.push({
          index: result.length,
          runs: [],
          rawText: '',
          hasPageBreak: false,
        });
      }
    } else if (htmlIdx < htmlParas.length) {
      // Content line — use the HTML-parsed paragraph (preserves formatting)
      const para = htmlParas[htmlIdx];
      para.index = result.length;
      result.push(para);
      htmlIdx++;
    }
  }

  // Append any remaining HTML paragraphs not matched to plain text lines
  while (htmlIdx < htmlParas.length) {
    const para = htmlParas[htmlIdx];
    para.index = result.length;
    result.push(para);
    htmlIdx++;
  }

  return result;
}

export function collectDocxFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];
  const files: File[] = [];
  for (let i = 0; i < fileList.length; i++) {
    if (fileList[i].name.endsWith('.docx')) {
      files.push(fileList[i]);
    }
  }
  return files;
}

export function readEntriesRecursive(
  entries: FileSystemEntry[]
): Promise<File[]> {
  const files: File[] = [];

  function readEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as FileSystemFileEntry).file(
          (f) => {
            files.push(f);
            resolve();
          },
          () => resolve()
        );
      });
    }
    if (entry.isDirectory) {
      return new Promise((resolve) => {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const readBatch = () => {
          reader.readEntries(
            async (batch) => {
              if (batch.length === 0) {
                resolve();
                return;
              }
              await Promise.all(batch.map(readEntry));
              readBatch(); // readEntries may return partial results
            },
            () => resolve()
          );
        };
        readBatch();
      });
    }
    return Promise.resolve();
  }

  return Promise.all(entries.map(readEntry)).then(() => files);
}

export function getAutoFixableRuleIds(): string[] {
  return RULE_REGISTRY.filter((r) => r.autoFixable).map((r) => r.id);
}
