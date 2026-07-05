// Records the README collaboration demo GIF frames against a running dev
// server (:5273). Session A opens GET /demo (the seeded showcase document);
// session B joins the same document. Every frame captures both screens so the
// assembler can composite them side by side.
// Usage: node scripts/make-demo-gif.mjs   then: python3 scripts/make-demo-gif.py
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const OUT = "/tmp/wwsgif";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const frames = []; // { a, b, ms }
let n = 0;

const browser = await chromium.launch();
const viewport = { width: 640, height: 400 };
const a = await (await browser.newContext({ viewport, deviceScaleFactor: 2 })).newPage();
const b = await (await browser.newContext({ viewport, deviceScaleFactor: 2 })).newPage();

// A gets a fresh seeded demo document; B joins the same doc.
await a.goto("http://localhost:5273/demo");
await a.waitForURL(/\?doc=/);
await a.getByTestId("status").waitFor();
await b.goto(a.url());
await b.getByTestId("status").waitFor();
await a.waitForTimeout(500);

async function snap(ms) {
  const fa = `${OUT}/a-${String(n).padStart(3, "0")}.png`;
  const fb = `${OUT}/b-${String(n).padStart(3, "0")}.png`;
  n++;
  await a.screenshot({ path: fa });
  await b.screenshot({ path: fb });
  frames.push({ a: fa, b: fb, ms });
}

/** Type on `page` a few characters per frame so the GIF shows live sync. */
async function typeRecorded(page, text, chunk = 3, ms = 110) {
  for (let i = 0; i < text.length; i += chunk) {
    await page.keyboard.type(text.slice(i, i + chunk));
    await page.waitForTimeout(60); // let the ops fan out to the peer
    await snap(ms);
  }
}

const down = async (page, times) => {
  for (let i = 0; i < times; i++) await page.keyboard.press("Control+x");
};

// ---- choreography ----
await snap(1200); // both sessions on the seeded DEMO DOCUMENT

// USER 1 types on the blank line under the title; USER 2 watches it live.
await down(a, 3);
await snap(300);
await typeRecorded(a, "USER 1 is typing this line...");
await snap(800);

// USER 2 replies on a fresh line (green cursor + name tag visible to USER 1).
await down(b, 3);
await b.keyboard.press("Control+q");
await b.keyboard.press("d"); // end of USER 1's line
await b.keyboard.press("Enter");
await snap(400);
await typeRecorded(b, "...and USER 2 answers as it happens.");
await snap(900);

// Concurrent edits on the SAME line: USER 1 at its line start, USER 2 at the
// end of that line; both type at once and the text converges.
await a.keyboard.press("Control+q");
await a.keyboard.press("s"); // USER 1 to start of its own line
await b.keyboard.press("Control+e"); // USER 2 up to USER 1's line...
await b.keyboard.press("Control+q");
await b.keyboard.press("d"); // ...and to its end
await snap(500);
const both = async (t1, t2) => {
  await Promise.all([a.keyboard.type(t1), b.keyboard.type(t2)]);
  await a.waitForTimeout(120);
  await snap(140);
};
for (const [t1, t2] of [[">> ", " <<"], ["at", " s"], [" t", "am"], ["he", "e "], [" sa", "li"], ["me", "ne"], [" time ", "!"]]) {
  await both(t1, t2);
}
await snap(1400);

// USER 1 undoes its own edits only — USER 2's text survives. (Interleaved
// remote ops seal undo chunks, so each of USER 1's concurrent bursts is its
// own step; a few more undos then eat its opening line.)
for (let i = 0; i < 8; i++) {
  await a.keyboard.press("Control+u");
  await a.waitForTimeout(90);
  await snap(220);
}
await snap(2600);

writeFileSync(`${OUT}/frames.json`, JSON.stringify(frames));
await browser.close();
console.log(`${frames.length} frame pairs in ${OUT}`);
