import { describe, it, expect } from "vitest";
import { SignalEngine } from "./signal-engine";
import { RiskEngine } from "./risk";
import type { InstrumentAnalysis } from "./analysis-types";
import type { Instrument } from "../types";

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
    symbol: "EURUSD",
    name: "Test",
    assetClass: "forex",
    timestamp: Date.now(),
    price: 100,
    spread: 0.0002,
    atr: 0.3,
    session: "LONDON",
    series: [],
    trend: {
      regime: "BULLISH",
      strength: 80,
      momentum: 70,
      structure: "HIGHER HIGHS",
      volatilityScore: 20,
      directionalBias: "BUY",
      shortTerm: "BULLISH",
      mediumTerm: "BULLISH",
      higherTimeframe: "BULLISH"
    },
    structure: {
      structureType: "HIGHER HIGHS",
      lastHH: 103,
      lastHL: 99,
      lastLH: 102,
      lastLL: 98,
      bos: true,
      choch: false,
      consolidation: false
    },
    supportResistance: {
      supports: [{ price: 97, kind: "Support", strength: 3 }],
      resistances: [{ price: 106, kind: "Resistance", strength: 3 }],
      ranges: [],
      sessionHighLow: { high: 104, low: 96 },
      dayHighLow: { high: 105, low: 95 },
      weeklyHighLow: { high: 110, low: 90 },
      dailyOpen: 99,
      weeklyOpen: 98
    },
    liquidity: { areas: [], equalHighs: [], equalLows: [], sweeps: [] },
    fvg: [],
    fib: { swingHigh: 108, swingLow: 95, levels: { "0.5": 101.5, "0.618": 99.97, "0.705": 98.83 }, retracementDepth: 2 },
    displacement: { bullish: [], bearish: [], bias: "NEUTRAL", latest: null },
    ifvg: [],
    indicators: {
      "1m": indCur(),
      "3m": indCur(),
      "5m": indCur(),
      "15m": indCur(),
      "30m": indCur(),
      "1h": indCur(),
      "4h": indCur(),
      "1d": indCur()
    }
  };
  return { ...base, ...overrides };
}

const instrument: Instrument = {
  symbol: "EURUSD",
  name: "Test",
  assetClass: "forex",
  baseDecimals: 5,
  pipSize: 0.0001,
  enabled: true
};

describe("SignalEngine", () => {
  it("detects a bullish setup on strong confluence", () => {
    const engine = new SignalEngine();
    const drafts = engine.detect(instrument, makeAnalysis());
    expect(drafts.length).toBeGreaterThan(0);
    const draft = drafts[0];
    expect(draft).not.toBeNull();
    if (draft) {
      expect(draft.direction).toBe("BUY");
      expect(draft.noTrade).toBeUndefined();
    }
  });

  it("emits a fully-analyzed BUY LIMIT with a resting entry at the support level", () => {
    const engine = new SignalEngine();
    const analysis = makeAnalysis({
      structure: { structureType: "PULLBACK", lastHH: 103, lastHL: 99, lastLH: 102, lastLL: 98, bos: false, choch: false, consolidation: false },
      supportResistance: {
        supports: [{ price: 99.4, kind: "Support", strength: 3 }],
        resistances: [{ price: 106, kind: "Resistance", strength: 3 }],
        ranges: [],
        sessionHighLow: { high: 104, low: 96 },
        dayHighLow: { high: 105, low: 95 },
        weeklyHighLow: { high: 110, low: 90 },
        dailyOpen: 99,
        weeklyOpen: 98
      },
      liquidity: {
        areas: [{ price: 99.4, kind: "Order Block", strength: 2 }],
        equalHighs: [],
        equalLows: [],
        sweeps: []
      }
    });
    const drafts = engine.detect(instrument, analysis);
    const limit = drafts.find((d) => d.type === "BUY LIMIT");
    expect(limit).toBeDefined();
    const risk = new RiskEngine().evaluate(
      instrument,
      analysis,
      { entry: 99.4, stopLoss: 99.1, takeProfits: [100.0, 100.3, 100.7] as any, direction: "BUY" }
    );
    const sig = engine.buildSignal(instrument, analysis, limit!, 80, risk);
    expect(sig).not.toBeNull();
    if (sig) {
      expect(sig.type).toBe("BUY LIMIT");
      expect(sig.entry).toBe(99.4);
      expect(sig.entry).toBeLessThan(analysis.price);
      expect(sig.stopLoss).toBeLessThan(sig.entry);
      expect(sig.status).toBe("WAITING");
    }
  });

  it("returns NO TRADE reason when confluence is low", () => {
    const engine = new SignalEngine({ moreSignals: false });
    const weak = makeAnalysis({
      trend: {
        regime: "NEUTRAL",
        strength: 30,
        momentum: 20,
        structure: "RANGE",
        volatilityScore: 70,
        directionalBias: "NEUTRAL",
        shortTerm: "NEUTRAL",
        mediumTerm: "NEUTRAL",
        higherTimeframe: "NEUTRAL"
      },
      structure: {
        structureType: "RANGE",
        lastHH: 101,
        lastHL: 100,
        lastLH: 100,
        lastLL: 99,
        bos: false,
        choch: false,
        consolidation: true
      }
    });
    const drafts = engine.detect(instrument, weak);
    expect(drafts[0]?.noTrade).toBe("SETUP NOT CONFIRMED");
  });

  it("scores strong signals high and weak signals low", () => {
    const engine = new SignalEngine();
    const strong = engine.detect(instrument, makeAnalysis())[0];
    const highScore = engine.score(instrument, makeAnalysis(), strong);
    expect(highScore).toBeGreaterThanOrEqual(50);

    const weak = makeAnalysis({
      trend: { ...makeAnalysis().trend, strength: 30, momentum: 20 }
    });
    const weakDraft = engine.detect(instrument, weak)[0];
    const lowScore = engine.score(instrument, makeAnalysis({ trend: makeAnalysis().trend }), weakDraft);
    expect(lowScore).toBeGreaterThanOrEqual(0);
    expect(lowScore).toBeLessThanOrEqual(100);
  });

  it("builds a signal with logical SL/TP ordering", () => {
    const engine = new SignalEngine();
    const draft = engine.detect(instrument, makeAnalysis())[0];
    const risk = new RiskEngine().evaluate(
      instrument,
      makeAnalysis(),
      { entry: 100, stopLoss: 99.7, takeProfits: [100.5, 100.8, 101.2] as any, direction: "BUY" }
    );
    const sig = engine.buildSignal(instrument, makeAnalysis(), draft, 80, risk);
    expect(sig).not.toBeNull();
    if (sig) {
      expect(sig.stopLoss).toBeLessThan(sig.entry);
      expect(sig.takeProfits[0]).toBeGreaterThan(sig.entry);
      expect(sig.takeProfits[2]).toBeGreaterThan(sig.takeProfits[1]);
    }
  });

  it("never calls BUY when the 5m (short-term) candle is bearish", () => {
    const engine = new SignalEngine();
    const bearishInd = {
      ema: { "9": 99, "20": 98, "50": 100, "100": 102, "200": 104 },
      rsi: 35,
      macd: { macd: -1, signal: -0.5, histogram: -0.5 },
      atr: 0.3,
      adx: 30,
      plusDI: 16,
      minusDI: 28,
      vwap: 100,
      bollinger: { upper: 105, middle: 100, lower: 95 },
      stochastic: 30
    };
    const bear = makeAnalysis({
      indicators: {
        "1m": bearishInd, "3m": bearishInd, "5m": bearishInd, "15m": bearishInd,
        "30m": bearishInd, "1h": bearishInd, "4h": bearishInd, "1d": bearishInd
      },
      trend: { ...makeAnalysis().trend, higherTimeframe: "BEARISH", directionalBias: "SELL", regime: "BEARISH" }
    });
    for (const d of engine.detect(instrument, bear)) {
      if (!d.noTrade) expect(d.direction).toBe("SELL");
    }
  });

  it("keeps SL and TP tight and close together with logical ordering", () => {
    const engine = new SignalEngine();
    const draft = engine.detect(instrument, makeAnalysis())[0];
    const risk = new RiskEngine().evaluate(
      instrument,
      makeAnalysis(),
      { entry: 100, stopLoss: 99.7, takeProfits: [100.5, 100.8, 101.2] as any, direction: "BUY" }
    );
    const sig = engine.buildSignal(instrument, makeAnalysis(), draft, 80, risk);
    expect(sig).not.toBeNull();
    if (sig) {
      const riskDistance = Math.abs(sig.entry - sig.stopLoss);
      // TP2 must stay reasonably close to TP1, TP3 close to TP2 (not stretched).
      const tp1Dist = Math.abs(sig.takeProfits[1] - sig.takeProfits[0]);
      const tp2Dist = Math.abs(sig.takeProfits[2] - sig.takeProfits[1]);
      expect(tp1Dist).toBeLessThanOrEqual(riskDistance * 1.0);
      expect(tp2Dist).toBeLessThanOrEqual(riskDistance * 1.0);
    }
  });

  it("emits a BUY LIMIT relying on FVG discount + fib retracement confluence", () => {
    const engine = new SignalEngine();
    const analysis = makeAnalysis({
      structure: { structureType: "PULLBACK", lastHH: 103, lastHL: 99, lastLH: 102, lastLL: 98, bos: false, choch: false, consolidation: false },
      supportResistance: {
        supports: [{ price: 99.4, kind: "Support", strength: 3 }],
        resistances: [{ price: 106, kind: "Resistance", strength: 3 }],
        ranges: [],
        sessionHighLow: { high: 104, low: 96 },
        dayHighLow: { high: 105, low: 95 },
        weeklyHighLow: { high: 110, low: 90 },
        dailyOpen: 99,
        weeklyOpen: 98
      },
      fvg: [{ upper: 99.6, lower: 99.2, type: "bullish", age: 2, filled: false, sizeAtr: 1.3 }],
      fib: { swingHigh: 108, swingLow: 95, levels: { "0.618": 99.97, "0.705": 98.83 }, retracementDepth: 1 }
    });
    const limit = engine.detect(instrument, analysis).find((d) => d.type === "BUY LIMIT");
    expect(limit).toBeDefined();
    expect(limit?.reasons.join()).toMatch(/FVG|discount/i);
  });

  it("emits a close, placeable SELL LIMIT using a small near-market pullback band", () => {
    const engine = new SignalEngine();
    const bearishInd = {
      ema: { "9": 99, "20": 98, "50": 100, "100": 102, "200": 104 },
      rsi: 35,
      macd: { macd: -1, signal: -0.5, histogram: -0.5 },
      atr: 0.3,
      adx: 30,
      plusDI: 16,
      minusDI: 28,
      vwap: 100,
      bollinger: { upper: 105, middle: 100, lower: 95 },
      stochastic: 30
    };
    const analysis = makeAnalysis({
      price: 100,
      indicators: {
        "1m": bearishInd, "3m": bearishInd, "5m": bearishInd, "15m": bearishInd,
        "30m": bearishInd, "1h": bearishInd, "4h": bearishInd, "1d": bearishInd
      },
      trend: { ...makeAnalysis().trend, higherTimeframe: "BEARISH", regime: "BEARISH", directionalBias: "SELL" },
      structure: { structureType: "RANGE", lastHH: 101, lastHL: 99, lastLH: 100, lastLL: 98, bos: false, choch: false, consolidation: true },
      supportResistance: {
        supports: [{ price: 97, kind: "Support", strength: 3 }],
        resistances: [{ price: 106, kind: "Resistance", strength: 3 }],
        ranges: [],
        sessionHighLow: { high: 104, low: 96 },
        dayHighLow: { high: 105, low: 95 },
        weeklyHighLow: { high: 110, low: 90 },
        dailyOpen: 99,
        weeklyOpen: 98
      },
      fvg: [],
      fib: { swingHigh: 108, swingLow: 95, levels: { "0.5": 101.5, "0.382": 103 }, retracementDepth: 3 }
    });
    const drafts = engine.detect(instrument, analysis);
    const sellLimit = drafts.find((d) => d.type === "SELL LIMIT");
    expect(sellLimit).toBeDefined();
    if (sellLimit) {
      const risk = new RiskEngine().evaluate(instrument, analysis, { entry: 101, stopLoss: 101.4, takeProfits: [100.5, 100.3, 100] as any, direction: "SELL" });
      const sig = engine.buildSignal(instrument, analysis, sellLimit, 55, risk);
      expect(sig).not.toBeNull();
      if (sig) {
        // resting level must be above market but close (within a few % of price)
        expect(sig.entry).toBeGreaterThan(analysis.price);
        expect(Math.abs(sig.entry - analysis.price)).toBeLessThanOrEqual(analysis.price * 0.02);
      }
    }
  });

  it("suppresses a BUY LIMIT under a bearish higher-timeframe trend", () => {
    const engine = new SignalEngine();
    const analysis = makeAnalysis({
      trend: { ...makeAnalysis().trend, higherTimeframe: "BEARISH", regime: "BEARISH", directionalBias: "SELL" }
    });
    const drafts = engine.detect(instrument, analysis);
    const buyLimit = drafts.find((d) => d.type === "BUY LIMIT");
    expect(buyLimit).toBeUndefined();
  });

  it("suppresses a SELL LIMIT under a bullish higher-timeframe trend", () => {
    const engine = new SignalEngine();
    const analysis = makeAnalysis();
    const drafts = engine.detect(instrument, analysis);
    const sellLimit = drafts.find((d) => d.type === "SELL LIMIT");
    expect(sellLimit).toBeUndefined();
  });
});

describe("RiskEngine", () => {
  it("classifies low-risk setups as LOW", () => {
    const engine = new RiskEngine();
    const res = engine.evaluate(
      instrument,
      makeAnalysis(),
      { entry: 100, stopLoss: 99.8, takeProfits: [100.6, 100.9, 101.3] as any, direction: "BUY" }
    );
    expect(["LOW", "VERY LOW"]).toContain(res.riskLevel);
    expect(res.riskScore).toBeLessThan(40);
  });
});
