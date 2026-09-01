"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { RISK_BADGE, TREND_COLOR } from "@/components/ui/badges";
import { StatCard, LiveValue } from "@/components/ui";
import { motion } from "framer-motion";
import { Search, Radar, TrendingUp, ShieldCheck, Zap } from "lucide-react";
import OandaStatusBanner from "@/components/OandaStatusBanner";

const FILTERS = ["All", "Forex", "Metals", "Indices", "Futures", "Commodities", "Scalps", "Day Trades", "Long", "Short", "Buy Limits", "Sell Limits", "Low Risk", "Medium Risk", "High Risk"];

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function ScannerPage() {
  const state = useMarketState();
  const [filter, setFilter] = useState<string>("All");

  const rows = useMemo(() => {
    let rows = [...state.snapshot.scanner];
    const assetClass = filter.toLowerCase();
    rows = rows.filter((r) => {
      const hasSetup = !!r.setup;
      if (!hasSetup && ["Scalps", "Day Trades", "Long", "Short", "Buy Limits", "Sell Limits", "Low Risk", "Medium Risk", "High Risk"].includes(filter)) return false;
      if (filter === "All") return true;
      if (["Forex", "Metals", "Indices", "Futures", "Commodities"].includes(filter)) return r.assetClass === assetClass;
      if (filter === "Scalps") return r.setup?.includes("SCALP");
      if (filter === "Day Trades") return r.setup?.includes("DAY TRADE");
      if (filter === "Long") return r.direction === "BUY" && !r.setup?.includes("LIMIT");
      if (filter === "Short") return r.direction === "SELL" && !r.setup?.includes("LIMIT");
      if (filter === "Buy Limits") return r.setup?.includes("BUY LIMIT");
      if (filter === "Sell Limits") return r.setup?.includes("SELL LIMIT");
      if (filter === "Low Risk") return r.risk === "LOW" || r.risk === "VERY LOW";
      if (filter === "Medium Risk") return r.risk === "MEDIUM";
      if (filter === "High Risk") return r.risk === "HIGH" || r.risk === "VERY HIGH";
      return true;
    });

    rows.sort((a, b) => (b.signalScore ?? -1) - (a.signalScore ?? -1));
    return rows;
  }, [state.snapshot.scanner, filter]);

  const withSetup = rows.filter((r) => !!r.setup);
  const activeSignals = rows.filter((r) => r.status === "ACTIVE").length;
  const lowRisk = rows.filter((r) => r.risk === "LOW" || r.risk === "VERY LOW").length;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-3xl panel border-terminal-border/50 p-6 sm:p-8">
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-terminal-accent/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terminal-accentBg border border-terminal-accent/30 text-terminal-accent text-caption font-semibold mb-4">
              <Search className="w-3.5 h-3.5" /> MARKET SCANNER
            </div>
            <h1 className="font-display text-display-md sm:text-display-lg font-bold tracking-tight">
              Market <span className="gradient-text">Scanner</span>
            </h1>
            <p className="text-terminal-muted mt-2 max-w-xl">
              Every instrument, ranked by confluence and risk-adjusted score. Drill into any
              symbol for a full breakdown.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-terminal-bgElevated/60 border border-terminal-border/60 rounded-xl px-3 py-1.5 text-caption text-terminal-muted">
            <Radar className="w-3.5 h-3.5 text-terminal-accent" /> {rows.length} instruments
          </div>
        </div>
      </motion.div>

      {/* OANDA feed status */}
      <motion.div variants={item}>
        <OandaStatusBanner />
      </motion.div>

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Instruments" value={rows.length} icon={<Radar className="w-5 h-5" />} variant="accent" />
        <StatCard label="Setups Found" value={withSetup.length} icon={<Zap className="w-5 h-5" />} variant="success" />
        <StatCard label="Active" value={activeSignals} icon={<TrendingUp className="w-5 h-5" />} variant="warning" />
        <StatCard label="Low Risk" value={lowRisk} icon={<ShieldCheck className="w-5 h-5" />} variant="info" />
      </motion.div>

      {/* Filters */}
      <motion.div variants={item} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-chip ${filter === f ? "filter-chip-active" : ""}`}
          >
            {f}
          </button>
        ))}
      </motion.div>

      {/* Table */}
      <motion.div variants={item} className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Trend</th>
                <th>Str</th>
                <th>Setup</th>
                <th>Dir</th>
                <th>Score</th>
                <th>Risk</th>
                <th>R:R</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="hover:bg-terminal-panel/60">
                  <td className="font-semibold">
                    <Link href={`/markets/${r.symbol}`} className="text-terminal-text hover:text-terminal-accent transition-colors">
                      {r.symbol}
                    </Link>
                    {r.simulated && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[10px] font-bold">
                        SIM
                      </span>
                    )}
                  </td>
                  <td>
                    <LiveValue value={r.price} decimals={decimalsFor(r.symbol)} className="font-mono" />
                  </td>
                  <td className={`font-semibold ${TREND_COLOR[r.trend] ?? "text-terminal-muted"}`}>
                    {r.trend.replace("SLIGHTLY ", "SLT ")}
                  </td>
                  <td className="font-mono text-terminal-textDim">{r.trendStrength}</td>
                  <td>
                    {r.setup ? (
                      <span className="badge" style={{ color: "#e2e8f0" }}>
                        {r.setup}
                      </span>
                    ) : (
                      <span className="text-terminal-muted">—</span>
                    )}
                  </td>
                  <td>
                    {r.direction ? (
                      <span className={`font-bold text-sm ${r.direction === "BUY" ? "text-terminal-bull" : "text-terminal-bear"}`}>
                        {r.direction === "BUY" ? "▲ LONG" : "▼ SHORT"}
                      </span>
                    ) : (
                      <span className="text-terminal-muted">—</span>
                    )}
                  </td>
                  <td className={`font-mono font-semibold ${
                    r.signalScore === null ? "text-terminal-muted" : r.signalScore! >= 75 ? "text-terminal-accent" : "text-terminal-text"
                  }`}>
                    {r.signalScore === null ? "—" : r.signalScore}
                  </td>
                  <td>
                    {r.risk ? (
                      <span className={`badge ${RISK_BADGE[r.risk] ?? "badge-neutral"}`}>{r.risk}</span>
                    ) : (
                      <span className="text-terminal-muted">—</span>
                    )}
                  </td>
                  <td className="font-mono text-terminal-accent">{r.rr ? `1:${r.rr.toFixed(1)}` : "—"}</td>
                  <td>
                    <span className={`badge ${
                      r.status === "ACTIVE" ? "badge-success" : r.status === "WAITING" ? "badge-warning" : "badge-neutral"
                    }`}>
                      {r.status ?? "NO TRADE"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="p-8 text-center text-terminal-muted text-sm">No instruments match filter</div>
        )}
      </motion.div>
    </motion.div>
  );
}
