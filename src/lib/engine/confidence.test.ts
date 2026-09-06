import { describe, expect, it } from "vitest";
import type { InstrumentAnalysis } from "./analysis-types";
import {
  scoreConfidence,
  gradeLabel,
  winRateTarget,
  gradeConfidence,
  classifyFvg,
  confidenceBand
} from "./confidence";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? T[P] extends (infer U)[]
      ? T[P]
      : DeepPartial<T[P]>
    : T[P];
};

function ind(macdHist: number) {
  return {
    emaFast: 100.5, emaFastPrev: 100.4, emaSlow: 100.2, emaSlowPrev: 100.1,
    emaTrend: 100.1, adx: 28, rsi: 55, macd: { macd: 0, signal: 0, histogram: macdHist }, rsiDivergence: false, ao: 0, cmf: 0, volumeSpike: false
  } as any;
}

function baseAnalysis(overrides: DeepPartial<InstrumentAnalysis> = {}): InstrumentAnalysis {
  const ind5m = ind(1);
  return {
    symbol: "EURUSD",
    name: "EUR/USD",
    assetClass: "forex",
    timestamp: Date.now(),
    price: 1.1,
    spread: 0.0002,
    atr: 0.001,
    trend: {
      directionalBias: "BULLISH",
      higherTimeframe: "BULLISH",
      overlay: [],
      emaFast: 1.1005,
      emaSlow: 1.099,
      emaTrend: 1.098,
      adx: 28,
      volatilityScore: 40,
      momentum: "BUY"
    },
    structure: {
      structureType: "CHANGE OF CHARACTER",
      bos: true,
      choch: true,
      consolidation: false
    },
    supportResistance: {
      supports: [],
      resistances: [{ price: 1.105, type: "resistance", strength: 3, touches: 2 }]
    },
    liquidity: {
      areas: [],
      equalHighs: [],
      equalLows: [],
      sweeps: [{ price: 1.098, type: "LOW", time: Date.now() - 3600_000 }]
    },
    fvg: [
      { upper: 1.101, lower: 1.0995, type: "bullish", age: 1, filled: false, sizeAtr: 1 }
    ],
    fib: { swingHigh: 1.11, swingLow: 1.09, levels: {}, retracementDepth: 1 },
    displacement: { bullish: [{ index: 1, range: 0.003 }], bearish: [], bias: "BUY", latest: { index: 1, range: 0.003 } },
    ifvg: [],
    orderBlocks: { bullish: [{ high: 1.1005, low: 1.099, type: "demand", strength: 1 }], bearish: [], all: [] },
    indicators: { "5m": ind5m, "15m": ind(1), "1h": ind(1.5), "4h": ind(2), "1d": ind(2) },
    session: "LONDON - NEW YORK OVERLAP",
    series: [],
    ...overrides
  } as unknown as InstrumentAnalysis;
}

describe("confidence engine", () => {
  it("grades a fully-aligned setup as A+ / PREMIUM with 90+ confidence", () => {
    const c = scoreConfidence(
      "BUY",
      baseAnalysis(),
      3,
      baseAnalysis().fvg[0]
    );
    expect(c.total).toBeGreaterThanOrEqual(90);
    expect(c.passed).toBe(true);
    expect(c.grade).toBe("PREMIUM SETUP");
    expect(gradeLabel(c.total)).toBe("A+");
    expect(winRateTarget(c.total)).toBeGreaterThanOrEqual(0.8);
    // each section max respected
    expect(c.trend).toBeLessThanOrEqual(20);
    expect(c.structure).toBeLessThanOrEqual(20);
    expect(c.liquidity).toBeLessThanOrEqual(15);
    expect(c.entryZone).toBeLessThanOrEqual(15);
    expect(c.momentum).toBeLessThanOrEqual(10);
    expect(c.riskReward).toBeLessThanOrEqual(10);
    expect(c.session).toBeLessThanOrEqual(10);
    expect(c.trend + c.structure + c.liquidity + c.entryZone + c.momentum + c.riskReward + c.session).toBe(c.total);
  });

  it("fails a flat, trendless setup at the 80 bar → NO TRADE", () => {
    const flat = baseAnalysis({
      trend: { regime: "NEUTRAL", strength: 20, momentum: 20, structure: "RANGE", volatilityScore: 50, directionalBias: "NEUTRAL", shortTerm: "NEUTRAL", mediumTerm: "NEUTRAL", higherTimeframe: "NEUTRAL" },
      structure: { structureType: "RANGE", bos: false, choch: false, consolidation: true },
      liquidity: { areas: [], equalHighs: [], equalLows: [], sweeps: [] },
      fvg: [],
      displacement: { bullish: [], bearish: [], bias: "NEUTRAL", latest: null },
      orderBlocks: { bullish: [], bearish: [], all: [] },
      session: "LOW LIQUIDITY",
      price: 1.1
    });
    const c = scoreConfidence("BUY", flat, 1.2, null);
    expect(c.total).toBeLessThan(80);
    expect(c.passed).toBe(false);
    expect(gradeLabel(c.total)).not.toBe("A+");
  });

  it("respects a custom minimum confidence threshold", () => {
    const c = scoreConfidence("BUY", baseAnalysis(), 3, baseAnalysis().fvg[0], { minConfidence: 95 });
    // A perfect setup lands 90-100, so a 95 bar may or may not pass — the gate is honored either way
    expect(c.passed).toBe(c.total >= 95);
  });

  it("maps confidence bands and letter grades monotonically", () => {
    expect(gradeLabel(95)).toBe("A+");
    expect(gradeLabel(87)).toBe("A");
    expect(gradeLabel(82)).toBe("B");
    expect(gradeLabel(75)).toBe("C");
    expect(gradeLabel(60)).toBe("F");
    expect(gradeConfidence(92)).toBe("PREMIUM SETUP");
    expect(gradeConfidence(86)).toBe("VERY STRONG SETUP");
    expect(gradeConfidence(80)).toBe("HIGH-QUALITY SETUP");
    expect(gradeConfidence(72)).toBe("MODERATE SETUP");
    expect(gradeConfidence(50)).toBe("LOW CONFIDENCE");
    expect(confidenceBand(92)).toBe("90-100");
    expect(confidenceBand(86)).toBe("85-89");
    expect(confidenceBand(81)).toBe("80-84");
    expect(confidenceBand(75)).toBe("70-79");
    expect(confidenceBand(60)).toBe("<70");
  });

  it("classifies FVG quality by the §6 rubric", () => {
    const strong = classifyFvg(
      { upper: 1.101, lower: 1.0995, type: "bullish", age: 1, filled: false, sizeAtr: 1 },
      { htfAligned: true, causedBos: true, liquiditySwept: true, atr: 0.001, price: 1.1 }
    );
    expect(strong.grade).toBe("PREMIUM");
    expect(strong.score).toBeGreaterThanOrEqual(90);

    const weak = classifyFvg(
      { upper: 1.101, lower: 1.0995, type: "bullish", age: 12, filled: true, sizeAtr: 0.1 },
      { htfAligned: false, causedBos: false, liquiditySwept: false, atr: 0.001, price: 1.1 }
    );
    expect(weak.grade).toBe("WEAK");
    expect(weak.score).toBeLessThan(70);
  });

  it("only credits momentum on displacement + BOTH 5m & 15m MACD agreement", () => {
    const displaced = baseAnalysis({
      displacement: { bullish: [{ index: 1, range: 0.003 }], bearish: [], bias: "BUY", latest: { index: 1, range: 0.003 } } as any,
      indicators: { "5m": ind(1), "15m": ind(-1), "1h": ind(1.5), "4h": ind(2), "1d": ind(2) }
    });
    const only5m = scoreConfidence("BUY", displaced, 2, null);
    expect(only5m.details.momentum.confirmed).toBe(false);
    expect(only5m.momentum).toBe(5); // displacement + one lone histogram

    const both = baseAnalysis({
      displacement: { bullish: [{ index: 1, range: 0.003 }], bearish: [], bias: "BUY", latest: { index: 1, range: 0.003 } } as any,
      indicators: {
        "5m": ind(1), "15m": ind(1.2), "1h": ind(1.5), "4h": ind(2), "1d": ind(2)
      }
    });
    const full = scoreConfidence("BUY", both, 2, null);
    expect(full.details.momentum.confirmed).toBe(true);
    expect(full.momentum).toBe(10);

    // No displacement at all → no momentum credit, even if histograms agree
    const noDisp = baseAnalysis({ displacement: { bullish: [], bearish: [], bias: "NEUTRAL", latest: null } as any });
    expect(scoreConfidence("BUY", noDisp, 2, null).momentum).toBe(0);
  });

  it("caps trend credit when the higher timeframe is unconfirmed (NEUTRAL)", () => {
    const neutralHtf = baseAnalysis({
      trend: { regime: "NEUTRAL", strength: 40, momentum: 40, structure: "TRENDING", volatilityScore: 40, directionalBias: "BUY", shortTerm: "BULLISH", mediumTerm: "NEUTRAL", higherTimeframe: "NEUTRAL" }
    });
    const c = scoreConfidence("BUY", neutralHtf, 3, null);
    // 1h + exec + emerging would otherwise reach 15 — hard-capped at 10
    expect(c.trend).toBeLessThanOrEqual(10);
  });

  it("zero-basis veto: no structure/liquidity/zone claim can never pass, even at high R:R", () => {
    const basisless = baseAnalysis({
      trend: { regime: "NEUTRAL", strength: 20, momentum: 20, structure: "RANGE", volatilityScore: 50, directionalBias: "NEUTRAL", shortTerm: "NEUTRAL", mediumTerm: "NEUTRAL", higherTimeframe: "NEUTRAL" },
      structure: { structureType: "RANGE", bos: false, choch: false, consolidation: true },
      liquidity: { areas: [], equalHighs: [], equalLows: [], sweeps: [] },
      fvg: [],
      supportResistance: { supports: [], resistances: [] },
      displacement: { bullish: [], bearish: [], bias: "NEUTRAL", latest: null },
      orderBlocks: { bullish: [], bearish: [], all: [] },
      indicators: {
        "5m": ind(0), "15m": ind(0), "1h": ind(0), "4h": ind(0), "1d": ind(0)
      },
      session: "LONDON - NEW YORK OVERLAP"
    });
    const c = scoreConfidence("BUY", basisless, 3, null, { minConfidence: 70 });
    expect(c.details.chopVeto).toBe(true);
    expect(c.total).toBeLessThanOrEqual(59);
    expect(c.passed).toBe(false);
    expect(c.reasons.some((r) => r.includes("No confluence basis"))).toBe(true);
  });
});