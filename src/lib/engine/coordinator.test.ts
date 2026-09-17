import { describe, it, expect } from "vitest";
import { DemoMarketDataProvider } from "../providers/demo";
import { AnalysisCoordinator, DEFAULT_ANALYSIS_CONFIG } from "./coordinator";
import { ScalpSignalEngine } from "./scalp";

describe("AnalysisCoordinator + DemoMarketDataProvider integration", () => {
  it("produces scanner rows and at least some signals/futures", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    expect(Object.keys(snapshot.instruments).length).toBeGreaterThan(0);
    expect(snapshot.instruments["EURUSD"]).toBeDefined();
    expect(snapshot.scanner.length).toBeGreaterThan(0);

    const first = snapshot.scanner[0];
    expect(first.price).toBeGreaterThan(0);
    expect(first.trend).toBeTruthy();
    expect(first.trendStrength).toBeGreaterThanOrEqual(0);
    expect(first.trendStrength).toBeLessThanOrEqual(100);

    for (const signal of snapshot.signals) {
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
      if (signal.direction === "BUY") {
        expect(signal.stopLoss).toBeLessThan(signal.entry);
        expect(signal.takeProfits[0]).toBeGreaterThan(signal.entry);
      }
    }
  });

  it("marks every analysis with a regime and session", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();
    for (const analysis of Object.values(snapshot.instruments)) {
      expect(analysis.trend.regime).toBeTruthy();
      expect(analysis.session).toBeTruthy();
      expect(analysis.indicators["5m"]).toBeDefined();
    }
  });

  it("tags demo-fed instruments as SIM and blocks them from producing signals", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    expect(snapshot.instruments["CADJPY"]).toBeDefined();
    expect(snapshot.instruments["CADJPY"].simulated).toBe(true);
    expect(snapshot.signals.length).toBe(0);
    expect(snapshot.scanner.length).toBeGreaterThan(0);
    for (const row of snapshot.scanner) {
      expect(row.simulated).toBe(true);
      expect(row.setup).toBeNull();
    }
  });

  it("runs simulated instruments through the FULL pipeline when allowSimulatedSignals (SIM tagging)", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator({
      ...DEFAULT_ANALYSIS_CONFIG,
      allowSimulatedSignals: true,
    });
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    // SIM bypass: simulated instruments run the real engine now.
    for (const row of snapshot.scanner) {
      expect(row.simulated).toBe(true);
      if (row.setup) expect(row.status).not.toBe("SIM");
    }
    for (const signal of snapshot.signals) {
      expect(signal.simulated).toBe(true);
      // Simulated/observation signals are exempt from the A-grade optimizer
      // (demo demonstration, never tradable), so no gate is applied.
      expect(signal.optimizerGate).toBeUndefined();
    }
    for (const f of snapshot.futureOpportunities) {
      expect(f.simulated).toBe(true);
    }
  });

  it("NEVER emits a counter-trend signal against the higher-timeframe trend (hard trend lock)", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator({
      ...DEFAULT_ANALYSIS_CONFIG,
      moreSignals: false,
      allowSimulatedSignals: true
    });
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    // Universal invariant, valid on every demo day: a BUY may ONLY appear when
    // the higher-timeframe trend is NOT bearish, and a SELL only when it is NOT
    // bullish. Fading a clear HTF trend causes the counter-trend bounce losses.
    for (const signal of snapshot.signals) {
      const htf = (snapshot.instruments[signal.symbol]?.trend.higherTimeframe || "").toUpperCase();
      const bull = htf.includes("BULLISH");
      const bear = htf.includes("BEARISH");
      if (bull === bear) continue; // neutral/conflicting HTF — not counter-trend
      if (bear) expect(signal.direction).not.toBe("BUY");
      if (bull) expect(signal.direction).not.toBe("SELL");
    }
  });

  it("defaults to high-volume signal mode so the signal feed is never empty", async () => {
    const { DEFAULT_SETTINGS } = await import("../settings");
    // Default ON (was OFF) so the feed always has setups; the hard trend lock
    // applies in BOTH modes, so high volume never means counter-trend trades.
    expect(DEFAULT_SETTINGS.moreSignals).toBe(true);
  });

  it("keeps swing thresholds tuned to actually produce trend-aligned swing trades", async () => {
    const { DEFAULT_SWING_CONFIG } = await import("./swing/config");
    // Relaxed baseline (was 80/70) so genuine pullback setups on a real daily
    // trend qualify — the daily-trend alignment + pullback + RR guards remain.
    expect(DEFAULT_SWING_CONFIG.confidenceThresholds.strongScore).toBe(76);
    expect(DEFAULT_SWING_CONFIG.confidenceThresholds.noTradeScore).toBe(66);
  });

  it("relaxed scalp config (the default high-volume engine) trades a real micro-trend", () => {
    // Deterministic synthetic series: a clean uptrend with realistic micro
    // ATR% (~0.03% per bar) — exactly the regime the OLD 0.1% volatility floor
    // blanked as "volatility too low for costs", which is why demo scalps never
    // fired. The relaxed config used by the coordinator must now trade it.
    const M1 = 60_000;
    const makeCandle = (i: number, open: number, close: number): { time: number; open: number; high: number; low: number; close: number; volume: number } => ({
      time: i * M1,
      open,
      high: Math.max(open, close) + 0.01,
      low: Math.min(open, close) - 0.01,
      close,
      volume: 1000
    });
    const m1: any[] = [];
    let price = 100;
    for (let i = 0; i < 920; i++) {
      const inLeg = i % 10 < 6;
      const delta = inLeg ? 0.05 : -0.005;
      const open = price;
      const close = price + delta;
      m1.push(makeCandle(i, open, close));
      price = close;
    }
    const aggregate = (candles: any[], per: number) => {
      const out: any[] = [];
      for (let i = 0; i < candles.length; i += per) {
        const group = candles.slice(i, i + per);
        const last = group[group.length - 1];
        out.push({
          time: last.time,
          open: group[0].open,
          high: Math.max(...group.map((c) => c.high)),
          low: Math.min(...group.map((c) => c.low)),
          close: last.close,
          volume: group.reduce((a, c) => a + c.volume, 0)
        });
      }
      return out;
    };
    const m5 = aggregate(m1, 5);
    const m15 = aggregate(m1, 15);

    const relaxed = new ScalpSignalEngine({
      scoring: { strongScore: 70, minScore: 45 },
      spread: { maxSpreadToStop: 0.5 },
      regime: { atrPctFloor: 0.00002, atrPctCeil: 0.02, adxMin: 10 },
      news: { enabled: false, blackoutBeforeMs: 0, blackoutAfterMs: 0, eventTimes: [] }
    });
    const sig = relaxed.evaluate({
      symbol: "EURUSD",
      assetClass: "forex",
      context: m15,
      setup: m5,
      entry: m1,
      spread: 0.0002,
      price: m1[m1.length - 1].close,
      now: m1.length * M1
    });
    expect(["BUY", "STRONG BUY"]).toContain(sig.verdict);
  });

  it("reuses derived analysis across scans while the candle window is unchanged (event-driven cache)", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const s1 = coordinator.analyze(provider);
    const s2 = coordinator.analyze(provider);
    provider.stop();

    const a1 = s1.instruments["EURUSD"];
    const a2 = s2.instruments["EURUSD"];
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();

    // Top-level is a fresh object (so the caller can tag simulated/etc)…
    expect(a2).not.toBe(a1);
    // …but the heavy candle-derived derivations are shared, not recomputed.
    expect(a2.trend).toBe(a1.trend);
    expect(a2.indicators).toBe(a1.indicators);
    expect(a2.liquidity).toBe(a1.liquidity);

    // Tick-level fields stay fresh on every scan.
    expect(a2.price).toBe(provider.getQuote("EURUSD")!.last);
    expect(a2.session).toBe(a1.session);
  });
});
