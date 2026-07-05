import { test, expect } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { openEditor } from "./e2e-helpers";

/** Build a small WS4-style fixture: plain text plus a high-bit-set byte. */
function buildFixture(): Buffer {
  const bytes: number[] = [];
  const push = (s: string) => {
    for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  };
  push("Hell");
  bytes.push(0x6f | 0x80); // high-bit 'o'
  push(" world");
  bytes.push(0x0a);
  push(".lm 5");
  return Buffer.from(bytes);
}

test("^K R uploads a fixture file and lands on a new document with its content", async ({
  page,
}) => {
  await openEditor(page);

  const dir = mkdtempSync(join(tmpdir(), "wws-import-"));
  const filePath = join(dir, "myfixture.ws");
  writeFileSync(filePath, buildFixture());

  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+k");
  await page.keyboard.press("r");
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);

  await page.waitForURL(/\?doc=/);

  const status = page.getByTestId("status");
  await expect(status).toContainText("myfixture");

  const screen = page.getByTestId("screen");
  await expect(screen).toContainText("Hello world");
  await expect(screen).toContainText(".lm 5");
});
