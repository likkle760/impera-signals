import { describe, it, expect } from "vitest";
import { DEFAULT_INSTRUMENTS } from "./instruments";

const REQUESTED = [
  "XAUUSD", "USDJPY", "NAS100", "ET30", "UT100", "GBPUSD", "USDCAD",
  "CADCHF", "USDCHF", "GBPCHF", "NZDCHF", "GBPAUD", "AUDCHF", "AUDJPY",
  "NZDUSD", "EURGBP", "EURUSD", "EURNZD", "AUDNZD", "EURJPY", "BTCUSD",
  "XAGUSD", "USOIL", "UKOIL", "BCO"
];

describe("instrument coverage", () => {
  it("contains every requested symbol, enabled", () => {
    const bySym = new Map(DEFAULT_INSTRUMENTS.map((i) => [i.symbol, i]));
    for (const sym of REQUESTED) {
      const inst = bySym.get(sym);
      expect(inst, `missing instrument ${sym}`).toBeDefined();
      expect(inst!.enabled, `${sym} not enabled`).toBe(true);
    }
  });

  it("has no duplicate symbols in the registry", () => {
    const syms = DEFAULT_INSTRUMENTS.map((i) => i.symbol);
    expect(new Set(syms).size).toBe(syms.length);
  });

  it("classifies oils as commodities and index aliases as indices", () => {
    const bySym = new Map(DEFAULT_INSTRUMENTS.map((i) => [i.symbol, i]));
    expect(bySym.get("USOIL")!.assetClass).toBe("commodities");
    expect(bySym.get("UKOIL")!.assetClass).toBe("commodities");
    expect(bySym.get("BCO")!.assetClass).toBe("commodities");
    expect(bySym.get("NAS100")!.assetClass).toBe("indices");
    expect(bySym.get("UT100")!.assetClass).toBe("indices");
    expect(bySym.get("ET30")!.assetClass).toBe("indices");
  });
});
