import { resolve, join } from "node:path";

/**
 * Resolve a request URL path to an absolute file path within `distAbs`,
 * or null if it would escape the root (path traversal). `distAbs` must be absolute.
 */
export function safeStaticPath(distAbs: string, urlPath: string): string | null {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const candidate = resolve(join(distAbs, rel));
  if (candidate !== distAbs && !candidate.startsWith(distAbs + "/")) return null;
  return candidate;
}
