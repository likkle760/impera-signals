import type { CandleSeries, Timeframe } from "../types";
import {
  adx,
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic
} from "./indicators";
import type { IndicatorSnapshot } from "./analysis-types";

export interface TAConfig {
  enabledIndicators: string[];
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atrPeriod: number;
  adxPeriod: number;
  bbPeriod: number;
}

export const DEFAULT_TA_CONFIG: TAConfig = {
  enabledIndicators: [
    "ema",
    "rsi",
    "macd",
    "atr",
    "adx",
    "vwap",
    "bollinger",
    "stochastic"
  ],
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  atrPeriod: 14,
  adxPeriod: 14,
  bbPeriod: 20
};

export class TechnicalAnalysisEngine {
  private config: TAConfig;

  constructor(config: Partial<TAConfig> = {}) {
    this.config = { ...DEFAULT_TA_CONFIG, ...config };
  }

  analyze(timeframes: CandleSeries[]): Record<Timeframe, IndicatorSnapshot> {
    const out = {} as Record<Timeframe, IndicatorSnapshot>;
    for (const series of timeframes) {
      out[series.timeframe] = this.analyzeSeries(series.candles);
    }
    return out;
  }

  private analyzeSeries(candles: CandleSeries["candles"]): IndicatorSnapshot {
    return this.analyzeCandles(candles);
  }

  analyzeCandles(candles: CandleSeries["candles"]): IndicatorSnapshot {
    const closes = candles.map((c) => c.close);
    const cfg = this.config;
    const enabled = cfg.enabledIndicators;

    const emaResult: Record<string, number> = {};
    if (enabled.includes("ema")) {
      const e9 = ema(closes, 9);
      const e20 = ema(closes, 20);
      const e50 = ema(closes, 50);
      const e100 = ema(closes, 100);
      const e200 = ema(closes, 200);
      const last = closes.length - 1;
      emaResult["9"] = e9[last] ?? NaN;
      emaResult["20"] = e20[last] ?? NaN;
      emaResult["50"] = e50[last] ?? NaN;
      emaResult["100"] = e100[last] ?? NaN;
      emaResult["200"] = e200[last] ?? NaN;
    }

    let rsiVal = NaN;
    if (enabled.includes("rsi")) {
      const r = rsi(closes, cfg.rsiPeriod);
      rsiVal = r[r.length - 1];
    }

    let macdVal: IndicatorSnapshot["macd"] = null;
    if (enabled.includes("macd")) {
      const m = macd(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
      macdVal = {
        macd: m.macd[m.macd.length - 1],
        signal: m.signal[m.signal.length - 1],
        histogram: m.histogram[m.histogram.length - 1]
      };
    }

    let atrVal = NaN;
    if (enabled.includes("atr")) {
      const a = atr(candles, cfg.atrPeriod);
      atrVal = a[a.length - 1];
    }

    let adxVal = NaN;
    let plusDI = NaN;
    let minusDI = NaN;
    if (enabled.includes("adx")) {
      const d = adx(candles, cfg.adxPeriod);
      const i = d.adx.length - 1;
      // find last valid ADX
      let lastValid = NaN;
      for (let k = d.adx.length - 1; k >= 0; k--) {
        if (!isNaN(d.adx[k])) {
          lastValid = d.adx[k];
          break;
        }
      }
      adxVal = lastValid;
      plusDI = d.plusDI[i];
      minusDI = d.minusDI[i];
    }

    let vwapVal: number | null = null;
    if (enabled.includes("vwap")) {
      vwapVal = this.calcVwap(candles);
    }

    let bbVal: IndicatorSnapshot["bollinger"] = null;
    if (enabled.includes("bollinger")) {
      const b = bollinger(closes, cfg.bbPeriod, 2);
      bbVal = {
        upper: b.upper[b.upper.length - 1],
        middle: b.middle[b.middle.length - 1],
        lower: b.lower[b.lower.length - 1]
      };
    }

    let stoVal: number | null = null;
    if (enabled.includes("stochastic")) {
      const s = stochastic(candles, 14);
      stoVal = s[s.length - 1];
    }

    const snap: IndicatorSnapshot = {
      ema: emaResult,
      rsi: rsiVal,
      macd: macdVal,
      atr: atrVal,
      adx: adxVal,
      plusDI,
      minusDI,
      vwap: vwapVal,
      bollinger: bbVal,
      stochastic: stoVal
    };
    return snap;
  }

  private calcVwap(candles: CandleSeries["candles"]): number | null {
    if (!candles.length) return null;
    let pv = 0;
    let v = 0;
    for (const c of candles) {
      const typical = (c.high + c.low + c.close) / 3;
      pv += typical * c.volume;
      v += c.volume;
    }
    return v > 0 ? pv / v : null;
  }
}
