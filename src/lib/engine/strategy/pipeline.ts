import type { CandleSeries, Instrument, RiskLevel, Timeframe } from "../../types";
import type {
  InstrumentAnalysis,
  Signal
} from "../analysis-types";
import { MarketStructureEngine } from "../market-structure";
import { TrendEngine } from "../trend";
import { TechnicalAnalysisEngine } from "../technical-analysis";
import { SupportResistanceEngine } from "../support-resistance";
import { LiquidityEngine } from "../liquidity";
import { getCurrentSession } from "../session";
import type { StrategyConfig } from "./strategy-config";
import { DisplacementDetector } from "./displacement-detector";
import { FVGDetector } from "./fvg-detector";
import { IFVGDetector } from "./ifvg-detector";
import { OrderBlockDetector } from "./order-blocks";
import { PremiumDiscountAnalyzer } from "./premium-discount";
import { SessionFilter } from "./session-filter";
import { ConfluenceScorer, shortTermBias } from "./confluence-scorer";
import { EntryEngine, DraftSignal } from "./entry-engine";
import { LimitOrderManager } from "./limit-order-manager";
import { RiskManager } from "./risk-manager";
import { TradeLogger } from "./trade-logger";
import { BacktestEngine, SignalHook, estimateAtr } from "./backtest-engine";
import { SignalReporter } from "./signal-reporter";

export interface PipelineDeps {
  ta?: TechnicalAnalysisEngine;
  structure?: MarketStructureEngine;
  trend?: TrendEngine;
  sr?: SupportResistanceEngine;
  liquidity?: LiquidityEngine;
}

/**
 * StrategyPipeline — the systematic top-level component. It composes the
 * named detectors (Displacement, FVG, IFVG, Premium/Discount, SessionFilter),
 * the ConfluenceScorer, EntryEngine, LimitOrderManager and RiskManager into
 * one analyzable + signal-producing unit, separate from the numeric
 * thresholds which all live in StrategyConfig.
 */
export class StrategyPipeline {
  readonly fvgDetector: FVGDetector;
  readonly ifvgDetector: IFVGDetector;
  readonly premiumDiscount: PremiumDiscountAnalyzer;
  readonly sessionFilter: SessionFilter;
  readonly confluence: ConfluenceScorer;
  readonly entries: EntryEngine;
  readonly limits = new LimitOrderManager({} as StrategyConfig);
  readonly riskManager: RiskManager;
  readonly logger = new TradeLogger();
  readonly backtest = new BacktestEngine();
  readonly reporter = new SignalReporter();

  private ta_: TechnicalAnalysisEngine;
  private structure_: MarketStructureEngine;
  private trend_: TrendEngine;
  private sr_: SupportResistanceEngine;
  private liquidity_: LiquidityEngine;

  constructor(private config: StrategyConfig, deps: PipelineDeps = {}) {
    this.ta_ = deps.ta ?? new TechnicalAnalysisEngine();
    this.structure_ = deps.structure ?? new MarketStructureEngine();
    this.trend_ = deps.trend ?? new TrendEngine();
    this.sr_ = deps.sr ?? new SupportResistanceEngine();
    this.liquidity_ = deps.liquidity ?? new LiquidityEngine();
    this.fvgDetector = new FVGDetector(config);
    this.ifvgDetector = new IFVGDetector(config);
    this.premiumDiscount = new PremiumDiscountAnalyzer(config);
    this.sessionFilter = new SessionFilter(config);
    this.confluence = new ConfluenceScorer(config);
    this.entries = new EntryEngine(config);
    this.riskManager = new RiskManager(config);
    this.limits = new LimitOrderManager(config);
  }

  /** Run all detectors to fill the analysis with displacement + FVG + IFVG. */
  analyze(
    instrument: Instrument,
    series: CandleSeries[],
    currentPrice: number,
    quoteSpread: number
  ): InstrumentAnalysis {
    const indicators = this.ta_.analyze(series);
    const structure = this.structure_.analyze(series, this.config.timeframes.primary);
    const trend = this.trend_.analyzeTrend(series, indicators, structure);
    const sr = this.sr_.analyze(instrument.symbol, instrument, series);
    const liquidity = this.liquidity_.analyze(series);

    const primary = this.config.timeframes.primary;
    const fvg = this.fvgDetector.analyze(series, primary, currentPrice);
    const ifvg = this.ifvgDetector.analyze(series, currentPrice);
    const pd = this.premiumDiscount.analyze(series, primary, currentPrice);

    const primaryCandles = series.find((s) => s.timeframe === primary);
    const displacement = new DisplacementDetector(this.config).analyze(
      primaryCandles?.candles ?? series[0]?.candles ?? []
    );
    const orderBlocks = new OrderBlockDetector(this.config).analyze(
      primaryCandles?.candles ?? series[0]?.candles ?? []
    );

    const atrVal = indicators[primary]?.atr ?? indicators["15m"]?.atr ?? currentPrice * this.config.risk.atrFallbackPct;
    trend.volatilityScore = computeVolatilityScore(atrVal, currentPrice);

    return {
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      timestamp: Date.now(),
      price: currentPrice,
      spread: quoteSpread,
      atr: atrVal,
      trend,
      structure,
      supportResistance: sr,
      liquidity,
      fvg,
      fib: pd.fib,
      displacement,
      ifvg,
      orderBlocks,
      indicators,
      session: getCurrentSession(),
      series
    };
  }

  /** Produce executable signals for an instrument using the engine pieces. */
  generateSignals(instrument: Instrument, analysis: InstrumentAnalysis): Signal[] {
    const signals: Signal[] = [];
    const conf = this.confluence.assess(analysis);
    const direction: "BUY" | "SELL" = conf.bullPoints >= conf.bearPoints ? "BUY" : "SELL";

    const nearTerm = this.nearTerm(analysis);
    const finalDirection: "BUY" | "SELL" = nearTerm === "SELL" ? "SELL" : nearTerm === "BUY" ? "BUY" : direction;

    const marketType = this.marketType(finalDirection, analysis);
    const fiveAgrees = nearTerm === finalDirection;
    const marketDraft: DraftSignal = conf.score < this.config.scoring.marketConfluenceFloor || !fiveAgrees
      ? { direction: finalDirection, type: marketType, confluence: conf.score, noTrade: !fiveAgrees ? "CHOPPY MARKET" : "SETUP NOT CONFIRMED", reasons: conf.reasons.slice(0, 3) }
      : { direction: finalDirection, type: marketType, confluence: conf.score, reasons: conf.reasons.slice(0, 4) };

    const limitDraft = this.entries.buildLimitDraft(finalDirection, analysis);

    const drafts: DraftSignal[] = [marketDraft, ...(limitDraft ? [limitDraft] : [])];

    for (const d of drafts) {
      if (d.noTrade) continue;
      const score = this.confluence.score(instrument, analysis, d);
      const isLimit = d.type.includes("LIMIT");
      const minFor = isLimit ? this.config.scoring.minLimitScore : this.config.scoring.minSignalScore;
      if (score < minFor) continue;

      const entry = isLimit ? this.entries.limitLevel(finalDirection, analysis)!.price : analysis.price;
      const risk = this.riskManager.evaluate(instrument, analysis, null, this.sessionFilter.liquidity(analysis.session as any));
      const signal = this.entries.buildSignal(instrument, analysis, d, score, risk);
      if (signal) signals.push(signal);
    }

    return signals;
  }

  private nearTerm(analysis: InstrumentAnalysis): "BUY" | "SELL" | "NEUTRAL" {
    const ind = analysis.indicators["5m"] ?? analysis.indicators["15m"];
    return shortTermBias(ind as any, analysis.price);
  }

  private marketType(direction: "BUY" | "SELL", analysis: InstrumentAnalysis): DraftSignal["type"] {
    const struct = analysis.structure.structureType;
    const isPullback = struct === "RANGE" || struct === "PULLBACK" || struct === "RETEST" || struct === "CHANGE OF CHARACTER";
    return direction === "BUY" ? (isPullback ? "SCALP BUY" : "MARKET BUY") : (isPullback ? "SCALP SELL" : "MARKET SELL");
  }

  /** Hook factory for the backtester: emits using only candles[0..i]. */
  backtestHook(symbol: string, timeframe: Timeframe): SignalHook {
    return {
      symbol,
      timeframe,
      emit: (candles, i) => {
        const window = candles.slice(0, i + 1);
        if (window.length < 30) return null;
        const series: CandleSeries[] = [{ timeframe, candles: window }];
        const atr = estimateAtr(candles, i);
        const price = candles[i].close;
        const fake: Instrument = {
          symbol, name: symbol, assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true
        };
        // Build a light analysis to produce a limit draft (deterministic, no-lookahead).
        const analysis = this.analyze(fake, series, price, 0.0001);
        const conf = this.confluence.assess(analysis);
        const nearTerm = this.nearTerm(analysis);
        if (nearTerm === "NEUTRAL") return null;
        const direction: "BUY" | "SELL" = nearTerm;
        const limit = this.entries.buildLimitDraft(direction, analysis);
        if (!limit) return null;
        const level = this.entries.limitLevel(direction, analysis);
        return { draft: limit, entry: level ? level.price : price };
      }
    };
  }
}

function computeVolatilityScore(atr: number, price: number): number {
  const pct = (atr / Math.max(price, 1e-9)) * 100;
  if (pct > 0.1) return 70;
  if (pct > 0.06) return 50;
  if (pct > 0.03) return 30;
  return 15;
}

export { estimateAtr };
