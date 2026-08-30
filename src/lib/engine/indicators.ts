import type { Candle } from "../types";
import { mean, stdDev, sum } from "../utils";

export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += values[i];
    if (i >= period) acc -= values[i - period];
    if (i >= period - 1) out[i] = acc / period;
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period + 1) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-9));
  }
  return out;
}

export function trueRange(c: Candle): number {
  const prevClose = c.close;
  const a = c.high - c.low;
  const b = Math.abs(c.high - prevClose);
  const d = Math.abs(c.low - prevClose);
  return Math.max(a, b, d);
}

export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return out;
  const tr = candles.slice(1).map((_, i) => trueRange(candles[i]));
  let avg = mean(tr.slice(0, period));
  out[period] = avg;
  for (let i = period + 1; i < candles.length; i++) {
    avg = (avg * (period - 1) + trueRange(candles[i])) / period;
    out[i] = avg;
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const macdLine = values.map((_, i) => fastEma[i] - slowEma[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

export function adx(
  candles: Candle[],
  period = 14
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = candles.length;
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  const adxArr: number[] = new Array(n).fill(NaN);
  if (n < period + 1) return { adx: adxArr, plusDI, minusDI };

  const trueRangeArr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    if (up > down && up > 0) plusDM[i] = up;
    if (down > up && down > 0) minusDM[i] = down;
    trueRangeArr[i] = trueRange(candles[i]);
  }

  let atrSum = sum(trueRangeArr.slice(1, 1 + period));
  let plusSum = sum(plusDM.slice(1, 1 + period));
  let minusSum = sum(minusDM.slice(1, 1 + period));
  const dx: number[] = new Array(n).fill(NaN);

  for (let i = period; i < n; i++) {
    atrSum += trueRangeArr[i];
    plusSum += plusDM[i];
    minusSum += minusDM[i];
    atrSum -= trueRangeArr[i - period];
    plusSum -= plusDM[i - period];
    minusSum -= minusDM[i - period];

    if (atrSum > 0) {
      plusDI[i] = (plusSum / atrSum) * 100;
      minusDI[i] = (minusSum / atrSum) * 100;
      const diSum = plusDI[i] + minusDI[i];
      if (diSum > 0) {
        dx[i] = (Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100;
      }
    }
  }

  const validDx = dx.filter((v) => !isNaN(v));
  if (validDx.length > period) {
    let dxx = mean(validDx.slice(0, period));
    let idx = period + n - validDx.length;
    adxArr[idx] = dxx;
    for (let i = idx + 1; i < n; i++) {
      if (!isNaN(dx[i])) {
        dxx = (dxx * (period - 1) + dx[i]) / period;
        adxArr[i] = dxx;
      }
    }
  }
  return { adx: adxArr, plusDI, minusDI };
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(values, period);
  const upper: number[] = new Array(values.length).fill(NaN);
  const lower: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const sd = stdDev(window);
    upper[i] = middle[i] + mult * sd;
    lower[i] = middle[i] - mult * sd;
  }
  return { upper, middle, lower };
}

export function stochastic(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  for (let i = period - 1; i < n; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      high = Math.max(high, candles[j].high);
      low = Math.min(low, candles[j].low);
    }
    out[i] = ((candles[i].close - low) / (high - low || 1e-9)) * 100;
  }
  return out;
}

export function pivotPoints(candles: Candle[], lookback = 2): {
  swingHighs: number[];
  swingLows: number[];
} {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  const n = candles.length;
  for (let i = lookback; i < n - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (candles[j].high > candles[i].high) isHigh = false;
      if (candles[j].low < candles[i].low) isLow = false;
    }
    if (isHigh) swingHighs.push(candles[i].high);
    if (isLow) swingLows.push(candles[i].low);
  }
  return { swingHighs, swingLows };
}
