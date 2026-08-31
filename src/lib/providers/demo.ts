import type {
  Candle,
  CandleSeries,
  Instrument,
  MarketStatus,
  Quote,
  Timeframe
} from "../types";
import { ALL_TIMEFRAMES, DEFAULT_INSTRUMENTS } from "../instruments";
import {
  MarketDataProvider,
  MarketDataEventListener
} from "./types";

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

const BASE_PRICES: Record<string, number> = {
  EURUSD: 1.1642,
  GBPUSD: 1.2841,
  USDJPY: 149.42,
  USDCHF: 0.8812,
  USDCAD: 1.3721,
  AUDUSD: 0.6512,
  NZDUSD: 0.5942,
  EURGBP: 0.8524,
  EURJPY: 162.18,
  GBPJPY: 198.52,
  AUDJPY: 97.21,
  EURAUD: 1.6631,
  GBPAUD: 1.9512,
  AUDCAD: 0.8935,
  NZDJPY: 88.74,
  CADCHF: 0.6615,
  GBPCHF: 1.1312,
  NZDCHF: 0.5291,
  AUDCHF: 0.5834,
  EURNZD: 1.7865,
  AUDNZD: 1.0955,
  EURCHF: 0.9485,
  EURCAD: 1.4812,
  GBPNZD: 2.0931,
  GBPCAD: 1.7211,
  NZDCAD: 0.8154,
  CADJPY: 108.42,
  CHFJPY: 171.05,
  EURNOK: 11.51,
  EURSEK: 11.28,
  USDSGD: 1.3021,
  SGDJPY: 114.98,
  USDNOK: 10.61,
  USDSEK: 10.42,
  USDZAR: 18.04,
  USDHKD: 7.812,
  ZARJPY: 8.27,
  EURTRY: 36.55,
  USDTRY: 34.12,
  EURHUF: 395.4,
  EURPLN: 4.28,
  USDPLN: 3.91,
  XAUUSD: 2435.2,
  XAGUSD: 29.41,
  XPTUSD: 945,
  XPDUSD: 1015,
  XCUUSD: 3.85,
  XAUJPY: 375000,
  XAUEUR: 2260,
  XAUGBP: 1910,
  XAUAUD: 3710,
  XAUCAD: 3320,
  XAUCHF: 2130,
  XAUNZD: 4050,
  XAGJPY: 4520,
  US30: 39220,
  US100: 18150,
  NAS100: 18150,
  UT100: 18150,
  ET30: 39220,
  US500: 5120,
  GER40: 18240,
  UK100: 7920,
  FRA40: 8040,
  JP225: 38240,
  AUS200: 7800,
  ES: 5148,
  NQ: 18290,
  YM: 39280,
  CL: 78.42,
  GC: 2438,
  NG: 2.742,
  USOIL: 78.1,
  UKOIL: 82.3,
  BCO: 82.3
};

const VOLATILITY: Record<string, number> = {
  EURUSD: 0.00012,
  GBPUSD: 0.00016,
  USDJPY: 0.018,
  USDCHF: 0.00014,
  USDCAD: 0.00016,
  AUDUSD: 0.00013,
  NZDUSD: 0.00014,
  EURGBP: 0.00008,
  EURJPY: 0.024,
  GBPJPY: 0.032,
  AUDJPY: 0.02,
  EURAUD: 0.00018,
  GBPAUD: 0.00028,
  AUDCAD: 0.00016,
  NZDJPY: 0.019,
  CADCHF: 0.00016,
  GBPCHF: 0.0002,
  NZDCHF: 0.00015,
  AUDCHF: 0.00016,
  EURNZD: 0.0002,
  AUDNZD: 0.00016,
  EURCHF: 0.00016,
  EURCAD: 0.00018,
  GBPNZD: 0.0003,
  GBPCAD: 0.00024,
  NZDCAD: 0.00018,
  CADJPY: 0.02,
  CHFJPY: 0.024,
  EURNOK: 0.0024,
  EURSEK: 0.0023,
  USDSGD: 0.0002,
  SGDJPY: 0.022,
  USDNOK: 0.0024,
  USDSEK: 0.0024,
  USDZAR: 0.004,
  USDHKD: 0.001,
  ZARJPY: 0.0031,
  EURTRY: 0.012,
  USDTRY: 0.011,
  EURHUF: 0.42,
  EURPLN: 0.0011,
  USDPLN: 0.0012,
  XAUUSD: 0.22,
  XAGUSD: 0.045,
  XPTUSD: 1.4,
  XPDUSD: 2.0,
  XCUUSD: 0.009,
  XAUJPY: 45,
  XAUEUR: 2.2,
  XAUGBP: 2.5,
  XAUAUD: 4.2,
  XAUCAD: 3.8,
  XAUCHF: 2.4,
  XAUNZD: 5.2,
  XAGJPY: 0.9,
  US30: 29,
  US100: 26,
  NAS100: 26,
  UT100: 26,
  ET30: 30,
  US500: 6.5,
  GER40: 30,
  UK100: 22,
  FRA40: 34,
  JP225: 95,
  AUS200: 22,
  ES: 6.8,
  NQ: 27,
  YM: 30,
  CL: 0.11,
  GC: 0.23,
  NG: 0.012,
  USOIL: 0.12,
  UKOIL: 0.12,
  BCO: 0.12
};

const SPREAD: Record<string, number> = {
  EURUSD: 0.0001,
  GBPUSD: 0.0002,
  USDJPY: 0.012,
  USDCHF: 0.00018,
  USDCAD: 0.0002,
  AUDUSD: 0.00014,
  NZDUSD: 0.00018,
  EURGBP: 0.00014,
  EURJPY: 0.022,
  GBPJPY: 0.028,
  AUDJPY: 0.026,
  EURAUD: 0.0003,
  GBPAUD: 0.0004,
  AUDCAD: 0.00024,
  NZDJPY: 0.024,
  CADCHF: 0.00024,
  GBPCHF: 0.0004,
  NZDCHF: 0.00028,
  AUDCHF: 0.00026,
  EURNZD: 0.00034,
  AUDNZD: 0.0003,
  EURCHF: 0.00028,
  EURCAD: 0.00034,
  GBPNZD: 0.0005,
  GBPCAD: 0.0004,
  NZDCAD: 0.00032,
  CADJPY: 0.028,
  CHFJPY: 0.034,
  EURNOK: 0.005,
  EURSEK: 0.005,
  USDSGD: 0.0004,
  SGDJPY: 0.034,
  USDNOK: 0.005,
  USDSEK: 0.005,
  USDZAR: 0.012,
  USDHKD: 0.008,
  ZARJPY: 0.012,
  EURTRY: 0.035,
  USDTRY: 0.032,
  EURHUF: 1.2,
  EURPLN: 0.002,
  USDPLN: 0.002,
  XAUUSD: 0.12,
  XAGUSD: 0.03,
  XPTUSD: 0.18,
  XPDUSD: 0.24,
  XCUUSD: 0.001,
  XAUJPY: 40,
  XAUEUR: 1.8,
  XAUGBP: 2.0,
  XAUAUD: 3.4,
  XAUCAD: 3.0,
  XAUCHF: 1.9,
  XAUNZD: 4.2,
  XAGJPY: 0.8,
  US30: 1.2,
  US100: 1.4,
  NAS100: 1.4,
  UT100: 1.4,
  ET30: 1.2,
  US500: 0.6,
  GER40: 1.4,
  UK100: 1.2,
  FRA40: 1.8,
  JP225: 6,
  AUS200: 2,
  ES: 0.6,
  NQ: 1.6,
  YM: 2,
  CL: 0.02,
  GC: 0.14,
  NG: 0.004,
  USOIL: 0.03,
  UKOIL: 0.04,
  BCO: 0.04
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = "demo";
  readonly label = "Demo Simulated Data";
  readonly isLive = false;

  private symbols = DEFAULT_INSTRUMENTS.filter((i) => i.enabled);
  private quotes = new Map<string, Quote>();
  private candles = new Map<string, Candle[]>();
  private rng: Record<string, () => number>;
  private listeners = new Map<string, Set<MarketDataEventListener>[]>();
  private listenerSets = new Set<MarketDataEventListener>();
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private tickMs = 1000) {
    this.rng = {};
    for (const sym of this.symbols) this.rng[sym.symbol] = mulberry32(hash(sym.symbol));
    for (const sym of this.symbols) this.initQuote(sym);
  }

  getSymbols(): Instrument[] {
    return this.symbols;
  }

  getQuote(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  getMarketStatus(): MarketStatus {
    return { open: true, label: "MARKET OPEN (DEMO)", timestamp: Date.now() };
  }

  private initQuote(sym: Instrument) {
    const base = BASE_PRICES[sym.symbol] ?? 1.0;
    const r = this.rng[sym.symbol];
    const drift = 1 + (r() - 0.5) * 0.004;
    const last = base * drift;
    const spread = SPREAD[sym.symbol] ?? last * 0.0002;
    const quote: Quote = {
      symbol: sym.symbol,
      bid: last - spread / 2,
      ask: last + spread / 2,
      last,
      spread,
      timestamp: Date.now()
    };
    this.quotes.set(sym.symbol, quote);
  }

  private seedCandles(sym: Instrument, timeframe: Timeframe, limit: number): Candle[] {
    const r = this.rng[sym.symbol];
    const tfMs = TIMEFRAME_MS[timeframe];
    const vol = VOLATILITY[sym.symbol] ?? 0.002 * BASE_PRICES[sym.symbol];
    const base = BASE_PRICES[sym.symbol] ?? 1.0;
    const now = Math.floor(Date.now() / tfMs) * tfMs;
    const candles: Candle[] = [];
    let price = base;
    let trend = 0;
    for (let i = 0; i < limit; i++) {
      if (r() > 0.985) trend = (r() - 0.5) * vol * 6;
      else if (r() > 0.92) trend *= 0.5;
      price += trend + (r() - 0.5) * vol * 2;
      const open = price;
      const close = open + (r() - 0.5) * vol * 2 + trend;
      const high = Math.max(open, close) + (r() - 0.5) * vol;
      const low = Math.min(open, close) - (r() - 0.5) * vol;
      const time = now - (limit - i) * tfMs;
      candles.push({
        time: time / 1000,
        open,
        high,
        low,
        close,
        volume: Math.round(100 + r() * 1500)
      });
    }
    return candles;
  }

  async getHistoricalCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candle[]> {
    const sym = this.symbols.find((s) => s.symbol === symbol);
    if (!sym) return [];
    return this.seedCandles(sym, timeframe, limit);
  }

  getCandleSeries(symbol: string): CandleSeries[] {
    const out: CandleSeries[] = [];
    for (const tf of ALL_TIMEFRAMES) {
      const series = this.candles.get(`${symbol}:${tf}`);
      if (series) out.push({ timeframe: tf, candles: series });
    }
    return out;
  }

  subscribe(listener: MarketDataEventListener): () => void {
    this.listenerSets.add(listener);
    return () => this.listenerSets.delete(listener);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    for (const sym of this.symbols) {
      for (const tf of ALL_TIMEFRAMES) {
        const key = `${sym.symbol}:${tf}`;
        if (!this.candles.has(key)) {
          this.candles.set(key, this.seedCandles(sym, tf, 500));
        }
      }
    }
    const tick = setInterval(() => this.tick(), this.tickMs);
    this.timers.push(tick);
    this.emitStatus();
  }

  private tick() {
    const now = Date.now();
    for (const sym of this.symbols) {
      const r = this.rng[sym.symbol];
      const vol = (VOLATILITY[sym.symbol] ?? 0.002) * 2.4;
      const move = (r() - 0.5) * vol;
      const quote = this.quotes.get(sym.symbol);
      if (!quote) continue;
      const next = quote.last + move;
      quote.bid = next - quote.spread / 2;
      quote.ask = next + quote.spread / 2;
      quote.last = next;
      quote.timestamp = now;

      for (const tf of ALL_TIMEFRAMES) {
        this.updateCandle(sym, tf, next, now);
      }
    }
    this.emitQuote();
  }

  private updateCandle(sym: Instrument, tf: Timeframe, price: number, now: number) {
    const tfMs = TIMEFRAME_MS[tf];
    const key = `${sym.symbol}:${tf}`;
    const series = this.candles.get(key);
    if (!series) return;
    const bucket = Math.floor(now / tfMs) * tfMs;
    const bucketSec = bucket / 1000;
    let last = series[series.length - 1];
    if (!last || last.time < bucketSec) {
      const newCandle: Candle = {
        time: bucketSec,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0
      };
      series.push(newCandle);
      if (series.length > 600) series.shift();
      for (const l of this.listenerSets) l.onCandle?.(sym.symbol, tf, newCandle);
      return;
    }
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
    last.close = price;
    last.volume += 1;
  }

  private emitQuote() {
    for (const q of this.quotes.values()) {
      for (const l of this.listenerSets) l.onQuote?.(q);
    }
  }

  private emitStatus() {
    for (const l of this.listenerSets) l.onStatus?.(this.getMarketStatus());
  }

  stop(): void {
    this.running = false;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
