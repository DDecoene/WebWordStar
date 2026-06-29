import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: { outDir: "dist" },
  // Dedicated, uncommon port with strictPort so WebWordStar never collides with
  // other Vite projects on the default 5173 (and so Playwright is deterministic).
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      "/ws": { target: "ws://localhost:5274", ws: true },
    },
  },
});
