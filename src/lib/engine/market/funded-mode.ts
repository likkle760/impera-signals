/**
 * Funded Mode risk controller (§42).
 *
 * Enforces funded-account discipline on TOP of signal generation:
 *   - daily loss protection
 *   - weekly loss protection
 *   - maximum simultaneous risk ($)
 *   - maximum correlated exposure (same-currency stacking)
 *   - maximum consecutive losses → cooldown
 *   - news protection (skip entries into high-impact releases)
 *   - session protection (only trade allowed sessions)
 *   - automatic trading halt (stop generating signals, do not try to win it back)
 *
 * §41 forbids martingale / revenge trading / grid / loss recovery entirely.
 */
export interface FundedSettings {
  accountSize: number;
  riskPct: number;                     // default 0.25
  maxRiskPct: number;                  // hard cap 0.5
  dailyLossPct: number;
  weeklyLossPct: number;
  maxSimultaneousRiskPct: number;
  maxCorrelatedExposurePct: number;
  maxConsecutiveLosses: number;
  cooldownBars: number;
  allowedSessions: string[];           // empty = all
  newsBlock: boolean;
  enabled: boolean;
}

export const DEFAULT_FUNDED: FundedSettings = {
  accountSize: 100_000,
  riskPct: 0.25,
  maxRiskPct: 0.5,
  dailyLossPct: 3,
  weeklyLossPct: 6,
  maxSimultaneousRiskPct: 2,
  maxCorrelatedExposurePct: 1.5,
  maxConsecutiveLosses: 3,
  cooldownBars: 17,
  allowedSessions: [],
  newsBlock: true,
  enabled: false
};

export type HaltReason = "NONE" | "DAILY_LOSS" | "WEEKLY_LOSS" | "CONSECUTIVE_LOSSES" | "MAX_POSITIONS" | "CORRELATED_EXPOSURE" | "NEWS" | "SESSION" | "DISABLED";

export interface FundedVerdict {
  halted: boolean;
  reason: HaltReason;
  /** whether signal generation should proceed */
  allowSignal: boolean;
  /** remaining risk % this trade may use (0 if halted) */
  allowedRiskPct: number;
  message: string | null;
}

export class FundedMode {
  private state: {
    balance: number;
    peak: number;
    dayStart: number;
    dayLossPct: number;
    weekLossPct: number;
    consecutiveLosses: number;
    openRiskPct: number;
    openExposure: Record<string, number>;
  };

  constructor(private settings: FundedSettings = DEFAULT_FUNDED) {
    this.state = {
      balance: settings.accountSize,
      peak: settings.accountSize,
      dayStart: settings.accountSize,
      dayLossPct: 0,
      weekLossPct: 0,
      consecutiveLosses: 0,
      openRiskPct: 0,
      openExposure: {}
    };
  }

  private get s() {
    return this.settings;
  }

  /** Evaluate whether a new trade should be authorised. */
  authorize(input: {
    session: string;
    newsBlocked: boolean;
    /** fraction of the same-currency exposure this trade would add */
    addedCorrelation: number;
    currency?: string;
  }): FundedVerdict {
    if (!this.s.enabled) {
      return { halted: false, reason: "DISABLED", allowSignal: true, allowedRiskPct: this.s.riskPct, message: null };
    }

    const dailyBreach = this.state.dayLossPct <= -this.s.dailyLossPct;
    const weeklyBreach = this.state.weekLossPct <= -this.s.weeklyLossPct;
    const consec = this.state.consecutiveLosses >= this.s.maxConsecutiveLosses;
    const positions = this.state.openRiskPct >= this.s.maxSimultaneousRiskPct;
    const corr = (this.state.openExposure[input.currency ?? ""] ?? 0) + input.addedCorrelation >= this.s.maxCorrelatedExposurePct;

    if (dailyBreach) return this.halt("DAILY_LOSS", "Daily loss limit reached. STOP FOR THE DAY — do not try to win it back.");
    if (weeklyBreach) return this.halt("WEEKLY_LOSS", "Weekly loss limit reached. Trading halted.");
    if (consec) return this.halt("CONSECUTIVE_LOSSES", `${this.s.maxConsecutiveLosses} consecutive losses — cooldown until winners reset the streak.`);
    if (positions) return this.halt("MAX_POSITIONS", "Maximum simultaneous risk reached.");
    if (corr) return this.halt("CORRELATED_EXPOSURE", "Correlated exposure limit exceeded for this currency.");
    if (this.s.newsBlock && input.newsBlocked) return this.halt("NEWS", "High-impact news imminent — no fresh entries.");
    if (this.s.allowedSessions.length && !this.s.allowedSessions.includes(input.session)) return this.halt("SESSION", `Session ${input.session} not permitted.`);

    return { halted: false, reason: "NONE", allowSignal: true, allowedRiskPct: this.s.riskPct, message: null };
  }

  private halt(reason: HaltReason, message: string): FundedVerdict {
    return { halted: true, reason, allowSignal: false, allowedRiskPct: 0, message };
  }

  /** Record a position opening (its risk as % of account). */
  open(riskPct: number, currency?: string): void {
    this.state.openRiskPct += riskPct;
    if (currency) this.state.openExposure[currency] = (this.state.openExposure[currency] ?? 0) + riskPct;
  }

  /** Settle a closed trade: outcome R (positive win, negative loss, 0 breakeven). */
  close(r: number, riskPct: number, currency?: string): void {
    this.state.openRiskPct = Math.max(0, this.state.openRiskPct - riskPct);
    if (currency) this.state.openExposure[currency] = Math.max(0, (this.state.openExposure[currency] ?? 0) - riskPct);
    const pnlPct = r * riskPct;
    this.state.balance += (this.s.accountSize * pnlPct) / 100;
    this.state.dayLossPct += pnlPct;
    this.state.weekLossPct += pnlPct;
    if (r > 0) { this.state.consecutiveLosses = 0; }
    else if (r < 0) { this.state.consecutiveLosses += 1; }
    if (this.state.balance > this.state.peak) this.state.peak = this.state.balance;
  }

  /** Call at a day boundary to reset the daily loss counter (weekly persists). */
  newDay(): void {
    this.state.dayStart = this.state.balance;
    this.state.dayLossPct = 0;
  }

  restartWeek(): void {
    this.state.weekLossPct = 0;
  }

  status() {
    return {
      balance: this.state.balance,
      protected: this.s.enabled,
      dayLossPct: this.state.dayLossPct,
      weeklyLossPct: this.state.weekLossPct,
      consecutiveLosses: this.state.consecutiveLosses,
      openRiskPct: this.state.openRiskPct,
      haltActive: this.state.dayLossPct <= -this.s.dailyLossPct || this.state.weekLossPct <= -this.s.weeklyLossPct || this.state.consecutiveLosses >= this.s.maxConsecutiveLosses
    };
  }
}