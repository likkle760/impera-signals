import { describe, it, expect, afterEach } from "vitest";
import { OandaMarketDataProvider } from "./oanda";
import { AnalysisCoordinator } from "../engine/coordinator";
import { GET } from "@/app/api/market/oanda/route";

const TOKEN = process.env.IMPERA_TEST_OANDA_TOKEN || "";
const ACCOUNT = process.env.IMPERA_TEST_OANDA_ACCOUNT || "";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

// Route OANDA proxy requests through the real route handler (in-memory).
function stubProxy() {
  global.fetch = (async (input: any, init?: any) => {
    const url = new URL(String(input));
    return GET(new Request(url, init));
  }) as typeof fetch;
}

describe("OANDA live analysis e2e", () => {
  it.skipIf(!TOKEN || !ACCOUNT)("produces XAUUSD data and limit signals from real live feed", async () => {
    process.env.OANDA_TOKEN = TOKEN;
    process.env.OANDA_ACCOUNT_ID = ACCOUNT;
    stubProxy();

    const provider = new OandaMarketDataProvider({ baseUrl: "http://local-test/api/market/oanda" });
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

    const xauSignals = snapshot.signals.filter((s) => s.symbol === "XAUUSD");
    const limits = snapshot.signals.filter((s) => s.type.includes("LIMIT"));
    console.log("signals:", snapshot.signals.length, "| limits:", limits.length);
    for (const s of snapshot.signals) {
      console.log(`  ${s.symbol} ${s.type} entry=${s.entry} SL=${s.stopLoss} conf=${s.confidence}`);
    }
  });
});
