import { test, expect, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openEditorAt } from "./e2e-helpers";

/** Two independent browser contexts (two users) on the same document. */
async function openPair(browser: Browser): Promise<{ a: Page; b: Page; docId: string }> {
  const docId = randomUUID();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await openEditorAt(a, docId);
  await openEditorAt(b, docId);
  return { a, b, docId };
}

test("typing in one browser appears in the other", async ({ browser }) => {
  const { a, b } = await openPair(browser);
  await a.keyboard.type("HELLO FROM A");
  await expect(b.getByTestId("screen")).toContainText("HELLO FROM A");
});

test("peer cursors are visible with a USER name tag", async ({ browser }) => {
  const { a, b } = await openPair(browser);
  await a.keyboard.type("presence");
  // A's cursor moved, so B should render a peer cursor labelled with A's name.
  const peer = b.locator(".peer-cursor").first();
  await expect(peer).toBeVisible();
  await expect(peer).toHaveAttribute("data-peer", /USER \d+/);
});

test("concurrent same-line edits converge to identical text", async ({ browser }) => {
  const { a, b } = await openPair(browser);
  await a.keyboard.type("middle");
  await expect(b.getByTestId("screen")).toContainText("middle");

  // A goes to line start, B to line end; both type without waiting for each other.
  await a.keyboard.press("Control+q");
  await a.keyboard.press("s");
  await b.keyboard.press("Control+q");
  await b.keyboard.press("d");
  await Promise.all([a.keyboard.type("AAA"), b.keyboard.type("BBB")]);

  await expect
    .poll(async () => (await a.getByTestId("screen").innerText()).trim())
    .toContain("AAAmiddleBBB");
  await expect
    .poll(async () => (await b.getByTestId("screen").innerText()).trim())
    .toContain("AAAmiddleBBB");
});

test("undo reverts only the local user's edits", async ({ browser }) => {
  const { a, b } = await openPair(browser);
  await a.keyboard.type("alpha");
  await expect(b.getByTestId("screen")).toContainText("alpha");
  // B starts a fresh line and types its own text.
  await b.keyboard.press("Control+q");
  await b.keyboard.press("c"); // end of document
  await b.keyboard.press("Enter");
  await b.keyboard.type("bravo");
  await expect(a.getByTestId("screen")).toContainText("bravo");

  // A undoes: its own "alpha" disappears everywhere, B's "bravo" survives.
  await a.keyboard.press("Control+u");
  await expect(a.getByTestId("screen")).not.toContainText("alpha");
  await expect(a.getByTestId("screen")).toContainText("bravo");
  await expect(b.getByTestId("screen")).not.toContainText("alpha");
  await expect(b.getByTestId("screen")).toContainText("bravo");
});

test("a reloaded client resyncs to the current content", async ({ browser }) => {
  const { a, b, docId } = await openPair(browser);
  await a.keyboard.type("before reload");
  await expect(b.getByTestId("screen")).toContainText("before reload");

  await openEditorAt(b, docId); // reload B
  await expect(b.getByTestId("screen")).toContainText("before reload");

  // Still live after the reload.
  await a.keyboard.type(" and after");
  await expect(b.getByTestId("screen")).toContainText("before reload and after");
});
