# Foundation Implementation Plan (v1.0.0 — Stage 1)

> ✅ **Shipped** — merged into `release/v1.0.0` (PR #10, issue #4).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the WebWordStar toolchain and the pure document model + shared type contracts that every later stage depends on.

**Architecture:** A TypeScript project built with Vite, unit-tested with Vitest and end-to-end-tested with Playwright. The heart of this stage is a *pure*, I/O-free **document model** (`src/shared/`) — text as an array of lines plus pure transform functions that take a model + an edit intent and return a new model. Shared TypeScript types define the client↔server contract used by every later stage. A minimal browser shell exists only so Vite builds and Playwright has a page to load.

**Tech Stack:** TypeScript (ESM), Vite, Vitest, Playwright, Node.js 20.

This is Stage 1 of the v1.0.0 milestone. Source spec: `docs/superpowers/specs/2026-06-28-webwordstar-v1.0.0-design.md`. Subsequent stages (editor core, dot commands, persistence, collaboration, export) get their own plans.

---

## File Structure

- `package.json` — add devDependencies + real `test`/`build`/`test:e2e`/`dev` scripts (replacing the echo placeholders).
- `tsconfig.json` — strict TypeScript config for the whole project.
- `vite.config.ts` — Vite build/dev config.
- `vitest.config.ts` — Vitest config (jsdom not needed yet; node environment).
- `playwright.config.ts` — Playwright config with a `webServer` block that auto-starts the Vite dev server.
- `index.html` — minimal app shell page.
- `src/main.ts` — minimal boot script (renders a placeholder so e2e has something to assert).
- `src/shared/types.ts` — shared types: `Position`, `TextDocument`, edit-intent union, `AppliedOp`, `Presence`, `Snapshot`.
- `src/shared/document.ts` — pure document model: `createDocument`, `getText`, `insertText`, `deleteRange`, `splitLine`, `applyIntent`.
- `tests/document.test.ts` — Vitest unit tests for the document model.
- `tests/smoke.spec.ts` — Playwright smoke test that loads the shell page.

---

## Task 1: Project toolchain

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D typescript@^5.5.0 vite@^5.4.0 vitest@^2.1.0 @playwright/test@^1.47.0 @types/node@^20.14.0
```
Expected: packages added to `devDependencies`, `package-lock.json` updated, exit 0.

- [ ] **Step 2: Replace the placeholder scripts in `package.json`**

Set the `scripts` block to exactly:
```json
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
  server: { port: 5173 },
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: /.*\.spec\.ts/,
  use: { baseURL: "http://localhost:5173" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 7: Verify the unit runner works with no tests yet**

Run: `npm test`
Expected: Vitest reports "No test files found" but exits 0 (because of `--passWithNoTests`).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts
git commit -m "chore: set up TypeScript + Vite + Vitest + Playwright toolchain"
```

---

## Task 2: Shared types (the client↔server contract)

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
/** A zero-based cursor position: line index and column (character) index. */
export interface Position {
  line: number;
  col: number;
}

/**
 * The document model: text as an array of lines (no trailing newline characters;
 * the array boundaries ARE the line breaks). This is the single source of truth.
 * Formatting runs and dot commands are added in later stages.
 */
export interface TextDocument {
  lines: string[];
}

/** Edit intents: what a client asks the server to do. Pure data. */
export type EditIntent =
  | { kind: "insertText"; at: Position; text: string }
  | { kind: "deleteRange"; start: Position; end: Position }
  | { kind: "splitLine"; at: Position };

/** An applied, ordered mutation broadcast by the server authority. */
export interface AppliedOp {
  docId: string;
  revision: number;
  intent: EditIntent;
}

/** Presence of a peer editing the same document. */
export interface Presence {
  docId: string;
  userId: string;
  name: string;
  cursor: Position;
}

/** Full document snapshot sent to a client on join. */
export interface Snapshot {
  docId: string;
  revision: number;
  document: TextDocument;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared document and collaboration types"
```

---

## Task 3: Document model — createDocument & getText

**Files:**
- Create: `src/shared/document.ts`
- Test: `tests/document.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createDocument, getText } from "../src/shared/document";

describe("createDocument / getText", () => {
  it("creates an empty document with one empty line", () => {
    const doc = createDocument();
    expect(doc.lines).toEqual([""]);
    expect(getText(doc)).toBe("");
  });

  it("creates a document from initial text, splitting on newlines", () => {
    const doc = createDocument("alpha\nbeta");
    expect(doc.lines).toEqual(["alpha", "beta"]);
    expect(getText(doc)).toBe("alpha\nbeta");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document.test.ts`
Expected: FAIL — cannot find module `../src/shared/document`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { TextDocument } from "./types";

/** Create a document. Empty text yields a single empty line. */
export function createDocument(text = ""): TextDocument {
  return { lines: text.split("\n") };
}

/** Serialize the document back to a single string with newline separators. */
export function getText(doc: TextDocument): string {
  return doc.lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/document.ts tests/document.test.ts
git commit -m "feat: add document model createDocument and getText"
```

---

## Task 4: Document model — insertText

**Files:**
- Modify: `src/shared/document.ts`
- Test: `tests/document.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/document.test.ts`)

```ts
import { insertText } from "../src/shared/document";

describe("insertText", () => {
  it("inserts text within a line and returns a new document", () => {
    const doc = createDocument("helo");
    const next = insertText(doc, { line: 0, col: 3 }, "l");
    expect(getText(next)).toBe("hello");
    expect(getText(doc)).toBe("helo"); // original unchanged (pure)
  });

  it("inserts at the start and end of a line", () => {
    const doc = createDocument("bc");
    expect(getText(insertText(doc, { line: 0, col: 0 }, "a"))).toBe("abc");
    expect(getText(insertText(doc, { line: 0, col: 2 }, "d"))).toBe("bcd");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document.test.ts`
Expected: FAIL — `insertText` is not exported.

- [ ] **Step 3: Add the implementation** (append to `src/shared/document.ts`)

```ts
import type { Position } from "./types";

/** Insert text into a single line at the given position. Returns a new document. */
export function insertText(doc: TextDocument, at: Position, text: string): TextDocument {
  const lines = doc.lines.slice();
  const line = lines[at.line] ?? "";
  lines[at.line] = line.slice(0, at.col) + text + line.slice(at.col);
  return { lines };
}
```

> Note: change the existing top-of-file import to `import type { TextDocument, Position } from "./types";` rather than adding a second import line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/document.ts tests/document.test.ts
git commit -m "feat: add document model insertText"
```

---

## Task 5: Document model — deleteRange

**Files:**
- Modify: `src/shared/document.ts`
- Test: `tests/document.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/document.test.ts`)

```ts
import { deleteRange } from "../src/shared/document";

describe("deleteRange", () => {
  it("deletes within a single line", () => {
    const doc = createDocument("abcdef");
    const next = deleteRange(doc, { line: 0, col: 1 }, { line: 0, col: 4 });
    expect(getText(next)).toBe("aef");
  });

  it("deletes across multiple lines, joining the ends", () => {
    const doc = createDocument("hello\nbig\nworld");
    const next = deleteRange(doc, { line: 0, col: 2 }, { line: 2, col: 2 });
    expect(getText(next)).toBe("herld");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document.test.ts`
Expected: FAIL — `deleteRange` is not exported.

- [ ] **Step 3: Add the implementation** (append to `src/shared/document.ts`)

```ts
/**
 * Delete everything from `start` (inclusive) to `end` (exclusive), where
 * start <= end in document order. Returns a new document; the line containing
 * `start` is joined with the remainder of the line containing `end`.
 */
export function deleteRange(doc: TextDocument, start: Position, end: Position): TextDocument {
  const lines = doc.lines.slice();
  const head = (lines[start.line] ?? "").slice(0, start.col);
  const tail = (lines[end.line] ?? "").slice(end.col);
  lines.splice(start.line, end.line - start.line + 1, head + tail);
  return { lines };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/shared/document.ts tests/document.test.ts
git commit -m "feat: add document model deleteRange"
```

---

## Task 6: Document model — splitLine & applyIntent

**Files:**
- Modify: `src/shared/document.ts`
- Test: `tests/document.test.ts`

- [ ] **Step 1: Add the failing test** (append to `tests/document.test.ts`)

```ts
import { splitLine, applyIntent } from "../src/shared/document";

describe("splitLine", () => {
  it("splits a line into two at the position", () => {
    const doc = createDocument("hello");
    const next = splitLine(doc, { line: 0, col: 2 });
    expect(next.lines).toEqual(["he", "llo"]);
  });
});

describe("applyIntent", () => {
  it("dispatches insertText", () => {
    const doc = createDocument("ac");
    const next = applyIntent(doc, { kind: "insertText", at: { line: 0, col: 1 }, text: "b" });
    expect(getText(next)).toBe("abc");
  });

  it("dispatches deleteRange", () => {
    const doc = createDocument("abc");
    const next = applyIntent(doc, {
      kind: "deleteRange",
      start: { line: 0, col: 0 },
      end: { line: 0, col: 1 },
    });
    expect(getText(next)).toBe("bc");
  });

  it("dispatches splitLine", () => {
    const doc = createDocument("ab");
    const next = applyIntent(doc, { kind: "splitLine", at: { line: 0, col: 1 } });
    expect(next.lines).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/document.test.ts`
Expected: FAIL — `splitLine` / `applyIntent` are not exported.

- [ ] **Step 3: Add the implementation** (append to `src/shared/document.ts`)

```ts
import type { EditIntent } from "./types";

/** Split a line at the position into two lines. Returns a new document. */
export function splitLine(doc: TextDocument, at: Position): TextDocument {
  const lines = doc.lines.slice();
  const line = lines[at.line] ?? "";
  lines.splice(at.line, 1, line.slice(0, at.col), line.slice(at.col));
  return { lines };
}

/** Apply any edit intent to the document, returning a new document. */
export function applyIntent(doc: TextDocument, intent: EditIntent): TextDocument {
  switch (intent.kind) {
    case "insertText":
      return insertText(doc, intent.at, intent.text);
    case "deleteRange":
      return deleteRange(doc, intent.start, intent.end);
    case "splitLine":
      return splitLine(doc, intent.at);
  }
}
```

> Note: extend the existing `import type` line to include `EditIntent` rather than adding a new import line.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/document.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/document.ts tests/document.test.ts
git commit -m "feat: add document model splitLine and applyIntent dispatcher"
```

---

## Task 7: Minimal app shell + Playwright smoke test

**Files:**
- Create: `index.html`, `src/main.ts`, `tests/smoke.spec.ts`

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WebWordStar</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/main.ts`**

```ts
import { createDocument, getText } from "./shared/document";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const doc = createDocument("WebWordStar");
  app.innerHTML = `<pre data-testid="screen">${getText(doc)}</pre>`;
}
```

- [ ] **Step 3: Write the Playwright smoke test**

```ts
import { test, expect } from "@playwright/test";

test("app shell renders the document text", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("screen")).toHaveText("WebWordStar");
});
```

- [ ] **Step 4: Install Playwright's browser and run the smoke test**

Run:
```bash
npx playwright install --with-deps chromium
npx playwright test
```
Expected: 1 test passes (Vite dev server auto-started by the `webServer` block).

- [ ] **Step 5: Verify the production build works**

Run: `npm run build`
Expected: `tsc --noEmit` passes, Vite writes `dist/`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.ts tests/smoke.spec.ts
git commit -m "feat: add minimal app shell and Playwright smoke test"
```

---

## Task 8: Wire real commands into CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the `e2e` job to run Playwright for real**

In `.github/workflows/ci.yml`, replace the placeholder e2e step:
```yaml
      - run: npm run test:e2e
```
with:
```yaml
      - run: npx playwright install --with-deps chromium

      - run: npm run test:e2e
```

The `unit` job already runs `npm test` and `npm run build`, which are now the real Vitest + build commands — no change needed there.

- [ ] **Step 2: Verify the workflow file is valid YAML**

Run: `npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "valid yaml"`
Expected: prints `valid yaml`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run real vitest + playwright in CI"
```

---

## Self-Review

**Spec coverage (Stage 1 portion):** The document model (spec §4.1) is implemented as a pure, no-I/O module with explicit line structure and no high-bit encoding ✓. Shared types / message contract (spec §5) defined: `Position`, `TextDocument`, `EditIntent`, `AppliedOp`, `Presence`, `Snapshot` ✓. Toolchain replacing CI placeholders (spec §8 step 1) ✓. Testing approach (spec §7): Vitest for the model + a Playwright smoke test establishing the e2e harness ✓. Later spec sections (editor core, dot commands, persistence, collaboration, export) are intentionally out of scope for Stage 1 and covered by their own plans.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps; every code step shows complete code; every command shows expected output.

**Type consistency:** `Position`, `TextDocument`, `EditIntent` are defined once in `types.ts` and used consistently in `document.ts` and tests. Function names (`createDocument`, `getText`, `insertText`, `deleteRange`, `splitLine`, `applyIntent`) match across tasks. `applyIntent`'s switch covers exactly the three `EditIntent` variants defined in Task 2.

**Note for executor:** Tasks 4 and 6 say to *extend the existing `import type` line* in `document.ts` rather than add duplicate import lines — keep a single `import type { TextDocument, Position, EditIntent } from "./types";` by the end.
```
