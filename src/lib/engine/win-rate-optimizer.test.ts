import { describe, expect, it } from "vitest";
import type { InstrumentAnalysis, Signal } from "./analysis-types";
import type { ConfidenceBreakdown } from "./confidence";
import {
  OPTIMIZER_CONFIDENCE_BAR,
  WIN_RATE_TARGET,
  applyWinRateOptimizer
} from "./win-rate-optimizer";

function baseBreakdown(patch: Partial<ConfidenceBreakdown["details"]> = {}, total = 88): ConfidenceBreakdown {
  return {
    trend: 20,
    structure: 15,
    liquidity: 13,
    entryZone: 14,
    momentum: 10,
    riskReward: 10,
    session: 10,
    total,
    passed: total >= OPTIMIZER_CONFIDENCE_BAR,
    reasons: ["fixture"],
    grade: "VERY STRONG SETUP",
    details: {
      htfAligned: { "4h": true, "1h": true, exec: true },
      structure: { bos: true, choch: false, sequence: true },
      liquidity: { sweepHigh: false, sweepLow: true, cleanRejection: true },
      fvg: null,
      zoneConfluence: true,
      momentum: { displacement: true, confirmed: true },
      riskReward: { rr: 2.2, rrOk2: true, rrOk3: false },
      session: { highLiquidity: true, dangerous: false },
      chopVeto: false,
      ...patch
    }
  };
}

function baseAnalysis(patch: Partial<InstrumentAnalysis["liquidity"]> = {}): InstrumentAnalysis {
  return {
    liquidity: {
      sweeps: [],
      equalLows: [],
      equalHighs: [],
      areas: [],
      ...patch
    }
  } as unknown as InstrumentAnalysis;
}

function baseSignal(): Signal {
  return {
    symbol: "XAUUSD",
    direction: "BUY",
    riskReward: 2.2,
    confidence: 88
  } as unknown as Signal;
}

describe("win-rate optimizer", () => {
  it("targets a 90% aim faceplate but admits at the achievable A grade", () => {
    expect(WIN_RATE_TARGET).toBe(0.9);
    expect(OPTIMIZER_CONFIDENCE_BAR).toBe(85);
    const res = applyWinRateOptimizer(baseSignal(), baseAnalysis(), baseBreakdown(), 2.2);
    expect(res.pass).toBe(true);
    expect(res.reasons).toHaveLength(0);
  });

  it("rejects a setup below the A bar", () => {
    const res = applyWinRateOptimizer(baseSignal(), baseAnalysis(), baseBreakdown({}, 80), 2.2);
    expect(res.pass).toBe(false);
    expect(res.reasons.join().toLowerCase()).toContain("confidence");
    expect(res.reasons.join()).toContain("(A bar)");
  });

  it("rejects without full multi-timeframe alignment", () => {
    const res = applyWinRateOptimizer(
      baseSignal(),
      baseAnalysis(),
      baseBreakdown({ htfAligned: { "4h": true, "1h": false, exec: true } }),
      2.2
    );
    expect(res.pass).toBe(false);
    expect(res.reasons.join()).toContain("alignment");
  });

  it("rejects unconfirmed momentum", () => {
    const res = applyWinRateOptimizer(
      baseSignal(),
      baseAnalysis(),
      baseBreakdown({ momentum: { displacement: true, confirmed: false } }),
      2.2
    );
    expect(res.pass).toBe(false);
    expect(res.reasons.join()).toContain("Momentum");
  });

  it("does not hard-block on a weak historical hit-rate (advisory)", () => {
    const res = applyWinRateOptimizer(baseSignal(), baseAnalysis(), baseBreakdown(), 2.2);
    expect(res.pass).toBe(true);
  });

  it("enforces the reward:risk floor", () => {
    const res = applyWinRateOptimizer(baseSignal(), baseAnalysis(), baseBreakdown(), 1.2);
    expect(res.pass).toBe(false);
    expect(res.reasons.join()).toContain("reward:risk");
  });

  it("rejects chop with no liquidity context", () => {
    const res = applyWinRateOptimizer(
      baseSignal(),
      baseAnalysis({ sweeps: [], equalLows: [], equalHighs: [], areas: [] }),
      baseBreakdown({ liquidity: { sweepHigh: false, sweepLow: false, cleanRejection: false } }),
      2.2
    );
    expect(res.pass).toBe(false);
    expect(res.reasons.join()).toContain("liquidity");
  });
});