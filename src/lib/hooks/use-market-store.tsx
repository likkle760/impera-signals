"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { MarketStore, MarketStoreState } from "@/lib/engine/store";
import { MarketDataProvider } from "@/lib/providers/types";
import { OandaMarketDataProvider } from "@/lib/providers/oanda";
import { CryptoMarketDataProvider } from "@/lib/providers/crypto";
import { FuturesMarketDataProvider } from "@/lib/providers/futures";
import { AggregateMarketDataProvider } from "@/lib/providers/aggregate";

const StoreContext = createContext<MarketStore | null>(null);

function resolveProvider(): MarketDataProvider | undefined {
  const providers: MarketDataProvider[] = [];
  // OANDA live feed: the API token lives SERVER-SIDE (via the /api/market/oanda
  // proxy) so it is never exposed to the browser. The proxy reports whether
  // OANDA is configured; if not, this provider stays idle.
  providers.push(new OandaMarketDataProvider());
  // Crypto always streams live from the free Binance public API.
  providers.push(new CryptoMarketDataProvider());
  // Indices/futures: simulated feed (clearly labelled) — no free live feed exists.
  providers.push(new FuturesMarketDataProvider());
  if (providers.length === 1) return providers[0];
  return new AggregateMarketDataProvider(providers);
}

export function MarketStoreProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<MarketStore | null>(null);
  if (!ref.current) {
    ref.current = new MarketStore(resolveProvider());
  }
  useEffect(() => {
    const store = ref.current!;
    void store.start();
    return () => store.stop();
  }, []);

  return <StoreContext.Provider value={ref.current}>{children}</StoreContext.Provider>;
}

export function useMarketStore(): MarketStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useMarketStore must be used within MarketStoreProvider");
  return ctx;
}

export function useMarketState(): MarketStoreState {
  const store = useMarketStore();
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((x) => x + 1)), [store]);
  return store.getState();
}
