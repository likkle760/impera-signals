"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { DEFAULT_INSTRUMENTS } from "@/lib/instruments";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { TREND_COLOR } from "@/components/ui/badges";
import { PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { Eye, Plus, Trash2, Star, ArrowUpRight } from "lucide-react";

const KEY = "impera.watchlist.v1";

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

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

  const live = watch.filter((sym) => !!state.snapshot.instruments[sym]).length;
  const bullish = watch.filter((sym) => state.snapshot.instruments[sym]?.trend.regime === "BULLISH").length;
  const bearish = watch.filter((sym) => state.snapshot.instruments[sym]?.trend.regime === "BEARISH").length;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="PERSONAL WATCHLIST"
          eyebrowIcon={<Eye className="w-3.5 h-3.5" />}
          title="Your"
          highlight="Watchlist"
          description="Pin the instruments you actually trade. Every card streams live price, regime and trend strength."
          right={
            <div className="inline-flex items-center gap-2 bg-terminal-bgElevated/60 border border-terminal-border/60 rounded-xl px-3 py-1.5 text-caption text-terminal-muted">
              <Star className="w-3.5 h-3.5 text-terminal-accent" />
              {watch.length} pinned
            </div>
          }
        />
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatStripValue label="Pinned" value={watch.length} />
        <StatStripValue label="Live Data" value={live} />
        <StatStripValue label="Bullish" value={bullish} cls="text-terminal-bull" />
        <StatStripValue label="Bearish" value={bearish} cls="text-terminal-bear" />
      </motion.div>

      {/* Add */}
      <motion.div variants={item} className="panel p-4 panel-hover">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Star className="w-4 h-4 text-terminal-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              list="instruments"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              placeholder="Type a symbol e.g. XAUUSD"
              className="input pl-9 py-2.5"
            />
            <datalist id="instruments">
              {DEFAULT_INSTRUMENTS.map((i) => (
                <option key={i.symbol} value={i.symbol}>{i.name}</option>
              ))}
            </datalist>
          </div>
          <button
            onClick={() => {
              const sym = candidate.toUpperCase().trim();
              if (sym && DEFAULT_INSTRUMENTS.some((i) => i.symbol === sym) && !watch.includes(sym)) {
                toggle(sym);
                setCandidate("");
              }
            }}
            className="btn btn-primary btn-sm"
          >
            <Plus className="w-4 h-4" /> Add to Watchlist
          </button>
        </div>
      </motion.div>

      {/* Cards */}
      {watch.length === 0 ? (
        <motion.div variants={item} className="panel empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">Your watchlist is empty</div>
          <div className="empty-desc">Add instruments above to keep a live eye on your most-traded markets.</div>
        </motion.div>
      ) : (
        <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {watch.map((sym, i) => {
            const a = state.snapshot.instruments[sym];
            if (!a) {
              return (
                <motion.div
                  key={sym}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i, duration: 0.3 }}
                  className="panel p-4 flex items-center justify-between"
                >
                  <span className="font-semibold text-terminal-text">{sym}</span>
                  <button onClick={() => toggle(sym)} className="text-rose-400 hover:text-rose-300 text-sm flex items-center gap-1">
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                </motion.div>
              );
            }
            const regime = a.trend.regime;
            const strength = Math.min(100, Math.max(0, a.trend.strength));
            return (
              <motion.div
                key={sym}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                className="hover-lift"
              >
                <Link href={`/markets/${sym}`} className="group card card-interactive overflow-hidden block h-full">
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-2 rounded-xl flex-shrink-0 ${
                          regime === "BULLISH" ? "bg-terminal-bullBg text-terminal-bull"
                          : regime === "BEARISH" ? "bg-terminal-bearBg text-terminal-bear"
                          : "bg-terminal-bgElevated text-terminal-muted"
                        }`}>
                          <ArrowUpRight className={`w-4 h-4 ${regime === "BEARISH" ? "-rotate-90" : ""}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-terminal-text leading-tight">{sym}</div>
                          <div className="text-[11px] text-terminal-muted truncate">{a.name}</div>
                        </div>
                      </div>
                      <button onClick={() => toggle(sym)} className="text-terminal-muted hover:text-rose-400 transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-end justify-between mt-3">
                      <div className={`font-mono text-lg font-semibold tabular-nums ${TREND_COLOR[regime] ?? "text-terminal-text"}`}>
                        {formatPrice(a.price, decimalsFor(sym))}
                      </div>
                      <span className={`text-[11px] font-semibold ${TREND_COLOR[regime] ?? ""}`}>
                        {regime.replace("SLIGHTLY ", "SLT ")}
                      </span>
                    </div>

                    {/* Trend strength gauge */}
                    <div className="mt-3">
                      <div className="flex justify-between text-[10px] uppercase tracking-wider text-terminal-muted mb-1">
                        <span>Strength</span>
                        <span className="font-mono text-terminal-textDim">{a.trend.strength}/100</span>
                      </div>
                      <div className="strength-bar h-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${strength}%`,
                            background: regime === "BULLISH" ? "linear-gradient(90deg,#089981,#22c55e)" : regime === "BEARISH" ? "linear-gradient(90deg,#f23645,#f87171)" : "linear-gradient(90deg,#64748b,#94a3b8)",
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-terminal-border/50 flex items-center justify-between text-[11px]">
                      <span className="text-terminal-muted">Momentum</span>
                      <span className={`font-mono ${a.trend.momentum >= 60 ? "text-emerald-400" : a.trend.momentum <= 40 ? "text-rose-400" : "text-terminal-textDim"}`}>
                        {a.trend.momentum}
                      </span>
                      <span className="flex items-center gap-1 text-sky-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse-live" /> {a.session}
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}

function StatStripValue({ label, value, cls = "text-white" }: { label: string; value: number; cls?: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold font-mono ${cls}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-terminal-muted mt-1">{label}</div>
    </div>
  );
}