/**
 * Fake Google Apps Script runtime for integration-testing the GAS glue layer.
 *
 * The modules under src/apps-script/ reach for GAS globals (DocumentApp, Drive,
 * Logger, PropertiesService, HtmlService) that only exist inside the Apps Script
 * runtime. This harness implements the small, well-defined subset of that API
 * that the glue actually uses, backed by a plain in-memory document model, and
 * installs it onto globalThis so the real shipping code can run under Vitest.
 *
 * Usage:
 *   const gas = installFakeGas();
 *   gas.setDocument([{ text: '1. ...' }, { runs: [...] }]);
 *   gas.setCursorAtParagraph(0);
 *   // ...call parseGoogleDoc(), detectCurrentQuestion(), etc.
 *   expect(gas.driveComments).toHaveLength(1);
 */

// ---------------------------------------------------------------------------
// Document spec (what tests author)
// ---------------------------------------------------------------------------

export interface RunSpec {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  superscript?: boolean;
  subscript?: boolean;
}

export interface ParaSpec {
  /** Shorthand for a single unformatted run. Ignored if `runs` is given. */
  text?: string;
  runs?: RunSpec[];
  /** Element type: a list item instead of a plain paragraph. */
  listItem?: boolean;
  /** Paragraph contains a PAGE_BREAK child element. */
  pageBreak?: boolean;
  /** A non-paragraph child of the body (e.g. a table) to exercise filtering. */
  other?: boolean;
}

// ---------------------------------------------------------------------------
// Enum fakes (compared by value in the source, so plain strings suffice)
// ---------------------------------------------------------------------------

const ElementType = {
  PARAGRAPH: 'PARAGRAPH',
  LIST_ITEM: 'LIST_ITEM',
  PAGE_BREAK: 'PAGE_BREAK',
  TEXT: 'TEXT',
  TABLE: 'TABLE',
  BODY_SECTION: 'BODY_SECTION',
} as const;

const TextAlignment = {
  NORMAL: 'NORMAL',
  SUPERSCRIPT: 'SUPERSCRIPT',
  SUBSCRIPT: 'SUBSCRIPT',
} as const;

// ---------------------------------------------------------------------------
// Fake element model
// ---------------------------------------------------------------------------

function normalizeRuns(spec: ParaSpec): Required<RunSpec>[] {
  const raw =
    spec.runs && spec.runs.length > 0
      ? spec.runs
      : [{ text: spec.text ?? '' }];
  return raw.map((r) => ({
    text: r.text,
    bold: r.bold ?? false,
    italic: r.italic ?? false,
    underline: r.underline ?? false,
    superscript: r.superscript ?? false,
    subscript: r.subscript ?? false,
  }));
}

interface CharFmt {
  ch: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
}

class FakeText {
  // runs is the mutable source of truth; full/starts are derived on demand so
  // that in-place edits (deleteText/insertText/setBold/…) stay consistent.
  private runs: Required<RunSpec>[];

  constructor(
    runs: Required<RunSpec>[],
    private readonly parent: FakeParagraph
  ) {
    this.runs = runs;
  }

  getText(): string {
    return this.runs.map((r) => r.text).join('');
  }

  getType() {
    return ElementType.TEXT;
  }

  getParent(): FakeParagraph {
    return this.parent;
  }

  private starts(): number[] {
    const starts: number[] = [];
    let offset = 0;
    for (const r of this.runs) {
      starts.push(offset);
      offset += r.text.length;
    }
    return starts;
  }

  // Offsets where text attributes change — GAS always includes 0.
  getTextAttributeIndices(): number[] {
    return this.starts();
  }

  private runAt(offset: number): Required<RunSpec> {
    const starts = this.starts();
    for (let i = this.runs.length - 1; i >= 0; i--) {
      if (offset >= starts[i]) return this.runs[i];
    }
    return this.runs[0];
  }

  isBold(offset: number): boolean {
    return this.runAt(offset).bold;
  }

  isItalic(offset: number): boolean {
    return this.runAt(offset).italic;
  }

  isUnderline(offset: number): boolean {
    return this.runAt(offset).underline;
  }

  getTextAlignment(offset: number): string {
    const r = this.runAt(offset);
    if (r.superscript) return TextAlignment.SUPERSCRIPT;
    if (r.subscript) return TextAlignment.SUBSCRIPT;
    return TextAlignment.NORMAL;
  }

  // --- Mutation API (subset used by src/apps-script/fixes.ts) ---

  private toChars(): CharFmt[] {
    const chars: CharFmt[] = [];
    for (const r of this.runs) {
      for (const ch of r.text) {
        chars.push({
          ch,
          bold: r.bold,
          italic: r.italic,
          underline: r.underline,
          superscript: r.superscript,
          subscript: r.subscript,
        });
      }
    }
    return chars;
  }

  private fromChars(chars: CharFmt[]): void {
    if (chars.length === 0) {
      this.runs = [
        {
          text: '',
          bold: false,
          italic: false,
          underline: false,
          superscript: false,
          subscript: false,
        },
      ];
      return;
    }
    const runs: Required<RunSpec>[] = [];
    for (const c of chars) {
      const last = runs[runs.length - 1];
      if (
        last &&
        last.bold === c.bold &&
        last.italic === c.italic &&
        last.underline === c.underline &&
        last.superscript === c.superscript &&
        last.subscript === c.subscript
      ) {
        last.text += c.ch;
      } else {
        runs.push({
          text: c.ch,
          bold: c.bold,
          italic: c.italic,
          underline: c.underline,
          superscript: c.superscript,
          subscript: c.subscript,
        });
      }
    }
    this.runs = runs;
  }

  deleteText(start: number, endInclusive: number): FakeText {
    const chars = this.toChars();
    chars.splice(start, endInclusive - start + 1);
    this.fromChars(chars);
    return this;
  }

  insertText(start: number, text: string): FakeText {
    const chars = this.toChars();
    // Inherit style from the character before the insertion point, matching
    // Apps Script's behavior; fall back to unformatted at the start.
    const template =
      start > 0 && chars[start - 1]
        ? chars[start - 1]
        : {
            bold: false,
            italic: false,
            underline: false,
            superscript: false,
            subscript: false,
          };
    const inserted: CharFmt[] = text.split('').map((ch) => ({
      ch,
      bold: template.bold,
      italic: template.italic,
      underline: template.underline,
      superscript: template.superscript,
      subscript: template.subscript,
    }));
    chars.splice(start, 0, ...inserted);
    this.fromChars(chars);
    return this;
  }

  setBold(start: number, endInclusive: number, value: boolean): FakeText {
    const chars = this.toChars();
    for (let i = start; i <= endInclusive && i < chars.length; i++) {
      chars[i].bold = value;
    }
    this.fromChars(chars);
    return this;
  }

  setItalic(start: number, endInclusive: number, value: boolean): FakeText {
    const chars = this.toChars();
    for (let i = start; i <= endInclusive && i < chars.length; i++) {
      chars[i].italic = value;
    }
    this.fromChars(chars);
    return this;
  }

  setUnderline(start: number, endInclusive: number, value: boolean): FakeText {
    const chars = this.toChars();
    for (let i = start; i <= endInclusive && i < chars.length; i++) {
      chars[i].underline = value;
    }
    this.fromChars(chars);
    return this;
  }
}

class FakePageBreak {
  getType() {
    return ElementType.PAGE_BREAK;
  }
}

class FakeParagraph {
  private readonly text: FakeText;
  private readonly children: Array<FakeText | FakePageBreak>;
  parent: FakeBody | null = null;

  constructor(
    spec: ParaSpec,
    private readonly elementType: string
  ) {
    this.text = new FakeText(normalizeRuns(spec), this);
    this.children = [this.text];
    if (spec.pageBreak) this.children.push(new FakePageBreak());
  }

  getType(): string {
    return this.elementType;
  }

  asParagraph(): FakeParagraph {
    return this;
  }

  editAsText(): FakeText {
    return this.text;
  }

  getNumChildren(): number {
    return this.children.length;
  }

  getChild(i: number): FakeText | FakePageBreak {
    return this.children[i];
  }

  getParent(): FakeBody | null {
    return this.parent;
  }
}

/** A non-paragraph body child (e.g. a table) — only needs a type. */
class FakeOther {
  getType() {
    return ElementType.TABLE;
  }
  getParent(): FakeBody | null {
    return null;
  }
}

type BodyChild = FakeParagraph | FakeOther;

class FakeBody {
  readonly children: BodyChild[];

  constructor(specs: ParaSpec[]) {
    this.children = specs.map((s) => {
      if (s.other) return new FakeOther();
      const type = s.listItem ? ElementType.LIST_ITEM : ElementType.PARAGRAPH;
      const p = new FakeParagraph(s, type);
      return p;
    });
    for (const c of this.children) {
      if (c instanceof FakeParagraph) c.parent = this;
    }
  }

  getType() {
    return ElementType.BODY_SECTION;
  }

  getNumChildren(): number {
    return this.children.length;
  }

  getChild(i: number): BodyChild {
    return this.children[i];
  }

  getChildIndex(el: unknown): number {
    return this.children.indexOf(el as BodyChild);
  }
}

class FakeCursor {
  constructor(private readonly element: FakeText) {}
  getElement(): FakeText {
    return this.element;
  }
}

interface FakePosition {
  element: FakeText;
  offset: number;
}

interface FakeRangePart {
  element: FakeText;
  start: number;
  end: number;
}

interface FakeRange {
  parts: FakeRangePart[];
}

class FakeDocument {
  readonly body: FakeBody;
  private cursor: FakeCursor | null = null;
  private lastCursorPos: FakePosition | null = null;
  private lastSelectionRange: FakeRange | null = null;

  constructor(
    specs: ParaSpec[],
    private readonly name: string,
    private readonly id: string
  ) {
    this.body = new FakeBody(specs);
  }

  getBody(): FakeBody {
    return this.body;
  }

  getName(): string {
    return this.name;
  }

  getId(): string {
    return this.id;
  }

  getCursor(): FakeCursor | null {
    return this.cursor;
  }

  setCursorAtParagraph(paraIndex: number): void {
    // paraIndex counts only paragraph/list-item children, matching the source.
    let count = 0;
    for (const child of this.body.children) {
      if (child instanceof FakeParagraph) {
        if (count === paraIndex) {
          this.cursor = new FakeCursor(child.editAsText());
          return;
        }
        count++;
      }
    }
    throw new Error(`No paragraph at index ${paraIndex}`);
  }

  clearCursor(): void {
    this.cursor = null;
  }

  // --- Navigation APIs (setCursor / setSelection) used by revealDiagnostic ---

  newPosition(element: FakeText, offset: number): FakePosition {
    return { element, offset };
  }

  newRange(): {
    addElement: (
      element: FakeText,
      start: number,
      end: number
    ) => ReturnType<FakeDocument['newRange']>;
    build: () => FakeRange;
  } {
    const parts: FakeRangePart[] = [];
    const builder = {
      addElement(element: FakeText, start: number, end: number) {
        parts.push({ element, start, end });
        return builder;
      },
      build(): FakeRange {
        return { parts };
      },
    };
    return builder;
  }

  setCursor(position: FakePosition): void {
    this.lastCursorPos = position;
  }

  setSelection(range: FakeRange): void {
    this.lastSelectionRange = range;
  }

  getLastCursorPos(): FakePosition | null {
    return this.lastCursorPos;
  }

  getLastSelectionRange(): FakeRange | null {
    return this.lastSelectionRange;
  }
}

// ---------------------------------------------------------------------------
// Install / handle
// ---------------------------------------------------------------------------

export interface GasHandle {
  /** Replace the active document. Returns it for cursor/inspection. */
  setDocument(
    specs: ParaSpec[],
    opts?: { name?: string; id?: string }
  ): FakeDocument;
  setCursorAtParagraph(paraIndex: number): void;
  clearCursor(): void;
  /** Read back the current text of a paragraph (post-edit). */
  paragraphText(paraIndex: number): string;
  /** Read back a character's formatting flags (post-edit). */
  paragraphFormat(
    paraIndex: number,
    offset: number
  ): { bold: boolean; italic: boolean; underline: boolean };
  /** The text selected by the last setSelection (null if none), for asserting reveals. */
  lastSelection(): { text: string; start: number; end: number } | null;
  /** The offset of the last setCursor position (null if none). */
  lastCursorOffset(): number | null;
  /** The paragraph index the last setCursor landed in (null if none). */
  lastCursorParagraph(): number | null;
  readonly logs: string[];
  readonly properties: Map<string, string>;
}

const g = globalThis as unknown as Record<string, unknown>;

/**
 * Install the fake runtime onto globalThis and return a handle for driving it.
 * Call once per test (e.g. in beforeEach) to get fresh, isolated state.
 */
export function installFakeGas(): GasHandle {
  let activeDoc: FakeDocument = new FakeDocument([], 'Untitled', 'doc-id');

  const paragraphAt = (paraIndex: number): FakeParagraph => {
    let count = 0;
    for (const child of activeDoc.getBody().children) {
      if (child instanceof FakeParagraph) {
        if (count === paraIndex) return child;
        count++;
      }
    }
    throw new Error(`No paragraph at index ${paraIndex}`);
  };

  const logs: string[] = [];
  const properties = new Map<string, string>();

  g.DocumentApp = {
    ElementType,
    TextAlignment,
    getActiveDocument: () => activeDoc,
    getUi: () => ({
      createMenu: () => {
        const menu = {
          addItem: () => menu,
          addToUi: () => undefined,
        };
        return menu;
      },
      showSidebar: () => undefined,
    }),
  };

  g.Logger = {
    log: (msg: unknown) => {
      logs.push(String(msg));
    },
  };

  g.PropertiesService = {
    getUserProperties: () => ({
      getProperty: (key: string) => properties.get(key) ?? null,
      setProperty: (key: string, value: string) => {
        properties.set(key, value);
      },
      deleteProperty: (key: string) => {
        properties.delete(key);
      },
    }),
  };

  g.HtmlService = {
    createHtmlOutputFromFile: () => {
      const output = {
        setTitle: () => output,
        setWidth: () => output,
      };
      return output;
    },
  };

  return {
    setDocument(specs, opts) {
      activeDoc = new FakeDocument(
        specs,
        opts?.name ?? 'Test Packet',
        opts?.id ?? 'doc-id'
      );
      return activeDoc;
    },
    setCursorAtParagraph(paraIndex) {
      activeDoc.setCursorAtParagraph(paraIndex);
    },
    clearCursor() {
      activeDoc.clearCursor();
    },
    lastSelection() {
      const r = activeDoc.getLastSelectionRange();
      if (!r || r.parts.length === 0) return null;
      const p = r.parts[0];
      return {
        text: p.element.getText().substring(p.start, p.end + 1),
        start: p.start,
        end: p.end,
      };
    },
    lastCursorOffset() {
      const pos = activeDoc.getLastCursorPos();
      return pos ? pos.offset : null;
    },
    lastCursorParagraph() {
      const pos = activeDoc.getLastCursorPos();
      if (!pos) return null;
      let count = 0;
      for (const child of activeDoc.getBody().children) {
        if (child instanceof FakeParagraph) {
          if (child.editAsText() === pos.element) return count;
          count++;
        }
      }
      return null;
    },
    paragraphText(paraIndex) {
      return paragraphAt(paraIndex).editAsText().getText();
    },
    paragraphFormat(paraIndex, offset) {
      const text = paragraphAt(paraIndex).editAsText();
      return {
        bold: text.isBold(offset),
        italic: text.isItalic(offset),
        underline: text.isUnderline(offset),
      };
    },
    logs,
    properties,
  };
}
