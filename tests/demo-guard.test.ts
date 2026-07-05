import { describe, it, expect } from "vitest";
import { SlidingWindowLimiter } from "../server/demoGuard";
import { DocumentStore } from "../server/DocumentStore";

describe("SlidingWindowLimiter", () => {
  it("allows calls under the limit", () => {
    const limiter = new SlidingWindowLimiter(3, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(true);
  });

  it("blocks the call that exceeds the limit", () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(false);
  });

  it("allows again once the window has passed", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("a", 1001)).toBe(true);
  });

  it("slides rather than resets: only events inside the window count", () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 900)).toBe(true);
    expect(limiter.allow("a", 950)).toBe(false);
    // t=0 event has left the window; the t=900 one has not
    expect(limiter.allow("a", 1100)).toBe(true);
    expect(limiter.allow("a", 1150)).toBe(false);
  });

  it("drops state for keys whose events have all expired", () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    limiter.allow("a", 0);
    limiter.allow("b", 0);
    limiter.prune(5000);
    expect(limiter.size).toBe(0);
  });
});

describe("DocumentStore.sweepIdleBefore", () => {
  it("deletes documents last updated before the cutoff", () => {
    const store = new DocumentStore(":memory:");
    store.create("old");
    const deleted = store.sweepIdleBefore(Date.now() + 60_000, new Set());
    expect(deleted).toBe(1);
    expect(store.load("old")).toBeNull();
    store.close();
  });

  it("keeps documents updated after the cutoff", () => {
    const store = new DocumentStore(":memory:");
    store.create("fresh");
    const deleted = store.sweepIdleBefore(Date.now() - 60_000, new Set());
    expect(deleted).toBe(0);
    expect(store.load("fresh")).not.toBeNull();
    store.close();
  });

  it("never deletes documents with an open session, however idle", () => {
    const store = new DocumentStore(":memory:");
    store.create("active");
    store.create("idle");
    const deleted = store.sweepIdleBefore(Date.now() + 60_000, new Set(["active"]));
    expect(deleted).toBe(1);
    expect(store.load("active")).not.toBeNull();
    expect(store.load("idle")).toBeNull();
    store.close();
  });
});
