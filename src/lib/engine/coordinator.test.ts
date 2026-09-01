import { describe, it, expect } from "vitest";
import { DemoMarketDataProvider } from "../providers/demo";
import { AnalysisCoordinator } from "./coordinator";

describe("AnalysisCoordinator + DemoMarketDataProvider integration", () => {
  it("produces scanner rows and at least some signals/futures", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    expect(Object.keys(snapshot.instruments).length).toBeGreaterThan(0);
    expect(snapshot.instruments["EURUSD"]).toBeDefined();
    expect(snapshot.scanner.length).toBeGreaterThan(0);

    const first = snapshot.scanner[0];
    expect(first.price).toBeGreaterThan(0);
    expect(first.trend).toBeTruthy();
    expect(first.trendStrength).toBeGreaterThanOrEqual(0);
    expect(first.trendStrength).toBeLessThanOrEqual(100);

    for (const signal of snapshot.signals) {
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
      if (signal.direction === "BUY") {
        expect(signal.stopLoss).toBeLessThan(signal.entry);
        expect(signal.takeProfits[0]).toBeGreaterThan(signal.entry);
      }
    }
  });

  it("marks every analysis with a regime and session", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();
    for (const analysis of Object.values(snapshot.instruments)) {
      expect(analysis.trend.regime).toBeTruthy();
      expect(analysis.session).toBeTruthy();
      expect(analysis.indicators["5m"]).toBeDefined();
    }
  });

  it("tags demo-fed instruments as SIM and blocks them from producing signals", async () => {
    const provider = new DemoMarketDataProvider();
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    expect(snapshot.instruments["CADJPY"]).toBeDefined();
    expect(snapshot.instruments["CADJPY"].simulated).toBe(true);
    expect(snapshot.signals.length).toBe(0);
    expect(snapshot.scanner.length).toBeGreaterThan(0);
    for (const row of snapshot.scanner) {
      expect(row.simulated).toBe(true);
      expect(row.setup).toBeNull();
    }
  });
});
