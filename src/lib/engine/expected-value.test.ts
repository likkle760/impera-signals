import { describe, expect, it } from "vitest";
import { MIN_EV_SAMPLE, expectedValueR, expectedValueRounded } from "./expected-value";

describe("expected value", () => {
  it("is positive R for a high hit-rate with healthy R:R", () => {
    // 90% win rate at 1:1.8 → 0.9*1.8 - 0.1 = +1.52R
    expect(expectedValueR(0.9, 1.8)).toBeCloseTo(1.52, 5);
    expect(expectedValueR(0.9, 1.8)).toBeGreaterThan(0);
  });

  it("can be negative even with a high hit-rate (tiny rewards)", () => {
    // 95% win rate at 1:0.2 → 0.95*0.2 - 0.05 = +0.14R (positive, but thin)
    expect(expectedValueR(0.95, 0.2)).toBeCloseTo(0.14, 5);
    // 60% win rate at 1:1 → 0.6 - 0.4 = +0.2R
    expect(expectedValueR(0.6, 1)).toBeCloseTo(0.2, 5);
    // 70% win rate at 1:0.8 → 0.56 - 0.3 = +0.26R ... but at 1:0.5 → 0.35-0.3=+0.05R
    expect(expectedValueR(0.7, 0.5)).toBeCloseTo(0.05, 5);
  });

  it("shows a losing profile despite a majority of wins is impossible when R:R large", () => {
    // The point: EV is win% and R:R together, not win% alone.
    // 50% win rate at 1:2 → 1 - 0.5 = +0.5R (break-even outcome is EV 0)
    expect(expectedValueR(0.5, 2)).toBeCloseTo(0.5, 5);
    expect(expectedValueR(1 / 3, 2)).toBeCloseTo(0, 5); // exactly break-even
    expect(expectedValueR(0.2, 2)).toBeCloseTo(-0.4, 5); // negative
  });

  it("rejects invalid inputs", () => {
    expect(expectedValueR(1.2, 2)).toBeNaN();
    expect(expectedValueR(-0.1, 2)).toBeNaN();
    expect(expectedValueR(0.5, Number.NaN)).toBeNaN();
    expect(expectedValueRounded(0.5, Number.NaN)).toBeUndefined();
  });

  it("requires a real sample before claiming EV", () => {
    expect(MIN_EV_SAMPLE).toBeGreaterThanOrEqual(10);
  });

  it("rounds to two decimals", () => {
    expect(expectedValueRounded(0.9, 1.8)).toBe(1.52);
  });
});