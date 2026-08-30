"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { DEFAULT_INSTRUMENTS } from "@/lib/instruments";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { TREND_COLOR } from "@/components/ui/badges";

const KEY = "impera.watchlist.v1";

export default function WatchlistPage() {
  const state = useMarketState();
  const [watch, setWatch] = useState<string[]>([]);
  const [candidate, setCandidate] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setWatch(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const toggle = (sym: string) => {
    const next = watch.includes(sym) ? watch.filter((s) => s !== sym) : [...watch, sym];
    setWatch(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const watchedRows = watch
    .map((sym) => state.snapshot.instruments[sym])
    .filter((a) => !!a);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h2 className="panel-title mb-2">ADD TO WATCHLIST</h2>
        <div className="flex gap-2">
          <input
            list="instruments"
            value={candidate}
            onChange={(e) => setCandidate(e.target.value)}
            placeholder="Type symbol e.g. XAUUSD"
            className="bg-terminal-panel border border-terminal-border rounded px-3 py-1.5 text-sm text-white placeholder:text-terminal-muted"
          />
          <datalist id="instruments">
            {DEFAULT_INSTRUMENTS.map((i) => (
              <option key={i.symbol} value={i.symbol}>{i.name}</option>
            ))}
          </datalist>
          <button
            onClick={() => {
              const sym = candidate.toUpperCase().trim();
              if (sym && DEFAULT_INSTRUMENTS.some((i) => i.symbol === sym) && !watch.includes(sym)) {
                toggle(sym);
                setCandidate("");
              }
            }}
            className="btn btn-primary"
          >
            Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {watch.map((sym) => {
          const a = state.snapshot.instruments[sym];
          if (!a) {
            return (
              <div key={sym} className="panel p-3 flex items-center justify-between">
                <span className="text-white font-semibold">{sym}</span>
                <button onClick={() => toggle(sym)} className="text-rose-400 hover:text-rose-300 text-sm">✕</button>
              </div>
            );
          }
          return (
            <div key={sym} className="panel p-3">
              <div className="flex items-center justify-between">
                <Link href={`/markets/${sym}`} className="font-semibold text-white hover:text-sky-300">{sym}</Link>
                <button onClick={() => toggle(sym)} className="text-rose-400 hover:text-rose-300 text-sm">✕</button>
              </div>
              <div className="font-mono text-white text-sm mt-1">{formatPrice(a.price, decimalsFor(sym))}</div>
              <div className={`text-[11px] font-semibold ${TREND_COLOR[a.trend.regime] ?? ""}`}>{a.trend.regime}</div>
              <div className="text-[11px] text-terminal-muted mt-1">Str {a.trend.strength} · {a.session}</div>
            </div>
          );
        })}
        {watch.length === 0 && (
          <div className="col-span-full panel p-8 text-center text-xs text-terminal-muted">
            Your watchlist is empty. Add instruments above.
          </div>
        )}
      </div>
    </div>
  );
}
