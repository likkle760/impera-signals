import { describe, it, expect } from "vitest";
import { computeQuantMetrics, maxDrawdown, rFromOutcome } from "./metrics";

describe("quant metrics — pure math", () => {
  it("handles empty input without NaN/Infinity", () => {
    const m = computeQuantMetrics({ r: [] });
    expect(m.trades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.netR).toBe(0);
    expect(m.expectancyR).toBe(0);
    expect(m.maxDrawdownR).toBe(0);
    expect(Number.isFinite(m.sharpe)).toBe(true);
    expect(Number.isFinite(m.sortino)).toBe(true);
    expect(m.profitFactor).toBe(0);
    expect(m.equityCurve).toEqual([]);
  });

  it("computes expectancy, win rate, profit factor and equity curve", () => {
    const m = computeQuantMetrics({ r: [2, -1, 3, -1, 1] });
    expect(m.trades).toBe(5);
    expect(m.wins).toBe(3);
    expect(m.losses).toBe(2);
    expect(m.winRate).toBeCloseTo(0.6, 5);
    expect(m.netR).toBeCloseTo(4, 5);
    expect(m.expectancyR).toBeCloseTo(0.8, 5);
    expect(m.avgWinR).toBeCloseTo(2, 5);
    expect(m.avgLossR).toBeCloseTo(-1, 5);
    expect(m.profitFactor).toBeCloseTo(6 / 2, 5);
    expect(m.equityCurve).toEqual([2, 1, 4, 3, 4]);
  });

  it("maxDrawdown is the worst peak-to-trough on the R curve", () => {
    expect(maxDrawdown([2, 1, 4, 3, 4])).toBeCloseTo(1, 5);
    expect(maxDrawdown([0, -2, -3, -1])).toBeCloseTo(3, 5);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
  });

  it("sharpe/sortino are finite for mixed R and unbounded for zero-variance wins", () => {
    const mixed = computeQuantMetrics({ r: [1, -1, 2, -0.5, 1.5] });
    expect(Number.isFinite(mixed.sharpe)).toBe(true);
    expect(mixed.sharpe).toBeGreaterThan(0);
    expect(mixed.sharpeAnnualized).toBeGreaterThan(mixed.sharpe);
    expect(Number.isFinite(mixed.sortino)).toBe(true);

    const steady = computeQuantMetrics({ r: [1, 1, 1, 1] });
    expect(steady.sharpe).toBe(Infinity); // no volatility + positive mean
    expect(steady.sortino).toBe(Infinity);

    const single = computeQuantMetrics({ r: [2] });
    expect(single.sharpe).toBe(0); // no variance estimate from 1 sample
  });

  it("Infinity profit factor when there are wins but zero losses", () => {
    const m = computeQuantMetrics({ r: [1, 2, 3] });
    expect(m.profitFactor).toBe(Infinity);
  });

  it("streaks and break-even buckets", () => {
    const m = computeQuantMetrics({ r: [1, 1, -1, 0, -1, -1, 2] });
    expect(m.longestWinStreak).toBe(2);
    expect(m.longestLossStreak).toBe(2);
    expect(m.breakEven).toBe(1);
  });

  it("avgBarsHeld uses the parallel array when provided", () => {
    const m = computeQuantMetrics({ r: [1, -1], barsHeld: [10, 20] });
    expect(m.avgBarsHeld).toBeCloseTo(15, 5);
    expect(computeQuantMetrics({ r: [1] }).avgBarsHeld).toBeNull();
  });

  it("rFromOutcome maps signal history outcomes to R", () => {
    expect(rFromOutcome("won", 2.4, "SWING BUY")).toBeCloseTo(2.4, 5);
    expect(rFromOutcome("lost", 2.4, "SWING BUY")).toBe(-1);
    expect(rFromOutcome("invalidated", undefined, "MARKET SELL")).toBe(-1);
    expect(rFromOutcome("pending", 3, "BUY LIMIT")).toBe(0);
    expect(rFromOutcome("won", undefined, "MARKET BUY")).toBe(1); // fallback
  });
});
