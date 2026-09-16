import { describe, it, expect } from "vitest";
import type { Signal } from "../analysis-types";
import type { HistoryEntry } from "../history";
import { PortfolioRiskEngine, type RiskEvaluationInput } from "./portfolio-risk";
import { DEFAULT_RISK_LIMITS } from "./config";

const now = 1_700_000_000_000;

function baseInput(over: Partial<RiskEvaluationInput> = {}): RiskEvaluationInput {
  return {
    symbol: "EURUSD",
    assetClass: "forex",
    name: "Euro / US Dollar",
    direction: "BUY",
    type: "MARKET BUY",
    entry: 1.1000,
    stopLoss: 1.0988, // 12 pips stop
    takeProfits: [1.1030, 1.1070, 1.1120],
    spread: 0.0001,
    price: 1.1000,
    atr: 0.0008,
    quoteTimestamp: now,
    now,
    simulated: false,
    snapshot: { EURUSD: { price: 1.1 }, GBPUSD: { price: 1.26 }, XAUUSD: { price: 2450 }, USDJPY: { price: 160 } },
    previousOpen: [],
    history: [],
    ...over
  };
}

function approvedSignal(over: Partial<Signal> = {}): Signal {
  return {
    id: `sig-EURUSD-abc-1x1`,
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    assetClass: "forex",
    type: "MARKET BUY",
    direction: "BUY",
    entry: 1.1,
    entryZone: [1.0998, 1.1002],
    stopLoss: 1.0988,
    takeProfits: [1.1030, 1.1070, 1.1120],
    riskReward: 1.5,
    confidence: 80,
    riskLevel: "LOW",
    riskScore: 10,
    timeframes: ["5m", "15m", "1h"],
    trendLabel: "BULLISH",
    setupName: "Bullish Continuation",
    reason: "test",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    session: "LONDON",
    score: 10,
    ...over
  };
}

function historyEntry(direction: "BUY" | "SELL", outcome: HistoryEntry["outcome"], at: number, symbol = "EURUSD"): HistoryEntry {
  return {
    ...approvedSignal({ symbol, direction, entry: 1.1, stopLoss: 1.0988, takeProfits: [1.1030, 1.1070, 1.1120], createdAt: at, updatedAt: at }),
    outcome,
    resultNote: outcome === "won" ? "TP1 reached" : "Stop loss hit",
    riskAnalysis: { decision: "APPROVED", reasons: [], riskPercent: 0.5, riskAmount: 50, positionSize: null, perLotRiskUSD: 0, projectedOpenRiskPct: 0, correlatedExposurePct: 0, openTrades: 0, maxOpenTrades: 4, maxDailyRiskRemainingPct: 2, dailyLossPct: 0, drawdownPct: 0, cooldownActive: false }
  };
}

describe("PortfolioRiskEngine — position sizing", () => {
  it("sizes a forex trade so the monetary loss at stop equals equity × risk%", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, accountEquity: 10_000, maxRiskPerTradePct: 0.5 });
    const d = eng.evaluate(baseInput());
    expect(d.decision).toBe("APPROVED");
    expect(d.riskAmount).toBe(50);
    // stop = 12 pips = 0.0012; per-lot = 0.0012 × 100_000 = $120
    expect(d.perLotRiskUSD).toBeCloseTo(120, 4);
    // lots = 50 / 120 = 0.4167 → margin-safe micro-lot increment
    expect(d.positionSize!.lots).toBeCloseTo(50 / 120, 4);
  });

  it("sizes gold (XAUUSD) using the 100oz contract", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, accountEquity: 10_000, maxRiskPerTradePct: 0.5 });
    const d = eng.evaluate(
      baseInput({ symbol: "XAUUSD", assetClass: "metals", entry: 2450, stopLoss: 2442, atr: 2.5 }) // 8.0 stop
    );
    expect(d.decision).toBe("APPROVED");
    // per-lot loss = 8.00 × $100 = $800
    expect(d.perLotRiskUSD).toBeCloseTo(800, 4);
    expect(d.positionSize!.lots).toBeCloseTo(50 / 800, 4);
  });

  it("converts cross-pair risk into USD using snapshot prices", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, accountEquity: 100_000, maxRiskPerTradePct: 0.5 });
    const d = eng.evaluate(baseInput({ symbol: "EURJPY", type: "MARKET BUY", entry: 160, stopLoss: 159.6, price: 160 }));
    // stop 0.4 x 100k = 40,000 JPY; EURJPY 160 → USD per 1 JPY = 1/160 → $250
    expect(d.perLotRiskUSD).toBeCloseTo(250, 1);
  });

  it("blocks the trade when the stop is invalid", () => {
    const eng = new PortfolioRiskEngine(DEFAULT_RISK_LIMITS);
    const d = eng.evaluate(baseInput({ entry: 1.1, stopLoss: 1.1 }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/Stop-loss distance is invalid/);
  });
});

describe("PortfolioRiskEngine — portfolio limits", () => {
  it("rejects when already at the max open trades", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxOpenTrades: 2 });
    const opens = [approvedSignal({ symbol: "GBPUSD" }), approvedSignal({ symbol: "AUDUSD" })];
    const d = eng.evaluate(baseInput({ previousOpen: opens }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/max open trades/);
  });

  it("rejects when total open risk would exceed the limit", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxTotalOpenRiskPct: 1 });
    const opens = [
      approvedSignal({ symbol: "GBPUSD", riskAnalysis: { decision: "APPROVED", reasons: [], riskPercent: 0.8, riskAmount: 80, positionSize: null, perLotRiskUSD: 0, projectedOpenRiskPct: 0, correlatedExposurePct: 0, openTrades: 1, maxOpenTrades: 4, maxDailyRiskRemainingPct: 2, dailyLossPct: 0, drawdownPct: 0, cooldownActive: false } })
    ];
    const d = eng.evaluate(baseInput({ previousOpen: opens }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/Portfolio risk would/);
  });

  it("blocks correlated exposure on the same currency", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxCorrelatedRiskPct: 0.5 });
    // Existing GBPUSD long exposes GBP (0.5%) — adding EURUSD long shares the
    // same USD quote leg and would push EUR+GBP correlated risk past the cap.
    const opens = [approvedSignal({ symbol: "GBPUSD" })];
    const d = eng.evaluate(baseInput({ previousOpen: opens }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/correlated exposure/i);
  });

  it("approves when correlated exposure stays under the cap", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxCorrelatedRiskPct: 2 });
    const opens = [approvedSignal({ symbol: "GBPUSD" })];
    const d = eng.evaluate(baseInput({ previousOpen: opens }));
    expect(d.decision).toBe("APPROVED");
  });
});

describe("PortfolioRiskEngine — ledger halts", () => {
  it("halts new trades when the daily loss limit is hit", () => {
    const eng = new PortfolioRiskEngine({
      ...DEFAULT_RISK_LIMITS,
      accountEquity: 10_000,
      maxRiskPerTradePct: 0.5,
      maxDailyLossPct: 4,
      maxConsecutiveLosses: 20, // won't trigger before the loss limit
      maxDrawdownPct: 100      // won't trigger
    });
    // 10 losses × 0.5% = 5% realized daily loss ≥ the 4% limit
    const history = Array.from({ length: 10 }, (_, i) =>
      historyEntry(i % 2 ? "BUY" : "SELL", "lost", now - (i + 1) * 3_600_000)
    );
    const d = eng.evaluate(baseInput({ history }));
    expect(d.dailyLossPct).toBeGreaterThanOrEqual(4);
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/Daily loss limit/);
  });

  it("enters cooldown after the max consecutive losses", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxConsecutiveLosses: 2 });
    // 2 losses on a DIFFERENT symbol so recentSymbolLoss won't override the verdict
    const history = [
      historyEntry("BUY", "lost", now - 3_600_000, "GBPUSD"),
      historyEntry("SELL", "lost", now - 2_600_000, "GBPUSD")
    ];
    const d = eng.evaluate(baseInput({ history }));
    expect(d.cooldownActive).toBe(true);
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/consecutive losses/);
  });

  it("resets the loss streak after a win", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxConsecutiveLosses: 2 });
    // History: loss, win, loss on OTHER symbols so recentSymbolLoss is false
    const history = [
      historyEntry("BUY", "lost", now - 3_600_000, "GBPUSD"),
      historyEntry("BUY", "won", now - 2_600_000, "GBPUSD"),
      historyEntry("SELL", "lost", now - 1_600_000, "AUDUSD")
    ];
    const d = eng.evaluate(baseInput({ history }));
    expect(d.cooldownActive).toBe(false);
    expect(d.decision).toBe("APPROVED");
  });

  it("flags a recent stop-out on the same symbol as a re-entry cooldown", () => {
    const eng = new PortfolioRiskEngine(DEFAULT_RISK_LIMITS);
    const history = [historyEntry("BUY", "lost", now - 5 * 60_000, "EURUSD")];
    const d = eng.evaluate(baseInput({ symbol: "EURUSD", history }));
    expect(d.cooldownActive).toBe(true);
    expect(d.problems.join(" ")).toMatch(/re-entry cooldown/);
  });

  it("halts on maximum drawdown", () => {
    const eng = new PortfolioRiskEngine({
      ...DEFAULT_RISK_LIMITS,
      maxDrawdownPct: 3,
      maxConsecutiveLosses: 20, // won't interfere
      accountEquity: 10_000,
      maxRiskPerTradePct: 0.5,
      maxDailyLossPct: 100  // won't interfere
    });
    // 10 losses × 0.5% = 5% drawdown from peak, exceeding the 3% cap
    const history = Array.from({ length: 10 }, (_, i) =>
      historyEntry(i % 2 ? "BUY" : "SELL", "lost", now - (i + 1) * 3_600_000)
    );
    const d = eng.evaluate(baseInput({ history }));
    expect(d.drawdownPct).toBeGreaterThan(3);
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/Maximum drawdown/);
  });

  it("does NOT enforce portfolio/ledger halts on SIM observation signals", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxOpenTrades: 0, maxTotalOpenRiskPct: 0, maxDailyLossPct: 0 });
    // Even with impossibly restrictive limits, a SIM signal's data-quality and
    // sizing checks still run but decision stays APPROVED (observational only).
    const d = eng.evaluate(baseInput({ simulated: true }));
    expect(d.decision).toBe("APPROVED");
  });
});

describe("PortfolioRiskEngine — data-quality guards", () => {
  it("rejects stale market data", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, staleMs: 45_000 });
    const d = eng.evaluate(baseInput({ quoteTimestamp: now - 90_000 }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/stale/i);
  });

  it("rejects when spread eats too much of the stop distance", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxSpreadToStopPct: 0.25 });
    // spread 0.0010 vs stop distance 0.0012 → spread/stop = 83% >> 25%
    const d = eng.evaluate(baseInput({ spread: 0.001 }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/Spread is/);
  });

  it("rejects abnormal volatility", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxVolatilityScore: 60 });
    const d = eng.evaluate(baseInput({ volatilityScore: 90 }));
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/volatility/i);
  });
});

describe("PortfolioRiskEngine — daily risk budget", () => {
  it("limits committed risk in a rolling 24h window", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxDailyRiskPct: 1.0 });
    eng.commit("sig-A", "EURUSD", 0.4, now);
    eng.commit("sig-B", "GBPUSD", 0.4, now);
    const d = eng.evaluate(baseInput());
    expect(d.decision).toBe("REJECTED");
    expect(d.problems.join(" ")).toMatch(/Daily risk budget/);
  });

  it("approves when the day still has budget", () => {
    const eng = new PortfolioRiskEngine({ ...DEFAULT_RISK_LIMITS, maxDailyRiskPct: 3 });
    eng.commit("sig-A", "EURUSD", 0.4, now);
    const d = eng.evaluate(baseInput());
    expect(d.decision).toBe("APPROVED");
    expect(d.maxDailyRiskRemainingPct).toBeGreaterThan(1);
  });
});