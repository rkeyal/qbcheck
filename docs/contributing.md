# Contributing

## Setup

1. Clone this repository
2. Install dependencies and build:
   ```
   npm install
   npm run build
   ```
3. Load the `dist/` folder as an unpacked extension in Chrome (see [Installation](../README.md#installation))

To update after pulling changes, run `npm run build` again and reload the extension in `chrome://extensions`.

## Development commands

```bash
npm run dev          # watch mode (rebuilds on file changes)
npm run build        # production build to dist/
npm test             # run all tests
npm run test:watch   # watch mode for tests
npm run lint         # ESLint (fails on warnings)
npm run lint:fix     # auto-fix ESLint issues
npm run format       # format with Prettier
npm run format:check # verify formatting
```

Run a single test file:
```bash
npm test -- test/rules/answerline.test.ts
```

Run tests matching a pattern:
```bash
npm test -- -t "checkAnswerPrefix"
```

## Adding a rule

1. Write the rule function in the appropriate file under `src/core/rules/`:
   - `packet.ts` — packet structure
   - `question.ts` — question text
   - `answerline.ts` — answer line formatting
   - `tag.ts` — author/category tags
   - `formatting.ts` — typography
   - `pronunciation.ts` — pronunciation guides
   - `writing.ts` — writing style

2. Add it to the exported rule array in that file.

3. Register metadata in `src/core/rule-registry.ts`:
   ```typescript
   'category.rule-name': {
     id: 'category.rule-name',
     category: 'Category Name',
     description: 'What this rule checks',
     defaultSeverity: 'warning',
     autoFixable: false,
   },
   ```

4. Write tests in `test/rules/<category>.test.ts`.

### Rule function pattern

```typescript
function checkSomething(packet: Packet): LintDiagnostic[] {
  const diags: LintDiagnostic[] = [];

  for (const question of packet.tossups) {
    if (violation) {
      diags.push({
        rule: 'category.rule-name',
        severity: 'warning',
        paragraph: paragraph.index,
        message: 'Description of the issue',
        sourceText: paragraph.rawText,
        offset: matchStart,
        length: matchLength,
      });
    }
  }

  return diags;
}
```

### Adding auto-fix

Set `autoFixable: true` in the registry entry. Then populate one of these fields on the diagnostic:

- **`fix`** (text-level): `{ oldText: 'wrong', newText: 'right', offset: number }`
- **`formatFix`** (run-level): `{ ranges: [{ offset: number, length: number }] }`

A diagnostic should have at most one of `fix` or `formatFix`.

## Project architecture

See [Internals](internals.md) for a walkthrough of the five-stage pipeline and data model.

## Tests

Tests use [Vitest](https://vitest.dev/) with jsdom. The test suite covers the parser, segmenter, all rule categories, fixer, and YAPP compatibility. Each rule file has a corresponding test file in `test/rules/`.

Test helpers in `test/helpers.ts` provide `makePacket()`, `makeQuestion()`, `makeParagraph()`, `hasDiag()`, and `findDiag()` for building test fixtures with minimal boilerplate.
