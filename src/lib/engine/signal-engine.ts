import type {
  Direction,
  Instrument,
  NoTradeReason,
  RiskLevel,
  Timeframe
} from "../types";
import { clamp, safeRatio } from "../utils";
import type {
  AnalysisSnapshot,
  FutureOpportunity,
  InstrumentAnalysis,
  Signal,
  SignalType
} from "./analysis-types";
import { RiskEngine } from "./risk";
import { SwingSignalEngine } from "./swing/signal";
import { SWING_VALIDATION } from "./swing";
import { ScalpSignalEngine } from "./scalp/signal";
import { SCALPING_VALIDATION } from "./scalp";
import type { Candle } from "../types";

export interface SignalEngineConfig {
  minSignalScore: number;
  maxRiskLevel: RiskLevel;
  minRiskReward: number;
  enabledTimeframes: Timeframe[];
  enabledModes: { scalp: boolean; dayTrade: boolean; swing: boolean };
}

export const DEFAULT_SIGNAL_CONFIG: SignalEngineConfig = {
  minSignalScore: 55,
  maxRiskLevel: "HIGH",
  minRiskReward: 1.2,
  enabledTimeframes: ["1m", "3m", "5m", "15m", "30m", "1h", "4h"],
  enabledModes: { scalp: true, dayTrade: true, swing: true }
};

export interface DraftSignal {
  direction: Direction;
  type: SignalType;
  reasons: string[];
  confluence: number;
  noTrade?: NoTradeReason;
}

export class SignalEngine {
  private config: SignalEngineConfig;
  private risk: RiskEngine;
  private swingEngine = new SwingSignalEngine();
  private scalpEngine = new ScalpSignalEngine();

  constructor(config: Partial<SignalEngineConfig> = {}, risk?: RiskEngine) {
    this.config = { ...DEFAULT_SIGNAL_CONFIG, ...config };
    this.risk = risk ?? new RiskEngine();
  }

  detect(instrument: Instrument, analysis: InstrumentAnalysis): DraftSignal[] {
    const trend = analysis.trend;
    const ind5 = analysis.indicators["5m"] ?? analysis.indicators["15m"];
    const indM = analysis.indicators["15m"] ?? analysis.indicators["30m"];
    const indH = analysis.indicators["1h"] ?? analysis.indicators["4h"];

    const htfBias = trend.higherTimeframe;
    const htfBull = htfBias.includes("BULLISH");
    const htfBear = htfBias.includes("BEARISH");

    const bulk = emaBull(ind5, analysis.price);
    const bearish = emaBear(ind5, analysis.price);
    // 5-minute primary momentum — read from the 5m candles so signals track the
    // trader's own timeframe (EMA-bias agreement with 5m is captured separately).
    const momentumUp = ind5?.macd ? macdPositive(ind5) : maBull(indM, analysis.price);
    const momentumDown = ind5?.macd ? macdNegative(ind5) : maBear(indM, analysis.price);

    const reasons: string[] = [];
    let confluence = 0;

    if (htfBull) { confluence += 3; reasons.push("Higher timeframe bullish"); }
    if (htfBear) { confluence += 3; reasons.push("Higher timeframe bearish"); }
    if (bulk && htfBull) { confluence += 2; reasons.push("Lower timeframe agrees"); }
    if (bearish && htfBear) { confluence += 2; reasons.push("Lower timeframe agrees"); }
    if (analysis.structure.bos) { confluence += 2; reasons.push("Break of structure"); }
    if (momentumUp) { confluence += 2; reasons.push("Momentum positive"); }
    if (momentumDown) { confluence += 2; reasons.push("Momentum negative"); }

    const marketNotConfirmed = confluence < 4;

    // Decide direction based on confluence-weighted bias
    let bullPoints = 0;
    let bearPoints = 0;
    if (htfBull) bullPoints += 3;
    if (htfBear) bearPoints += 3;
    if (bulk) bullPoints += 2;
    if (bearish) bearPoints += 2;
    if (isFinite(ind5?.adx ?? NaN) && (ind5?.plusDI ?? 0) > (ind5?.minusDI ?? 0)) bullPoints += 1;
    if (isFinite(ind5?.adx ?? NaN) && (ind5?.minusDI ?? 0) > (ind5?.plusDI ?? 0)) bearPoints += 1;
    if (momentumUp) bullPoints += 1;
    if (momentumDown) bearPoints += 1;
    if (analysis.structure.structureType === "HIGHER HIGHS") bullPoints += 1;
    if (analysis.structure.structureType === "LOWER LOWS") bearPoints += 1;

    // ICT/SMC 5m direction gate: never call BUY while the 5m candle is bearish,
    // and never call SELL while it is bullish.
    const nearTerm = shortTermBias(ind5, analysis.price);
    if (nearTerm === "SELL") bearPoints += 3;
    if (nearTerm === "BUY") bullPoints += 3;

    let direction: Direction = bullPoints >= bearPoints ? "BUY" : "SELL";
    // Hard lock: align with the prevailing 5m candle/regime.
    if (nearTerm === "SELL") direction = "SELL";
    if (nearTerm === "BUY") direction = "BUY";

    // Determine signal type by timeframe context and structure
    const scalp = this.config.enabledModes.scalp;
    const structure = analysis.structure.structureType;
    const isPullback = structure === "RANGE" || structure === "PULLBACK" || structure === "RETEST";

    let marketType: SignalType;
    if (scalp) {
      marketType = direction === "BUY" ? (isPullback ? "SCALP BUY" : "MARKET BUY")
        : (isPullback ? "SCALP SELL" : "MARKET SELL");
    } else {
      marketType = direction === "BUY" ? "DAY TRADE BUY" : "DAY TRADE SELL";
    }

    const drafts: DraftSignal[] = [];

    // Accuracy gates apply ONLY to the immediate MARKET entry: enough confluence,
    // 5m candle/momentum agreement, no 5m regime contradiction, a REAL trend
    // (not chop), and a CLEAR one-sided lead. Weak/balanced point counts flip
    // direction in chop (the classic whipsaw that kills accuracy), so a directional
    // market call only fires when the trend is genuinely one-sided. Since a trend
    // is directional, both LONG and SHORT still appear — each on its own trend.
    const fiveAgrees = direction === "BUY" ? (nearTerm === "BUY" || momentumUp) : (nearTerm === "SELL" || momentumDown);
    const regimeConflicts = direction === "BUY"
      ? trend.shortTerm.includes("BEARISH")
      : trend.shortTerm.includes("BULLISH");
    const adx = isFinite(ind5?.adx ?? NaN) ? (ind5?.adx ?? 0) : (indM?.adx ?? 0);
    const realTrend =
      adx >= 20 ||
      trend.strength >= 25 ||
      (direction === "BUY" ? (trend.directionalBias === "BUY" && (momentumUp || nearTerm === "BUY")) : (trend.directionalBias === "SELL" && (momentumDown || nearTerm === "SELL")));
    // Clear lead: direction must outscore the opposite side by a meaningful margin
    // (HTF + LT + momentum + structure all agreeing = the only case we go to market).
    const clearLead = Math.abs(bullPoints - bearPoints) >= 3;

    // The modular ScalpSignalEngine is authoritative for the immediate scalp
    // entry whenever 15m/5m/1m series + a live spread are available. It owns the
    // direction gate (15m context → 5m setup → 1m confirmation), the mandatory
    // spread/volatility/session/news filters, and a strict NO TRADE default.
    // Only when it cannot run (no series / no spread) do we fall back to the
    // legacy confluence market draft.
    const scalpDraft = this.buildScalpDraft(instrument, analysis);

    if (!scalpDraft) {
      // TREND ALIGNMENT GATE (market calls only): never fire a market BUY/SELL
      // against a clear higher-timeframe trend. This is the single biggest source
      // of losses in discretionary trading — buying into a daily/4H downtrend for
      // a counter-trend bounce on the 5m, then getting run over. LONG only with a
      // bullish HTF, SHORT only with a bearish HTF; no clear HTF trend means we
      // wait for one instead of guessing. The limit entry below is LEFT alone.
      const htfClear = htfBull !== htfBear;
      const htfAligned = !htfClear || (direction === "BUY" ? htfBull : htfBear);
      if (marketNotConfirmed) {
        drafts.push({ direction, type: marketType, confluence, noTrade: "SETUP NOT CONFIRMED", reasons: ["Insufficient confluence"] });
      } else if (!htfAligned) {
        drafts.push({ direction, type: marketType, confluence, noTrade: "COUNTER-TREND", reasons: [`${htfBear ? "HTF bearish" : "HTF bullish"} — not fading the trend`] });
      } else if (!fiveAgrees) {
        drafts.push({ direction, type: marketType, confluence, noTrade: "CHOPPY MARKET", reasons: ["5M momentum not confirmed"] });
      } else if (regimeConflicts) {
        drafts.push({ direction, type: marketType, confluence, noTrade: "CONFLICTING TIMEFRAMES", reasons: ["5M regime conflicts with entry side"] });
      } else if (!realTrend) {
        drafts.push({ direction, type: marketType, confluence, noTrade: "CHOPPY MARKET", reasons: ["No confirmed trend (ADX weak)"] });
      } else if (!clearLead) {
        drafts.push({ direction, type: marketType, confluence, noTrade: "CHOPPY MARKET", reasons: ["Balanced signals — no clear directional trend"] });
      } else {
        drafts.push({ direction, type: marketType, confluence, reasons: reasons.slice(0, 4) });
      }
    } else {
      drafts.push(scalpDraft);
    }

    // A resting LIMIT entry is evaluated INDEPENDENTLY of the immediate market gate —
    // it waits on a pullback to an aligned key level, so it stays available even when
    // current 5m momentum is flat.
    const limit = this.buildLimitDraft(direction, analysis);
    if (limit) drafts.push(limit);

    // SWING mode: longer-horizon position for forex (and metals). Direction is read
    // ONLY from the higher timeframes (1h/4h) so it rides the real swing instead of
    // 5m noise, and it must be a genuine one-sided HTF trend (accuracy matters more
    // here because swing carries a bigger lot size). Both LONG and SHORT appear, each
    // on its own confirmed HTF trend. Uses a distinct 1h/4h signal type.
    const swing = this.buildSwingDraft(instrument, analysis);
    if (swing) drafts.push(swing);

    return drafts;
  }

  /**
   * Emits a SWING BUY / SWING SELL draft for longer-held, trend-conformant trades.
   *
   * This delegates to the modular SwingSignalEngine: the DAILY candle defines the
   * dominant trend bias, and the 4H candle confirms the entry (pullback + structure
   * + momentum + volatility + reward:risk). The engine is intentionally SELECTIVE —
   * it returns NO TRADE when conditions are poor — and it rides the daily swing
   * rather than intraday noise. Both LONG and SHORT appear, each on its own confirmed
   * daily trend; only one side (the aligned one) is emitted per scan.
   */
  private buildSwingDraft(instrument: Instrument, analysis: InstrumentAnalysis): DraftSignal | null {
    if (!this.config.enabledModes.swing) return null;
    // Swing positions are aimed at forex/metal pairs (traded 24h, deep liquidity).
    if (instrument.assetClass !== "forex" && instrument.assetClass !== "metals") return null;

    const daily = seriesFor(analysis, "1d");
    const hour4 = seriesFor(analysis, "4h");
    if (!daily || !hour4) return null;

    const sig = this.swingEngine.evaluate({
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      daily,
      hour4,
      now: analysis.timestamp
    });

    if (sig.verdict === "NO TRADE") return null;

    const direction: Direction = sig.direction === "SELL" ? "SELL" : "BUY";
    return {
      direction,
      type: direction === "BUY" ? "SWING BUY" : "SWING SELL",
      confluence: Math.round(sig.score),
      reasons: sig.reasons.slice(0, 4)
    };
  }

  /**
   * Emits an authoritative SCALP BUY / SCALP SELL draft via the modular
   * ScalpSignalEngine. Returns null ONLY when the engine cannot run (scalp mode
   * off, or 15m/5m/1m series or spread missing) — in that case the caller falls
   * back to the legacy confluence path. When it CAN run, its NO TRADE verdict is
   * final and returned as a no-trade draft so downstream UI explains rejection.
   */
  private buildScalpDraft(instrument: Instrument, analysis: InstrumentAnalysis): DraftSignal | null {
    if (!this.config.enabledModes.scalp) return null;

    const m1 = seriesFor(analysis, "1m");
    const m5 = seriesFor(analysis, "5m");
    const m15 = seriesFor(analysis, "15m");
    if (!m1 || !m5 || !m15) return null;
    if (!isFinite(analysis.spread) || analysis.spread <= 0) return null;

    const sig = this.scalpEngine.evaluate({
      symbol: instrument.symbol,
      assetClass: instrument.assetClass,
      context: m15,
      setup: m5,
      entry: m1,
      spread: analysis.spread,
      price: analysis.price,
      now: analysis.timestamp
    });

    const direction: Direction = sig.direction === "SELL" ? "SELL" : "BUY";
    if (sig.verdict === "NO TRADE") {
      return {
        direction,
        type: direction === "BUY" ? "SCALP BUY" : "SCALP SELL",
        confluence: Math.round(sig.score),
        reasons: sig.noTradeReason ? [sig.noTradeReason] : sig.reasons.slice(0, 4),
        noTrade: "SETUP NOT CONFIRMED"
      };
    }
    return {
      direction,
      type: direction === "BUY" ? "SCALP BUY" : "SCALP SELL",
      confluence: Math.round(sig.score),
      reasons: sig.reasons.slice(0, 4)
    };
  }

  /**
   * Emits a BUY LIMIT / SELL LIMIT only after full confluence analysis:
   * strong HTF direction + price near a confirmed support (buy) or resistance (sell)
   * + momentum/structure agreement + a clean entry zone. The order rests at the
   * level (not market), so it only fills on a pullback.
   */
  private buildLimitDraft(direction: Direction, analysis: InstrumentAnalysis): DraftSignal | null {
    const indH = analysis.indicators["1h"] ?? analysis.indicators["4h"];
    const ind5 = analysis.indicators["5m"] ?? analysis.indicators["15m"];
    const atr = analysis.atr || analysis.price * 0.002;
    const price = analysis.price;

    // TREND ALIGNMENT GATE for resting limits (same rule as the market path):
    // never rest a BUY LIMIT below a bearish higher-timeframe trend, nor a SELL
    // LIMIT below a bullish one. A pullback limit is only a good fill if the
    // eventual direction rides WITH the prevailing trend. A neutral HTF means we
    // wait rather than guess — this is the fix for the flood of one-sided buy
    // limits that used to fire without any market confirmation.
    const htf = (analysis.trend.higherTimeframe || "").toUpperCase();
    const htfBull = htf.includes("BULLISH");
    const htfBear = htf.includes("BEARISH");
    if (direction === "BUY" && htfBear) return null;
    if (direction === "SELL" && htfBull) return null;
    if (!htfBull && !htfBear) return null; // no clear HTF trend → no resting level

    const level = this.limitLevel(direction, analysis, atr);
    if (!level) return null;

    // Full-confluence checks before declaring a limit opportunity.
    const reasons: string[] = [];
    let confluence = 0;

    // 1) Structure context: a pullback/reversal is ideal, but price respecting a
    //    key level after any move is still a valid resting entry for the user.
    const struct = analysis.structure.structureType;
    const isPullbackCtx = struct === "PULLBACK" || struct === "RANGE" || struct === "RETEST" || struct === "CHANGE OF CHARACTER";
    const nearSupport = direction === "BUY"
      ? analysis.supportResistance.supports.some((s) => Math.abs(s.price - level.price) <= level.price * 0.004)
      : analysis.supportResistance.resistances.some((r) => Math.abs(r.price - level.price) <= level.price * 0.004);
    if (isPullbackCtx) { confluence += 3; reasons.push("Pullback structure confirmed"); }
    else if (nearSupport) { confluence += 2; reasons.push("Resting at key level"); }

    // 2) Momentum supports the eventual direction
    const momAgrees = direction === "BUY"
      ? (indH?.macd?.histogram ?? 0) >= 0 || (ind5?.ema?.["20"] ?? 0) > (ind5?.ema?.["50"] ?? 1e-9)
      : (indH?.macd?.histogram ?? 0) <= 0 || (ind5?.ema?.["20"] ?? 0) < (ind5?.ema?.["50"] ?? 1e-9);
    if (momAgrees) { confluence += 2; reasons.push("Momentum aligned"); }

    // 3) FVG discount/premium zone confluence
    const gz = analysis.fvg.find((g) =>
      direction === "BUY"
        ? g.type === "bullish" && g.lower <= level.price && level.price <= g.upper
        : g.type === "bearish" && g.lower <= level.price && level.price <= g.upper
    );
    if (gz) { confluence += 2; reasons.push(direction === "BUY" ? "Buying discount (FVG)" : "Selling premium (FVG)"); }

    // 4) Liquidity area / order block confluence
    const liq = analysis.liquidity.areas.find((a) =>
      direction === "BUY"
        ? a.price >= level.price && a.price - level.price <= atr * 1.2
        : a.price <= level.price && level.price - a.price <= atr * 1.2
    );
    if (liq) { confluence += 2; reasons.push("Liquidity/order-block confluence"); }

    // 5) HTF directional agreement (optional but strong)
    if (analysis.trend.higherTimeframe.includes(direction === "BUY" ? "BULLISH" : "BEARISH")) {
      confluence += 2; reasons.push("Higher timeframe agrees");
    }

    // 6) Fibonacci discount/premium for the eventual direction
    const fibDeep = analysis.fib.retracementDepth;
    if (fibDeep !== null && fibDeep <= 2) {
      confluence += 1; reasons.push("Fibonacci retracement discount");
    }

    // A resting level close by + direction that respects the short-term candle is
    // enough to keep the user "ready" with a placeable order.
    if (confluence < 4) return null;

    return {
      direction,
      type: direction === "BUY" ? "BUY LIMIT" : "SELL LIMIT",
      confluence,
      reasons: reasons.slice(0, 4)
    };
  }

  /**
   * Chooses a close, placeable resting level for a limit order. ICT/SMC style:
   * prefer the nearest unbounded FVG / order block / S-R zone on the correct
   * side, otherwise derive a small pullback level off market so orders stay
   * ready to fill (e.g. gold ~4605 -> SELL LIMIT ~4615/4620).
   */
  private limitLevel(
    direction: Direction,
    analysis: InstrumentAnalysis,
    atr: number
  ): { price: number; kind: string; strength: number } | null {
    const price = analysis.price;
    // Small pullback band off market (capped % so gold stays ~10-20 pts away).
    const band = Math.max(price * 0.0025, Math.max(atr, price * 0.0008));
    const minDist = Math.max(atr * 0.35, price * 0.0008);
    const maxDist = Math.min(band * 3, price * 0.012);

    const candidates: { price: number; kind: string; strength: number }[] = [];

    // ICT FVG discount/premium zones first (they are the best pullback entries).
    for (const g of analysis.fvg) {
      const correct = direction === "BUY" ? g.type === "bullish" : g.type === "bearish";
      if (!correct || g.filled) continue;
      const mid = (g.upper + g.lower) / 2;
      if (direction === "BUY" && mid < price) {
        candidates.push({ price: mid, kind: g.type === "bullish" ? "Bullish FVG (discount)" : "Bearish FVG", strength: 9 + (g.type === "bullish" ? 1 : 0) });
      } else if (direction === "SELL" && mid > price) {
        candidates.push({ price: mid, kind: g.type === "bearish" ? "Bearish FVG (premium)" : "Bullish FVG", strength: 9 + (g.type === "bearish" ? 1 : 0) });
      }
    }

    // Order blocks / liquidity pools.
    for (const a of analysis.liquidity.areas) {
      const col = a.price - price;
      const correct = direction === "BUY" ? col < 0 : col > 0;
      if (correct) candidates.push({ price: a.price, kind: a.kind, strength: 7 });
    }

    // Classic S/R levels.
    const sR = analysis.supportResistance;
    const src = direction === "BUY" ? sR.supports : sR.resistances;
    for (const L of src) {
      candidates.push({ price: L.price, kind: L.kind, strength: L.strength });
    }

    // Session / prior-day extremes and Fibonacci retracements.
    if (direction === "BUY") {
      const sessLow = sR.sessionHighLow?.low;
      if (sessLow != null) candidates.push({ price: sessLow, kind: "Session Low", strength: 6 });
      const dayLow = sR.dayHighLow?.low;
      if (dayLow != null) candidates.push({ price: dayLow, kind: "Prior Day Low", strength: 7 });
    } else {
      const sessHigh = sR.sessionHighLow?.high;
      if (sessHigh != null) candidates.push({ price: sessHigh, kind: "Session High", strength: 6 });
      const dayHigh = sR.dayHighLow?.high;
      if (dayHigh != null) candidates.push({ price: dayHigh, kind: "Prior Day High", strength: 7 });
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
    const derived = direction === "BUY" ? price - band : price + band;
    return { price: derived, kind: direction === "BUY" ? "Pullback Discount" : "Pullback Premium", strength: 4 };
  }

  score(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    draft: DraftSignal
  ): number {
    let score = 0;
    const trend = analysis.trend;
    const ind = analysis.indicators["5m"] ?? analysis.indicators["15m"];
    const indH = analysis.indicators["1h"] ?? analysis.indicators["4h"];

    score += Math.min(25, trend.strength * 0.25);
    score += Math.min(15, trend.momentum * 0.15);
    if (draft.direction === "BUY" && trend.directionalBias === "BUY") score += 10;
    if (draft.direction === "SELL" && trend.directionalBias === "SELL") score += 10;
    if (ind && emaBull(ind, analysis.price) && draft.direction === "BUY") score += 8;
    if (ind && emaBear(ind, analysis.price) && draft.direction === "SELL") score += 8;

    // Trend-following reward: a signal aligned with BOTH the HTF bias and the
    // short-term trend (plus rising ADX = a real, tradeable trend) scores higher,
    // because riding the existing trend is more accurate than fighting it.
    const htfAligned =
      (draft.direction === "BUY" && trend.higherTimeframe.includes("BULLISH")) ||
      (draft.direction === "SELL" && trend.higherTimeframe.includes("BEARISH"));
    const shortAligned =
      (draft.direction === "BUY" && (trend.shortTerm.includes("BULLISH") || trend.mediumTerm.includes("BULLISH"))) ||
      (draft.direction === "SELL" && (trend.shortTerm.includes("BEARISH") || trend.mediumTerm.includes("BEARISH")));
    if (htfAligned) score += 6;
    if (shortAligned) score += 6;
    if (htfAligned && shortAligned) score += 6;
    if (ind && isFinite(ind.adx) && ind.adx >= 20) score += 4; // real trend strength, not chop

    if (ind && isFinite(ind.rsi) && draft.direction === "BUY" && ind.rsi > 50 && ind.rsi < 70) score += 5;
    if (ind && isFinite(ind.rsi) && draft.direction === "SELL" && ind.rsi < 50 && ind.rsi > 30) score += 5;
    if (indH && indH.macd && draft.direction === "BUY" && indH.macd.histogram > 0) score += 5;
    if (indH && indH.macd && draft.direction === "SELL" && indH.macd.histogram < 0) score += 5;
    if (analysis.supportResistance.supports.length && draft.direction === "BUY") score += 4;
    if (analysis.supportResistance.resistances.length && draft.direction === "SELL") score += 4;
    if (ind && analysis.structure.bos && draft.direction === "BUY" && ind.vwap !== null && analysis.price > ind.vwap) score += 4;

    score += Math.min(10, draft.confluence * 2);

    return Math.round(clamp(score, 0, 100));
  }

  buildSignal(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    draft: DraftSignal,
    score: number,
    risk: { riskLevel: RiskLevel; riskScore: number },
    timeNow = Date.now()
  ): Signal | null {
    const price = analysis.price;
    const atrVal = analysis.atr || price * 0.002;
    const direction = draft.direction;

    const isLimit = draft.type.includes("LIMIT");
    const isSwing = draft.type.includes("SWING");
    const isScalp = draft.type.includes("SCALP");
    const resting = isLimit ? this.limitLevel(direction, analysis, atrVal) : null;
    const entry = resting ? resting.price : price;

    // Stop placed just beyond the nearest structure low/high (middle lows) so it
    // sits right beside the swing we are trading from, then clamped to stay tight.
    // For a BUY the stop is the nearest support BELOW entry; for SELL the nearest
    // resistance ABOVE entry.
    const buffers = analysis.supportResistance;
    const nearestStructure = direction === "BUY"
      ? buffers.supports.filter((s) => s.price < entry).sort((a, b) => b.price - a.price)[0]?.price
      : buffers.resistances.filter((r) => r.price > entry).sort((a, b) => a.price - b.price)[0]?.price;
    const baseStop = direction === "BUY"
      ? (nearestStructure ?? entry - Math.max(atrVal, price * 0.0008))
      : (nearestStructure ?? entry + Math.max(atrVal, price * 0.0008));
    const rawStopDist = Math.abs(entry - baseStop);
    // Prefer ATR-based sizing but keep it from blasting far out; never exceed the
    // "middle low" swing distance (already capped) so risk stays manageable.
    // SWING trades use a wider stop (multi-ATR on the 1h/4h scale) to survive
    // normal intraday retracement on a longer hold.
    const tightStop = Math.min(
      Math.max(rawStopDist, Math.max(atrVal * 0.5, price * 0.0006)),
      Math.max(price * 0.004, atrVal * 1.2)
    );
    const stopDist = isSwing
      ? Math.min(Math.max(rawStopDist * 2, atrVal * 1.8, price * 0.002), Math.max(price * 0.01, atrVal * 4))
      : tightStop;
    const stopLoss = direction === "BUY" ? entry - stopDist : entry + stopDist;

    // Take profits are kept close and laddered (~1R / 1.6R / 2.2R), not stretched.
    // Swing rides further: deeper ladder out to ~3.5R for the longer hold.
    const tpLadder = isSwing ? [1.5, 2.4, 3.5] : [1.0, 1.6, 2.2];
    const tp1 = direction === "BUY" ? entry + stopDist * tpLadder[0] : entry - stopDist * tpLadder[0];
    const tp2 = direction === "BUY" ? entry + stopDist * tpLadder[1] : entry - stopDist * tpLadder[1];
    const tp3 = direction === "BUY" ? entry + stopDist * tpLadder[2] : entry - stopDist * tpLadder[2];

    const riskReward = safeRatio(tp1 - entry, entry - stopLoss);
    const riskToReward = 1 / Math.max(riskReward, 0.001);

    // Build a tight, placeable entry zone around the fill price so the trader can
    // actually get filled. For a market order the zone hugs the live price; for a
    // resting limit it flanks the resting level. Previously this was ±0.2 ATR,
    // which produced un-placeably wide bands on high-ATR assets (gold, BTC).
    const zoneHalf = isLimit
      ? Math.max(atrVal * 0.06, price * 0.0003)
      : Math.max(atrVal * 0.04, price * 0.0002);
    const zoneCap = isLimit ? atrVal * 0.12 : atrVal * 0.08;
    const zone = Math.min(zoneHalf, zoneCap);
    const entryZone: [number, number] = [entry - zone, entry + zone];

    // Keep the stop just beyond the entry zone so it never overlaps the band.
    const zoneClearance = Math.max(zone * 2.2, stopDist * 0.25);
    const finalStop = direction === "BUY"
      ? Math.min(stopLoss, entry - zoneClearance)
      : Math.max(stopLoss, entry + zoneClearance);

    // This trader operates on the 5-minute timeframe — every signal is 5m-primary,
    // except SWING which is read off the 1h/4h that define its trade horizon.
    const timeframes: Timeframe[] = draft.type.includes("SCALP")
      ? ["5m", "15m"]
      : draft.type.includes("SWING")
        ? ["1h", "4h", "1d"]
        : ["5m", "15m", "1h"];

    const setupName = this.setupName(direction, analysis);

    // A single clear sentence that spells out DIRECTION + which trend it rides +
    // the key confirmations, so every card explains itself (e.g. "LONG with the
    // bullish 5m trend — HTF bullish, momentum up, break of structure").
    const trendWord = analysis.trend.regime || analysis.trend.higherTimeframe || "neutral trend";
    const ridingWith =
      (direction === "BUY" && analysis.trend.higherTimeframe.includes("BULLISH")) ||
      (direction === "SELL" && analysis.trend.higherTimeframe.includes("BEARISH"));
    const reasonLead = draft.type.includes("SWING")
      ? `${direction === "BUY" ? "SWING LONG" : "SWING SHORT"} with the ${trendWord}`
      : `${direction === "BUY" ? "LONG" : "SHORT"} riding the ${trendWord}${ridingWith ? " (with trend)" : ""}`;
    const extra = draft.reasons.length ? ` — confirmations: ${draft.reasons.join("; ")}` : "";
    const reason = `${reasonLead}.${extra}`;

    const id = `sig-${instrument.symbol}-${timeNow}-${Math.floor(Math.random() * 10000)}`;

    const signal: Signal = {
      id,
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      type: draft.type,
      direction,
      entry,
      entryZone,
      stopLoss: finalStop,
      takeProfits: [tp1, tp2, tp3],
      riskReward,
      confidence: score,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore,
      timeframes,
      trendLabel: analysis.trend.regime,
      setupName,
      reason: draft.reasons.join(", "),
      status: draft.type.includes("LIMIT") ? "WAITING" : "ACTIVE",
      createdAt: timeNow,
      updatedAt: timeNow,
      session: analysis.session,
      score: 1 / riskToReward,
      validationNote: isSwing && !SWING_VALIDATION.validated
        ? "NOT VALIDATED FOR LIVE USE"
        : isScalp && !SCALPING_VALIDATION.validated
          ? "SCALPING STRATEGY NOT VALIDATED FOR LIVE USE"
          : undefined
    };
    return signal;
  }

  private setupName(direction: Direction, analysis: InstrumentAnalysis): string {
    const s = analysis.structure.structureType;
    if (analysis.structure.bos) return direction === "BUY" ? "Bullish Breakout" : "Bearish Breakout";
    if (s === "HIGHER HIGHS") return "Bullish Continuation";
    if (s === "LOWER LOWS") return "Bearish Continuation";
    if (analysis.structure.choch) return direction === "BUY" ? "Bullish Reversal" : "Bearish Reversal";
    return direction === "BUY" ? "Bullish Pullback" : "Bearish Pullback";
  }

  unpack(a: AnalysisSnapshot): void {}
}

function num(v: number | undefined): v is number {
  return typeof v === "number" && isFinite(v);
}

/** Extract a CandleSeries' candles by timeframe from an analysis. */
function seriesFor(
  analysis: InstrumentAnalysis,
  timeframe: Timeframe
): Candle[] | null {
  const s = analysis.series.find((x) => x.timeframe === timeframe);
  return s && s.candles.length ? s.candles : null;
}

function emaBull(ind: IndicatorLike, price: number): boolean {
  const e20 = ind?.ema?.["20"];
  const e50 = ind?.ema?.["50"];
  return num(e20) && num(e50) && price > e20 && e20 > e50;
}
function emaBear(ind: IndicatorLike, price: number): boolean {
  const e20 = ind?.ema?.["20"];
  const e50 = ind?.ema?.["50"];
  return num(e20) && num(e50) && price < e20 && e20 < e50;
}
function maBull(ind: IndicatorLike, price: number): boolean {
  const e50 = ind?.ema?.["50"];
  return num(e50) && price > e50;
}
function maBear(ind: IndicatorLike, price: number): boolean {
  const e50 = ind?.ema?.["50"];
  return num(e50) && price < e50;
}
function macdPositive(ind: IndicatorLike): boolean {
  return !!ind?.macd?.histogram && ind.macd.histogram > 0;
}
function macdNegative(ind: IndicatorLike): boolean {
  return !!ind?.macd?.histogram && ind.macd.histogram < 0;
}

/**
 * ICT/SMC short-term trend gate. Reads the 5m/15m snapshot to decide whether the
 * immediate market is bearish or bullish so we never fade the current candle.
 */
function shortTermBias(ind: IndicatorLike, price: number): "BUY" | "SELL" | "NEUTRAL" {
  const e20 = ind?.ema?.["20"];
  const e50 = ind?.ema?.["50"];
  let bull = 0;
  let bear = 0;

  // EMA alignment
  if (num(e20) && num(e50)) {
    if (price > e20 && e20 > e50) bull += 2;
    if (price < e20 && e20 < e50) bear += 2;
  }
  // MACD histogram
  if (num(ind?.macd?.histogram)) {
    if (ind.macd!.histogram > 0) bull += 1;
    else if (ind.macd!.histogram < 0) bear += 1;
  }
  // RSI
  if (num(ind?.rsi)) {
    if (ind.rsi! > 55) bull += 1;
    else if (ind.rsi! < 45) bear += 1;
  }
  // ADX direction
  if (num(ind?.plusDI) && num(ind?.minusDI)) {
    if (ind.plusDI! > ind.minusDI!) bull += 1;
    else if (ind.minusDI! > ind.plusDI!) bear += 1;
  }

  if (bear > bull && bear >= 2) return "SELL";
  if (bull > bear && bull >= 2) return "BUY";
  return "NEUTRAL";
}

type IndicatorLike = InstrumentAnalysis["indicators"]["1m"] | undefined;
