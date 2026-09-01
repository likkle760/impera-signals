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
    const seen = new Set<string>();
    const out: Instrument[] = [];
    for (const p of this.providers) {
      for (const i of p.getSymbols()) {
        if (seen.has(i.symbol)) continue;
        seen.add(i.symbol);
        out.push(i);
      }
    }
    return out;
  }

  getQuote(symbol: string): Quote | undefined {
    for (const p of this.providers) {
      const q = p.getQuote(symbol);
      if (q) return q;
    }
    return undefined;
  }

  isSimulatedSymbol(symbol: string): boolean {
    // A live provider actually serving a quote for this symbol → real data.
    const liveServing = this.providers.some((p) => p.isLive && p.getQuote(symbol));
    // A non-live (sim) provider serving it → synthetic.
    const simServing = this.providers.some((p) => !p.isLive && p.getQuote(symbol));
    return simServing && !liveServing;
  }

  getMarketStatus(): MarketStatus {
    const live = this.providers.filter((p) => p.id !== "demo");
    const hasDemo = this.providers.some((p) => p.id === "demo");
    if (!live.length) return { open: true, label: "SIMULATED (demo feed)", timestamp: Date.now() };
    const liveLabel = live.map((p) => p.label).join(" + ");
    return {
      open: true,
      label: hasDemo ? `LIVE (${liveLabel}) + SIM FALLBACK` : `LIVE (${liveLabel})`,
      timestamp: Date.now()
    };
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
