import type { Direction, Instrument, RiskLevel } from "../types";
import type {
  FutureOpportunity,
  FutureStatus,
  InstrumentAnalysis,
  Level
} from "./analysis-types";

/**
 * FutureOpportunityEngine
 *
 * Flags levels where a setup MAY become valid IN THE CURRENT MARKET.
 * To keep everything relevant to live price, every zone must sit within
 * PROXIMITY_ATR of the current price — far-away levels are ignored so the
 * panel never shows "future" signals that are detached from the market.
 *
 * Context is read from the SWING timeframes (1h / 4h / daily), because any
 * setup worth staging as a swing must align with the higher-timeframe trend
 * rather than intraday noise.
 */
export class FutureOpportunityEngine {
  /** Only consider levels that sit within this many ATRs of current price. */
  private static readonly PROXIMITY_ATR = 1.1;

  generate(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    timeNow = Date.now()
  ): FutureOpportunity[] {
    const out: FutureOpportunity[] = [];
    const trend = analysis.trend;
    const price = analysis.price;
    const atrVal = analysis.atr || price * 0.002;

    const htfBull = trend.higherTimeframe.includes("BULLISH");
    const htfBear = trend.higherTimeframe.includes("BEARISH");

    // Swing-timeframe context (1h/4h) drives validity and the narrative.
    const swing = this.swingContext(analysis);

    // Nearest support that is still near current price (pullback target for BUY).
    const support = this.nearLevel(analysis.supportResistance.supports, price, atrVal, "below");
    // Nearest resistance that is still near current price (rejection target for SELL).
    const resistance = this.nearLevel(analysis.supportResistance.resistances, price, atrVal, "above");

    // BUY ZONE: bullish swing context + support within reach of current price.
    if (htfBull && support) {
      const zoneLo = support - atrVal * 0.15;
      const zoneHi = support + atrVal * 0.3;
      out.push(this.makeZone(instrument, analysis, "BUY ZONE", "BUY", [zoneLo, zoneHi], swing, timeNow));
    }

    // SELL ZONE: bearish swing context + resistance within reach of current price.
    if (htfBear && resistance) {
      const zoneLo = resistance - atrVal * 0.3;
      const zoneHi = resistance + atrVal * 0.15;
      out.push(this.makeZone(instrument, analysis, "SELL ZONE", "SELL", [zoneLo, zoneHi], swing, timeNow));
    }

    return out;
  }

  /** Find a swing-direction level that is still within PROXIMITY_ATR of price. */
  private nearLevel(
    levels: Level[],
    price: number,
    atrVal: number,
    side: "above" | "below"
  ): number | null {
    for (const lvl of levels) {
      const dist = side === "below" ? price - lvl.price : lvl.price - price;
      if (dist < 0) continue; // wrong side — ignore
      if (dist > atrVal * FutureOpportunityEngine.PROXIMITY_ATR) continue; // too far — ignore
      return lvl.price;
    }
    return null;
  }

  /** Compact read of the swing (1h/4h/daily) context for narrative + validity. */
  private swingContext(analysis: InstrumentAnalysis) {
    const ind4 = analysis.indicators["4h"];
    const ind1 = analysis.indicators["1h"];
    let bull = 0;
    let bear = 0;
    const tags: string[] = [];

    if (ind4 && ind1) {
      if (analysis.price > ind4.ema["20"] && ind4.ema["20"] > ind4.ema["50"]) {
        bull += 2;
        tags.push("4h EMA stacked bull");
      }
      if (analysis.price < ind4.ema["20"] && ind4.ema["20"] < ind4.ema["50"]) {
        bear += 2;
        tags.push("4h EMA stacked bear");
      }
      if ((ind4.macd?.histogram ?? 0) > 0) { bull += 1; tags.push("4h MACD +"); }
      if ((ind4.macd?.histogram ?? 0) < 0) { bear += 1; tags.push("4h MACD −"); }
      if ((ind1.macd?.histogram ?? 0) > 0) { bull += 1; tags.push("1h momentum +"); }
      if ((ind1.macd?.histogram ?? 0) < 0) { bear += 1; tags.push("1h momentum −"); }
    }

    return { bullScore: bull, bearScore: bear, tags };
  }

  private makeZone(
    instrument: Instrument,
    analysis: InstrumentAnalysis,
    kind: string,
    direction: Direction,
    zone: [number, number],
    swing: { bullScore: number; bearScore: number; tags: string[] },
    timeNow: number
  ): FutureOpportunity {
    const atrVal = analysis.atr || analysis.price * 0.002;
    const stopLoss = direction === "BUY" ? zone[0] - atrVal * 0.5 : zone[1] + atrVal * 0.5;
    const mid = (zone[0] + zone[1]) / 2;
    const tp1 = direction === "BUY" ? mid + atrVal * 1.2 : mid - atrVal * 1.2;
    const tp2 = direction === "BUY" ? mid + atrVal * 2 : mid - atrVal * 2;
    const tp3 = direction === "BUY" ? mid + atrVal * 3 : mid - atrVal * 3;

    const isBuy = direction === "BUY";
    const status: FutureStatus = "WAITING";
    const swingBias = isBuy ? "bullish" : "bearish";
    const conditions = [
      `Price reaches ${zone[0].toFixed(instrument.baseDecimals)} - ${zone[1].toFixed(instrument.baseDecimals)}`,
      isBuy ? "Bullish rejection appears" : "Bearish rejection appears",
      isBuy ? "1H/4H structure holds bullish" : "1H/4H structure holds bearish",
      "Momentum confirms",
      "Spread remains acceptable"
    ];

    const riskLevel: RiskLevel =
      analysis.spread / Math.max(analysis.price, 1e-9) > 0.0003 ||
      analysis.trend.volatilityScore > 60
        ? "HIGH"
        : analysis.trend.volatilityScore > 40
        ? "MEDIUM"
        : "LOW";

    const confTags = swing.tags.length
      ? swing.tags.slice(0, 2).join(", ")
      : `price trending ${swingBias} on 1H/4H`;
    const confidence = isBuy
      ? 68 + Math.round(Math.min(Math.max(swing.bullScore, analysis.trend.strength * 0.4), 30))
      : 68 + Math.round(Math.min(Math.max(swing.bearScore, analysis.trend.strength * 0.4), 30));

    return {
      id: `fut-${instrument.symbol}-${kind}-${timeNow}-${Math.floor(Math.random() * 1000)}`,
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      direction,
      kind,
      watchZone: zone,
      stopLoss,
      takeProfits: [tp1, tp2, tp3],
      triggerConditions: conditions,
      status,
      confidence: Math.min(Math.max(confidence, 40), 95),
      riskLevel,
      createdAt: timeNow,
      updatedAt: timeNow,
      reason: isBuy
        ? `Bullish swing on 1H/4H. Watch zone sits within reach of current price — staged pullback into support. (${confTags})`
        : `Bearish swing on 1H/4H. Watch zone sits within reach of current price — staged rejection into resistance. (${confTags})`
    };
  }
}
