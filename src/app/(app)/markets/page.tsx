"use client";
import Link from "next/link";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { TREND_COLOR } from "@/components/ui/badges";
import { LiveValue } from "@/components/ui";
import { motion } from "framer-motion";
import { Globe, ArrowUpRight, Coins, CandlestickChart, Landmark, Fuel } from "lucide-react";

const GROUPS = ["forex", "metals", "indices", "futures", "commodities"] as const;
const GROUP_LABEL: Record<string, string> = {
  forex: "Forex",
  metals: "Metals",
  indices: "Indices",
  futures: "Futures",
  commodities: "Commodities",
};

const GROUP_ICON: Record<string, React.ReactNode> = {
  forex: <Globe className="w-5 h-5" />,
  metals: <Coins className="w-5 h-5" />,
  indices: <CandlestickChart className="w-5 h-5" />,
  futures: <Landmark className="w-5 h-5" />,
  commodities: <Fuel className="w-5 h-5" />,
};

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function MarketsPage() {
  const state = useMarketState();
  const instruments = Object.values(state.snapshot.instruments);
  const total = instruments.length;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={item} className="relative overflow-hidden rounded-3xl panel border-terminal-border/50 p-6 sm:p-8">
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute -top-24 right-0 w-80 h-80 rounded-full bg-terminal-accent/10 blur-3xl" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terminal-accentBg border border-terminal-accent/30 text-terminal-accent text-caption font-semibold mb-4">
              <Globe className="w-3.5 h-3.5" /> LIVE MARKETS
            </div>
            <h1 className="font-display text-display-md sm:text-display-lg font-bold tracking-tight">
              Markets <span className="gradient-text">Overview</span>
            </h1>
            <p className="text-terminal-muted mt-2 max-w-xl">
              Live prices across forex, metals, indices and futures with real-time regime
              and trend strength.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-terminal-bgElevated/60 border border-terminal-border/60 rounded-xl px-3 py-1.5 text-caption text-terminal-muted">
            <span className="live-dot live-dot-live" /> {total} instruments tracked
          </div>
        </div>
      </motion.div>

      {GROUPS.map((g, gi) => {
        const group = instruments.filter((i) => i.assetClass === g);
        if (!group.length) return null;
        const bullish = group.filter((i) => i.trend.regime === "BULLISH").length;
        const bearish = group.filter((i) => i.trend.regime === "BEARISH").length;

        return (
          <motion.section key={g} variants={item}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${
                  g === "metals" ? "bg-terminal-violetBg text-terminal-violet"
                  : g === "indices" ? "bg-terminal-infoBg text-terminal-info"
                  : g === "futures" ? "bg-terminal-warnBg text-terminal-warn"
                  : "bg-terminal-accentBg text-terminal-accent"
                }`}>
                  {GROUP_ICON[g]}
                </div>
                <div>
                  <h2 className="panel-title">{GROUP_LABEL[g].toUpperCase()}</h2>
                  <p className="text-caption-xs text-terminal-muted">
                    {group.length} instruments · {bullish}▲ {bearish}▼
                  </p>
                </div>
              </div>
              <span className="text-caption text-terminal-muted">{bullish + bearish} trending</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.map((a, i) => {
                const tone =
                  a.trend.regime === "BULLISH"
                    ? { bar: "from-terminal-bull/70", text: "text-terminal-bull" }
                    : a.trend.regime === "BEARISH"
                    ? { bar: "from-terminal-bear/70", text: "text-terminal-bear" }
                    : { bar: "from-terminal-muted/60", text: "text-terminal-muted" };
                return (
                  <motion.div
                    key={a.symbol}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.04 * i, duration: 0.3 }}
                  >
                    <Link
                      href={`/markets/${a.symbol}`}
                      className="group panel panel-hover relative overflow-hidden block p-3.5 transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <div className={`absolute top-0 left-0 h-[2px] bg-gradient-to-r ${tone.bar} to-transparent`} />
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-terminal-text">{a.symbol}</span>
                        <span className={`font-mono text-xs font-semibold ${tone.text}`}>
                          {a.trend.strength}
                        </span>
                      </div>
                      <div className="font-mono text-sm text-terminal-text mt-1 tabular-nums">
                        <LiveValue value={a.price} decimals={decimalsFor(a.symbol)} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={`text-[11px] font-semibold ${tone.text}`}>
                          {a.trend.regime.replace("SLIGHTLY ", "SLT ")}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-terminal-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        );
      })}
    </motion.div>
  );
}
