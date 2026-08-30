import { describe, it, expect } from "vitest";
import { OandaMarketDataProvider } from "./oanda";

// Uses OANDA practice credentials exposed for local verification.
const TOKEN = process.env.IMPERA_TEST_OANDA_TOKEN || "";
const ACCOUNT = process.env.IMPERA_TEST_OANDA_ACCOUNT || "";

describe("OandaMarketDataProvider (live integration)", () => {
  it.skipIf(!TOKEN || !ACCOUNT)("fetches real quotes and candles", async () => {
    const provider = new OandaMarketDataProvider({ token: TOKEN, accountId: ACCOUNT });
    provider.subscribe({ onError: (e) => console.log("PROVIDER ERROR:", e.message) });
    console.log("SYMBOLS", provider.getSymbols().map((s) => s.symbol));
    const quotes = await provider.fetchQuotes();
    console.log("QUOTES", quotes.length, quotes.map((q) => q.symbol).join(","));
    expect(quotes.length).toBeGreaterThan(0);
    const xau = quotes.find((q) => q.symbol === "XAUUSD");
    expect(xau).toBeDefined();
    expect(xau!.last).toBeGreaterThan(0);

    const candles = await provider.getHistoricalCandles("XAUUSD", "5m", 10);
    expect(candles.length).toBeGreaterThan(0);
    expect(candles[0].close).toBeGreaterThan(0);

    provider.stop();
  });
});
