import { ScalpConfig, DEFAULT_SCALP_CONFIG, scalpConfigForAssetClass } from "./config";

/**
 * ScalpGuard — enforces overtrading protection and duplicate-signal prevention,
 * shared by the live pipeline and the backtester so the rules are identical.
 *
 * State is per (step):
 * - setup IDs entered (dedup): no identical setup re-emitted while active
 * - consecutive losses + their timestamps → cooldown after a loss string
 * - daily loss (R) cap
 * - trades per session cap
 * - max open positions
 */
export class ScalpGuard {
  private activeSetups = new Set<string>();
  private consecutive = 0;
  private lastLossTime = 0;
  private dailyLossR = 0;
  private lastDay = -1;
  private sessionTrades = 0;
  private lastSession = "";
  private openPositions = 0;
  private config: ScalpConfig;

  constructor(config: Partial<ScalpConfig> = {}, private now = Date.now()) {
    this.config = { ...DEFAULT_SCALP_CONFIG, ...config };
  }

  /** Whether a new entry for a setup is permitted right now. */
  permit(setupId: string, session: string, now: number): { allow: boolean; reason?: string } {
    const cfg = this.config;
    this.rollDay(now, session);
    if (this.activeSetups.has(setupId)) {
      return { allow: false, reason: `duplicate setup (${setupId})` };
    }
    if (this.dailyLossR <= -cfg.overtrading.dailyLossLimitR) {
      return { allow: false, reason: "daily loss limit reached" };
    }
    if (this.consecutive >= cfg.overtrading.maxConsecutiveLosses && now - this.lastLossTime < cfg.overtrading.cooldownBars * 60_000) {
      return { allow: false, reason: "cooldown after consecutive losses" };
    }
    if (this.sessionTrades >= cfg.overtrading.maxTradesPerSession) {
      return { allow: false, reason: "max trades per session reached" };
    }
    if (this.openPositions >= cfg.overtrading.maxOpenPositions) {
      return { allow: false, reason: "max open positions reached" };
    }
    return { allow: true };
  }

  /** Record a new entry placement. Must be called after permit() allows. */
  open(setupId: string, session: string, now: number): void {
    this.rollDay(now, session);
    this.activeSetups.add(setupId);
    this.openPositions++;
    this.sessionTrades++;
  }

  /** Close a position and feed back outcome (R) for guard accounting. */
  close(setupId: string, r: number, now: number): void {
    this.rollDay(now);
    this.activeSetups.delete(setupId);
    this.openPositions = Math.max(0, this.openPositions - 1);
    if (r < 0) {
      this.consecutive++;
      this.lastLossTime = now;
      this.dailyLossR += r;
    } else {
      this.consecutive = 0;
      this.dailyLossR += r;
    }
  }

  /** Roll daily/session counters when the UTC day or session boundary passes. */
  private rollDay(now: number, session?: string): void {
    const day = Math.floor(now / 86_400_000);
    if (day !== this.lastDay) {
      this.lastDay = day;
      this.dailyLossR = 0;
      this.sessionTrades = 0;
      this.lastSession = session ?? "";
      return;
    }
    if (session !== undefined && session !== this.lastSession) {
      this.lastSession = session;
      this.sessionTrades = 0;
    }
  }
}