import type { Candle, Direction } from "../../types";
import {
  ScalpConfig,
  DEFAULT_SCALP_CONFIG,
  scalpConfigForAssetClass
} from "./config";
import { SwingStructure } from "../swing/structure";
import { SwingSupportResistance } from "../swing/support-resistance";
import {
  atrAt,
  emaSeries,
  adxAt,
  rsiAt,
  classifyRegime
} from "../swing/indicators";
import { getCurrentSession } from "../session";
import type { SwingZone } from "../swing/types";
import type { ScalpSignal, ScalpVerdict } from "./types";

export interface ScalpAnalysisInput {
  symbol: string;
  assetClass: string;
  /** context timeframe (15m) candles, closed up to current */
  context: Candle[];
  /** setup timeframe (5m) candles, closed up to current */
  setup: Candle[];
  /** entry timeframe (1m) candles, closed up to current */
  entry: Candle[];
  /** spread in price units (mid-to-mid) */
  spread: number;
  /** current price */
  price: number;
  /** wall-clock timestamp being evaluated */
  now: number;
}

interface LevelSet {
  supports: { price: number; kind: string; strength: number }[];
  resistances: { price: number; kind: string; strength: number }[];
}

/**
 * ScalpSignalEngine — the modular, rules-based scalping setup detector.
 *
 * DOMAIN: 15m = context, 5m = setup, 1m = entry confirmation. Only ever reads
 * bars <= the current closed bar so it is safe to call per-bar in a backtester
 * (no look-ahead by construction). Mandatory spread filter, session filter and
 * news blackout prevent uneconomic/oversized execution. NO TRADE is the default.
 */
export class ScalpSignalEngine {
  private config: ScalpConfig;

  constructor(config: Partial<ScalpConfig> = {}) {
    this.config = { ...DEFAULT_SCALP_CONFIG, ...config };
  }

  evaluate(input: ScalpAnalysisInput): ScalpSignal {
    const cfg = scalpConfigForAssetClass(this.config, input.assetClass);
    const { context, setup, entry, spread, price, now } = input;

    const ctx = context.length - 1;
    const stp = setup.length - 1;
    const ent = entry.length - 1;

    if (ctx < 60 || stp < 60 || ent < 40) {
      return noDataSignal(input, cfg);
    }

    const atr1m = atrAt(entry, ent);
    const atr5m = atrAt(setup, stp);
    const atr15m = atrAt(context, ctx);
    const atrPct = atr15m / Math.max(price, 1e-9);

    const regime = classifyRegime(
      context,
      ctx,
      atr15m,
      cfg.regime.atrPctFloor,
      cfg.regime.atrPctCeil
    );
    const lowVol = atrPct < cfg.regime.atrPctFloor;
    const highVol = atrPct > cfg.regime.atrPctCeil;

    const session = getCurrentSession(new Date(now));
    const sessionAllowed = cfg.sessions.allowed.length === 0 || cfg.sessions.allowed.includes(session);

    const blockedByNews = cfg.news.enabled && cfg.news.eventTimes.some(
      (t) => {
        const diff = t - now;
        return diff <= cfg.news.blackoutBeforeMs && diff >= -cfg.news.blackoutAfterMs;
      }
    );

    // ---- 15m context trend ----
    const trend = this.contextTrend(context, ctx, cfg);

    // ---- 5m structure ----
    const structureEng = new SwingStructure(cfg.structure.pivotLookback);
    const struct = structureEng.detect(setup, stp);
    const structureBias = struct.bias;

    // ---- 1m entry confirmation ----
    const entryEng = new SwingStructure(cfg.structure.pivotLookback - 1);
    const entryStruct = entryEng.detect(entry, ent);
    const entryBias = entryStruct.bias;

    // ---- Key intraday levels ----
    const levels = this.keyLevels(input, struct.points, stp, atr5m, cfg);

    // ---- Momentum (5m close RSI) ----
    const closes5 = setup.map((c) => c.close);
    const rsi5 = rsiAt(closes5, stp, 14);
    const momBull = rsi5 >= cfg.momentum.rsiFloor;
    const momBear = rsi5 <= 100 - cfg.momentum.rsiFloor;

    // ---- Spread filter (mandatory for scalping) ----
    // Stop distance is approximated by ATR(1m) × min(stopMinAtr, stopBufferAtr).
    const approxStop = Math.max(atr1m * cfg.risk.stopMinAtr, atr1m * cfg.risk.stopBufferAtr);
    const spreadToStop = spread / Math.max(approxStop, 1e-12);
    const spreadOk = spreadToStop <= cfg.spread.maxSpreadToStop;

    // ---- Direct scalar factor scores (each out of its stated max) ----
    const factors: { label: string; score: number; detail: string }[] = [];
    const maxScore = { regime: 15, trend: 15, structure: 15, level: 15, entry: 15, momentum: 10, volatility: 5, spread: 10 };

    factors.push({ label: "Market regime", score: lowVol || highVol ? 0 : regime === "TRENDING" ? 15 : regime === "RANGING" ? 7 : 10, detail: regime });
    factors.push({ label: "Trend alignment", score: this.trendScore(trend, price, setup, stp, cfg), detail: `15m ${trend}` });
    factors.push({ label: "Market structure", score: this.structureScore(trend, structureBias), detail: `5m ${structureBias}` });
    const levelScore = this.levelScore(trend, levels, price, atr5m);
    factors.push({ label: "Key level", score: levelScore.score, detail: levelScore.detail });
    factors.push({ label: "Entry confirmation", score: this.entryScore(trend, entryBias), detail: `1m ${entryBias}` });
    factors.push({ label: "Momentum", score: this.momentumScore(trend, momBull, momBear), detail: `RSI5 ${rsi5.toFixed(0)}` });
    factors.push({ label: "Volatility", score: lowVol || highVol ? 0 : 5, detail: `${(atrPct * 100).toFixed(2)}% 15m ATR` });
    factors.push({ label: "Spread/execution", score: spreadOk ? 10 : 0, detail: `spread ${spreadToStop.toFixed(2)}× stop` });

    const score = clamp(Math.round(factors.reduce((a, f) => a + f.score, 0)), 0, 100);

    const direction = this.pickDirection(trend, structureBias, entryBias, momBull, momBear);
    const verdict = this.verdict(direction, score, cfg);

    // Reject signals that failed a critical gate.
    let finalSignal: ScalpSignal;
    if (verdict === "NO TRADE") {
      const noTradeReasons: string[] = [];
      if (lowVol) noTradeReasons.push("volatility too low for costs");
      if (highVol) noTradeReasons.push("volatility too high to execute");
      if (!spreadOk) noTradeReasons.push("spread too large relative to stop");
      if (!sessionAllowed) noTradeReasons.push(`session ${session} filter`);
      if (blockedByNews) noTradeReasons.push("news blackout");
      if (score < cfg.scoring.minScore) noTradeReasons.push(`score ${score} below ${cfg.scoring.minScore}`);
      if (direction === null) noTradeReasons.push("no aligned direction across 15m/5m/1m");
      finalSignal = this.build(input, cfg, { direction, verdict, score, factors, reasons: noTradeReasons, noTradeReason: noTradeReasons.join(", ") });
    } else {
      finalSignal = this.build(input, cfg, {
        direction: direction!,
        verdict,
        score,
        factors,
        reasons: this.buildReasons(trend, structureBias, entryBias, regime, levelScore, score, verdict, cfg),
        noTradeReason: null
      });
    }

    // Stamp diagnostics.
    finalSignal.blockedByNews = blockedByNews;
    finalSignal.spreadBlocked = !spreadOk;
    finalSignal.volBlocked = lowVol || highVol;
    finalSignal.regime = regime;
    finalSignal.session = session;
    finalSignal.trend = trend;
    finalSignal.structure = structureBias;
    return finalSignal;
  }

  private contextTrend(context: Candle[], upto: number, cfg: ScalpConfig): "BULLISH" | "BEARISH" | "NEUTRAL" {
    const closes = context.slice(0, upto + 1).map((c) => c.close);
    if (closes.length < cfg.trend.emaSlow + 2) return "NEUTRAL";
    const price = context[upto].close;
    const fast = emaSeries(closes, cfg.trend.emaFast)[upto];
    const slow = emaSeries(closes, cfg.trend.emaSlow)[upto];
    const adx = adxAt(context, upto);
    if (adx < cfg.regime.adxMin) return "NEUTRAL";
    if (price > slow && fast > slow) return "BULLISH";
    if (price < slow && fast < slow) return "BEARISH";
    return "NEUTRAL";
  }

  private trendScore(trend: string, price: number, setup: Candle[], upto: number, cfg: ScalpConfig): number {
    if (trend === "BULLISH") return price > setup[upto].close ? 15 : 10;
    if (trend === "BEARISH") return price < setup[upto].close ? 15 : 10;
    return 0;
  }

  private structureScore(trend: string, struct: string): number {
    if (trend === "BULLISH") return struct === "BULLISH" ? 15 : struct === "NEUTRAL" ? 5 : 3;
    if (trend === "BEARISH") return struct === "BEARISH" ? 15 : struct === "NEUTRAL" ? 5 : 3;
    return 0;
  }

  private levelScore(
    trend: string,
    levels: LevelSet,
    price: number,
    atr: number
  ): { score: number; detail: string } {
    if (trend === "BULLISH") {
      const s = nearestLevel(levels.supports, price, atr, "below");
      if (s) return { score: 10 + Math.min(5, s.strength), detail: `support ${s.kind} @${s.price.toFixed(5)}` };
      return { score: 2, detail: "no support below" };
    }
    if (trend === "BEARISH") {
      const r = nearestLevel(levels.resistances, price, atr, "above");
      if (r) return { score: 10 + Math.min(5, r.strength), detail: `resistance ${r.kind} @${r.price.toFixed(5)}` };
      return { score: 2, detail: "no resistance above" };
    }
    return { score: 0, detail: "no direction" };
  }

  private entryScore(trend: string, entryBias: string): number {
    if (trend === "BULLISH" && entryBias === "BULLISH") return 15;
    if (trend === "BEARISH" && entryBias === "BEARISH") return 15;
    if (trend !== "NEUTRAL" && entryBias !== "NEUTRAL") return 8;
    return 0;
  }

  private momentumScore(trend: string, momBull: boolean, momBear: boolean): number {
    if (trend === "BULLISH" && momBull) return 10;
    if (trend === "BEARISH" && momBear) return 10;
    if (trend !== "NEUTRAL") return 3;
    return 0;
  }

  private pickDirection(
    trend: string,
    struct: string,
    entryBias: string,
    momBull: boolean,
    momBear: boolean
  ): Direction | null {
    const bull = trend === "BULLISH" && struct !== "BEARISH" && entryBias !== "BEARISH" && momBull;
    const bear = trend === "BEARISH" && struct !== "BULLISH" && entryBias !== "BULLISH" && momBear;
    if (bull) return "BUY";
    if (bear) return "SELL";
    return null;
  }

  private verdict(direction: Direction | null, score: number, cfg: ScalpConfig): ScalpVerdict {
    if (!direction || score < cfg.scoring.minScore) return "NO TRADE";
    if (score >= cfg.scoring.strongScore) return direction === "BUY" ? "STRONG BUY" : "STRONG SELL";
    return direction === "BUY" ? "BUY" : "SELL";
  }

  private keyLevels(
    input: ScalpAnalysisInput,
    swingPoints: any[],
    stp: number,
    atr: number,
    cfg: ScalpConfig
  ): LevelSet {
    const price = input.price;
    const supports: LevelSet["supports"] = [];
    const resistances: LevelSet["resistances"] = [];
    const seen = new Set<string>();

    // S/R zones from 5m swing points (reuse the swing S/R engine).
    const srEng = new SwingSupportResistance(cfg.structure.minTouches, cfg.structure.zoneBandAtr, cfg.structure.swingLookback);
    const zones = srEng.detect(input.setup, stp, swingPoints, atr);
    for (const z of zones.supports) addLevel("5m swing support", z, supports, seen);
    for (const z of zones.resistances) addLevel("5m swing resistance", z, resistances, seen);

    // Prior-day, session, opening-range levels from the 1m series (available bars).
    const { pdh, pdl } = intradayExtremes(input.entry, input.now);
    if (pdh) addLevel("prior/session high", { price: pdh, strength: 7 }, resistances, seen);
    if (pdl) addLevel("prior/session low", { price: pdl, strength: 7 }, supports, seen);

    // Opening-range (first 30 1m bars) levels.
    const openRange = openingRange(input.entry);
    if (openRange) {
      addLevel("opening-range high", { price: openRange.high, strength: 6 }, resistances, seen);
      addLevel("opening-range low", { price: openRange.low, strength: 6 }, supports, seen);
    }

    // VWAP as a level on the 5m set.
    const vwap = calcVwap(input.setup, stp);
    if (vwap != null) {
      if (vwap < price) addLevel("5m VWAP", { price: vwap, strength: 5 }, supports, seen);
      else addLevel("5m VWAP", { price: vwap, strength: 5 }, resistances, seen);
    }

    supports.sort((a, b) => b.strength - a.strength || Math.abs(a.price - price) - Math.abs(b.price - price));
    resistances.sort((a, b) => b.strength - a.strength || Math.abs(a.price - price) - Math.abs(b.price - price));
    return {
      supports: supports.slice(0, 5),
      resistances: resistances.slice(0, 5)
    };
  }

  private build(
    input: ScalpAnalysisInput,
    cfg: ScalpConfig,
    partial: {
      direction: Direction | null;
      verdict: ScalpVerdict;
      score: number;
      factors: { label: string; score: number; detail: string }[];
      reasons: string[];
      noTradeReason: string | null;
    }
  ): ScalpSignal {
    const { price, spread } = input;
    const atr1m = atrAt(input.entry, input.entry.length - 1);
    const dir = partial.direction ?? "BUY";

    const approxStop = Math.max(atr1m * cfg.risk.stopMinAtr, atr1m * cfg.risk.stopBufferAtr);
    const stop = dir === "BUY" ? price - approxStop : price + approxStop;
    const tp1 = dir === "BUY" ? price + approxStop * cfg.risk.tp1R : price - approxStop * cfg.risk.tp1R;
    const tp2 = dir === "BUY" ? price + approxStop * cfg.risk.tp2R : price - approxStop * cfg.risk.tp2R;

    const zoneHalf = Math.max(atr1m * 0.25, 1e-12);
    const entryZone: [number, number] = [price - zoneHalf, price + zoneHalf];

    const noTrade = partial.verdict === "NO TRADE";
    return {
      symbol: input.symbol,
      assetClass: input.assetClass,
      timestamp: input.now,
      direction: dir,
      verdict: noTrade ? "NO TRADE" : partial.verdict,
      timeframes: ["15m", "5m", "1m"],
      entryZone,
      stopLoss: stop,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskReward1: cfg.risk.tp1R - (spread / Math.max(approxStop, 1e-12)),
      riskReward2: cfg.risk.tp2R - (spread / Math.max(approxStop, 1e-12)),
      score: partial.score,
      grade: partial.score >= cfg.scoring.strongScore ? "A+" : partial.score >= cfg.scoring.minScore ? "A" : "B",
      trend: "NEUTRAL",
      structure: "NEUTRAL",
      regime: "TRENDING",
      session: "",
      holdingWindow: `${cfg.holding.maxBars} minutes`,
      reasons: partial.reasons,
      invalidation: dir === "BUY"
        ? `1m close below ${stop.toFixed(5)} or ${cfg.holding.maxBars} min hold`
        : `1m close above ${stop.toFixed(5)} or ${cfg.holding.maxBars} min hold`,
      blockedByNews: false,
      noTradeReason: partial.noTradeReason,
      setupId: noTrade ? null : `${input.symbol}|${input.now}`,
      spreadBlocked: false,
      volBlocked: false,
      factors: partial.factors
    };
  }

  private buildReasons(
    trend: string,
    struct: string,
    entryBias: string,
    regime: string,
    level: { score: number; detail: string },
    score: number,
    verdict: ScalpVerdict,
    cfg: ScalpConfig
  ): string[] {
    const r: string[] = [];
    if (trend === "BULLISH") r.push("15m trend bullish");
    if (trend === "BEARISH") r.push("15m trend bearish");
    if (struct === "BULLISH") r.push("5m structure bullish");
    if (struct === "BEARISH") r.push("5m structure bearish");
    if (entryBias === "BULLISH") r.push("1m confirms bullish");
    if (entryBias === "BEARISH") r.push("1m confirms bearish");
    if (regime === "TRENDING") r.push("trending regime");
    if (regime === "RANGING") r.push("ranging regime");
    if (level.score >= 10) r.push(level.detail);
    r.push(`${verdict} score ${score}/100 (${score >= cfg.scoring.strongScore ? "A+" : "A"})`);
    return r;
  }
}

function addLevel(
  kind: string,
  z: { price?: number; strength: number; lower?: number; upper?: number },
  out: { price: number; kind: string; strength: number }[],
  seen: Set<string>
): void {
  const price = zPrice(z);
  const key = price.toFixed(6);
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ price, kind, strength: z.strength });
}
function zPrice(z: { price?: number; lower?: number; upper?: number }): number {
  if (z.price != null) return z.price;
  return (z.lower! + z.upper!) / 2;
}

function nearestLevel(
  levels: { price: number; kind: string; strength: number }[],
  price: number,
  atr: number,
  side: "below" | "above"
): { price: number; kind: string; strength: number } | null {
  for (const l of levels) {
    const dist = side === "below" ? price - l.price : l.price - price;
    if (dist < 0) continue; // wrong side
    if (dist > atr * 4) continue; // too far to matter for a scalp
    return l;
  }
  return null;
}

function intradayExtremes(entry: Candle[], now: number): { pdh: number | null; pdl: number | null } {
  // Restrict to bars from the same UTC day as `now` so we compute today's
  // session high/low (proxy for prior-day when a full day is available).
  const day = new Date(now);
  const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (const c of entry) {
    if (c.time * 1000 < start) continue;
    if (c.time > now) break;
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
    n++;
  }
  if (n < 5) return { pdh: null, pdl: null };
  return { pdh: hi, pdl: lo };
}

function openingRange(entry: Candle[]): { high: number; low: number } | null {
  const first = 30; // 30 one-minute bars = 30-min opening range
  if (entry.length < first) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < first; i++) {
    lo = Math.min(lo, entry[i].low);
    hi = Math.max(hi, entry[i].high);
  }
  return { high: hi, low: lo };
}

function calcVwap(candles: Candle[], upto: number): number | null {
  let pv = 0;
  let v = 0;
  for (let i = 0; i <= upto; i++) {
    const c = candles[i];
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : null;
}

function noDataSignal(input: ScalpAnalysisInput, cfg: ScalpConfig): ScalpSignal {
  return {
    symbol: input.symbol,
    assetClass: input.assetClass,
    timestamp: input.now,
    direction: "BUY",
    verdict: "NO TRADE",
    timeframes: ["15m", "5m", "1m"],
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
    regime: "LOW_VOLATILITY",
    session: "",
    holdingWindow: "—",
    reasons: ["insufficient historical data"],
    invalidation: "—",
    blockedByNews: false,
    noTradeReason: "insufficient historical data",
    setupId: null,
    spreadBlocked: false,
    volBlocked: false,
    factors: []
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}