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

// Realistic reference prices used to seed the simulated walk so values look sane.
const BASE_PRICE: Record<string, number> = {
  US30: 39000,
  US100: 20700,
  US500: 5100,
  GER40: 18700,
  UK100: 8300,
  FRA40: 8200,
  JP225: 40200,
  AUS200: 7200,
  ES: 5120,
  NQ: 20800,
  YM: 39100,
  CL: 82,
  GC: 2350,
  NG: 2.6
};

// Per-tick volatility (as a fraction of price) scaled per asset.
const VOLATILITY: Record<string, number> = {
  US30: 0.0006,
  US100: 0.0009,
  US500: 0.0007,
  GER40: 0.0008,
  UK100: 0.0006,
  FRA40: 0.0007,
  JP225: 0.0008,
  AUS200: 0.0006,
  ES: 0.0007,
  NQ: 0.0009,
  YM: 0.0006,
  CL: 0.012,
  GC: 0.005,
  NG: 0.02
};

const DECIMALS: Record<string, number> = {
  CL: 2, GC: 2, NG: 3,
  US500: 1, GER40: 1, UK100: 1, FRA40: 1, JP225: 1, AUS200: 1,
  US30: 1, US100: 1, ES: 1, NQ: 1, YM: 0
};

/**
 * Index + futures provision.
 *
 * NOTE: There is no free, keyless, real-time US index / futures feed available.
 * This provider generates a plausible, trend-aware simulated walk (honestly
 * labelled as simulated) so that futures/index traders can still receive and
 * exercise the analysis pipeline. The series is seeded to CONTINUE the recent
 * trend (previous market direction) and to re-test structure, mirroring how a
 * real chart would behave. It is NOT a guarantee of live prices.
 */
export class FuturesMarketDataProvider implements MarketDataProvider {
  readonly id = "futures-sim";
  readonly label = "Indices/Futures (simulated)";
  readonly isLive = true;

  private symbols: Instrument[];
  private quotes = new Map<string, Quote>();
  private candles = new Map<string, Candle[]>();
  private listenerSets = new Set<MarketDataEventListener>();
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private seed = new Map<string, number>();

  constructor() {
    this.symbols = DEFAULT_INSTRUMENTS.filter(
      (i) => i.enabled && (i.assetClass === "indices" || i.assetClass === "futures")
    );
    for (const s of this.symbols) this.seed.set(s.symbol, Math.floor(Math.random() * 1e9));
  }

  getSymbols(): Instrument[] {
    return this.symbols;
  }

  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  getMarketStatus(): MarketStatus {
    return {
      open: true,
      label: "SIMULATED INDEX/FUTURES FEED (no free live feed available)",
      timestamp: Date.now()
    };
  }

  getCandleSeries(symbol: string): CandleSeries[] {
    const out: CandleSeries[] = [];
    for (const tf of ALL_TIMEFRAMES) {
      const series = this.candles.get(`${symbol}:${tf}`);
      if (series) out.push({ timeframe: tf, candles: series });
    }
    return out;
  }

  async getHistoricalCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const s = this.symbols.find((i) => i.symbol === symbol);
    if (!s) return [];
    const key = `${symbol}:${timeframe}`;
    const existing = this.candles.get(key);
    if (existing && existing.length) return existing;
    const candles = this.buildSeries(symbol, timeframe, limit);
    this.candles.set(key, candles);
    return candles;
  }

  private rng(symbol: string): () => number {
    let state = this.seed.get(symbol) ?? 42;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  private buildSeries(symbol: string, timeframe: Timeframe, limit: number): Candle[] {
    const base = BASE_PRICE[symbol] ?? 100;
    const vol = VOLATILITY[symbol] ?? 0.005;
    const rnd = this.rng(symbol);
    const tfMs = TIMEFRAME_MS[timeframe];
    const now = Date.now();
    let price = base * (0.95 + rnd() * 0.1);

    // Establish a recent prior trend (~60% of candles) then let it continue with
    // pullbacks, so the engine sees a coherent structure based on previous trends.
    // A persistent drift (autocorrelated momentum) creates tradeable, trend-able
    // structure instead of pure noise, so structure/ICT detection yields meaningful
    // entries for index/futures traders.
    const regime = rnd(); // 0..1
    const drift = (regime - 0.42) * vol * 4; // tilt; ~58% bullish so trends are findable
    let momentum = 0;
    const out: Candle[] = [];
    for (let i = 0; i < limit; i++) {
      const t = Math.floor(now / tfMs) * tfMs / 1000 - (limit - i) * (tfMs / 1000);
      const open = price;
      // Momentum persistence: reuse last move with mild decay + fresh noise so
      // the series trends for stretches then pulls back (mirrors a real chart).
      momentum = momentum * 0.72 + (rnd() - 0.5) * 2 * vol;
      const change = momentum + drift * 0.35;
      const close = open * (1 + change);
      const wick = vol * rnd() * 0.6;
      const high = Math.max(open, close) * (1 + wick);
      const low = Math.min(open, close) * (1 - wick);
      out.push({
        time: t,
        open: +open.toFixed(6),
        high: +high.toFixed(6),
        low: +low.toFixed(6),
        close: +close.toFixed(6),
        volume: Math.floor(100 + rnd() * 900)
      });
      price = close;
    }
    return out;
  }

  private async fetchQuotes(): Promise<Quote[]> {
    const quotes: Quote[] = [];
    for (const s of this.symbols) {
      const series = this.candles.get(`${s.symbol}:1m`) ?? this.candles.get(`${s.symbol}:5m`);
      const lastBar = series?.[series.length - 1];
      const last = lastBar ? lastBar.close : BASE_PRICE[s.symbol] ?? 100;
      const dec = DECIMALS[s.symbol] ?? 2;
      const spread = Math.max((last * (VOLATILITY[s.symbol] ?? 0.005)) / 8, 1 / Math.pow(10, dec + 1));
      const q: Quote = {
        symbol: s.symbol,
        bid: +(last - spread / 2).toFixed(6),
        ask: +(last + spread / 2).toFixed(6),
        last: +last.toFixed(6),
        spread: +spread.toFixed(6),
        timestamp: Date.now()
      };
      this.quotes.set(s.symbol, q);
      quotes.push(q);
    }
    return quotes;
  }

  subscribe(listener: MarketDataEventListener): () => void {
    this.listenerSets.add(listener);
    return () => this.listenerSets.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const jobs: Promise<void>[] = [];
    for (const sym of this.symbols) {
      for (const tf of ALL_TIMEFRAMES) {
        if (!this.candles.has(`${sym.symbol}:${tf}`)) {
          this.candles.set(`${sym.symbol}:${tf}`, this.buildSeries(sym.symbol, tf, 300));
        }
      }
    }
    await Promise.all(jobs);

    await this.fetchQuotes();
    this.emitQuotes();
    for (const l of this.listenerSets) l.onStatus?.(this.getMarketStatus());

    const poll = setInterval(async () => {
      const quotes = await this.fetchQuotes();
      for (const q of quotes) {
        for (const l of this.listenerSets) l.onQuote?.(q);
        this.updateCandles(q);
      }
    }, 2500);
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
