import type { Direction, RiskLevel, Timeframe } from "../../types";
import type { InstrumentAnalysis, Signal, SignalType } from "../analysis-types";
import { safeRatio } from "../../utils";
import type { StrategyConfig } from "./strategy-config";

export interface DraftSignal {
  direction: Direction;
  type: SignalType;
  confluence: number;
  noTrade?: string | null;
  reasons: string[];
}

export interface LimitLevel {
  price: number;
  kind: string;
  strength: number;
}

/**
 * EntryEngine — turns a direction + confluence assessment into a concrete,
 * executable signal with an entry, a defined invalidation (stop), and defined
 * targets. It owns both market entries and resting limit orders, reading all
 * thresholds (bands, SL/TP ladders, proximity) from StrategyConfig so the
 * numbers live in one place.
 */
export class EntryEngine {
  constructor(private config: StrategyConfig) {}

  /** Whether a resting level is near an existing S/R level on the correct side. */
  private isNearLevel(direction: Direction, analysis: InstrumentAnalysis, levelPrice: number): boolean {
    const prox = this.config.limit.levelProximityPct;
    return direction === "BUY"
      ? analysis.supportResistance.supports.some((s) => Math.abs(s.price - levelPrice) <= levelPrice * prox)
      : analysis.supportResistance.resistances.some((r) => Math.abs(r.price - levelPrice) <= levelPrice * prox);
  }

  /** Pick the best close-by resting level for a limit in the given direction. */
  limitLevel(direction: Direction, analysis: InstrumentAnalysis): LimitLevel | null {
    const cfg = this.config.limit;
    const price = analysis.price;
    const atr = analysis.atr || price * this.config.risk.atrFallbackPct;

    const band = Math.max(price * cfg.bandPct, Math.max(atr * cfg.bandAtrFloor, price * cfg.bandPriceFloor));
    const minDist = Math.max(atr * 0.35, price * cfg.minDistPct);
    const maxDist = Math.min(band * 3, price * cfg.maxDistPct);

    const candidates: LimitLevel[] = [];

    // FVG discount/premium zones first.
    for (const g of analysis.fvg) {
      const correct = direction === "BUY" ? g.type === "bullish" : g.type === "bearish";
      if (!correct || g.filled) continue;
      const mid = (g.upper + g.lower) / 2;
      if (direction === "BUY" && mid < price) {
        candidates.push({ price: mid, kind: g.type === "bullish" ? "Bullish FVG (discount)" : "Bearish FVG", strength: 10 });
      } else if (direction === "SELL" && mid > price) {
        candidates.push({ price: mid, kind: g.type === "bearish" ? "Bearish FVG (premium)" : "Bullish FVG", strength: 10 });
      }
    }

    // Inverse FVG HTF magnet zones.
    for (const g of analysis.ifvg) {
      const mid = (g.upper + g.lower) / 2;
      if (direction === "BUY" && mid < price) candidates.push({ price: mid, kind: "HTF IFVG (discount)", strength: 9 });
      else if (direction === "SELL" && mid > price) candidates.push({ price: mid, kind: "HTF IFVG (premium)", strength: 9 });
    }

    // Order blocks / liquidity pools.
    for (const a of analysis.liquidity.areas) {
      const col = a.price - price;
      const correct = direction === "BUY" ? col < 0 : col > 0;
      if (correct) candidates.push({ price: a.price, kind: a.kind, strength: 7 });
    }

    // Classic S/R levels.
    const src = direction === "BUY" ? analysis.supportResistance.supports : analysis.supportResistance.resistances;
    for (const L of src) candidates.push({ price: L.price, kind: L.kind, strength: L.strength });

    // Session / prior-day extremes and fib retracements.
    const sR = analysis.supportResistance;
    if (direction === "BUY") {
      if (sR.sessionHighLow?.low != null) candidates.push({ price: sR.sessionHighLow.low, kind: "Session Low", strength: 6 });
      if (sR.dayHighLow?.low != null) candidates.push({ price: sR.dayHighLow.low, kind: "Prior Day Low", strength: 7 });
    } else {
      if (sR.sessionHighLow?.high != null) candidates.push({ price: sR.sessionHighLow.high, kind: "Session High", strength: 6 });
      if (sR.dayHighLow?.high != null) candidates.push({ price: sR.dayHighLow.high, kind: "Prior Day High", strength: 7 });
    }
    for (const [key, level] of Object.entries(analysis.fib.levels)) {
      const col = level - price;
      const correct = direction === "BUY" ? col < 0 : col > 0;
      if (correct) candidates.push({ price: level, kind: `Fib ${key}`, strength: parseFloat(key) >= 0.5 ? 8 : 5 });
    }

    const valid = candidates
      .filter((L) => {
        const dist = Math.abs(L.price - price);
        const col = L.price - price;
        const correct = direction === "BUY" ? col < 0 : col > 0;
        return correct && dist >= minDist && dist <= maxDist;
      })
      .sort((a, b) => {
        const da = Math.abs(a.price - price);
        const db = Math.abs(b.price - price);
        if (Math.abs(da - db) < maxDist * 0.3) return b.strength - a.strength;
        return da - db;
      });

    if (valid.length) return valid[0];

    // No confirmed zone nearby — derive a clean placeable pullback level.
    return {
      price: direction === "BUY" ? price - band : price + band,
      kind: direction === "BUY" ? "Pullback Discount" : "Pullback Premium",
      strength: 4
    };
  }

  /** Full resting-limit draft with confluence gating. */
  buildLimitDraft(direction: Direction, analysis: InstrumentAnalysis): DraftSignal | null {
    const W = this.config.confluenceWeights;
    const indH = analysis.indicators["1h"] ?? analysis.indicators["4h"];
    const ind5 = analysis.indicators["5m"] ?? analysis.indicators["15m"];

    const level = this.limitLevel(direction, analysis);
    if (!level) return null;

    const reasons: string[] = [];
    let confluence = 0;

    const struct = analysis.structure.structureType;
    const isPullbackCtx = struct === "PULLBACK" || struct === "RANGE" || struct === "RETEST" || struct === "CHANGE OF CHARACTER";
    if (isPullbackCtx) { confluence += W.pullbackStructure; reasons.push("Pullback structure confirmed"); }
    else if (this.isNearLevel(direction, analysis, level.price)) { confluence += W.restingAtLevel; reasons.push("Resting at key level"); }

    const momAgrees = direction === "BUY"
      ? (indH?.macd?.histogram ?? 0) >= 0 || (ind5?.ema?.["20"] ?? 0) > (ind5?.ema?.["50"] ?? 1e-9)
      : (indH?.macd?.histogram ?? 0) <= 0 || (ind5?.ema?.["20"] ?? 0) < (ind5?.ema?.["50"] ?? 1e-9);
    if (momAgrees) { confluence += W.momentum; reasons.push("Momentum aligned"); }

    const gzone = analysis.fvg.find((g) =>
      direction === "BUY"
        ? g.type === "bullish" && g.lower <= level.price && level.price <= g.upper
        : g.type === "bearish" && g.lower <= level.price && level.price <= g.upper
    );
    if (gzone) { confluence += W.fvgZone; reasons.push(direction === "BUY" ? "Buying discount (FVG)" : "Selling premium (FVG)"); }

    const izone = analysis.ifvg.find((g) =>
      direction === "BUY"
        ? g.type === "bullish" && g.lower <= level.price && level.price <= g.upper
        : g.type === "bearish" && g.lower <= level.price && level.price <= g.upper
    );
    if (izone) { confluence += W.ifvg; reasons.push("HTF inverse FVG confluence"); }

    const liq = analysis.liquidity.areas.find((a) =>
      direction === "BUY"
        ? a.price >= level.price && a.price - level.price <= analysis.atr * 1.2
        : a.price <= level.price && level.price - a.price <= analysis.atr * 1.2
    );
    if (liq) { confluence += W.liquidityOb; reasons.push("Liquidity/order-block confluence"); }

    if (analysis.trend.higherTimeframe.includes(direction === "BUY" ? "BULLISH" : "BEARISH")) {
      confluence += W.htfDirectional; reasons.push("Higher timeframe agrees");
    }

    const fibDeep = analysis.fib.retracementDepth;
    if (fibDeep !== null && fibDeep <= 2) {
      confluence += W.fibonacciDiscount; reasons.push("Fibonacci retracement discount");
    }

    if (confluence < this.config.scoring.limitConfluenceFloor) return null;

    return {
      direction,
      type: direction === "BUY" ? "BUY LIMIT" : "SELL LIMIT",
      confluence,
      reasons: reasons.slice(0, 4)
    };
  }

  setupName(direction: Direction, analysis: InstrumentAnalysis): string {
    const st = analysis.structure.structureType;
    if (analysis.structure.bos) return direction === "BUY" ? "Bullish Breakout" : "Bearish Breakout";
    if (st === "HIGHER HIGHS") return "Bullish Continuation";
    if (st === "LOWER LOWS") return "Bearish Continuation";
    if (analysis.structure.choch) return direction === "BUY" ? "Bullish Reversal" : "Bearish Reversal";
    return direction === "BUY" ? "Bullish Pullback" : "Bearish Pullback";
  }

  timeframesFor(draft: DraftSignal): Timeframe[] {
    return draft.type.includes("SCALP") ? ["5m", "15m"] : ["5m", "15m", "1h"];
  }

  /** Build the final signal with defined invalidation (SL) and targets (TPs). */
  buildSignal(
    instrument: { symbol: string; name: string; assetClass: string; baseDecimals: number },
    analysis: InstrumentAnalysis,
    draft: DraftSignal,
    score: number,
    risk: { riskLevel: RiskLevel; riskScore: number },
    timeNow = Date.now()
  ): Signal {
    const price = analysis.price;
    const atrVal = analysis.atr || price * this.config.risk.atrFallbackPct;
    const direction = draft.direction;
    const R = this.config.risk;

    const isLimit = draft.type.includes("LIMIT");
    const resting = isLimit ? this.limitLevel(direction, analysis) : null;
    const entry = resting ? resting.price : price;

    // Defined invalidation: stop just beyond the nearest structure low/high on
    // the correct side, clamped to stay tight relative to ATR.
    const buffers = analysis.supportResistance;
    const nearestStructure = direction === "BUY"
      ? buffers.supports.filter((s) => s.price < entry).sort((a, b) => b.price - a.price)[0]?.price
      : buffers.resistances.filter((r) => r.price > entry).sort((a, b) => a.price - b.price)[0]?.price;
    const baseStop = direction === "BUY"
      ? (nearestStructure ?? entry - Math.max(atrVal, price * R.atrFallbackPct))
      : (nearestStructure ?? entry + Math.max(atrVal, price * R.atrFallbackPct));
    const rawStopDist = Math.abs(entry - baseStop);
    const stopDist = Math.min(
      Math.max(rawStopDist, Math.max(atrVal * R.stopMinAtr, price * R.stopMinPct)),
      Math.max(price * R.stopMaxPct, atrVal * R.stopMaxAtr)
    );
    const stopLoss = direction === "BUY" ? entry - stopDist : entry + stopDist;

    // Defined targets: laddered at 1R / 1.6R / 2.2R (from config).
    const [m1, m2, m3] = R.tpLadder;
    const tp1 = direction === "BUY" ? entry + stopDist * m1 : entry - stopDist * m1;
    const tp2 = direction === "BUY" ? entry + stopDist * m2 : entry - stopDist * m2;
    const tp3 = direction === "BUY" ? entry + stopDist * m3 : entry - stopDist * m3;

    const riskReward = safeRatio(tp1 - entry, entry - stopLoss);
    const riskToReward = 1 / Math.max(riskReward, 0.001);

    return {
      id: `sig-${instrument.symbol}-${timeNow}-${Math.floor(Math.random() * 10000)}`,
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      type: draft.type,
      direction,
      entry,
      entryZone: [entry - atrVal * 0.2, entry + atrVal * 0.2],
      stopLoss,
      takeProfits: [tp1, tp2, tp3],
      riskReward,
      confidence: score,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      timeframes: this.timeframesFor(draft),
      trendLabel: analysis.trend.regime,
      setupName: this.setupName(direction, analysis),
      reason: draft.reasons.join(", "),
      status: draft.type.includes("LIMIT") ? "WAITING" : "ACTIVE",
      createdAt: timeNow,
      updatedAt: timeNow,
      session: analysis.session,
      score: 1 / riskToReward
    };
  }
}
