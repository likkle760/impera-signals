import type { Instrument, MarketRegime, NoTradeReason, RiskLevel, Timeframe } from "../types";
import { ALL_TIMEFRAMES } from "../instruments";
import type { MarketDataProvider } from "../providers/types";
import type {
  AnalysisSnapshot,
  FutureOpportunity,
  InstrumentAnalysis,
  ScannerRow,
  Signal
} from "./analysis-types";
import { MarketStructureEngine } from "./market-structure";
import { TrendEngine } from "./trend";
import { TechnicalAnalysisEngine } from "./technical-analysis";
import { SupportResistanceEngine } from "./support-resistance";
import { LiquidityEngine } from "./liquidity";
import { IctAnalysisEngine } from "./ict-analysis";
import { RiskEngine } from "./risk";
import { SignalEngine, DraftSignal } from "./signal-engine";
import { FutureOpportunityEngine } from "./future-opportunity";
import { getCurrentSession } from "./session";
import { DisplacementDetector } from "./strategy/displacement-detector";
import { IFVGDetector } from "./strategy/ifvg-detector";
import { DEFAULT_STRATEGY_CONFIG } from "./strategy/strategy-config";
import { clamp } from "../utils";
import { evaluateSignal } from "./signal-intelligence";
import { buildMarketIntel } from "./market/market-intel";
import { InstitutionalEntryEngine } from "./market/institutional-entry";

export interface AnalysisConfig {
  minSignalScore: number;
  minLimitScore: number;
  maxRiskLevel: "VERY LOW" | "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH";
  minRiskReward: number;
  enabledTimeframes: Timeframe[];
  enabledInstruments: string[];
  /** Symbols the user focuses on (e.g. XAUUSD). Scanned first + sorted to the top. */
  prioritySymbols: string[];
  scalpingMode: boolean;
  dayTradeMode: boolean;
  swingMode: boolean;
  scanSeconds: number;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  minSignalScore: 55,
  minLimitScore: 40,
  maxRiskLevel: "HIGH",
  minRiskReward: 1.1,
  enabledTimeframes: ALL_TIMEFRAMES,
  enabledInstruments: [],
  prioritySymbols: ["XAUUSD"],
  scalpingMode: true,
  dayTradeMode: true,
  swingMode: true,
  scanSeconds: 30
};

const SESSION_LIQUIDITY: Record<string, number> = {
  "LONDON/NEW YORK OVERLAP": 0,
  "LONDON": 0.15,
  "NEW YORK": 0.2,
  "ASIA": 0.5,
  "OFF HOURS": 0.7
};

/**
 * Session-liquidity penalty for an instrument. Crypto trades 24/7 — it is never
 * "off hours" — so crypto gets no session penalty even while FX/metals/indices
 * are sitting in OFF HOURS. This keeps BTCUSD, SOLUSD, ETHUSD etc. emitting
 * signals around the clock.
 */
export function sessionLiquidityFor(instrument: Instrument, session: string): number {
  if (instrument.assetClass === "crypto") return 0;
  return SESSION_LIQUIDITY[session] ?? 0.5;
}

export class AnalysisCoordinator {
  private structure = new MarketStructureEngine();
  private trend = new TrendEngine();
  private ta = new TechnicalAnalysisEngine();
  private sr = new SupportResistanceEngine();
  private liquidity = new LiquidityEngine();
  private ict = new IctAnalysisEngine();
  private risk = new RiskEngine();
  private signalEngine: SignalEngine;
  private futureEngine = new FutureOpportunityEngine();

  constructor(private config: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) {
    this.signalEngine = new SignalEngine({
      minSignalScore: config.minSignalScore,
      maxRiskLevel: config.maxRiskLevel,
      minRiskReward: config.minRiskReward,
      enabledTimeframes: config.enabledTimeframes,
      enabledModes: { scalp: config.scalpingMode, dayTrade: config.dayTradeMode, swing: config.swingMode }
    });
  }

  analyze(provider: MarketDataProvider): AnalysisSnapshot {
    const instruments = provider.getSymbols().filter((i) =>
      this.config.enabledInstruments.length === 0
        ? true
        : this.config.enabledInstruments.includes(i.symbol)
    );
    instruments.sort((a, b) => {
      const ai = this.config.prioritySymbols.includes(a.symbol) ? 0 : 1;
      const bi = this.config.prioritySymbols.includes(b.symbol) ? 0 : 1;
      return ai - bi;
    });

    const snapshot: AnalysisSnapshot = {
      timestamp: Date.now(),
      instruments: {},
      signals: [],
      futureOpportunities: [],
      scanner: []
    };

    for (const instrument of instruments) {
      const analysis = this.analyzeInstrument(provider, instrument);
      if (!analysis) continue;
      // Mark instruments whose data comes from a simulated/demo feed so the UI
      // can tag them [SIM] and so they never produce a tradable signal.
      analysis.simulated = provider.isSimulatedSymbol?.(instrument.symbol) ?? !provider.isLive;
      snapshot.instruments[instrument.symbol] = analysis;

      // Simulated-only instruments must NOT generate buy/sell/limit/swing
      // signals or futures — their prices are synthetic, not real.
      if (analysis.simulated) {
        snapshot.scanner.push({
          symbol: instrument.symbol,
          name: instrument.name,
          assetClass: instrument.assetClass,
          price: analysis.price,
          trend: analysis.trend.regime,
          trendStrength: analysis.trend.strength,
          setup: null,
          direction: null,
          signalScore: null,
          risk: null,
          riskScore: null,
          rr: null,
          timeframes: [],
          status: "SIM",
          updatedAt: analysis.timestamp,
          noTradeReason: null,
          simulated: true
        });
        continue;
      }

      const drafts = this.signalEngine.detect(instrument, analysis);
      const noTradeDraft = drafts.find((d) => d.noTrade) ?? null;
      const scannerRow = this.buildScannerRow(instrument, analysis, drafts, noTradeDraft);
      snapshot.scanner.push(scannerRow);

      if (drafts.some((d) => d && !d.noTrade)) {
        for (const draft of drafts) {
          if (!draft || draft.noTrade) continue;
          const score = this.signalEngine.score(instrument, analysis, draft);
          const isLimit = draft.type.includes("LIMIT");
          const minForThis = isLimit ? this.config.minLimitScore : this.config.minSignalScore;
          if (score >= minForThis) {
            const riskRes = this.risk.evaluate(
              instrument,
              analysis,
              {
                entry: analysis.price,
                stopLoss: analysis.price - (analysis.atr || analysis.price * 0.002),
                takeProfits: [0, 0, 0],
                direction: draft.direction
              },
              0,
              sessionLiquidityFor(instrument, analysis.session)
            );
            const signal = this.signalEngine.buildSignal(
              instrument,
              analysis,
              draft,
              score,
              riskRes
            );
            if (signal && riskAllowed(riskRes.riskLevel, this.config.maxRiskLevel)) {
              const primarySeries = analysis.series.find((s) => s.timeframe === "5m") ?? analysis.series[0];
              const intel = evaluateSignal(signal, analysis, primarySeries?.candles ?? []);
              signal.confidence = intel.confidence;
              signal.winRate = intel.winRate ? Number((intel.winRate.winRate * 100).toFixed(0)) : undefined;
              signal.winRateTrades = intel.winRate?.trades;
              signal.newsVerdict = intel.verdict;
              const mi = buildMarketIntel(analysis);
              signal.narrative = {
                state: mi.narrative.state,
                action: mi.narrative.action,
                headline: mi.narrative.headline,
                story: mi.narrative.story,
                confirm: mi.narrative.confirm,
                invalidate: mi.narrative.invalidate ?? null,
                noTradeReason: mi.narrative.noTradeReason ?? null,
                liquidity: mi.liquidityEvent
              };
              signal.correlationNote = mi.correlationNote;

              // ── Institutional entry gate (MARKET / DAY TRADE only) ──
              // Never chase price. Only allow a market long/short when price is
              // pulling back to a valid institutional ORDER BLOCK formed by a
              // liquidity sweep + displacement (+FVG), in the HTF trend direction.
              // If there's no valid block, we SKIP the signal — that's how we avoid
              // the entry-then-immediate-SL chases that cause losses.
              if (!draft.type.includes("LIMIT") && !draft.type.includes("SWING")) {
                const gated = applyInstitutionalGate(signal, analysis);
                if (!gated) continue; // no valid order block → do not post
                signal.entry = gated.entry;
                signal.entryZone = gated.entryZone;
                signal.stopLoss = gated.stopLoss;
                signal.takeProfits = gated.takeProfits;
                signal.institutionalEntry = gated.notes;
              }

              snapshot.signals.push(signal);
            }
          }
        }
      }

      const futures = this.futureEngine.generate(instrument, analysis);
      snapshot.futureOpportunities.push(...futures);
    }

    snapshot.signals.sort((a, b) => {
      const ap = this.config.prioritySymbols.includes(a.symbol) ? 0 : 1;
      const bp = this.config.prioritySymbols.includes(b.symbol) ? 0 : 1;
      return ap - bp || b.confidence - a.confidence;
    });
    return snapshot;
  }

  private analyzeInstrument(
    provider: MarketDataProvider,
    instrument: Instrument
  ): InstrumentAnalysis | null {
    const quote = provider.getQuote(instrument.symbol);
    if (!quote) return null;
    const series = provider.getCandleSeries(instrument.symbol);
    if (!series.length) return null;

    const indicators = this.ta.analyze(series);
    const structure = this.structure.analyze(series, "5m");
    const trend = this.trend.analyzeTrend(series, indicators, structure);
    const sr = this.sr.analyze(instrument.symbol, instrument, series);
    const liq = this.liquidity.analyze(series);
    const fvg = this.ict.analyzeFairValueGaps(series, series.some((s) => s.timeframe === "5m") ? "5m" : "15m");
    const fib = this.ict.analyzeFib(series, series.some((s) => s.timeframe === "5m") ? "5m" : "30m");

    const primaryCandles = series.find((s) => s.timeframe === "5m") ?? series[0];
    const displacement = new DisplacementDetector(DEFAULT_STRATEGY_CONFIG).analyze(
      primaryCandles?.candles ?? []
    );
    const ifvg = new IFVGDetector(DEFAULT_STRATEGY_CONFIG).analyze(series, quote.last);

    const last5 = series.find((s) => s.timeframe === "5m") ?? series[0];
    const atrVal = indicators["5m"]?.atr ?? indicators["15m"]?.atr ?? quote.last * 0.002;

    const volatilityScore = computeVolatilityScore(atrVal, quote.last);

    trend.volatilityScore = volatilityScore;

    const session = getCurrentSession();

    return {
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      timestamp: quote.timestamp,
      price: quote.last,
      spread: quote.spread,
      atr: atrVal,
      trend,
      structure,
      supportResistance: sr,
      liquidity: liq,
      fvg,
      fib,
      displacement,
      ifvg,
      indicators,
      session,
      series
    };
  }

  private buildScannerRow(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    drafts: DraftSignal[],
    noTradeDraft: DraftSignal | null
  ): ScannerRow {
    const active = drafts.filter((d) => d && !d.noTrade);
    // Prefer showing the immediate MARKET / SWING call (the real trend-matched
    // long/short) in the scanner, and only fall back to a resting LIMIT when no
    // market or swing setup is active. This stops the UI from drowning in
    // one-sided limit orders and surfaces the actual directional trade.
    const market = active.find((d) => !d.type.includes("LIMIT"));
    const limit = active.find((d) => d.type.includes("LIMIT"));
    const picked = market ?? limit ?? active[0] ?? null;
    const score = picked
      ? this.signalEngine.score(instrument, analysis, picked)
      : null;
    const minForPicked = picked?.type.includes("LIMIT") ? this.config.minLimitScore : this.config.minSignalScore;
    const hasSetup = picked && (score ?? 0) >= minForPicked;
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      price: analysis.price,
      trend: analysis.trend.regime,
      trendStrength: analysis.trend.strength,
      setup: hasSetup ? picked!.type : null,
      direction: hasSetup ? picked!.direction : null,
      signalScore: score,
      risk: hasSetup ? riskLevelForScore(analysis, picked!.direction, sessionLiquidityFor(instrument, analysis.session)) : null,
      riskScore: hasSetup ? riskScoreFor(analysis, picked!.direction) : null,
      rr: hasSetup ? 1.5 : null,
      timeframes: hasSetup ? (picked!.type.includes("SCALP") ? ["5m", "15m"] : ["5m", "15m", "1h"]) : [],
      status: hasSetup ? (picked!.type.includes("LIMIT") ? "WAITING" : "ACTIVE") : noTradeDraft?.noTrade ?? null,
      updatedAt: analysis.timestamp,
      noTradeReason: noTradeDraft?.noTrade ?? null
    };
  }
}

function riskAllowed(level: string, max: string): boolean {
  const order = ["VERY LOW", "LOW", "MEDIUM", "HIGH", "VERY HIGH"];
  return order.indexOf(level) <= order.indexOf(max);
}

/**
 * Institutional order-block entry gate for MARKET / DAY TRADE signals.
 *
 * Only lets the signal through when price is pulling back to a valid order block
 * (liquidity sweep -> displacement -> FVG) in the direction of the HTF trend.
 * Returns the re-leveled entry (entry/SL/TP from the block) + evidence, or null
 * to SKIP the signal entirely (no valid block = do not chase = no stop-out chase).
 */
function applyInstitutionalGate(
  signal: Signal,
  analysis: InstrumentAnalysis
): { entry: number; entryZone: [number, number]; stopLoss: number; takeProfits: [number, number, number]; notes: { side: string; zone: string | null; reasons: string[] } } | null {
  const side = signal.direction === "BUY" ? "LONG" : "SHORT";

  // Map the HTF bias string to a strict direction for the gate.
  const htf = (analysis.trend.higherTimeframe || "").toUpperCase();
  let htfBias: string;
  if (htf.includes("BULLISH")) htfBias = "BUY";
  else if (htf.includes("BEARISH")) htfBias = "SELL";
  else htfBias = "NEUTRAL";

  // Entry timeframe: 15m gives meaningful blocks for intraday market trades.
  const series = analysis.series.find((s) => s.timeframe === "15m")
    ?? analysis.series.find((s) => s.timeframe === "5m")
    ?? analysis.series[0];
  const candles = series?.candles;
  if (!candles || candles.length < 8) return null;
  const atr = analysis.atr || analysis.price * 0.002;

  const structure = {
    bos: !!analysis.structure?.bos,
    choch: !!analysis.structure?.choch,
    bias: analysis.trend.directionalBias ?? "NEUTRAL"
  };

  const engine = new InstitutionalEntryEngine().find(side, {
    candles,
    htfBias,
    structure,
    price: analysis.price,
    atr,
    symbol: signal.symbol
  });

  if (!engine) return null;

  const zoneHalf = Math.max(atr * 0.04, analysis.price * 0.0002);
  const takeProfits: [number, number, number] = side === "LONG"
    ? [engine.takeProfit, engine.takeProfit * 1 + (engine.takeProfit - engine.entry) * 0.3, engine.takeProfit * 1 + (engine.takeProfit - engine.entry) * 0.6]
    : [engine.takeProfit, engine.takeProfit * 1 - (engine.entry - engine.takeProfit) * 0.3, engine.takeProfit * 1 - (engine.entry - engine.takeProfit) * 0.6];

  return {
    entry: engine.entry,
    entryZone: [engine.entry - zoneHalf, engine.entry + zoneHalf],
    stopLoss: engine.stopLoss,
    takeProfits,
    notes: { side, zone: `${engine.zone.top.toFixed(4)}-${engine.zone.bottom.toFixed(4)}`, reasons: engine.reasons }
  };
}

function riskLevelForScore(analysis: InstrumentAnalysis, direction: "BUY" | "SELL", sessionLiq: number): RiskLevel {
  return riskScoreFor(analysis, direction) > 35 ? "MEDIUM" : "LOW";
}

function riskScoreFor(analysis: InstrumentAnalysis, direction: "BUY" | "SELL"): number {
  const spread = (analysis.spread / analysis.price) * 10000;
  let s = spread > 2 ? 20 : spread > 1 ? 10 : 2;
  s += analysis.trend.volatilityScore > 60 ? 25 : analysis.trend.volatilityScore > 40 ? 15 : 5;
  const gap = direction === "BUY"
    ? (analysis.supportResistance.resistances[0]?.price ?? analysis.price)
    : (analysis.supportResistance.supports[0]?.price ?? analysis.price);
  const gapDist = Math.abs(gap - analysis.price) / Math.max(analysis.atr, 1e-9);
  if (gapDist < 1.5) s += 15;
  return Math.round(clamp(s, 0, 100));
}

function computeVolatilityScore(atr: number, price: number): number {
  const pct = (atr / Math.max(price, 1e-9)) * 100;
  if (pct > 0.1) return 70;
  if (pct > 0.06) return 50;
  if (pct > 0.03) return 30;
  return 15;
}
