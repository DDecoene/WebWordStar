/**
 * Abuse guards for publicly hosted demo instances (WWS_DEMO=1).
 * Everything here is opt-in; a normal self-hosted install never constructs these.
 */

/**
 * A per-key sliding-window rate limiter: at most `limit` allowed events per
 * `windowMs`, counted over a true sliding window (old events age out
 * individually, the window never hard-resets).
 */
export class SlidingWindowLimiter {
  private events = new Map<string, number[]>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  /** Record an attempt by `key`; returns whether it is allowed. */
  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const kept = (this.events.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length >= this.limit) {
      this.events.set(key, kept);
      return false;
    }
    kept.push(now);
    this.events.set(key, kept);
    return true;
  }

  /** Drop keys whose events have all aged out (call occasionally to bound memory). */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.events) {
      if (!times.some((t) => t > cutoff)) this.events.delete(key);
    }
  }

  get size(): number {
    return this.events.size;
  }
}

/** Demo-mode settings resolved from the environment. */
export interface DemoConfig {
  enabled: boolean;
  /** Documents idle longer than this are wiped. */
  wipeHours: number;
  /** Max doc-creating HTTP requests (GET /demo, POST /import) per IP per hour. */
  createPerIpPerHour: number;
  /** Max concurrent WebSocket connections per IP. */
  maxConnPerIp: number;
  /** Max WebSocket messages per connection per 10 seconds. */
  msgPer10s: number;
}

export function demoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DemoConfig {
  const num = (v: string | undefined, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    enabled: env.WWS_DEMO === "1",
    wipeHours: num(env.WWS_WIPE_HOURS, 24),
    createPerIpPerHour: num(env.WWS_CREATE_PER_IP_PER_HOUR, 30),
    maxConnPerIp: num(env.WWS_MAX_CONN_PER_IP, 8),
    msgPer10s: num(env.WWS_MSG_PER_10S, 400),
  };
}

/** Concurrent-connection counter per IP. */
export class ConnectionCounter {
  private counts = new Map<string, number>();

  constructor(private max: number) {}

  /** Try to register a connection for `ip`; returns false when the cap is hit. */
  add(ip: string): boolean {
    const n = this.counts.get(ip) ?? 0;
    if (n >= this.max) return false;
    this.counts.set(ip, n + 1);
    return true;
  }

  remove(ip: string): void {
    const n = this.counts.get(ip) ?? 0;
    if (n <= 1) this.counts.delete(ip);
    else this.counts.set(ip, n - 1);
  }
}
