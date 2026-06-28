import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: /.*\.spec\.ts/,
  use: { baseURL: "http://localhost:5174" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
