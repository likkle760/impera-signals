import { describe, expect, it } from "vitest";
import { computeManagementPlan } from "./ea-management";
import type { Signal } from "./analysis-types";

function baseSignal(partial: Partial<Signal>): Signal {
  return {
    id: "test-1",
    symbol: "EURUSD",
    name: "EUR/USD",
    assetClass: "forex",
    type: "BUY LIMIT",
    direction: "BUY",
    entry: 1.1,
    entryZone: [1.095, 1.105],
    stopLoss: 1.09,
    takeProfits: [1.11, 1.12, 1.13],
    riskReward: 1.0,
    confidence: 70,
    riskLevel: "MEDIUM",
    riskScore: 50,
    timeframes: ["1h", "4h"],
    trendLabel: "BULLISH",
    setupName: "OB Sweep",
    reason: "reason",
    status: "ACTIVE",
    createdAt: 0,
    updatedAt: 0,
    session: "LONDON",
    score: 70,
    ...partial,
  };
}

describe("computeManagementPlan", () => {
  it("break-even stop equals entry and anchors at TP1", () => {
    const s = baseSignal({});
    const p = computeManagementPlan(s);
    expect(p.breakEven.at).toBe(1.11);
    expect(p.breakEven.stop).toBe(1.1);
  });

  it("partial close is 50% at TP1", () => {
    const p = computeManagementPlan(baseSignal({}));
    expect(p.partialClose.at).toBe(1.11);
    expect(p.partialClose.fractionPct).toBe(50);
  });

  it("trailing distance is a fraction of TP1->TP2 spread, floored", () => {
    const s = baseSignal({});
    const p = computeManagementPlan(s);
    // EU stop = 100 pips, tp1 = 100p, tp2 = 200p -> remaining 100p -> 40p
    expect(p.trailing.distancePips).toBe(40);
    expect(p.trailing.enabled).toBe(true);
  });

  it("lot size scales with account risk and stop distance", () => {
    const p = computeManagementPlan(baseSignal({}), 10000, 1);
    // EU stop = 100p, $10/lot/pip -> risk/lot = $1000. $100 risk -> 0.1 lots
    expect(p.lotSize).not.toBeNull();
    expect(p.lotSize!.riskDollars).toBeCloseTo(100, 5);
    expect(p.lotSize!.stopPips).toBeCloseTo(100, 5);
    expect(p.lotSize!.suggested).toContain("0.1 lots");
  });

  it("lot size doubles when risk % doubles", () => {
    const a = computeManagementPlan(baseSignal({}), 10000, 1);
    const b = computeManagementPlan(baseSignal({}), 10000, 2);
    expect(b.lotSize!.riskDollars).toBe(2 * a.lotSize!.riskDollars);
  });

  it("produces a non-empty summary", () => {
    const p = computeManagementPlan(baseSignal({}));
    expect(p.summary.length).toBeGreaterThan(0);
  });
});
