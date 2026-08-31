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
 * OANDA Live data provider (client-side).
 *
 * Client talks ONLY to the local server proxy `/api/market/oanda`. The real
 * OANDA API token lives server-side and is never exposed to the browser.
 * This feed is READ-ONLY by deliberate security design (live account).
 */

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000,
  "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000
};

const PROXY = "/api/market/oanda";

// Only instruments we can map to OANDA.
const OANDA_SYMBOLS: Record<string, string> = {
  EURUSD: "EUR_USD", GBPUSD: "GBP_USD", USDJPY: "USD_JPY", USDCHF: "USD_CHF",
  USDCAD: "USD_CAD", AUDUSD: "AUD_USD", NZDUSD: "NZD_USD", EURGBP: "EUR_GBP",
  EURJPY: "EUR_JPY", GBPJPY: "GBP_JPY", AUDJPY: "AUD_JPY", EURAUD: "EUR_AUD",
  GBPAUD: "GBP_AUD", AUDCAD: "AUD_CAD", NZDJPY: "NZD_JPY", XAUUSD: "XAU_USD",
  XAGUSD: "XAG_USD"
};

export interface OandaConfig {
  /** optional override; default uses the server proxy's configured account */
  enabled?: boolean;
  /** internal: override the proxy base (used only by tests, not the browser page) */
  baseUrl?: string;
}

export class OandaMarketDataProvider implements MarketDataProvider {
  readonly id = "oanda";
  readonly label = "OANDA Live";
  readonly isLive = true;

  private symbols: Instrument[];
  private quotes = new Map<string, Quote>();
  private candles = new Map<string, Candle[]>();
  private listenerSets = new Set<MarketDataEventListener>();
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private proxyAvailable: boolean | null = null;
  private proxyBase: string;

  constructor(config: OandaConfig = {}) {
    this.proxyBase = config.baseUrl ?? PROXY;
    this.symbols = DEFAULT_INSTRUMENTS.filter((i) => i.enabled && OANDA_SYMBOLS[i.symbol]);
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

  async checkAvailability(): Promise<boolean> {
    if (this.proxyAvailable !== null) return this.proxyAvailable;
    try {
      const res = await fetch(`${this.proxyBase}?action=status`, { cache: "no-store" });
      const data = await res.json();
      this.proxyAvailable = Boolean(data.configured);
    } catch {
      this.proxyAvailable = false;
    }
    return this.proxyAvailable;
  }

  async fetchQuotes(): Promise<Quote[]> {
    if (!this.proxyAvailable) return [];
    const instruments = this.symbols.map((s) => OANDA_SYMBOLS[s.symbol]).join(",");
    try {
      const res = await fetch(`${this.proxyBase}?action=pricing&symbols=${encodeURIComponent(instruments)}`, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const quotes: Quote[] = [];
      for (const q of data.quotes ?? []) {
        const quote: Quote = { ...q };
        this.quotes.set(quote.symbol, quote);
        quotes.push(quote);
      }
      return quotes;
    } catch {
      return [];
    }
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candle[]> {
    if (!this.proxyAvailable) return [];
    try {
      const res = await fetch(
        `${this.proxyBase}?action=candles&symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&count=${limit}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.candles ?? [];
    } catch {
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

    const available = await this.checkAvailability();
    this.proxyAvailable = available;
    if (!available) {
      for (const l of this.listenerSets) l.onError?.(new Error("OANDA proxy not configured (live feed disabled)"));
      return;
    }

    // Fetch candles for each instrument/timeframe in parallel.
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

    // Initial quotes.
    await this.fetchQuotes();
    this.emitQuotes();
    for (const l of this.listenerSets) l.onStatus?.(this.getMarketStatus());

    // Poll quotes every 2s.
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
          open: q.last, high: q.last, low: q.last, close: q.last,
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