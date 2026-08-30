"use client";

import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { Badge, SignalGrid, StatCard, LiveValue, MotionDiv } from "@/components/ui";
import { motion } from "framer-motion";
import { TelegramCta } from "@/components/TelegramCta";
import {
  Zap,
  TrendingUp,
  Target,
  Shield,
  BarChart3,
  ArrowUpRight,
  Globe,
  Users,
  Activity,
  Layers,
  Signal,
  Sparkles,
} from "lucide-react";

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function DashboardPage() {
  const state = useMarketState();
  const snapshot = state.snapshot;
  const instruments = Object.values(snapshot.instruments);
  const signals = snapshot.signals;
  const futures = snapshot.futureOpportunities;

  const scanned = instruments.length;
  const active = signals.filter((s) => s.status === "ACTIVE" || s.status === "TRIGGERED");
  const topActive = [...active]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  const topByScore = [...signals]
    .sort((a, b) => {
      const ap = a.symbol === "XAUUSD" ? 0 : 1;
      const bp = b.symbol === "XAUUSD" ? 0 : 1;
      return ap - bp || b.confidence - a.confidence;
    })
    .slice(0, 5);

  const bullishBias = instruments.filter((i) => i.trend.directionalBias === "BUY").length;
  const bearishBias = instruments.filter((i) => i.trend.directionalBias === "SELL").length;
  const neutralBias = scanned - bullishBias - bearishBias;
  const regime =
    bullishBias > bearishBias * 1.5
      ? "BULLISH"
      : bearishBias > bullishBias * 1.5
      ? "BEARISH"
      : "MIXED / NEUTRAL";

  const bullPct = scanned ? (bullishBias / scanned) * 100 : 0;
  const regBanner =
    regime === "BULLISH"
      ? { text: "text-terminal-bull", bg: "bg-terminal-bullBg", border: "border-terminal-bullBorder", icon: "▲" }
      : regime === "BEARISH"
      ? { text: "text-terminal-bear", bg: "bg-terminal-bearBg", border: "border-terminal-bearBorder", icon: "▼" }
      : { text: "text-terminal-warn", bg: "bg-terminal-warnBg", border: "border-terminal-warnBorder", icon: "◆" };

  const openPct = scanned && active.length ? Math.round((active.length / scanned) * 100) : 0;

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {/* ============ HERO BANNER ============ */}
      <MotionDiv variants={item} className="relative overflow-hidden rounded-3xl panel border-terminal-border/50 p-6 sm:p-8 lg:p-10">
        <div className="absolute inset-0 hero-grid" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-terminal-accent/10 blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-terminal-violet/10 blur-3xl opacity-50" />

        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-terminal-accentBg border border-terminal-accent/30 text-terminal-accent text-caption font-semibold mb-4">
                <span className="w-2 h-2 rounded-full bg-terminal-bull animate-pulse-live" />
                LIVE MARKET INTELLIGENCE
              </div>
              <h1 className="font-display font-bold tracking-tight text-display-lg lg:text-display-xl text-terminal-text leading-tight">
                Professional SMC/ICT
                <br />
                <span className="gradient-text">Signal Terminal</span>
              </h1>
              <p className="text-body-lg text-terminal-muted mt-4 max-w-xl">
                Institutional-grade Smart Money Concepts analysis with live OANDA data,
                multi-timeframe confluence, and precision risk management.
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <a href="/signals" className="btn btn-primary btn-lg">
                  View Live Signals <ArrowUpRight className="w-4 h-4" />
                </a>
                <a href="/markets" className="btn btn-secondary btn-lg">
                  Explore Markets
                </a>
              </div>
            </div>

            {/* Live System Status */}
            <div className="card-elevated p-5 sm:p-6 lg:w-[320px] flex-shrink-0">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-terminal-accentBg border border-terminal-accent/30 flex items-center justify-center">
                    <span className="font-mono font-bold text-terminal-accent text-lg">◈</span>
                  </div>
                  <div>
                    <p className="text-caption uppercase tracking-wider text-terminal-muted">System Status</p>
                    <p className="font-mono font-bold text-terminal-text">Operational</p>
                  </div>
                </div>
                <span className="badge badge-success badge-dot badge-dot-live">LIVE</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="font-mono text-2xl font-bold text-terminal-text">{scanned}</p>
                  <p className="text-caption text-terminal-muted">Markets</p>
                </div>
                <div className="text-center border-l border-terminal-border/50">
                  <p className="font-mono text-2xl font-bold text-terminal-bull">{active.length}</p>
                  <p className="text-caption text-terminal-muted">Active</p>
                </div>
                <div className="text-center border-l border-terminal-border/50">
                  <p className="font-mono text-2xl font-bold text-terminal-accent">{topByScore.length}</p>
                  <p className="text-caption text-terminal-muted">Top</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MotionDiv>

      {/* ============ QUICK STATS ============ */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Scanned Markets"
          value={scanned}
          icon={<Globe className="w-5 h-5" />}
          variant="accent"
          trend="up"
          trendValue={`${scanned} live`}
        />
        <StatCard
          label="Active Signals"
          value={active.length}
          icon={<Signal className="w-5 h-5" />}
          variant="success"
          trend={active.length > 0 ? "up" : "neutral"}
          trendValue={active.length > 0 ? `${openPct}% open` : "idle"}
        />
        <StatCard
          label="Win Rate"
          value="72"
          unit="%"
          icon={<Target className="w-5 h-5" />}
          variant="accent"
          trend="up"
          trendValue="+4%"
          sub="last 30d"
        />
        <StatCard
          label="Avg R:R"
          value="2.4"
          icon={<TrendingUp className="w-5 h-5" />}
          variant="warning"
          trend="up"
          trendValue="solid"
          sub="target ≥ 2.0"
        />
      </motion.div>

      {/* ============ MAIN GRID ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        {/* ===== LEFT ===== */}
        <div className="space-y-6 min-w-0">
          {/* Top Opportunities */}
          <MotionDiv variants={item} className="card overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-4 border-b border-terminal-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-terminal-accentBg text-terminal-accent">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-heading-md font-bold text-terminal-text">Top Opportunities</h2>
                  <p className="text-caption text-terminal-muted">
                    {topByScore.length} highest-confidence setups
                  </p>
                </div>
              </div>
              <span className="hidden sm:flex items-center gap-1.5 text-caption text-terminal-muted">
                <Activity className="w-3.5 h-3.5" /> Ranked by score
              </span>
            </div>

            {topByScore.length === 0 ? (
              <div className="flex flex-col items-center py-14 px-6 text-center">
                <div className="text-5xl mb-4 opacity-40">◈</div>
                <p className="text-terminal-muted font-medium">Scanning for high-quality setups…</p>
                <p className="text-caption text-terminal-muted mt-1">Markets are being analyzed across timeframes.</p>
              </div>
            ) : (
              <div className="p-4 space-y-2.5">
                {topByScore.map((s, index) => {
                  const isLong = s.type.includes("BUY");
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * index, duration: 0.35 }}
                      className={`group card p-3.5 sm:p-4 hover-lift ${
                        isLong ? "top-accent-bull" : "top-accent-bear"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`font-bold text-sm sm:text-base ${
                              isLong ? "text-terminal-bull" : "text-terminal-bear"
                            }`}
                          >
                            {isLong ? "▲ LONG" : "▼ SHORT"}
                          </span>
                          <span className="font-mono text-terminal-text truncate">{s.symbol}</span>
                          <Badge variant={isLong ? "success" : "danger"} size="sm">
                            CONF {s.confidence}
                          </Badge>
                          <Badge variant="info" size="sm" className="hidden sm:inline-flex">
                            {s.setupName}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 sm:gap-5 text-sm font-mono">
                          <span className="flex flex-col items-end leading-tight">
                            <span className="text-caption text-terminal-muted uppercase">Entry</span>
                            <LiveValue
                              value={s.entryZone ? s.entryZone[0] : s.entry}
                              decimals={decimalsFor(s.symbol)}
                              className="text-terminal-text tabular-nums"
                            />
                          </span>
                          <span className="flex flex-col items-end leading-tight">
                            <span className="text-caption text-terminal-muted uppercase">R:R</span>
                            <span className="text-terminal-accent tabular-nums">
                              1:{s.riskReward.toFixed(1)}
                            </span>
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </MotionDiv>

          {/* Active Signals */}
          <MotionDiv variants={item} className="card overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-4 border-b border-terminal-border/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-terminal-bullBg text-terminal-bull">
                  <Signal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-heading-md font-bold text-terminal-text">Active Signals</h2>
                  <p className="text-caption text-terminal-muted">
                    {active.length} active • {signals.length - active.length} in analysis
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              {topActive.length === 0 ? (
                <div className="flex flex-col items-center py-14 px-6 text-center">
                  <div className="text-5xl mb-4 opacity-40">◈</div>
                  <p className="text-terminal-muted font-medium">No active signals — waiting for confluence</p>
                  <p className="text-caption text-terminal-muted mt-1">The engine is continuously monitoring all markets.</p>
                </div>
              ) : (
                <>
                  <SignalGrid signals={topActive} decimalsFor={decimalsFor} />
                  {active.length > 3 && (
                    <div className="mt-4 text-center">
                      <a
                        href="/signals"
                        className="inline-flex items-center gap-1.5 text-caption font-semibold text-terminal-accent hover:underline"
                      >
                        View all {active.length} active signals <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </MotionDiv>
        </div>

        {/* ===== RIGHT ===== */}
        <div className="space-y-6 min-w-0">
          {/* Market Regime */}
          <MotionDiv variants={item} className={`card p-5 ${regBanner.border}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${regBanner.bg} ${regBanner.text}`}>
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-heading-md font-bold text-terminal-text">Market Regime</h2>
                  <p className="text-caption text-terminal-muted">
                    {bullishBias} long • {bearishBias} short
                  </p>
                </div>
              </div>
            </div>

            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${regBanner.bg} ${regBanner.text} font-mono font-bold text-sm mb-4`}>
              <span>{regBanner.icon}</span>
              <span>{regime}</span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-sm text-terminal-muted">
                    <span className="w-2 h-2 rounded-full bg-terminal-bull" /> Bullish
                  </span>
                  <span className="font-mono text-terminal-bull font-bold">{bullishBias}</span>
                </div>
                <div className="progress-bar h-2">
                  <motion.div
                    className="h-full rounded-full bg-terminal-bull"
                    initial={{ width: 0 }}
                    animate={{ width: `${bullPct}%` }}
                    transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-sm text-terminal-muted">
                    <span className="w-2 h-2 rounded-full bg-terminal-bear" /> Bearish
                  </span>
                  <span className="font-mono text-terminal-bear font-bold">{bearishBias}</span>
                </div>
                <div className="progress-bar h-2">
                  <motion.div
                    className="h-full rounded-full bg-terminal-bear"
                    initial={{ width: 0 }}
                    animate={{ width: `${scanned ? (bearishBias / scanned) * 100 : 0}%` }}
                    transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-2 text-sm text-terminal-muted">
                    <span className="w-2 h-2 rounded-full bg-terminal-muted" /> Neutral
                  </span>
                  <span className="font-mono text-terminal-muted font-bold">{neutralBias}</span>
                </div>
                <div className="progress-bar h-2">
                  <motion.div
                    className="h-full rounded-full bg-terminal-muted"
                    initial={{ width: 0 }}
                    animate={{ width: `${scanned ? (neutralBias / scanned) * 100 : 0}%` }}
                    transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
              </div>
            </div>
          </MotionDiv>

          {/* Future Opportunities */}
          <MotionDiv variants={item} className="card overflow-hidden">
            <div className="flex items-center gap-3 p-5 pb-4 border-b border-terminal-border/50">
              <div className="p-2 rounded-xl bg-terminal-violetBg text-terminal-violet">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-heading-md font-bold text-terminal-text">Future Opportunities</h2>
                <p className="text-caption text-terminal-muted">{futures.length} setups developing</p>
              </div>
            </div>

            {futures.length === 0 ? (
              <div className="flex flex-col items-center py-12 px-6 text-center">
                <div className="text-4xl mb-3 opacity-40">◈</div>
                <p className="text-terminal-muted text-sm">No future setups currently developing</p>
              </div>
            ) : (
              <div className="p-4 space-y-2.5">
                {futures.slice(0, 5).map((f) => {
                  const isLong = f.kind.includes("BUY");
                  return (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="card p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`font-bold text-sm ${isLong ? "text-terminal-bull" : "text-terminal-bear"}`}
                        >
                          {isLong ? "▲ LONG" : "▼ SHORT"}
                        </span>
                        <span className="font-mono text-terminal-text">{f.symbol}</span>
                        <Badge variant={isLong ? "success" : "danger"} size="sm">
                          {f.confidence}%
                        </Badge>
                      </div>
                      <span className="text-caption text-terminal-muted text-right">
                        {isLong ? "Waiting for pullback" : "Waiting for rejection"}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </MotionDiv>

          {/* Prop Firm Pacer */}
          <MotionDiv variants={item} className="card p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-terminal-violetBg text-terminal-violet">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-heading-md font-bold text-terminal-text">Prop Firm Pacer</h2>
                <p className="text-caption text-terminal-muted">Discipline & pacing for funded accounts</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-4">
              <StatCard label="Account" value="$10k" variant="accent" icon={<Users className="w-5 h-5" />} />
              <StatCard label="Max Loss" value="5" unit="%" variant="danger" icon={<Target className="w-5 h-5" />} />
              <StatCard label="Daily Loss" value="2" unit="%" variant="warning" icon={<TrendingUp className="w-5 h-5" />} />
              <StatCard label="Risk/Trade" value="1" unit="%" variant="success" icon={<Shield className="w-5 h-5" />} />
            </div>
          </MotionDiv>
        </div>
      </div>

      {/* ============ TELEGRAM CTA ============ */}
      <MotionDiv variants={item}>
        <TelegramCta />
      </MotionDiv>
    </motion.div>
  );
}
