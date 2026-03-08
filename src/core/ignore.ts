/**
 * Support for .qblintignore files.
 *
 * Format:
 *   # Comment lines start with #
 *   <file-pattern> <rule-id>
 *
 * See .qblintignore.example for usage examples.
 */

export interface IgnoreRule {
  pattern: string; // glob pattern for file paths
  ruleId: string; // rule ID to ignore
}

/**
 * Parse a .qblintignore file.
 */
export function parseIgnoreFile(content: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse "pattern rule-id"
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      console.warn(`Invalid .qblintignore line (expected 2 parts): ${line}`);
      continue;
    }

    const [pattern, ruleId] = parts;
    rules.push({ pattern, ruleId });
  }

  return rules;
}

/**
 * Check if a file path matches a glob pattern.
 * Supports basic glob syntax: *, **, ?.
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  // Process character by character to properly handle glob wildcards
  let regexPattern = '';
  let i = 0;
  while (i < normalizedPattern.length) {
    const ch = normalizedPattern[i];
    const next = normalizedPattern[i + 1];
    const nextNext = normalizedPattern[i + 2];

    if (ch === '*' && next === '*' && nextNext === '/') {
      // **/ matches zero or more path segments
      regexPattern += '(.*/)?';
      i += 3;
    } else if (ch === '*' && next === '*') {
      // ** at end or before other chars matches across segments
      regexPattern += '.*';
      i += 2;
    } else if (ch === '*') {
      // * matches within a segment (not /)
      regexPattern += '[^/]*';
      i++;
    } else if (ch === '?') {
      // ? matches single character
      regexPattern += '.';
      i++;
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      // Escape regex special characters
      regexPattern += '\\' + ch;
      i++;
    } else {
      // Regular character
      regexPattern += ch;
      i++;
    }
  }

  // Anchor to start and end
  regexPattern = `^${regexPattern}$`;

  const regex = new RegExp(regexPattern);
  return regex.test(normalizedPath);
}

/**
 * Check if a diagnostic should be ignored based on ignore rules.
 */
export function shouldIgnore(
  filePath: string,
  ruleId: string,
  ignoreRules: IgnoreRule[]
): boolean {
  for (const rule of ignoreRules) {
    if (rule.ruleId === ruleId && matchesPattern(filePath, rule.pattern)) {
      return true;
    }
  }
  return false;
}
