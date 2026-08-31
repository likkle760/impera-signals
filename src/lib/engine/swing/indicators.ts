import type { Candle } from "../../types";
import type { SwingRegime } from "./types";

/** Simple EMA over a numeric series (last value meaningful). */
export function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (!values.length) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out[i] = values[0];
      prev = values[0];
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** True Range at index i (0-based) computed from a slice. */
export function trueRange(candles: Candle[], i: number): number {
  const c = candles[i];
  if (i === 0) return c.high - c.low;
  const prev = candles[i - 1];
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
}

/** ATR at index upto over `period` bars, using only bars <= upto. */
export function atrAt(candles: Candle[], upto: number, period = 14): number {
  const start = Math.max(1, upto - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= upto; i++) {
    sum += trueRange(candles, i);
    n++;
  }
  return n ? sum / n : candles[upto].close * 0.002;
}

/** RSI (Wilder approx) at index upto. */
export function rsiAt(closes: number[], upto: number, period = 14): number {
  const start = Math.max(1, upto - period);
  let gains = 0;
  let losses = 0;
  let n = 0;
  for (let i = start + 1; i <= upto; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
    n++;
  }
  if (n === 0) return 50;
  const avgGain = gains / n;
  const avgLoss = losses / n;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** ADX approximation at index upto (directionless strength read). 0 if flat. */
export function adxAt(candles: Candle[], upto: number, period = 14): number {
  if (upto < period * 2 + 5) return 0;
  let plusDM = 0;
  let minusDM = 0;
  let trSum = 0;
  for (let i = upto - period; i <= upto; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const upMove = c.high - prev.high;
    const dnMove = prev.low - c.low;
    const pdm = upMove > dnMove && upMove > 0 ? upMove : 0;
    const mdm = dnMove > upMove && dnMove > 0 ? dnMove : 0;
    plusDM += pdm;
    minusDM += mdm;
    trSum += trueRange(candles, i);
  }
  if (trSum <= 0) return 0;
  const pdi = (100 * plusDM) / trSum;
  const mdi = (100 * minusDM) / trSum;
  if (pdi + mdi === 0) return 0;
  const dx = (Math.abs(pdi - mdi) / (pdi + mdi)) * 100;
  return dx;
}

/** RSI-recovery momentum read: whether momentum is recovering/resolving bullish. */
export function momentumRecoveryBull(closes: number[], upto: number, rsiThreshold: number): boolean {
  const rsi = rsiAt(closes, upto);
  return rsi >= rsiThreshold;
}
export function momentumRecoveryBear(closes: number[], upto: number, rsiThreshold: number): boolean {
  const rsi = rsiAt(closes, upto);
  return rsi <= 100 - rsiThreshold;
}

/**
 * Market-regime classifier on the confirmation timeframe's recent bars:
 * trending vs ranging (via ADX) crossed with volatility (via ATR%).
 */
export function classifyRegime(
  candles: Candle[],
  upto: number,
  atr: number,
  atrPctFloor: number,
  atrPctCeil: number
): SwingRegime {
  const price = candles[upto].close;
  const adx = adxAt(candles, upto);
  const atrPct = atr / Math.max(price, 1e-9);
  const trending = adx >= 20;
  const lowVol = atrPct < atrPctFloor;
  const highVol = atrPct > atrPctCeil;
  if (highVol) return "HIGH_VOLATILITY";
  if (lowVol) return "LOW_VOLATILITY";
  return trending ? "TRENDING" : "RANGING";
}
