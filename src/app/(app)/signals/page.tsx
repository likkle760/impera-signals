"use client";
import { useMemo, useState } from "react";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import SignalCard from "@/components/SignalCard";
import { formatTime } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Signal, Activity, Filter, Send } from "lucide-react";
import { StatCard } from "@/components/ui";
import { TelegramCta } from "@/components/TelegramCta";

const TYPES = [
  "All",
  "MARKET BUY",
  "MARKET SELL",
  "BUY LIMIT",
  "SELL LIMIT",
  "SCALP BUY",
  "SCALP SELL",
  "DAY TRADE BUY",
  "DAY TRADE SELL",
  "SWING BUY",
  "SWING SELL",
];

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function SignalsPage() {
  const state = useMarketState();
  const [filter, setFilter] = useState("All");

  const allSignals = state.snapshot.signals;
  const signals = useMemo(() => {
    let s = [...allSignals];
    if (filter !== "All") s = s.filter((x) => x.type === filter);
    return s.sort((a, b) => b.confidence - a.confidence);
  }, [allSignals, filter]);

  const active = allSignals.filter((x) => x.status === "ACTIVE" || x.status === "TRIGGERED");
  const avgConfidence = allSignals.length
    ? Math.round(allSignals.reduce((a, s) => a + s.confidence, 0) / allSignals.length)
    : 0;
  const highConf = allSignals.filter((s) => s.confidence >= 70).length;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div
        variants={item}
        className="relative overflow-hidden rounded-3xl panel border-terminal-border/50 p-6 sm:p-8"
      >
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-terminal-accent/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terminal-accentBg border border-terminal-accent/30 text-terminal-accent text-caption font-semibold mb-4">
              <span className="w-2 h-2 rounded-full bg-terminal-bull animate-pulse-live" />
              LIVE SIGNAL FEED
            </div>
            <h1 className="font-display text-display-md sm:text-display-lg font-bold tracking-tight">
              Signal <span className="gradient-text">Feed</span>
            </h1>
            <p className="text-terminal-muted mt-2 max-w-xl">
              Filtered, high-confluence institutional setups. Every signal is backed by
              multi-timeframe SMC/ICT confluence and live OANDA data.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-terminal-bgElevated/60 border border-terminal-border/60 rounded-xl px-3 py-1.5 text-caption text-terminal-muted">
            <Activity className="w-3.5 h-3.5 text-terminal-accent" />
            Last analysis · {formatTime(state.lastAnalysis)}
          </div>
        </div>
      </motion.div>

      {/* Stats strip */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Signals" value={allSignals.length} icon={<Signal className="w-5 h-5" />} variant="accent" />
        <StatCard label="Active Now" value={active.length} icon={<Zap className="w-5 h-5" />} variant="success" />
        <StatCard label="High Confidence" value={highConf} icon={<Activity className="w-5 h-5" />} variant="warning" />
        <StatCard label="Avg Confidence" value={avgConfidence} unit="%" icon={<Filter className="w-5 h-5" />} variant="info" />
      </motion.div>

      {/* Filters */}
      <motion.div variants={item} className="flex flex-wrap gap-2 items-center">
        <span className="flex items-center gap-1.5 text-caption uppercase tracking-wider text-terminal-muted mr-1">
          <Filter className="w-3.5 h-3.5" /> Type
        </span>
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`filter-chip ${filter === t ? "filter-chip-active" : ""}`}
          >
            {t}
          </button>
        ))}
      </motion.div>

      {/* Signals */}
      <motion.div variants={item}>
        {signals.length === 0 ? (
          <div className="panel flex flex-col items-center py-16 px-6 text-center">
            <div className="text-5xl mb-4 opacity-40">◈</div>
            <p className="text-terminal-muted font-medium">No high-quality setup for “{filter}”</p>
            <p className="text-caption text-terminal-muted mt-1">Markets are being continuously monitored.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout" initial={false}>
              {signals.map((s) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                  className="hover-lift"
                >
                  <SignalCard signal={s} decimals={decimalsFor(s.symbol)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Telegram CTA */}
      <motion.div variants={item}>
        <TelegramCta />
      </motion.div>

      {/* Footer note */}
      <motion.div
        variants={item}
        className="panel p-4 text-caption text-terminal-muted flex flex-wrap items-center justify-between gap-3"
      >
        <span>
          {signals.length} signal(s) · {allSignals.length} total · scanned at {formatTime(state.lastAnalysis)}
        </span>
        <a href="/" className="inline-flex items-center gap-1.5 text-terminal-accent hover:underline">
          <Send className="w-3.5 h-3.5" /> View dashboard
        </a>
      </motion.div>
    </motion.div>
  );
}
