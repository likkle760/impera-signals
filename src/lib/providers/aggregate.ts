import type {
  Candle,
  CandleSeries,
  Instrument,
  MarketStatus,
  Quote,
  Timeframe
} from "../types";
import { MarketDataProvider, MarketDataEventListener } from "./types";

/**
 * Combines multiple data providers into a single MarketDataProvider so forex
 * (OANDA) and crypto (Binance) stream together under one store.
 */
export class AggregateMarketDataProvider implements MarketDataProvider {
  readonly id = "aggregate";
  readonly label = "Live Composite";
  readonly isLive = true;

  private providers: MarketDataProvider[];

  constructor(providers: MarketDataProvider[]) {
    this.providers = providers.filter(Boolean);
  }

  getSymbols(): Instrument[] {
    return this.providers.flatMap((p) => p.getSymbols());
  }

  getQuote(symbol: string): Quote | undefined {
    for (const p of this.providers) {
      const q = p.getQuote(symbol);
      if (q) return q;
    }
    return undefined;
  }

  getMarketStatus(): MarketStatus {
    return { open: true, label: "LIVE (OANDA + Binance)", timestamp: Date.now() };
  }

  getCandleSeries(symbol: string): CandleSeries[] {
    for (const p of this.providers) {
      const series = p.getCandleSeries(symbol);
      if (series && series.length) return series;
    }
    return [];
  }

  async getHistoricalCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    for (const p of this.providers) {
      const candles = await p.getHistoricalCandles(symbol, timeframe, limit);
      if (candles && candles.length) return candles;
    }
    return [];
  }

  subscribe(listener: MarketDataEventListener): () => void {
    const unsubs = this.providers.map((p) => p.subscribe(listener));
    return () => unsubs.forEach((u) => u());
  }

  async start(): Promise<void> {
    await Promise.all(this.providers.map((p) => p.start()));
  }

  stop(): void {
    for (const p of this.providers) p.stop();
  }
}
