import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/market/oanda/route";

// Uses OANDA credentials exposed for local verification. Sets the SAME server-side
// env vars the proxy route reads, then invokes the route handler directly.
const TOKEN = process.env.IMPERA_TEST_OANDA_TOKEN || "";
const ACCOUNT = process.env.IMPERA_TEST_OANDA_ACCOUNT || "";

function asGet(url: string): Promise<Response> {
  return GET(new Request(new URL(url, "http://localhost")));
}

describe("OANDA server proxy (live integration)", () => {
  it.skipIf(!TOKEN || !ACCOUNT)("status reflects configured server env", async () => {
    process.env.OANDA_TOKEN = TOKEN;
    process.env.OANDA_ACCOUNT_ID = ACCOUNT;
    const res = await asGet("/api/market/oanda?action=status");
    const data = await res.json();
    expect(data.configured).toBe(true);
  });

  it.skipIf(!TOKEN || !ACCOUNT)("proxies real quotes and candles read-only", async () => {
    process.env.OANDA_TOKEN = TOKEN;
    process.env.OANDA_ACCOUNT_ID = ACCOUNT;

    const pres = await asGet("/api/market/oanda?action=pricing&symbols=XAUUSD,EURUSD");
    expect(pres.status).toBe(200);
    const p = await pres.json();
    expect(p.ok).toBe(true);
    const xau = p.quotes?.find((q: any) => q.symbol === "XAUUSD");
    expect(xau).toBeDefined();
    expect(xau.last).toBeGreaterThan(0);

    const cres = await asGet("/api/market/oanda?action=candles&symbol=XAUUSD&timeframe=5m&count=10");
    expect(cres.status).toBe(200);
    const c = await cres.json();
    expect(c.ok).toBe(true);
    expect(c.candles.length).toBeGreaterThan(0);
    expect(c.candles[0].close).toBeGreaterThan(0);
  });

  it.skipIf(!TOKEN || !ACCOUNT)("blocks unknown actions", async () => {
    process.env.OANDA_TOKEN = TOKEN;
    process.env.OANDA_ACCOUNT_ID = ACCOUNT;
    const res = await asGet("/api/market/oanda?action=orders");
    expect(res.status).toBe(400);
  });
});
