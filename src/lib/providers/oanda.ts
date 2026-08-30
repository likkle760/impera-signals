import type {
  Candle,
  CandleSeries,
  Instrument,
  MarketStatus,
  Quote,
  Timeframe
} from "../types";
import { ALL_TIMEFRAMES, DEFAULT_INSTRUMENTS } from "../instruments";
import { MarketDataProvider, MarketDataEventListener } from "./types";

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000
};

const OANDA_GRANULARITY: Record<Timeframe, string> = {
  "1m": "M1",
  "3m": "M3",
  "5m": "M5",
  "15m": "M15",
  "30m": "M30",
  "1h": "H1",
  "4h": "H4",
  "1d": "D"
};

// OANDA uses underscores in instrument names and only provides forex/metals/CFDs.
const OANDA_SYMBOLS: Record<string, string> = {
  EURUSD: "EUR_USD",
  GBPUSD: "GBP_USD",
  USDJPY: "USD_JPY",
  USDCHF: "USD_CHF",
  USDCAD: "USD_CAD",
  AUDUSD: "AUD_USD",
  NZDUSD: "NZD_USD",
  EURGBP: "EUR_GBP",
  EURJPY: "EUR_JPY",
  GBPJPY: "GBP_JPY",
  AUDJPY: "AUD_JPY",
  EURAUD: "EUR_AUD",
  GBPAUD: "GBP_AUD",
  AUDCAD: "AUD_CAD",
  NZDJPY: "NZD_JPY",
  XAUUSD: "XAU_USD",
  XAGUSD: "XAG_USD"
};

export interface OandaConfig {
  token: string;
  accountId: string;
  environment?: "practice" | "live";
}

export class OandaMarketDataProvider implements MarketDataProvider {
  readonly id = "oanda";
  readonly label = "OANDA Live";
  readonly isLive = true;

  private config: OandaConfig;
  private restBase: string;
  private streamBase: string;
  private symbols: Instrument[];
  private quotes = new Map<string, Quote>();
  private candles = new Map<string, Candle[]>();
  private listenerSets = new Set<MarketDataEventListener>();
  private timers: NodeJS.Timeout[] = [];
  private controller: AbortController | null = null;
  private running = false;

  constructor(config: OandaConfig) {
    this.config = config;
    const env = config.environment ?? "practice";
    this.restBase = env === "practice" ? "https://api-fxpractice.oanda.com" : "https://api-fxtrade.oanda.com";
    this.streamBase = env === "practice" ? "https://stream-fxpractice.oanda.com" : "https://stream-fxtrade.oanda.com";
    // Only instruments we can map to OANDA
    this.symbols = DEFAULT_INSTRUMENTS
      .filter((i) => i.enabled && OANDA_SYMBOLS[i.symbol]);
  }

  getSymbols(): Instrument[] {
    return this.symbols;
  }

  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  getMarketStatus(): MarketStatus {
    return { open: true, label: "LIVE (OANDA)", timestamp: Date.now() };
  }

  getCandleSeries(symbol: string): CandleSeries[] {
    const out: CandleSeries[] = [];
    for (const tf of ALL_TIMEFRAMES) {
      const series = this.candles.get(`${symbol}:${tf}`);
      if (series) out.push({ timeframe: tf, candles: series });
    }
    return out;
  }

  private authHeaders(additional: Record<string, string> = {}): Headers {
    const h = new Headers({
      "Authorization": `Bearer ${this.config.token}`,
      "Content-Type": "application/json",
      ...additional
    });
    return h;
  }

  async fetchQuotes(): Promise<Quote[]> {
    const instruments = this.symbols.map((s) => OANDA_SYMBOLS[s.symbol]).join(",");
    const url = `${this.restBase}/v3/accounts/${this.config.accountId}/pricing?instruments=${instruments}`;
    try {
      const res = await fetch(url, { headers: this.authHeaders() });
      if (!res.ok) throw new Error(`OANDA pricing HTTP ${res.status}`);
      const data = await res.json();
      const quotes: Quote[] = [];
      for (const p of data.prices ?? []) {
        const internal = this.internalSymbol(p.instrument);
        if (!internal) continue;
        const item = this.symbols.find((s) => s.symbol === internal);
        const bid = parseFloat(p.bids?.[0]?.price ?? "0");
        const ask = parseFloat(p.asks?.[0]?.price ?? "0");
        const last = (bid + ask) / 2;
        const quote: Quote = {
          symbol: internal,
          bid,
          ask,
          last,
          spread: ask - bid,
          timestamp: Date.now()
        };
        this.quotes.set(internal, quote);
        quotes.push(quote);
      }
      return quotes;
    } catch (e) {
      for (const l of this.listenerSets) l.onError?.(e instanceof Error ? e : new Error(String(e)));
      return [];
    }
  }

  private internalSymbol(oandaSymbol: string): string | null {
    for (const [k, v] of Object.entries(OANDA_SYMBOLS)) {
      if (v === oandaSymbol) return k;
    }
    return null;
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candle[]> {
    const oandaSym = OANDA_SYMBOLS[symbol];
    if (!oandaSym) return [];
    const granularity = OANDA_GRANULARITY[timeframe];
    const url = `${this.restBase}/v3/instruments/${oandaSym}/candles?granularity=${granularity}&count=${limit}&price=MBA`;
    try {
      const res = await fetch(url, { headers: this.authHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      const candles = (data.candles ?? []).map((c: any) => ({
        time: new Date(c.time).getTime() / 1000,
        open: parseFloat(c.mid?.o ?? "0"),
        high: parseFloat(c.mid?.h ?? "0"),
        low: parseFloat(c.mid?.l ?? "0"),
        close: parseFloat(c.mid?.c ?? "0"),
        volume: c.volume ?? 0
      }));
      return candles;
    } catch (e) {
      for (const l of this.listenerSets) l.onError?.(e instanceof Error ? e : new Error(String(e)));
      return [];
    }
  }

  subscribe(listener: MarketDataEventListener): () => void {
    this.listenerSets.add(listener);
    return () => this.listenerSets.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Fetch candles for each instrument/timeframe in parallel
    const jobs: Promise<void>[] = [];
    for (const sym of this.symbols) {
      for (const tf of ALL_TIMEFRAMES) {
        const key = `${sym.symbol}:${tf}`;
        jobs.push(
          this.getHistoricalCandles(sym.symbol, tf, 300).then((candles) => {
            if (candles.length) this.candles.set(key, candles);
          })
        );
      }
    }
    await Promise.all(jobs);

    // Initial quotes
    await this.fetchQuotes();
    this.emitQuotes();
    for (const l of this.listenerSets) l.onStatus?.(this.getMarketStatus());

    // Poll quotes every 2s (simple, reliable) — REST pricing endpoint is fastest stable approach
    const poll = setInterval(async () => {
      const quotes = await this.fetchQuotes();
      for (const q of quotes) {
        for (const l of this.listenerSets) l.onQuote?.(q);
        this.updateCandles(q);
      }
    }, 2000);
    this.timers.push(poll);
  }

  private updateCandles(q: Quote) {
    const now = Date.now();
    for (const tf of ALL_TIMEFRAMES) {
      const key = `${q.symbol}:${tf}`;
      const series = this.candles.get(key);
      if (!series) continue;
      const tfMs = TIMEFRAME_MS[tf];
      const bucketSec = Math.floor(now / tfMs) * tfMs / 1000;
      const last = series[series.length - 1];
      if (!last) continue;
      if (last.time < bucketSec) {
        series.push({
          time: bucketSec,
          open: q.last,
          high: q.last,
          low: q.last,
          close: q.last,
          volume: 0
        });
        if (series.length > 600) series.shift();
        for (const l of this.listenerSets) l.onCandle?.(q.symbol, tf, series[series.length - 1]);
      } else {
        last.high = Math.max(last.high, q.last);
        last.low = Math.min(last.low, q.last);
        last.close = q.last;
        last.volume += 1;
      }
    }
  }

  private emitQuotes() {
    for (const q of this.quotes.values()) {
      for (const l of this.listenerSets) l.onQuote?.(q);
    }
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.controller) this.controller.abort();
  }
}
