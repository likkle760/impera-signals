import { describe, it, expect } from "vitest";
import { ema, rsi, macd, atr, sma, adx, pivotPoints } from "./indicators";
import type { Candle } from "../types";

function mkCloses(n: number, start = 100, step = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(start + i * step);
  return out;
}

function mkCandles(n: number): Candle[] {
  return mkCloses(n).map((close, i) => ({
    time: i,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 100
  }));
}

describe("ema", () => {
  it("returns an array of the same length", () => {
    const vals = mkCloses(50);
    expect(ema(vals, 20).length).toBe(50);
  });
  it("tracks rising prices above the mean", () => {
    const vals = mkCloses(60, 100, 1);
    const e = ema(vals, 20);
    expect(e[e.length - 1]).toBeGreaterThan(100);
  });
});

describe("sma", () => {
  it("computes simple moving average", () => {
    const vals = [1, 2, 3, 4];
    const s = sma(vals, 2);
    expect(s[2]).toBe(2.5);
    expect(s[3]).toBe(3.5);
    expect(s[0]).toBeNaN();
  });
});

describe("rsi", () => {
  it("returns 100 for strictly rising prices", () => {
    const vals = mkCloses(30);
    const r = rsi(vals, 14);
    expect(r[r.length - 1]).toBeGreaterThan(90);
  });
  it("returns near 0 for strictly falling prices", () => {
    const vals = mkCloses(30, 200, -1);
    const r = rsi(vals, 14);
    expect(r[r.length - 1]).toBeLessThan(10);
  });
});

describe("macd", () => {
  it("produces positive histogram on a strong uptrend", () => {
    const vals = mkCloses(200);
    const m = macd(vals);
    expect(m.histogram[m.histogram.length - 1]).toBeGreaterThan(0);
  });
});

describe("atr", () => {
  it("is positive when candles move", () => {
    const candles = mkCandles(60);
    const a = atr(candles, 14);
    const last = [...a].reverse().find((v) => !isNaN(v))!;
    expect(last).toBeGreaterThan(0);
  });
});

describe("adx", () => {
  it("returns a bounded trend value", () => {
    const candles = mkCandles(200);
    const d = adx(candles, 14);
    const last = [...d.adx].reverse().find((v) => !isNaN(v));
    expect(last).toBeDefined();
    if (last !== undefined) {
      expect(last).toBeGreaterThanOrEqual(0);
      expect(last).toBeLessThanOrEqual(100);
    }
  });
});

describe("pivotPoints", () => {
  it("detects a swing high on a peak", () => {
    const prices = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2, 1];
    const candles = prices.map((close, i) => ({
      time: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 10
    }));
    const { swingHighs } = pivotPoints(candles, 2);
    expect(swingHighs.length).toBeGreaterThan(0);
  });
});
