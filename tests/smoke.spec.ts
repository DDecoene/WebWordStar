import { test, expect } from "@playwright/test";

test("app shell renders the document text", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("screen")).toHaveText("WebWordStar");
});
