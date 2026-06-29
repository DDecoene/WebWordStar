import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { safeStaticPath } from "../server/staticPath";

const DIST = resolve("dist");

describe("safeStaticPath", () => {
  it("maps / to index.html inside dist", () => {
    expect(safeStaticPath(DIST, "/")).toBe(resolve(DIST, "index.html"));
  });
  it("maps a normal asset path inside dist", () => {
    expect(safeStaticPath(DIST, "/assets/app.js")).toBe(resolve(DIST, "assets/app.js"));
  });
  it("rejects path traversal escaping dist", () => {
    expect(safeStaticPath(DIST, "/../../../../etc/passwd")).toBeNull();
  });
  it("rejects encoded-ish traversal with leading slashes", () => {
    expect(safeStaticPath(DIST, "/..%2f..%2fetc")).not.toBeNull(); // %2f is literal here, stays inside
    expect(safeStaticPath(DIST, "/../secret")).toBeNull();
  });
});
