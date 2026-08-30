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

/**
 * Real crypto market data via the public Binance REST API (no key required for
 * market data). Supports all timeframes we use (1m/3m/5m/15m/30m/1h/4h/1d).
 */
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

const BINANCE_INTERVAL: Record<Timeframe, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d"
};

const REST_BASE = "https://api.binance.com/api/v3";

export interface CryptoConfig {
  baseUrl?: string;
}

export class CryptoMarketDataProvider implements MarketDataProvider {
  readonly id = "binance";
  readonly label = "Crypto (Binance)";
  readonly isLive = true;

  private baseUrl: string;
  private symbols: Instrument[];
  private quotes = new Map<string, Quote>();
  private candles = new Map<string, Candle[]>();
  private listenerSets = new Set<MarketDataEventListener>();
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(config: CryptoConfig = {}) {
    this.baseUrl = config.baseUrl ?? REST_BASE;
    this.symbols = DEFAULT_INSTRUMENTS
      .filter((i) => i.assetClass === "crypto" && i.enabled);
  }

  getSymbols(): Instrument[] {
    return this.symbols;
  }

  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  getMarketStatus(): MarketStatus {
    return { open: true, label: "LIVE (Binance)", timestamp: Date.now() };
  }

  getCandleSeries(symbol: string): CandleSeries[] {
    const out: CandleSeries[] = [];
    for (const tf of ALL_TIMEFRAMES) {
      const series = this.candles.get(`${symbol}:${tf}`);
      if (series) out.push({ timeframe: tf, candles: series });
    }
    return out;
  }

  async fetchQuotes(): Promise<Quote[]> {
    const quotes: Quote[] = [];
    for (const s of this.symbols) {
      const pair = s.providerSymbol ?? s.symbol;
      try {
        const res = await fetch(`${this.baseUrl}/ticker/bookTicker?symbol=${pair}`);
        if (!res.ok) continue;
        const t = await res.json();
        const bid = parseFloat(t.bidPrice ?? "0");
        const ask = parseFloat(t.askPrice ?? "0");
        const last = (bid + ask) / 2;
        const quote: Quote = {
          symbol: s.symbol,
          bid,
          ask,
          last,
          spread: ask - bid,
          timestamp: Date.now()
        };
        this.quotes.set(s.symbol, quote);
        quotes.push(quote);
      } catch {
        // ignore per-symbol failures; Binance may throttle
      }
    }
    return quotes;
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candle[]> {
    const inst = this.symbols.find((s) => s.symbol === symbol);
    if (!inst) return [];
    const pair = inst.providerSymbol ?? symbol;
    const interval = BINANCE_INTERVAL[timeframe];
    const url = `${this.baseUrl}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data
        .filter((k: any[]) => Array.isArray(k) && k.length >= 6)
        .map((k: any[]) => ({
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
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

    // Poll quotes every 3s
    const poll = setInterval(async () => {
      const quotes = await this.fetchQuotes();
      for (const q of quotes) {
        for (const l of this.listenerSets) l.onQuote?.(q);
        this.updateCandles(q);
      }
    }, 3000);
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
  }
}
