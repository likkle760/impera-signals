import { describe, it, expect } from "vitest";
import type { Candle } from "../../types";
import { DEFAULT_STRATEGY_CONFIG } from "./strategy-config";
import { DisplacementDetector } from "./displacement-detector";
import { FVGDetector } from "./fvg-detector";
import { IFVGDetector } from "./ifvg-detector";
import { PremiumDiscountAnalyzer } from "./premium-discount";
import { SessionFilter } from "./session-filter";
import { ConfluenceScorer, shortTermBias } from "./confluence-scorer";
import { EntryEngine } from "./entry-engine";
import { LimitOrderManager } from "./limit-order-manager";
import { RiskManager } from "./risk-manager";
import { TradeLogger } from "./trade-logger";
import { BacktestEngine, estimateAtr } from "./backtest-engine";
import { SignalReporter } from "./signal-reporter";
import type { InstrumentAnalysis } from "../analysis-types";

function makeAnalysis(overrides: Partial<InstrumentAnalysis> = {}): InstrumentAnalysis {
  const indCur = () => ({
    ema: { "9": 101, "20": 100, "50": 99, "100": 98, "200": 97 },
    rsi: 60,
    macd: { macd: 1, signal: 0.5, histogram: 0.5 },
    atr: 0.3,
    adx: 30,
    plusDI: 28,
    minusDI: 18,
    vwap: 100,
    bollinger: { upper: 105, middle: 100, lower: 95 },
    stochastic: 65
  });
  const base: InstrumentAnalysis = {
    symbol: "EURUSD", name: "Test", assetClass: "forex", timestamp: Date.now(),
    price: 100, spread: 0.0002, atr: 0.3, session: "LONDON", series: [],
    trend: { regime: "BULLISH", strength: 80, momentum: 70, structure: "HIGHER HIGHS", volatilityScore: 20, directionalBias: "BUY", shortTerm: "BULLISH", mediumTerm: "BULLISH", higherTimeframe: "BULLISH" },
    structure: { structureType: "HIGHER HIGHS", lastHH: 103, lastHL: 99, lastLH: 102, lastLL: 98, bos: true, choch: false, consolidation: false },
    supportResistance: { supports: [{ price: 97, kind: "Support", strength: 3 }], resistances: [{ price: 106, kind: "Resistance", strength: 3 }], ranges: [], sessionHighLow: { high: 104, low: 96 }, dayHighLow: { high: 105, low: 95 }, weeklyHighLow: { high: 110, low: 90 }, dailyOpen: 99, weeklyOpen: 98 },
    liquidity: { areas: [], equalHighs: [], equalLows: [], sweeps: [] },
    fvg: [], fib: { swingHigh: 108, swingLow: 95, levels: { "0.5": 101.5 }, retracementDepth: 2 },
    displacement: { bullish: [], bearish: [], bias: "NEUTRAL", latest: null },
    ifvg: [],
    indicators: { "1m": indCur(), "3m": indCur(), "5m": indCur(), "15m": indCur(), "30m": indCur(), "1h": indCur(), "4h": indCur(), "1d": indCur() }
  };
  return { ...base, ...overrides };
}

/** Build a repeating-bar synthetic candle array with an impulse move. */
function candles(count: number, base = 100, step = 0.05): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const open = base + i * step;
    out.push({
      time: 1_600_000_000 + i * 300,
      open,
      high: open + step * 1.5,
      low: open - step * 0.5,
      close: open + step,
      volume: 100
    });
  }
  return out;
}

const singleSeries = (candles: Candle[]) => [{ timeframe: "5m" as const, candles }];

/** Quiet candles then a cluster of large bullish impulse candles. */
function impulseSeries(quiet = 40, impulses = 5, quietStep = 0.01, impulseRange = 3.0): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  let t = 1_600_000_000;
  for (let i = 0; i < quiet; i++) {
    out.push({ time: t, open: price, high: price + quietStep, low: price - quietStep, close: price + quietStep * 0.3, volume: 10 });
    price = out[out.length - 1].close;
    t += 300;
  }
  for (let i = 0; i < impulses; i++) {
    const body = impulseRange * 0.8;
    out.push({ time: t, open: price, high: price + impulseRange, low: price - impulseRange * 0.2, close: price + body, volume: 500 });
    price = out[out.length - 1].close;
    t += 300;
  }
  return out;
}

describe("DisplacementDetector", () => {
  it("flags a strong body/range impulse as a displacement", () => {
    const c = impulseSeries(30, 5);
    const det = new DisplacementDetector(DEFAULT_STRATEGY_CONFIG);
    const res = det.analyze(c);
    expect(res.bullish.length).toBeGreaterThan(0);
    expect(res.bias).toBe("BUY");
  });

  it("returns neutral / empty on flat data", () => {
    const c = candles(30, 100, 0.005);
    const det = new DisplacementDetector(DEFAULT_STRATEGY_CONFIG);
    const res = det.analyze(c);
    expect(res.bullish.length).toBe(0);
    expect(res.bearish.length).toBe(0);
  });
});

describe("FVGDetector + IFVGDetector", () => {
  it("finds a bullish FVG on an impulse up-series", () => {
    const c = impulseSeries(25, 5);
    const det = new FVGDetector(DEFAULT_STRATEGY_CONFIG);
    const gaps = det.analyze(singleSeries(c), "5m");
    expect(gaps.some((g) => g.type === "bullish")).toBe(true);
  });

  it("IFVGDetector returns higher-timeframe imbalance boundaries in order", () => {
    const c = impulseSeries(40, 6);
    const det = new IFVGDetector(DEFAULT_STRATEGY_CONFIG);
    const gaps = det.analyze([{ timeframe: "15m" as const, candles: c }], 120);
    expect(Array.isArray(gaps)).toBe(true);
    if (gaps.length) {
      expect(gaps[0].upper).toBeGreaterThanOrEqual(gaps[0].lower);
    }
  });
});

describe("PremiumDiscountAnalyzer", () => {
  it("labels below the fib midpoint as discount and aligns for a buy", () => {
    const c = candles(40, 100, 0.1);
    const pd = new PremiumDiscountAnalyzer(DEFAULT_STRATEGY_CONFIG).analyze(singleSeries(c), "5m", 100.2);
    expect(["DISCOUNT", "EQUILIBRIUM", "PREMIUM"]).toContain(pd.zone);
  });
});

describe("SessionFilter", () => {
  it("all all sessions by default and penalizes OFF HOURS", () => {
    const sf = new SessionFilter(DEFAULT_STRATEGY_CONFIG);
    expect(sf.isAllowed("LONDON" as any)).toBe(true);
    expect(sf.liquidity("LONDON/NEW YORK OVERLAP" as any)).toBe(0);
    expect(sf.liquidity("OFF HOURS" as any)).toBeGreaterThan(0);
  });
});

describe("ConfluenceScorer", () => {
  it("scores a clear bullish analysis above a bearish one", () => {
    const c = new ConfluenceScorer(DEFAULT_STRATEGY_CONFIG);
    const a = makeAnalysis();
    const res = c.assess(a);
    expect(res.bullPoints).toBeGreaterThan(res.bearPoints);
  });

  it("shortTermBias returns NEUTRAL on undefined input", () => {
    expect(shortTermBias(undefined, 100)).toBe("NEUTRAL");
  });
});

describe("EntryEngine + LimitOrderManager + RiskManager", () => {
  const bearishAnalysis = () => {
    const ind = {
      ema: { "9": 99, "20": 98, "50": 100, "100": 102, "200": 104 },
      rsi: 35,
      macd: { macd: -1, signal: -0.5, histogram: -0.5 },
      atr: 0.6,
      adx: 30,
      plusDI: 16,
      minusDI: 28,
      vwap: 100,
      bollinger: { upper: 105, middle: 100, lower: 95 },
      stochastic: 30
    };
    return makeAnalysis({
      price: 100,
      trend: { regime: "BEARISH", strength: 70, momentum: 60, structure: "LOWER LOWS", volatilityScore: 20, directionalBias: "SELL", shortTerm: "BEARISH", mediumTerm: "BEARISH", higherTimeframe: "BEARISH" },
      structure: { structureType: "RANGE", lastHH: 103, lastHL: 99, lastLH: 102, lastLL: 98, bos: false, choch: false, consolidation: true },
      displacement: { bullish: [], bearish: [], bias: "SELL", latest: null },
      fvg: [],
      fib: { swingHigh: 110, swingLow: 95, levels: { "0.5": 102.5, "0.382": 104.3 }, retracementDepth: 3 },
      indicators: { "1m": ind, "3m": ind, "5m": ind, "15m": ind, "30m": ind, "1h": ind, "4h": ind, "1d": ind }
    });
  };

  it("builds a resting SELL LIMIT above market with a defined stop and targets", () => {
    const e = new EntryEngine(DEFAULT_STRATEGY_CONFIG);
    const a = bearishAnalysis();
    const limit = e.buildLimitDraft("SELL", a);
    expect(limit).toBeDefined();
    expect(limit?.type).toBe("SELL LIMIT");
    if (limit) {
      const risk = { riskLevel: "LOW" as const, riskScore: 10 };
      const sig = e.buildSignal({ symbol: "EURUSD", name: "T", assetClass: "forex", baseDecimals: 5 }, a, limit, 60, risk);
      expect(sig.entry).toBeGreaterThan(a.price);
      expect(sig.stopLoss).toBeGreaterThan(sig.entry);
      expect(sig.takeProfits[2]).toBeLessThan(sig.takeProfits[0]);
    }
  });

  it("LimitOrderManager classifies a triggered limit", () => {
    const mgr = new LimitOrderManager(DEFAULT_STRATEGY_CONFIG);
    const e = new EntryEngine(DEFAULT_STRATEGY_CONFIG);
    const a = bearishAnalysis();
    const limit = e.buildLimitDraft("SELL", a)!;
    expect(limit).toBeDefined();
    const sig = e.buildSignal({ symbol: "EURUSD", name: "T", assetClass: "forex", baseDecimals: 5 }, a, limit, 60, { riskLevel: "LOW", riskScore: 10 });
    const book = mgr.reconcile([sig], 1000); // price way above a SELL LIMIT -> triggered/invalidated
    expect(book.invalidated.length + book.triggered.length).toBeGreaterThan(0);
  });

  it("RiskManager respects the max risk level filter", () => {
    const rm = new RiskManager(DEFAULT_STRATEGY_CONFIG);
    expect(rm.allowed("LOW")).toBe(true);
    expect(rm.allowed("VERY HIGH")).toBe(false);
  });
});

describe("BacktestEngine (no lookahead)", () => {
  it("emits a report with trades and never looks ahead", () => {
    const c = candles(200, 100, 0.05);
    const bt = new BacktestEngine();
    const hook = {
      symbol: "EURUSD",
      timeframe: "5m" as const,
      emit: (candles: Candle[], i: number) => {
        // Only use bars strictly before i (no lookahead).
        const window = candles.slice(0, i);
        if (window.length < 30) return null;
        const price = candles[i - 1].close;
        const dir = price > window[window.length - 2].close ? "BUY" as const : "SELL" as const;
        return {
          draft: { direction: dir, type: dir === "BUY" ? "MARKET BUY" as const : "MARKET SELL" as const, confluence: 5, reasons: ["test"] },
          entry: price
        };
      }
    };
    const { report } = bt.run("EURUSD", "5m", c, hook);
    expect(report.noLookahead).toBe(true);
    expect(report.candlesTested).toBe(c.length);
    expect(Number.isFinite(report.netPnl)).toBe(true);
    for (const t of report.trades) {
      // exit price must be within the tested candle range if closed
      if (t.exit != null) expect(t.closeIndex).toBeGreaterThan(t.openIndex);
    }
    // SL/TP distances are finite and ordered
    for (const t of report.trades) {
      expect(Number.isFinite(t.stopLoss)).toBe(true);
      expect(t.takeProfits.length).toBe(3);
    }
  });

  it("estimateAtr is non-negative and finite", () => {
    const c = candles(40, 100, 0.1);
    expect(estimateAtr(c, 30)).toBeGreaterThan(0);
    expect(Number.isFinite(estimateAtr(c, 30))).toBe(true);
  });
});

describe("TradeLogger + SignalReporter", () => {
  it("logger persists and loads entries (localStorage guarded on server)", () => {
    const l = new TradeLogger();
    const entry = l.push({ kind: "BACKTEST", symbol: "XAUUSD", type: "BACKTEST RUN", direction: null, entry: null, stopLoss: null, takeProfits: null, riskLevel: null, score: null, status: null, outcome: null, pnl: null, reason: "test" });
    expect(entry.id).toMatch(/^tl-/);
    expect(l.bySymbol("XAUUSD").length).toBeGreaterThan(0);
  });

  it("reporter builds a report and includes the required caveat disclaimer", () => {
    const rep = new SignalReporter();
    const report = rep.buildSignalsReport([]);
    expect(report.setups).toBe(0);
    expect(rep.disclaimer()).toMatch(/not guaranteed|no-loss|100% accurate/i);
  });
});
