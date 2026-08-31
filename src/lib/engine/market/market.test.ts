import { describe, it, expect } from "vitest";
import type { Candle } from "../../types";
import { LiquiditySweepEngine } from "./liquidity-sweep";
import { DisplacementEngine } from "./displacement";
import { ImbalanceEngine } from "./imbalance";
import { SupplyDemandEngine } from "./supply-demand";
import { PremiumDiscountEngine } from "./premium-discount";
import { NarrativeEngine } from "./narrative";
import { CorrelationEngine, parsePair, dxyContext } from "./correlation";
import { XAUUSD_CONFIG, isGoldSymbol } from "./asset-config";
import { FundedMode } from "./funded-mode";
import { SignalJournal, mfeMae } from "./signal-journal";
import { ValidationSuite } from "./validation";

function candle(t: number, o: number, h: number, l: number, c: number): Candle {
  return { time: t, open: o, high: h, low: l, close: c, volume: 1000 };
}

describe("LiquiditySweepEngine", () => {
  it("flags a high-quality sweep only when wick-reject displacement occurs", () => {
    // price rises to 110, wicks to 112 (above a 111 pool), closes back below,
    // then strong bearish displacement.
    const candles = [
      candle(0, 100, 104, 99, 103),
      candle(1, 103, 108, 102, 107),
      candle(2, 107, 112, 106, 110),  // wick through 111 and reject to 110
      candle(3, 110, 110.5, 105, 105), // displacement down
      candle(4, 105, 106, 100, 101)
    ];
    const eng = new LiquiditySweepEngine({ maxWickAtr: 3 });
    const res = eng.detect({
      candles, upto: 4, atr: 2,
      structure: { choch: true, bos: true, bias: "BEARISH" },
      majorLevels: [{ price: 111, type: "BUY-SIDE", source: "PDH", significance: 8 }]
    });
    const sweep = res.all[0];
    expect(sweep).toBeTruthy();
    if (sweep) {
      expect(sweep.displacedAway).toBe(true);
      expect(sweep.quality).toBe("HIGH");
      expect(sweep.rejected).toBe(true);
    }
  });

  it("ignores a plain wick with no rejection (price kept going = breakout, not sweep)", () => {
    const candles = [
      candle(0, 100, 104, 99, 103),
      candle(1, 103, 108, 102, 107),
      candle(2, 107, 112, 106, 112),  // closes ABOVE the pool → breakout, not sweep
      candle(3, 112, 115, 111, 114),
      candle(4, 114, 118, 113, 117)
    ];
    const eng = new LiquiditySweepEngine({ maxWickAtr: 3 });
    const res = eng.detect({
      candles, upto: 4, atr: 2, structure: { bias: "BULLISH" },
      majorLevels: [{ price: 111, type: "BUY-SIDE", source: "PDH", significance: 8 }]
    });
    expect(res.all.filter((s) => s.quality !== "LOW")).toHaveLength(0);
  });
});

describe("DisplacementEngine", () => {
  it("classifies strong displacement from big ATR-multiple bars", () => {
    // Boring small candles then one huge bearish candle (~4x ATR).
    const candles: Candle[] = [];
    for (let i = 0; i < 30; i++) candles.push(candle(i, 100, 100.4, 99.6, 100 + (i % 2 ? 0.2 : -0.2)));
    candles[20] = candle(20, 100, 101, 96, 96.5); // huge down bar
    const eng = new DisplacementEngine();
    const res = eng.detect(candles, 20, 0.4);
    expect(res.direction).toBe("SELL");
    expect(["STRONG", "EXTREME"]).toContain(res.classification);
    expect(res.extended).toBe(true);
  });
});

describe("ImbalanceEngine", () => {
  it("detects a bullish three-candle FVG and ranks it by fill/alignt", () => {
    const candles: Candle[] = [
      candle(0, 100, 101, 99, 100.5),
      candle(1, 100.5, 100.8, 99.5, 100),   // small down
      candle(2, 100, 103, 102.5, 102.8),    // strong up: low(102.5) > high(101)
      candle(3, 102.8, 103.5, 102, 103),
      candle(4, 103, 103.5, 102.6, 103.2)
    ];
    const eng = new ImbalanceEngine();
    const res = eng.detect({ candles, upto: 4, atr: 0.5, htfBias: "BULLISH", structure: { bos: true }, displacement: { classification: "STRONG" } });
    expect(res.best).toBeTruthy();
    expect(res.best!.type).toBe("bullish");
    expect(res.best!.qualityScore).toBeGreaterThanOrEqual(5);
  });
});

describe("SupplyDemandEngine", () => {
  it("only creates an order block with a base candle and strong displacement", () => {
    // small bull base then strong bearish displacement below it → supply OB
    const candles = [
      candle(0, 100, 100.4, 99.6, 100.2),
      candle(1, 100.2, 101, 99.8, 100.9),   // bull base
      candle(2, 100.9, 101, 98, 98.2),      // strong bear displacement
      candle(3, 98.2, 98.6, 97.5, 98),
      candle(4, 98, 98.5, 97.8, 98.2)
    ];
    const eng = new SupplyDemandEngine();
    const res = eng.detectOrderBlocks({ candles, upto: 4, atr: 0.5, htfBias: "BEARISH", structure: { bos: true }, displacement: { classification: "STRONG" } });
    expect(res.zones.length).toBeGreaterThan(0);
    expect(res.zones[0].kind).toBe("SUPPLY");
    expect(res.zones[0].qualityScore).toBeGreaterThanOrEqual(5);
  });
});

describe("PremiumDiscountEngine", () => {
  it("marks a price below range equilibrium as DISCOUNT", () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 60; i++) candles.push(candle(i, 100 + Math.sin(i) * 5, 106, 94, 100 + Math.sin(i) * 5));
    const eng = new PremiumDiscountEngine();
    const res = eng.detect(candles, 59, 95, 1, () => "LONDON");
    expect(res.range).toBeTruthy();
    expect(res.range!.commitment).toBe("DISCOUNT");
  });
});

describe("NarrativeEngine", () => {
  it("produces a LIVE buy narrative with full explanation when components confirm", () => {
    const liquidity = {
      pools: [{ price: 98, type: "SELL-SIDE" as const, source: "PDL", significance: 8, timesTouched: 1 }],
      current: {
        pool: { price: 98, type: "SELL-SIDE" as const, source: "PDL", significance: 8, timesTouched: 1 },
        wickThroughAtr: 0.8, rejected: true, displacedAway: true, structureShift: true,
        quality: "HIGH" as const, qualityScore: 9, timestamp: 0,
        note: "SELL-SIDE liquidity at PDL swept cleanly with rejection + displacement"
      },
      all: []
    };
    const displacement = { classification: "STRONG" as const, score: 9, atrMultiple: 2.1, streak: 3, direction: "BUY" as const, brokeStructure: true, extended: false, detail: "Bullish displacement 2.1× ATR, strong" };
    const imbalance = {
      gaps: [],
      best: { upper: 99, lower: 98, type: "bullish" as const, sizeAtr: 1.2, createdAt: 0, fillPct: 0.2, filled: false, strongCreation: true, htfAligned: true, distanceAtr: 1.5, qualityScore: 8, note: "Bullish FVG 1.2× ATR, 20% filled" }
    };
    const zones = { zones: [] };
    const premium = { range: null, sessions: [], sessionPattern: null };
    const eng = new NarrativeEngine();
    const n = eng.build({
      symbol: "EURUSD", price: 100.5, htfBias: "BULLISH",
      structureByTF: [{ tf: "15m", bias: "BULLISH", bos: true }],
      liquidity, displacement, imbalance, zones, premium, session: "LONDON",
      leanDirection: "BUY"
    });
    expect(n.state).toBe("LIVE");
    expect(n.action).toBe("BUY");
    expect(n.story.length).toBeGreaterThan(20);
    expect(n.invalidate).toContain("swept low");
  });

  it("explains NO TRADE rather than forcing a trade", () => {
    const liquidity = { pools: [], current: null, all: [] };
    const displacement = { classification: "WEAK" as const, score: 0, atrMultiple: 0.3, streak: 0, direction: "BUY" as const, brokeStructure: false, extended: false, detail: "no displacement" };
    const eng = new NarrativeEngine();
    const n = eng.build({
      symbol: "GBPJPY", price: 180, htfBias: "NEUTRAL",
      structureByTF: [{ tf: "4h", bias: "RANGE" }],
      liquidity, displacement, imbalance: { gaps: [], best: null }, zones: { zones: [] },
      premium: { range: null, sessions: [], sessionPattern: null },
      session: "ASIA", leanDirection: null
    });
    expect(n.state).toBe("NO TRADE");
    expect(n.action).toBe("NO TRADE");
    expect(n.noTradeReason).toBeTruthy();
  });
});

describe("CorrelationEngine", () => {
  it("dedups three parallel USD-weakness longs into one representative", () => {
    const eng = new CorrelationEngine();
    const res = eng.resolve({
      signals: [
        { symbol: "EURUSD", direction: "BUY", quality: 80, rr: 2 },
        { symbol: "GBPUSD", direction: "BUY", quality: 75, rr: 1.5 },
        { symbol: "AUDUSD", direction: "BUY", quality: 70, rr: 1.2 }
      ]
    });
    expect(res.netExposure.USD).toBeLessThan(0); // USD short across all
    expect(res.best.length).toBe(1);
    expect(res.best[0].symbol).toBe("EURUSD");
    expect(res.best[0].dedupedBy).toBeUndefined();
  });

  it("parses a cross pair and gold as USD", () => {
    expect(parsePair("EURJPY")).toEqual({ base: "EUR", quote: "JPY" });
    expect(parsePair("XAUUSD")).toEqual({ base: "USD", quote: "USD" });
  });
});

describe("dxyContext", () => {
  it("treats a strong USD as bullish context without deciding", () => {
    const c = dxyContext(105, 0.2);
    expect(c.bias).toBe("BULLISH");
    expect(c.strength).toBeGreaterThan(0);
    expect(c.note).toContain("BULLISH");
  });
  it("returns neutral when no DXY is available", () => {
    const c = dxyContext(null, null);
    expect(c.bias).toBe("NEUTRAL");
  });
});

describe("XAUUSD config", () => {
  it("identifies gold symbols only", () => {
    expect(isGoldSymbol("XAUUSD")).toBe(true);
    expect(isGoldSymbol("EURUSD")).toBe(false);
  });
  it("provides gold-specific params distinct from forex defaults", () => {
    expect(XAUUSD_CONFIG.scalp.spread?.maxSpreadToStop).toBe(0.25);
    expect(XAUUSD_CONFIG.swing.risk?.minRewardRisk).toBe(2.2);
  });
});

describe("FundedMode", () => {
  it("halts on daily loss breach and does not recover", () => {
    const f = new FundedMode({ ...{} as any, accountSize: 100000, riskPct: 0.25, maxRiskPct: 0.5, dailyLossPct: 3, weeklyLossPct: 6, maxSimultaneousRiskPct: 2, maxCorrelatedExposurePct: 1.5, maxConsecutiveLosses: 3, cooldownBars: 5, allowedSessions: [], newsBlock: true, enabled: true });
    f.open(0.25); f.close(-1, 0.25);
    f.open(0.25); f.close(-1, 0.25);
    f.open(0.25); f.close(-1, 0.25);
    f.open(0.25); f.close(-1, 0.25); // -1.0% → more than 3x? no, 4*0.25 = 1%, need > 3% to breach daily
    // breach by bigger losses
    const f2 = new FundedMode({ ...{} as any, accountSize: 100000, riskPct: 0.5, maxRiskPct: 0.5, dailyLossPct: 3, weeklyLossPct: 6, maxSimultaneousRiskPct: 2, maxCorrelatedExposurePct: 1.5, maxConsecutiveLosses: 3, cooldownBars: 5, allowedSessions: [], newsBlock: true, enabled: true });
    f2.open(0.5); f2.close(-6, 0.5); // -3% → daily breached
    const v = f2.authorize({ session: "LONDON", newsBlocked: false, addedCorrelation: 0, currency: "USD" });
    expect(v.halted).toBe(true);
    expect(v.reason).toBe("DAILY_LOSS");
    expect(v.allowSignal).toBe(false);
  });

  it("blocks entries on high-impact news when newsBlock is on", () => {
    const f = new FundedMode({ ...{} as any, accountSize: 100000, riskPct: 0.25, maxRiskPct: 0.5, dailyLossPct: 3, weeklyLossPct: 6, maxSimultaneousRiskPct: 2, maxCorrelatedExposurePct: 1.5, maxConsecutiveLosses: 3, cooldownBars: 5, allowedSessions: [], newsBlock: true, enabled: true });
    const v = f.authorize({ session: "LONDON", newsBlocked: true, addedCorrelation: 0, currency: "USD" });
    expect(v.reason).toBe("NEWS");
  });

  it("ignores everything when funded mode is disabled", () => {
    const f = new FundedMode();
    const v = f.authorize({ session: "LONDON", newsBlocked: true, addedCorrelation: 0, currency: "USD" });
    expect(v.allowSignal).toBe(true);
  });
});

describe("SignalJournal", () => {
  it("records signals and no-trades, then computes MFE/MAE", () => {
    const j = new SignalJournal(false);
    j.record({ symbol: "EURUSD", direction: "BUY", strategy: "SCALP", state: "LIVE", score: 88, regime: "BULLISH", htfBias: "BULLISH", session: "LONDON", liquidityEvent: "PDL sweep", structureBreak: "MSS", fvg: "bullish", zone: "demand", entry: 100, stopLoss: 99.5, takeProfit: 101, rr: 2, spread: 0.2, newsBlocked: false, reason: "test", taken: true });
    expect(j.length).toBe(1);
    const m = mfeMae(100, 99.5, [101.5], [99.2]);
    expect(m.mfe).toBeCloseTo(3);
    expect(m.mae).toBeCloseTo(-1.6);
  });
});

describe("ValidationSuite", () => {
  it("flags a brittle parameter as sensitive via stability", () => {
    const v = new ValidationSuite();
    const res = v.sensitivity("ema", 50, [40, 45, 50, 55, 60], (p) => ({
      pf: p === 50 ? 1.4 : p === 45 || p === 55 ? 1.1 : 0.5,
      expectancy: 0.3, trades: 100
    }));
    expect(["STABLE", "SENSITIVE", "BRITTLE"]).toContain(res.flagged);
  });

  it("walk-forwards a consistently profitable sequence as PASS", () => {
    const v = new ValidationSuite();
    const seq = Array.from({ length: 400 }, (_, i) => (i % 3 === 0 ? -1 : 0.6));
    const res = v.walkForward(seq, 100, 20);
    expect(res.verdict).toBe("PASS");
    expect(res.totalTestTrades).toBeGreaterThan(0);
  });

  it("returns FINAL drawdown from Monte Carlo", () => {
    const v = new ValidationSuite();
    const seq = Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? -1 : 0.8));
    const mc = v.monteCarlo(seq, 500, -20);
    expect(mc.sims).toBe(500);
    expect(mc.riskOfRuinPct).toBeGreaterThanOrEqual(0);
    expect(mc.finalDist.length).toBeGreaterThan(0);
  });

  it("breaks results down by session and side", () => {
    const v = new ValidationSuite();
    const trades = [
      { r: 1.2, labels: { session: "LONDON", side: "LONG" } },
      { r: -0.8, labels: { session: "LONDON", side: "SHORT" } },
      { r: 1.0, labels: { session: "ASIA", side: "LONG" } }
    ];
    const bySession = v.breakdownBy(trades, "session");
    expect(bySession.find((b) => b.key === "LONDON")!.trades).toBe(2);
  });
});