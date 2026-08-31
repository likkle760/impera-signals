import type { Candle, Direction } from "../../types";
import { SwingConfig, DEFAULT_SWING_CONFIG, configForAssetClass } from "./config";
import { SwingStructure } from "./structure";
import { SwingSupportResistance, ZoneResult } from "./support-resistance";
import {
  atrAt,
  emaSeries,
  adxAt,
  rsiAt,
  momentumRecoveryBull,
  momentumRecoveryBear,
  classifyRegime
} from "./indicators";
import type {
  SwingFactor,
  SwingRegime,
  SwingSignal,
  SwingStructureBias,
  SwingTrendBias,
  SwingVerdict,
  SwingZone
} from "./types";

export interface SwingAnalysisInput {
  symbol: string;
  assetClass: string;
  /** higher-timeframe (daily) candles, closed up to current */
  daily: Candle[];
  /** confirmation-timeframe (4H) candles, closed up to current */
  hour4: Candle[];
  /** live timestamp being evaluated */
  now: number;
}

/** DOMAIN: daily trend defines the bias; 4H confirms the entry (pullback +
 *  structure + momentum). It only ever reads bars <= the current closed bar, so
 *  it is safe to call per-bar in a backtester (no look-ahead by construction).
 *
 *  It is intentionally SELECTIVE: NO TRADE is a valid and important output, and
 *  a good setup needs the highest-timeframe trend, a pullback (never chasing an
 *  extended move), meaningful S/R, momentum recovery, acceptable volatility and
 *  a minimum reward:risk — AND a minimum 0-100 setup score. */
export class SwingSignalEngine {
  private config: SwingConfig;

  constructor(config: Partial<SwingConfig> = {}) {
    this.config = { ...DEFAULT_SWING_CONFIG, ...config };
  }

  analyze(
    input: SwingAnalysisInput,
    upto4h: number,
    uptoDaily: number,
    outConfig: SwingConfig
  ): SwingSignal | null {
    const { symbol, assetClass, hour4, daily, now } = input;
    const cfg = configForAssetClass(outConfig, assetClass);
    const price = hour4[upto4h].close;
    const dailyCloses = daily.slice(0, uptoDaily + 1).map((c) => c.close);
    const atr4h = atrAt(hour4, upto4h);

    const prevTs = hour4[upto4h].time;
    const holdingDays = estimateHoldingDays(assetClass);
    const holdingPeriod = `${holdingDays[0]}-${holdingDays[1]} days`;

    // ---- Regime + volatility ----
    const regime = classifyRegime(
      hour4,
      upto4h,
      atr4h,
      cfg.volatility.atrPctFloor,
      cfg.volatility.atrPctCeil
    );
    const atrPct = atr4h / Math.max(price, 1e-9);
    const lowVol = atrPct < cfg.volatility.atrPctFloor;
    const highVol = atrPct > cfg.volatility.atrPctCeil;

    // ---- News/event filter (optional) ----
    const blockedByNews = cfg.news.enabled && cfg.news.eventTimes.some(
      (t) => t - now <= cfg.news.blackoutBeforeMs && t > now
    );

    // ---- Daily trend ----
    const trend = this.dailyTrend(daily, uptoDaily, cfg);
    const eFastD = emaSeries(dailyCloses, cfg.trend.emaFast)[uptoDaily];
    const eSlowD = emaSeries(dailyCloses, cfg.trend.emaSlow)[uptoDaily];
    const priceVsDaily = price;

    // ---- 4H structure ----
    const structureEng = new SwingStructure(cfg.structure.pivotLookback);
    const struct = structureEng.detect(hour4, upto4h);
    const structureBias: SwingStructureBias = struct.bias;

    // ---- S/R zones ----
    const srEng = new SwingSupportResistance(
      cfg.structure.minTouches,
      cfg.structure.zoneBandAtr,
      cfg.structure.swingLookback
    );
    const zones = srEng.detect(hour4, upto4h, struct.points, atr4h);

    // ---- Momentum (on 4H) ----
    const momBull = momentumRecoveryBull(hour4.map((c) => c.close), upto4h, cfg.momentum.rsiRecovery);
    const momBear = momentumRecoveryBear(hour4.map((c) => c.close), upto4h, cfg.momentum.rsiRecovery);

    // ---- Direction decision ----
    // Trend is the master; only consider a side where trend agrees. For a bullish
    // setup we need daily bullish; the 4H structure + momentum + pullback confirm.
    const factors: SwingFactor[] = [];

    // Trend score (weight 20, exact of the 0-100 scale)
    const trendScore = this.trendScore(trend, eFastD, eSlowD, priceVsDaily);
    factors.push({ label: "Trend", score: trendScore, detail: trendLabel(trend) });

    // Structure score (weight 20) — 4H must confirm in the trend's direction.
    const structureScore = this.structureScore(trend, structureBias, struct.bos);
    factors.push({ label: "Market structure", score: structureScore, detail: `4H ${structureBias}` });

    // S/R score (weight 15) — meaningful zone on the pullback side.
    const srScore = this.srScore(trend, zones, price, atr4h);
    factors.push({ label: "Support/Resistance", score: srScore.score, detail: srScore.detail });

    // Pullback quality (weight 10) — price should be pulling back, not extended.
    const pullbackScore = this.pullbackScore(trend, price, eFastD, eSlowD, atr4h);
    factors.push({ label: "Pullback quality", score: pullbackScore, detail: "not chasing extended move" });

    // Momentum (weight 10)
    const momentumScore = this.momentumScore(trend, momBull, momBear);
    factors.push({ label: "Momentum", score: momentumScore, detail: momentumLabel(trend, momBull, momBear) });

    // Volatility (weight 10)
    const volatilityScore = this.volatilityScore(lowVol, highVol, regime);
    factors.push({ label: "Volatility", score: volatilityScore, detail: regime });

    // Regime (weight 5)
    const regimeScore = this.regimeScore(regime, trend);
    factors.push({ label: "Market regime", score: regimeScore, detail: regime });

    // Risk/reward (weight 10) — computed below with a provisional stop.
    // Provisional entry = pullback zone midpoint; stop = beyond zone + ATR buffer.
    const direction = this.pickDirection(trend, structureBias, momBull, momBear);
    const riskScore = this.riskScore(direction, zones, price, atr4h, cfg);
    factors.push({ label: "Risk/Reward", score: riskScore.score, detail: riskScore.detail });

    const score = clampInt(Math.round(factors.reduce((a, f) => a + f.score, 0)), 0, 100);
    const verdict = this.verdict(direction, score, cfg);

    const reasons = this.buildReasons(trend, structureBias, zones, momBull, momBear, regime, score, verdict, cfg);
    const reasonsOut = reasons.slice(0, 6);

    const noTradeReasons: string[] = [];
    if (trend === "NEUTRAL") noTradeReasons.push("higher-timeframe trend neutral/ranging");
    if (structureBias === "NEUTRAL") noTradeReasons.push("no clear 4H structure");
    if (srScore.score < 5) noTradeReasons.push("no meaningful support/resistance on entry side");
    if (lowVol) noTradeReasons.push("volatility too low — breakout follow-through unlikely");
    if (highVol) noTradeReasons.push("volatility too high — stops impractical");
    if (blockedByNews) noTradeReasons.push("blocked by upcoming major event/news blackout");
    if (riskScore.score < 6) noTradeReasons.push("reward:risk below minimum");
    if (score < cfg.confidenceThresholds.noTradeScore) noTradeReasons.push(`setup score ${score} below ${cfg.confidenceThresholds.noTradeScore} threshold`);

    const directionLine = direction ?? fallbackDirection(trend);
    const entry = directionLine === "BUY"
      ? nearestSupportPrice(zones.supports) ?? price
      : nearestResistancePrice(zones.resistances) ?? price;

    const stop = directionLine === "BUY"
      ? entry - Math.max(atr4h * cfg.risk.stopMinAtr, atr4h * cfg.risk.stopBufferAtr)
      : entry + Math.max(atr4h * cfg.risk.stopMinAtr, atr4h * cfg.risk.stopBufferAtr);
    const stopDist = Math.abs(entry - stop);
    const tp1 = directionLine === "BUY" ? entry + stopDist * cfg.risk.tp1R : entry - stopDist * cfg.risk.tp1R;
    const tp2 = directionLine === "BUY" ? entry + stopDist * cfg.risk.tp2R : entry - stopDist * cfg.risk.tp2R;

    const zoneHalf = Math.max(atr4h * 0.15, 1e-12);
    const entryZone: [number, number] = directionLine === "BUY"
      ? [entry - zoneHalf, entry + zoneHalf]
      : [entry - zoneHalf, entry + zoneHalf];

    const rr1 = stopDist > 0 ? ((tp1 - entry) / stopDist) * (directionLine === "BUY" ? 1 : -1) : 0;
    const rr2 = stopDist > 0 ? ((tp2 - entry) / stopDist) * (directionLine === "BUY" ? 1 : -1) : 0;

    const noTrade = verdict === "NO TRADE" || directionLine === null;
    const invalidation = directionLine === "BUY"
      ? `Close below ${stop.toFixed(5)} (below structure + ATR buffer) on 4H`
      : `Close above ${stop.toFixed(5)} (above structure + ATR buffer) on 4H`;

    return {
      symbol,
      assetClass,
      timestamp: prevTs,
      direction: directionLine ?? "BUY",
      verdict: noTrade ? "NO TRADE" : verdict,
      entryZone,
      stopLoss: stop,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskReward1: Math.max(0, rr1),
      riskReward2: Math.max(0, rr2),
      score,
      grade: grade(score, cfg),
      trend,
      structure: structureBias,
      srValid: srScore.score >= 5,
      momentumValid: momentumScore >= 5,
      volatilityValid: !lowVol && !highVol,
      regime,
      holdingPeriod,
      reasons: noTrade ? noTradeReasons.slice(0, 4) : reasonsOut,
      invalidation,
      blockedByNews,
      noTradeReason: noTrade ? noTradeReasons.join(", ") : null,
      factors
    };
  }

  /** Convenience: evaluate using the FULL available bars as "current". */
  evaluate(input: SwingAnalysisInput): SwingSignal {
    const cfg = configForAssetClass(this.config, input.assetClass);
    const upto4h = input.hour4.length - 1;
    const uptoDaily = input.daily.length - 1;
    if (upto4h < 40 || uptoDaily < 60) {
      return noDataSignal(input, cfg);
    }
    const sig = this.analyze(input, upto4h, uptoDaily, cfg);
    return sig ?? noDataSignal(input, cfg);
  }

  /** Run the full evaluate() but for a historical bar index `upto4h`. */
  evaluateAt(input: SwingAnalysisInput, upto4h: number, uptoDaily: number): SwingSignal {
    const cfg = configForAssetClass(this.config, input.assetClass);
    if (upto4h < 40 || uptoDaily < 60) {
      return noDataSignal(input, cfg);
    }
    const sig = this.analyze(input, upto4h, uptoDaily, cfg);
    return sig ?? noDataSignal(input, cfg);
  }

  private dailyTrend(daily: Candle[], uptoDaily: number, cfg: SwingConfig): SwingTrendBias {
    const closes = daily.slice(0, uptoDaily + 1).map((c) => c.close);
    if (closes.length < cfg.trend.emaSlow + 2) return "NEUTRAL";
    const price = daily[uptoDaily].close;
    const fast = emaSeries(closes, cfg.trend.emaFast)[uptoDaily];
    const slow = emaSeries(closes, cfg.trend.emaSlow)[uptoDaily];
    const adx = adxAt(daily, uptoDaily);
    if (adx < cfg.trend.adxMin) return "NEUTRAL"; // no real trend strength on HTF
    if (price > slow && fast > slow) return "BULLISH";
    if (price < slow && fast < slow) return "BEARISH";
    return "NEUTRAL";
  }

  private trendScore(trend: SwingTrendBias, fast: number, slow: number, price: number): number {
    if (trend === "BULLISH") return price > fast ? 20 : 14;
    if (trend === "BEARISH") return price < fast ? 20 : 14;
    return 0;
  }

  private structureScore(trend: SwingTrendBias, struct: SwingStructureBias, bos: boolean): number {
    if (trend === "BULLISH" && struct === "BULLISH") return bos ? 20 : 16;
    if (trend === "BEARISH" && struct === "BEARISH") return bos ? 20 : 16;
    if (struct !== "NEUTRAL") return 8; // weak or conflicting
    return 2;
  }

  private srScore(
    trend: SwingTrendBias,
    zones: ZoneResult,
    price: number,
    atr: number
  ): { score: number; detail: string } {
    if (trend === "BULLISH") {
      const s = bestZone(zones.supports, price, atr);
      if (s) return { score: 10 + Math.min(5, s.touches * 2), detail: `support ${fmt(s.lower)}-${fmt(s.upper)} (${s.touches} touches)` };
      return { score: 2, detail: "no support below price on 4H" };
    }
    if (trend === "BEARISH") {
      const r = bestZone(zones.resistances, price, atr);
      if (r) return { score: 10 + Math.min(5, r.touches * 2), detail: `resistance ${fmt(r.upper)}-${fmt(r.lower)} (${r.touches} touches)` };
      return { score: 2, detail: "no resistance above price on 4H" };
    }
    return { score: 0, detail: "neutral trend" };
  }

  private pullbackScore(trend: SwingTrendBias, price: number, eFast: number, eSlow: number, atr: number): number {
    if (trend === "BULLISH") {
      // price pulling back toward (not extended past) the fast daily EMA is a
      // good pullback; price well above fast EMA = chasing.
      const dist = (price - eFast) / Math.max(atr, 1e-9);
      if (dist > 4) return 2;
      if (dist > 2) return 6;
      return 10;
    }
    if (trend === "BEARISH") {
      const dist = (eFast - price) / Math.max(atr, 1e-9);
      if (dist > 4) return 2;
      if (dist > 2) return 6;
      return 10;
    }
    return 0;
  }

  private momentumScore(trend: SwingTrendBias, momBull: boolean, momBear: boolean): number {
    if (trend === "BULLISH" && momBull) return 10;
    if (trend === "BEARISH" && momBear) return 10;
    if (trend !== "NEUTRAL") return 3;
    return 0;
  }

  private volatilityScore(lowVol: boolean, highVol: boolean, regime: SwingRegime): number {
    if (lowVol) return 0;
    if (highVol) return 2;
    if (regime === "HIGH_VOLATILITY") return 4;
    return 10;
  }

  private regimeScore(regime: SwingRegime, trend: SwingTrendBias): number {
    if (regime === "TRENDING" && trend !== "NEUTRAL") return 5;
    if (regime === "RANGING") return 0;
    if (regime === "LOW_VOLATILITY") return 0;
    return 2;
  }

  private riskScore(
    direction: Direction | null,
    zones: ZoneResult,
    price: number,
    atr: number,
    cfg: SwingConfig
  ): { score: number; detail: string; entry: number; stopDist: number } {
    if (!direction) return { score: 0, detail: "no direction", entry: price, stopDist: atr };
    const entry = direction === "BUY"
      ? (nearestSupportPrice(zones.supports) ?? price)
      : (nearestResistancePrice(zones.resistances) ?? price);
    const stopDist = Math.max(atr * cfg.risk.stopMinAtr, atr * cfg.risk.stopBufferAtr);
    const target = direction === "BUY" ? entry + stopDist * cfg.risk.tp1R : entry - stopDist * cfg.risk.tp1R;
    const rr = (Math.abs(target - entry) / stopDist) * (direction === "BUY" ? 1 : -1);
    if (rr >= cfg.risk.minRewardRisk) return { score: 10, detail: `RR ${rr.toFixed(1)}:1 >= ${cfg.risk.minRewardRisk}:1`, entry, stopDist };
    return { score: 2, detail: `RR ${rr.toFixed(1)}:1 < ${cfg.risk.minRewardRisk}:1`, entry, stopDist };
  }

  private pickDirection(
    trend: SwingTrendBias,
    struct: SwingStructureBias,
    momBull: boolean,
    momBear: boolean
  ): Direction | null {
    if (trend === "BULLISH" && struct !== "BEARISH" && momBull) return "BUY";
    if (trend === "BEARISH" && struct !== "BULLISH" && momBear) return "SELL";
    return null;
  }

  private verdict(direction: Direction | null, score: number, cfg: SwingConfig): SwingVerdict {
    if (!direction) return "NO TRADE";
    const strong = cfg.confidenceThresholds.strongScore;
    const min = cfg.confidenceThresholds.noTradeScore;
    if (score >= strong) return direction === "BUY" ? "STRONG BUY" : "STRONG SELL";
    if (score >= min) return direction === "BUY" ? "BUY" : "SELL";
    return "NO TRADE";
  }

  private buildReasons(
    trend: SwingTrendBias,
    struct: SwingStructureBias,
    zones: ZoneResult,
    momBull: boolean,
    momBear: boolean,
    regime: SwingRegime,
    score: number,
    verdict: SwingVerdict,
    cfg: SwingConfig
  ): string[] {
    const r: string[] = [];
    if (trend === "BULLISH") r.push(`Daily trend bullish (EMA ${cfg.trend.emaFast}/${cfg.trend.emaSlow} stacked)`);
    if (trend === "BEARISH") r.push(`Daily trend bearish (EMA ${cfg.trend.emaFast}/${cfg.trend.emaSlow} stacked)`);
    if (trend === "NEUTRAL") r.push("Daily trend neutral — no trade");
    if (struct === "BULLISH") r.push("4H structure bullish (HH/HL)");
    if (struct === "BEARISH") r.push("4H structure bearish (LL/LH)");
    if (verdict === "BUY" || verdict === "STRONG BUY") {
      const s = bestZone(zones.supports, 0, 1);
      if (s) r.push(`Pullback near 4H support ${fmt(s.lower)}-${fmt(s.upper)}`);
      if (momBull) r.push("Momentum recovering (RSI above threshold)");
    }
    if (verdict === "SELL" || verdict === "STRONG SELL") {
      const s = bestZone(zones.resistances, 0, 1);
      if (s) r.push(`Pullback near 4H resistance ${fmt(s.upper)}-${fmt(s.lower)}`);
      if (momBear) r.push("Momentum deteriorating (RSI below threshold)");
    }
    if (regime === "TRENDING") r.push("Trending regime — follow-through likely");
    if (regime === "RANGING") r.push("Ranging regime — limited follow-through");
    r.push(`Setup score ${score}/100 (${grade(score, cfg)})`);
    return r;
  }
}

function noDataSignal(input: SwingAnalysisInput, cfg: SwingConfig): SwingSignal {
  return {
    symbol: input.symbol,
    assetClass: input.assetClass,
    timestamp: input.now,
    direction: "BUY",
    verdict: "NO TRADE",
    entryZone: [0, 0],
    stopLoss: 0,
    takeProfit1: 0,
    takeProfit2: 0,
    riskReward1: 0,
    riskReward2: 0,
    score: 0,
    grade: "—",
    trend: "NEUTRAL",
    structure: "NEUTRAL",
    srValid: false,
    momentumValid: false,
    volatilityValid: false,
    regime: "LOW_VOLATILITY",
    holdingPeriod: "—",
    reasons: ["insufficient historical data"],
    invalidation: "—",
    blockedByNews: false,
    noTradeReason: "insufficient historical data",
    factors: []
  };
}

function estimateHoldingDays(assetClass: string): [number, number] {
  if (assetClass === "crypto") return [3, 14];
  return [3, 10];
}

function fallbackDirection(trend: SwingTrendBias): Direction | null {
  if (trend === "BULLISH") return "BUY";
  if (trend === "BEARISH") return "SELL";
  return null;
}

function nearestSupportPrice(supports: SwingZone[]): number | null {
  if (!supports.length) return null;
  // strongest-near: use the closest support to price by midpoint
  return supports[0] ? (supports[0].lower + supports[0].upper) / 2 : null;
}
function nearestResistancePrice(resistances: SwingZone[]): number | null {
  if (!resistances.length) return null;
  return resistances[0] ? (resistances[0].lower + resistances[0].upper) / 2 : null;
}

function bestZone(zones: SwingZone[], price: number, atr: number): SwingZone | null {
  const sorted = [...zones].sort((a, b) => b.strength - a.strength || (Math.abs(mid(a) - price) - Math.abs(mid(b) - price)));
  return sorted[0] ?? null;
}
function mid(z: SwingZone): number {
  return (z.lower + z.upper) / 2;
}

function trendLabel(t: SwingTrendBias): string {
  return t === "BULLISH" ? "Bullish" : t === "BEARISH" ? "Bearish" : "Neutral";
}
function momentumLabel(t: SwingTrendBias, b: boolean, be: boolean): string {
  if (t === "BULLISH") return b ? "Recovering" : "Not confirmed";
  if (t === "BEARISH") return be ? "Deteriorating" : "Not confirmed";
  return "—";
}

function grade(score: number, cfg: SwingConfig): string {
  const s = cfg.confidenceThresholds.strongScore;
  const m = cfg.confidenceThresholds.noTradeScore;
  if (score >= s) return "A+";
  if (score >= m) return "A";
  return "B";
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fmt(n: number): number {
  return Math.round(n * 10000) / 10000;
}
