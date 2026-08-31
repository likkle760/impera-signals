import { describe, it, expect } from "vitest";
import type { Candle } from "../../types";
import { ScalpSignalEngine } from "./signal";
import { ScalpGuard } from "./guard";
import { ScalpBacktestEngine } from "./backtest";
import { DEFAULT_SCALP_CONFIG, scalpConfigForAssetClass } from "./config";
import { SCALPING_VALIDATION } from "./index";
import { AnalysisCoordinator } from "../coordinator";
import { DemoMarketDataProvider } from "../../providers/demo";

const M1 = 60_000;
const ENTRIES = 2000;

function makeCandle(time: number, open: number, close: number, extra = 1.5): Candle {
  const high = Math.max(open, close) + extra;
  const low = Math.min(open, close) - extra;
  return { time, open, high, low, close, volume: 1000 };
}

/** Clean ascending staircase on the 1-minute scale: clear HH & HL, strong drift. */
function ascendingStairs1m(n: number, start: number): Candle[] {
  let price = start;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const inLeg = i % 10 < 6;
    const delta = inLeg ? 4 : -0.5;
    const open = price;
    const close = price + delta;
    out.push(makeCandle(i * M1, open, close));
    price = close;
  }
  return out;
}

/** Clean descending staircase on the 1-minute scale. */
function descendingStairs1m(n: number, start: number): Candle[] {
  let price = start;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const inLeg = i % 10 < 6;
    const delta = inLeg ? -4 : 0.5;
    const open = price;
    const close = price + delta;
    out.push(makeCandle(i * M1, open, close));
    price = close;
  }
  return out;
}

/** Literally flat / zero-range market — no trend, no volatility, no structure. */
function flat1m(n: number, start: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ time: i * M1, open: start, high: start, low: start, close: start, volume: 1000 });
  }
  return out;
}

/** Aggregate 1m candles into a larger timeframe labelled by the group's last bar. */
function aggregate(candles: Candle[], per: number): Candle[] {
  const out: Candle[] = [];
  let i = 0;
  while (i < candles.length) {
    const group = candles.slice(i, i + per);
    const last = group[group.length - 1];
    let hi = -Infinity;
    let lo = Infinity;
    let vol = 0;
    for (const c of group) {
      hi = Math.max(hi, c.high);
      lo = Math.min(lo, c.low);
      vol += c.volume;
    }
    out.push({ time: last.time, open: group[0].open, high: hi, low: lo, close: last.close, volume: vol });
    i += per;
  }
  return out;
}

interface Series {
  m1: Candle[];
  m5: Candle[];
  m15: Candle[];
}

function buildSeries(dir: "up" | "down" | "flat"): Series {
  const m1 = dir === "up" ? ascendingStairs1m(ENTRIES, 100)
    : dir === "down" ? descendingStairs1m(ENTRIES, 300)
      : flat1m(ENTRIES, 150);
  return { m1, m5: aggregate(m1, 5), m15: aggregate(m1, 15) };
}

function input(symbol: string, assetClass: string, s: Series, spread: number, now: number) {
  const price = s.m1[s.m1.length - 1].close;
  return { symbol, assetClass, context: s.m15, setup: s.m5, entry: s.m1, spread, price, now };
}

/** Aggressive config that guarantees directional verdicts on a real trend
 *  (for deterministic building-block tests, not a suggestion for live use). */
const RELAXED = {
  scoring: { strongScore: 80, minScore: 0 },
  regime: { adxMin: 0, atrPctFloor: 0, atrPctCeil: 2 },
  momentum: { rsiFloor: 40 }
} as any;

describe("scalpConfigForAssetClass", () => {
  it("applies crypto execution overrides and leaves forex defaults intact", () => {
    const fx = scalpConfigForAssetClass(DEFAULT_SCALP_CONFIG, "forex");
    const cr = scalpConfigForAssetClass(DEFAULT_SCALP_CONFIG, "crypto");
    expect(fx.regime.atrPctCeil).toBe(DEFAULT_SCALP_CONFIG.regime.atrPctCeil);
    expect(cr.regime.atrPctCeil).toBe(0.03);
    expect(cr.spread.maxSpreadToStop).toBe(0.15);
  });
});

describe("ScalpSignalEngine — insufficient data", () => {
  it("returns NO TRADE with an insufficient-history reason", () => {
    const m1 = ascendingStairs1m(20, 100);
    const s = { m1, m5: aggregate(m1, 5), m15: aggregate(m1, 15) };
    const eng = new ScalpSignalEngine();
    const sig = eng.evaluate(input("EURUSD", "forex", s, 0.0002, 20 * M1));
    expect(sig.verdict).toBe("NO TRADE");
    expect(sig.noTradeReason).toContain("insufficient");
  });
});

describe("ScalpSignalEngine — bullish setup", () => {
  it("produces a directional BUILDING-BLOCK bias on a strong uptrend", () => {
    const s = buildSeries("up");
    const eng = new ScalpSignalEngine(RELAXED);
    const sig = eng.evaluate(input("EURUSD", "forex", s, 0.0002, ENTRIES * M1));
    // Deterministic: with relaxed thresholds a genuine uptrend yields BUY.
    expect(["BUY", "STRONG BUY"]).toContain(sig.verdict);
    expect(sig.direction).toBe("BUY");
    expect(sig.score).toBeGreaterThanOrEqual(0);
    expect(sig.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(sig.stopLoss)).toBe(true);
    // Stop below entry for a buy; TP1 above entry.
    expect(sig.stopLoss).toBeLessThan(sig.entryZone[0]);
    expect(sig.takeProfit1).toBeGreaterThan(sig.entryZone[0]);
  });

  it("entry/stop/targets form a valid reward:risk structure when it trades", () => {
    const s = buildSeries("up");
    const eng = new ScalpSignalEngine(RELAXED);
    const sig = eng.evaluate(input("XAUUSD", "metals", s, 0.0002, ENTRIES * M1));
    if (sig.verdict !== "NO TRADE") {
      const stopDist = Math.abs(sig.entryZone[0] - sig.stopLoss);
      const tp1Dist = Math.abs(sig.takeProfit1 - sig.entryZone[0]);
      const tp2Dist = Math.abs(sig.takeProfit2 - sig.entryZone[0]);
      expect(stopDist).toBeGreaterThan(0);
      expect(tp1Dist).toBeGreaterThan(stopDist);
      expect(tp2Dist).toBeGreaterThanOrEqual(tp1Dist);
    }
  });
});

describe("ScalpSignalEngine — bearish setup", () => {
  it("tilts the verdict bearish on a clear downtrend", () => {
    const s = buildSeries("down");
    const eng = new ScalpSignalEngine(RELAXED);
    const sig = eng.evaluate(input("GBPUSD", "forex", s, 0.0002, ENTRIES * M1));
    expect(["SELL", "STRONG SELL"]).toContain(sig.verdict);
    expect(sig.direction).toBe("SELL");
    expect(sig.stopLoss).toBeGreaterThan(sig.entryZone[0]);
    expect(sig.takeProfit1).toBeLessThan(sig.entryZone[0]);
  });
});

describe("ScalpSignalEngine — flat market", () => {
  it("returns NO TRADE on a genuinely flat market (no direction to trade)", () => {
    const s = buildSeries("flat");
    const eng = new ScalpSignalEngine(RELAXED);
    const sig = eng.evaluate(input("AUDUSD", "forex", s, 0.0002, ENTRIES * M1));
    expect(sig.verdict).toBe("NO TRADE");
    expect(sig.noTradeReason).not.toBeNull();
  });
});

describe("ScalpSignalEngine — mandatory spread filter", () => {
  it("blocks when spread is huge relative to the 1m-ATR stop distance", () => {
    const s = buildSeries("up");
    const eng = new ScalpSignalEngine(RELAXED);
    // 1m ATR here is ~3.5 → stop ≈ 5.25; a 10-unit spread swamps the stop.
    const sig = eng.evaluate(input("EURUSD", "forex", s, 10, ENTRIES * M1));
    expect(sig.spreadBlocked).toBe(true);
    if (sig.verdict === "NO TRADE") {
      expect(sig.noTradeReason).toContain("spread");
    }
  });

  it("passes a tiny spread on the same setup", () => {
    const s = buildSeries("up");
    const eng = new ScalpSignalEngine(RELAXED);
    const sig = eng.evaluate(input("EURUSD", "forex", s, 0.0002, ENTRIES * M1));
    expect(sig.spreadBlocked).toBe(false);
  });
});

describe("ScalpSignalEngine — news blackout", () => {
  it("flags blocked-by-news when a major event sits inside the blackout window", () => {
    const s = buildSeries("up");
    const now = ENTRIES * M1;
    const eng = new ScalpSignalEngine({
      ...RELAXED,
      news: { enabled: true, blackoutBeforeMs: 15 * M1, blackoutAfterMs: 5 * M1, eventTimes: [now + 10 * M1] }
    } as any);
    const sig = eng.evaluate(input("XAUUSD", "metals", s, 0.0002, now));
    expect(sig.blockedByNews).toBe(true);
  });

  it("does not flag when the filter is disabled", () => {
    const s = buildSeries("up");
    const now = ENTRIES * M1;
    const eng = new ScalpSignalEngine({
      ...RELAXED,
      news: { enabled: false, newsTimes: [], eventTimes: [now] }
    } as any);
    const sig = eng.evaluate(input("EURUSD", "forex", s, 0.0002, now));
    expect(sig.blockedByNews).toBe(false);
  });
});

describe("ScalpSignalEngine — verdict/score consistency", () => {
  it("directional verdicts always respect scoring thresholds", () => {
    const s = buildSeries("up");
    const eng = new ScalpSignalEngine({ ...RELAXED, scoring: { strongScore: 20, minScore: 10 } } as any);
    const sig = eng.evaluate(input("EURUSD", "forex", s, 0.0002, ENTRIES * M1));
    const strong = ["STRONG BUY", "STRONG SELL"];
    const weak = ["BUY", "SELL"];
    if (strong.includes(sig.verdict)) expect(sig.score).toBeGreaterThanOrEqual(20);
    if (weak.includes(sig.verdict)) {
      expect(sig.score).toBeGreaterThanOrEqual(10);
      expect(sig.score).toBeLessThan(20);
    }
    if (sig.verdict === "NO TRADE") expect(sig.noTradeReason).not.toBeNull();
  });
});

describe("ScalpGuard", () => {
  it("rejects the exact duplicate setup while it is open", () => {
    const g = new ScalpGuard({});
    expect(g.permit("A|t", "LONDON", 0).allow).toBe(true);
    g.open("A|t", "LONDON", 0);
    expect(g.permit("A|t", "LONDON", 0).allow).toBe(false);
    g.close("A|t", 1, 0);
    expect(g.permit("A|t", "LONDON", 0).allow).toBe(true);
  });

  it("halts trading once the daily loss limit is breached", () => {
    const g = new ScalpGuard({ overtrading: { maxTradesPerSession: 50, maxConsecutiveLosses: 5, dailyLossLimitR: 2, cooldownBars: 10, maxOpenPositions: 1 } } as any);
    g.open("s1", "LONDON", 0); g.close("s1", -1.5, 60_000);
    g.open("s2", "LONDON", 120_000); g.close("s2", -1.5, 180_000);
    const r = g.permit("s3", "LONDON", 240_000);
    expect(r.allow).toBe(false);
    expect(r.reason).toContain("daily loss");
  });

  it("enforces a cooldown after consecutive losses", () => {
    const g = new ScalpGuard({ overtrading: { maxTradesPerSession: 50, maxConsecutiveLosses: 2, dailyLossLimitR: 10, cooldownBars: 10, maxOpenPositions: 1 } } as any);
    g.open("a", "LONDON", 0); g.close("a", -1, 60_000);
    g.open("b", "LONDON", 120_000); g.close("b", -1, 180_000);
    // Within the 10-minute cooldown window.
    const r = g.permit("c", "LONDON", 240_000);
    expect(r.allow).toBe(false);
    expect(r.reason).toContain("cooldown");
    // After the cooldown elapses the guard permits again.
    const r2 = g.permit("c", "LONDON", 240_000 + 11 * 60_000);
    expect(r2.allow).toBe(true);
  });

  it("resets the loss streak after a winning trade", () => {
    const g = new ScalpGuard({ overtrading: { maxTradesPerSession: 50, maxConsecutiveLosses: 2, dailyLossLimitR: 10, cooldownBars: 1, maxOpenPositions: 1 } } as any);
    g.open("a", "LONDON", 0); g.close("a", -1, 60_000);
    g.open("b", "LONDON", 120_000); g.close("b", 2, 180_000);
    expect(g.permit("c", "LONDON", 240_000).allow).toBe(true);
  });

  it("caps trades per session", () => {
    const g = new ScalpGuard({ overtrading: { maxTradesPerSession: 1, maxConsecutiveLosses: 9, dailyLossLimitR: 99, cooldownBars: 0, maxOpenPositions: 1 } } as any);
    g.open("a", "LONDON", 0);
    expect(g.permit("b", "LONDON", 60_000).allow).toBe(false);
  });
});

describe("ScalpBacktestEngine", () => {
  it("walks 1-minute bars without look-ahead and reports honest metrics", () => {
    const s = buildSeries("up");
    const bt = new ScalpBacktestEngine();
    const report = bt.run({
      symbol: "EURUSD",
      assetClass: "forex",
      context: s.m15,
      setup: s.m5,
      entry: s.m1,
      spread: 0.0002,
      scenario: "realistic",
      config: { ...RELAXED, holding: { maxBars: 30 }, overtrading: { maxTradesPerSession: 50, maxConsecutiveLosses: 5, dailyLossLimitR: 12, cooldownBars: 6, maxOpenPositions: 1 } },
      eventTimes: []
    });
    expect(report.noLookahead).toBe(true);
    expect(report.candlesTested).toBe(ENTRIES);
    expect(report.costModel.scenario).toBe("realistic");
    expect(report.costModel.spreadPerSide).toBeGreaterThan(0);
    expect(report.costModel.slippagePerSide).toBeGreaterThan(0);
    expect(report.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    for (const t of report.trades) {
      expect(Number.isFinite(t.r)).toBe(true);
      expect(t.barsHeld).toBeGreaterThanOrEqual(0);
    }
  });

  it("produces trades under the stress scenario with all costs applied", () => {
    const s = buildSeries("up");
    const bt = new ScalpBacktestEngine();
    const report = bt.run({
      symbol: "BTCUSDT",
      assetClass: "crypto",
      context: s.m15,
      setup: s.m5,
      entry: s.m1,
      spread: 0.0002,
      scenario: "stress",
      config: { ...RELAXED, overtrading: { maxTradesPerSession: 50, maxConsecutiveLosses: 5, dailyLossLimitR: 12, cooldownBars: 6, maxOpenPositions: 1 }, holding: { maxBars: 60 } },
      eventTimes: []
    });
    expect(report.metrics.totalTrades).toBeGreaterThan(0);
    expect(report.metrics.profitFactor).toBeGreaterThanOrEqual(0);
    expect(report.metrics.avgWinR).toBeDefined();
    expect(report.metrics.bySession).toBeDefined();
    // Stress spreads 1.5x and slippage 2x vs the base model.
    expect(report.costModel.slippagePerSide).toBeGreaterThan(report.costModel.spreadPerSide);
  });
});

describe("SCALPING_VALIDATION gate", () => {
  it("defaults to SCALPING STRATEGY NOT VALIDATED FOR LIVE USE with explicit criteria", () => {
    expect(SCALPING_VALIDATION.validated).toBe(false);
    expect(SCALPING_VALIDATION.status).toBe("SCALPING STRATEGY NOT VALIDATED FOR LIVE USE");
    expect(SCALPING_VALIDATION.criteria.length).toBeGreaterThan(0);
    expect(SCALPING_VALIDATION.lastBacktest.profitFactor).toBeNull();
  });
});

describe("Live-pipeline integration", () => {
  it("emits SCALP signals via the coordinator stamped with the validation note", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coord = new AnalysisCoordinator({
      minSignalScore: 55,
      minLimitScore: 40,
      maxRiskLevel: "HIGH",
      minRiskReward: 1.1,
      enabledTimeframes: ["1m", "3m", "5m", "15m", "30m", "1h", "4h"],
      enabledInstruments: [],
      prioritySymbols: ["XAUUSD"],
      scalpingMode: true,
      dayTradeMode: false,
      swingMode: false,
      scanSeconds: 30
    });
    const snap = coord.analyze(provider);
    const scalp = snap.signals.filter((s) => s.type.startsWith("SCALP"));
    for (const s of scalp) {
      expect(s.validationNote).toBe("SCALPING STRATEGY NOT VALIDATED FOR LIVE USE");
      expect(["SCALP BUY", "SCALP SELL"]).toContain(s.type);
    }
    provider.stop();
  });
});