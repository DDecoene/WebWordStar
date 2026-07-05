import { test, expect } from "@playwright/test";

test("visiting /demo redirects to a seeded document", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\?doc=/);

  const status = page.getByTestId("status");
  await expect(status).toContainText("PAGE");
  await expect(status).toContainText("DEMO DOCUMENT");

  const screen = page.getByTestId("screen");
  await expect(screen).toContainText("WELCOME TO WEBWORDSTAR");
});

test("visiting /demo twice creates two different documents", async ({ page }) => {
  await page.goto("/demo");
  await page.waitForURL(/\?doc=/);
  const firstUrl = page.url();
  const firstId = new URL(firstUrl).searchParams.get("doc");

  await page.goto("/demo");
  await page.waitForURL(/\?doc=/);
  const secondUrl = page.url();
  const secondId = new URL(secondUrl).searchParams.get("doc");

  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();
  expect(firstId).not.toBe(secondId);
});
