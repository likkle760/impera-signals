import { describe, it, expect } from "vitest";
import { OandaMarketDataProvider } from "./oanda";
import { AnalysisCoordinator } from "../engine/coordinator";

const TOKEN = process.env.IMPERA_TEST_OANDA_TOKEN || "";
const ACCOUNT = process.env.IMPERA_TEST_OANDA_ACCOUNT || "";

describe("OANDA live analysis e2e", () => {
  it.skipIf(!TOKEN || !ACCOUNT)("produces XAUUSD data and limit signals from real live feed", async () => {
    const provider = new OandaMarketDataProvider({ token: TOKEN, accountId: ACCOUNT });
    await provider.start();
    const coordinator = new AnalysisCoordinator();
    const snapshot = coordinator.analyze(provider);
    provider.stop();

    const instruments = Object.keys(snapshot.instruments);
    console.log("SCANNED:", instruments.join(","));
    expect(instruments).toContain("XAUUSD");

    const xau = snapshot.instruments["XAUUSD"];
    console.log("XAUUSD price:", xau?.price, "atr:", xau?.atr, "session:", xau?.session);
    for (const [sym, a] of Object.entries(snapshot.instruments)) {
      const struct = a.structure.structureType;
      const sr = a.supportResistance;
      const near = (L: number) => Math.abs(a.price - L) / (a.atr || 0.001);
      const sup = sr.supports.map((s) => `${s.price.toFixed(2)}(d=${near(s.price).toFixed(1)},str=${s.strength})`).join(" ");
      const res = sr.resistances.map((s) => `${s.price.toFixed(2)}(d=${near(s.price).toFixed(1)},str=${s.strength})`).join(" ");
      console.log(`${sym} price=${a.price.toFixed(2)} struct=${struct} SUPPORTS: ${sup} | RES: ${res}`);
    }

    for (const [sym, a] of Object.entries(snapshot.instruments)) {
      const idx = a.indicators["15m"] ?? a.indicators["5m"];
      const atr = a.atr || a.price * 0.002;
      const sess = a.supportResistance.sessionHighLow;
      const day = a.supportResistance.dayHighLow;
      const vwap = idx?.vwap;
      const d = (p: number) => Math.abs(a.price - p) / atr;
      console.log(`${sym} price=${a.price.toFixed(2)} atr=${atr.toFixed(3)} sessLow=${sess ? d(sess.low).toFixed(1) : "-"} sessHigh=${sess ? d(sess.high).toFixed(1) : "-"} dayLow=${day ? d(day.low).toFixed(1) : "-"} dayHigh=${day ? d(day.high).toFixed(1) : "-"} vwap=${vwap ? d(vwap).toFixed(1) : "-"} struct=${a.structure.structureType} htf=${a.trend.higherTimeframe}`);
    }

    const xauSignals = snapshot.signals.filter((s) => s.symbol === "XAUUSD");
    const limits = snapshot.signals.filter((s) => s.type.includes("LIMIT"));
    console.log("signals:", snapshot.signals.length, "| limits:", limits.length);
    for (const s of snapshot.signals) {
      console.log(`  ${s.symbol} ${s.type} entry=${s.entry} SL=${s.stopLoss} conf=${s.confidence}`);
    }
  });
});
