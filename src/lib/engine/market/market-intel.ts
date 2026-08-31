import type { MarketRegime } from "../../types";
import type { InstrumentAnalysis } from "../analysis-types";
import type { Candle } from "../../types";
import { LiquiditySweepEngine } from "./liquidity-sweep";
import { DisplacementEngine } from "./displacement";
import { ImbalanceEngine } from "./imbalance";
import { SupplyDemandEngine } from "./supply-demand";
import { PremiumDiscountEngine } from "./premium-discount";
import { NarrativeEngine, type Narrative } from "./narrative";
import { CorrelationEngine, parsePair } from "./correlation";

/**
 * Compose the full market-intelligence layer for a single instrument into a
 * narrative + correlation note, given an already-computed InstrumentAnalysis.
 * Used by the coordinator to attach human-readable "why" to every signal.
 */

export interface MarketIntel {
  narrative: Narrative;
  correlationNote: string | null;
  liquidityEvent: string | null;
  structureBreak: "BOS" | "CHOCH" | "MSS" | null;
  fvg: string | null;
  zone: string | null;
}

function primaryCandles(analysis: InstrumentAnalysis, tf: string): Candle[] {
  const s = analysis.series.find((x) => x.timeframe === tf);
  return s?.candles ?? ([] as Candle[]);
}

export function buildMarketIntel(analysis: InstrumentAnalysis): MarketIntel {
  const price = analysis.price;
  const atr = Math.max(analysis.atr, 1e-9);
  const candles5 = primaryCandles(analysis, "5m");

  const structure = {
    bos: analysis.structure?.bos ?? !!analysis.trend.directionalBias,
    choch: analysis.structure?.choch ?? false,
    bias: (analysis.trend.directionalBias ?? analysis.trend.shortTerm ?? "NEUTRAL") as MarketRegime
  };

  const sweep = new LiquiditySweepEngine({ maxWickAtr: 3 }).detect({
    candles: candles5,
    upto: Math.max(0, candles5.length - 1),
    atr,
    structure,
    majorLevels: []
  });

  const dip = new DisplacementEngine().detect(
    candles5,
    Math.max(0, candles5.length - 1),
    atr
  );

  const imbalance = new ImbalanceEngine().detect({
    candles: candles5,
    upto: Math.max(0, candles5.length - 1),
    atr,
    htfBias: structure.bias,
    structure,
    displacement: dip
  });

  const supplyDemand = new SupplyDemandEngine().detectOrderBlocks({
    candles: candles5,
    upto: Math.max(0, candles5.length - 1),
    atr,
    htfBias: structure.bias,
    structure,
    displacement: dip
  });

  const premium = new PremiumDiscountEngine().detect(
    candles5,
    Math.max(0, candles5.length - 1),
    price,
    1,
    () => analysis.session
  );

  const narrative = new NarrativeEngine().build({
    symbol: analysis.symbol,
    price,
    htfBias: structure.bias,
    structureByTF: [{ tf: "5m", bias: structure.bias, bos: !!(structure.bos || structure.choch) }],
    liquidity: sweep as any,
    displacement: dip,
    imbalance: { gaps: [], best: imbalance.best as any },
    zones: supplyDemand,
    premium,
    session: analysis.session,
    leanDirection: null
  });

  const { base } = parsePair(analysis.symbol);
  const corr = new CorrelationEngine();
  const cRes = corr.resolve({
    signals: [{ symbol: analysis.symbol, direction: "BUY", quality: 100, rr: 2 }]
  });
  const correlationNote = `DXY & correlation are context only (see §15): net ${cRes.netExposure[base] >= 0 ? "long" : "short"} ${base} across the watchlist; verify against USD context before sizing.`;

  return {
    narrative,
    correlationNote,
    liquidityEvent: narrative.liquidity ?? null,
    structureBreak: structure.bos ? "BOS" : structure.choch ? "CHOCH" : null,
    fvg: imbalance.best ? `${imbalance.best.type} FVG` : null,
    zone: supplyDemand.zones.length ? supplyDemand.zones[0].type : null
  };
}