import { describe, it, expect, afterEach } from "vitest";
import { MarketStore } from "./store";
import { DemoMarketDataProvider } from "../providers/demo";

describe("MarketStore — live quant terminal scan controls", () => {
  const stores: MarketStore[] = [];
  const make = () => {
    const s = new MarketStore(new DemoMarketDataProvider());
    stores.push(s);
    return s;
  };
  afterEach(() => {
    for (const s of stores) s.stop();
    stores.length = 0;
  });

  it("exposes runtime scan state from the constructor", () => {
    const s = make();
    const state = s.getState();
    expect(state.scanSeconds).toBeGreaterThanOrEqual(5);
    expect(state.autoScan).toBe(true);
    expect(state.scanCount).toBe(0);
  });

  it("changes the scan interval at runtime without a reload", () => {
    const s = make();
    s.setScanInterval(15);
    expect(s.getState().scanSeconds).toBe(15);
    s.setScanInterval(999); // clamped
    expect(s.getState().scanSeconds).toBe(300);
    s.setScanInterval(1); // clamped
    expect(s.getState().scanSeconds).toBe(5);
  });

  it("pauses and resumes auto-scan", () => {
    const s = make();
    s.setAutoScan(false);
    expect(s.getState().autoScan).toBe(false);
    s.toggleAutoScan();
    expect(s.getState().autoScan).toBe(true);
    s.toggleAutoScan();
    expect(s.getState().autoScan).toBe(false);
  });

  it("counts scans and still allows a manual scan while paused", () => {
    const s = make();
    s.setAutoScan(false);
    const before = s.getState().scanCount;
    s.runScan();
    expect(s.getState().scanCount).toBe(before + 1);
    expect(s.getState().lastAnalysis).toBeGreaterThan(0);
    expect(s.getState().snapshot.instruments).toBeTruthy();
  });
});
