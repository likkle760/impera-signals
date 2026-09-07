"use client";
import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { useMarketState, useMarketStore } from "@/lib/hooks/use-market-store";
import MarketChart from "@/components/MarketChart";
import SignalCard from "@/components/SignalCard";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { TREND_COLOR, RISK_BADGE, DIRECTION_BG } from "@/components/ui/badges";
import { PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, Layers, TrendingUp, TrendingDown, MapPin, Gauge, Zap, ShieldCheck } from "lucide-react";
import type { Timeframe } from "@/lib/types";

const TFS: Timeframe[] = ["1m", "3m", "5m", "15m", "30m", "1h", "4h"];

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

export default function MarketDetailPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();
  const state = useMarketState();
  const store = useMarketStore();
  const [tf, setTf] = useState<Timeframe>("5m");

  const analysis = state.snapshot.instruments[symbol];
  const candles = useMemo(() => store.getCandleSeries(symbol, tf)?.candles ?? [], [store, symbol, tf, state.lastAnalysis]);
  const signal = state.snapshot.signals.find((s) => s.symbol === symbol);
  const futures = state.snapshot.futureOpportunities.filter((f) => f.symbol === symbol);

  if (!analysis && state.lastAnalysis > 0) return notFound();
  const cash = decimalsFor(symbol);

  const regime = analysis?.trend.regime;
  const strength = analysis ? Math.min(100, Math.max(0, analysis.trend.strength)) : 0;

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <div className="flex items-center gap-2 mb-2">
          <Link href="/markets" className="btn btn-ghost btn-sm">
            <ArrowLeft className="w-4 h-4" /> Markets
          </Link>
        </div>
        <PageHeader
          eyebrow={`MARKET ANALYSIS · ${analysis?.assetClass?.toUpperCase() ?? "SYMBOL"}`}
          eyebrowIcon={<Activity className="w-3.5 h-3.5" />}
          title={symbol}
          highlight={analysis?.name ?? ""}
          description={`${analysis?.assetClass ?? ""} · session ${analysis?.session ?? "—"}. Live multi-timeframe SMC/ICT analysis with order-block zones and entry levels.`}
          right={
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xl font-bold text-terminal-text tabular-nums">
                {analysis ? formatPrice(analysis.price, cash) : "—"}
              </span>
              {signal && (
                <span className={`badge px-3 py-1 ${signal.type.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>
                  <span className="text-[9px]">{signal.type.includes("BUY") ? "▲" : "▼"}</span> {signal.type}
                </span>
              )}
              <span className={`badge ${analysis?.trend.regime === "BULLISH" ? "badge-success" : analysis?.trend.regime === "BEARISH" ? "badge-danger" : "badge-neutral"}`}>
                {regime ?? "—"}
              </span>
            </div>
          }
        />
      </motion.div>

      {!analysis ? (
        <motion.div variants={item} className="panel empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">Loading market data…</div>
          <div className="empty-desc">Connecting to the live feed.</div>
        </motion.div>
      ) : (
        <>
          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Chart */}
            <div className="lg:col-span-2">
              <div className="card p-3 panel-hover h-full">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {TFS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTf(t)}
                      className={`filter-chip ${tf === t ? "filter-chip-active" : ""}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <MarketChart candles={candles} timeframe={tf} analysis={analysis} />
                <div className="text-[11px] text-terminal-muted mt-1.5 flex items-center gap-1.5">
                  <Gauge className="w-3 h-3 text-terminal-accent" />
                  Entry / SL / TP shown on the active signal card. Lines: EMA 9/20/50, VWAP (dashed), S/R zones.
                </div>
              </div>
            </div>

            <div className="space-y-5">
              {/* Trend */}
              <section className="card p-4 panel-hover">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="panel-title flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> TREND</h2>
                  <span className={`text-lg font-bold ${TREND_COLOR[regime] ?? ""}`}>{regime}</span>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-terminal-muted mb-1">
                    <span>Strength</span>
                    <span className="font-mono text-terminal-textDim">{analysis.trend.strength}/100</span>
                  </div>
                  <div className="strength-bar h-2">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${strength}%`,
                        background: regime === "BULLISH" ? "linear-gradient(90deg,#089981,#22c55e)" : regime === "BEARISH" ? "linear-gradient(90deg,#f23645,#f87171)" : "linear-gradient(90deg,#64748b,#94a3b8)",
                        boxShadow: regime === "BULLISH" ? "0 0 12px rgba(8,153,129,0.4)" : regime === "BEARISH" ? "0 0 12px rgba(242,54,69,0.4)" : "none",
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-sm">
                  <Row label="Momentum">
                    <span className="flex items-center gap-2">
                      <span className={`font-mono ${analysis.trend.momentum >= 60 ? "text-emerald-400" : analysis.trend.momentum <= 40 ? "text-rose-400" : "text-white"}`}>
                        {analysis.trend.momentum}
                      </span>
                      <span className={`badge ${analysis.trend.momentum >= 60 ? "badge-success" : analysis.trend.momentum <= 40 ? "badge-danger" : "badge-neutral"}`}>
                        {analysis.trend.momentum >= 60 ? "Strong" : analysis.trend.momentum <= 40 ? "Weak" : "Moderate"}
                      </span>
                    </span>
                  </Row>
                  <Row label="Structure"><span className="text-terminal-text font-medium">{analysis.structure.structureType}</span></Row>
                  <Row label="HTF"><TrendChip value={analysis.trend.higherTimeframe} /></Row>
                  <Row label="MTF"><TrendChip value={analysis.trend.mediumTerm} /></Row>
                  <Row label="STF"><TrendChip value={analysis.trend.shortTerm} /></Row>
                  <Row label="Session">
                    <span className="inline-flex items-center gap-1.5 text-sky-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse-live" /> {analysis.session}
                    </span>
                  </Row>
                </div>
              </section>

              {/* Market structure */}
              <section className="card p-4 panel-hover">
                <h2 className="panel-title mb-3 flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> MARKET STRUCTURE</h2>
                <div className="text-sm font-semibold text-terminal-text mb-2">{analysis.structure.structureType}</div>
                <div className="space-y-2 text-xs">
                  <BoolMeter label="Break of Structure" value={analysis.structure.bos} />
                  <BoolMeter label="Change of Character" value={analysis.structure.choch} />
                  <BoolMeter label="Consolidation" value={analysis.structure.consolidation} />
                </div>
              </section>

              {/* S/R */}
              <section className="card p-4 panel-hover">
                <h2 className="panel-title mb-3 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> SUPPORT / RESISTANCE</h2>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                    <TrendingUp className="w-3 h-3" /> Support
                  </div>
                  {analysis.supportResistance.supports.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex justify-between px-2 py-1 rounded-lg bg-terminal-panel2/60 border border-terminal-border/50 font-mono hover:border-emerald-500/30 transition-colors">
                      <span className="text-terminal-muted">{s.kind}</span>
                      <span className="text-emerald-300">{formatPrice(s.price, cash)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5 text-rose-400 mt-2 mb-1 font-semibold uppercase text-[10px] tracking-wider">
                    <TrendingDown className="w-3 h-3" /> Resistance
                  </div>
                  {analysis.supportResistance.resistances.slice(0, 4).map((r, i) => (
                    <div key={i} className="flex justify-between px-2 py-1 rounded-lg bg-terminal-panel2/60 border border-terminal-border/50 font-mono hover:border-rose-500/30 transition-colors">
                      <span className="text-terminal-muted">{r.kind}</span>
                      <span className="text-rose-300">{formatPrice(r.price, cash)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Indicators */}
            <section className="card p-4 panel-hover">
              <h2 className="panel-title mb-3 flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> INDICATORS ({tf.toUpperCase()})</h2>
              <Indicators analysis={analysis} cash={cash} />
            </section>

            {/* Signal */}
            <section className="card p-4 panel-hover lg:col-span-2">
              <h2 className="panel-title mb-3 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> ACTIVE SIGNAL</h2>
              {signal ? (
                <div className="max-w-md">
                  <SignalCard signal={signal} decimals={cash} />
                </div>
              ) : (
                <div className="empty-state py-8 border border-dashed border-terminal-border/70 rounded-xl">
                  <div className="empty-icon text-4xl">◈</div>
                  <div className="empty-title text-sm">NO HIGH-QUALITY SETUP</div>
                  <div className="empty-desc">
                    No confirmed setup on {symbol} right now. Reasons may include conflicting timeframes, excessive
                    volatility, poor risk/reward, weak structure, large spread, or an unconfirmed setup.
                  </div>
                </div>
              )}
            </section>
          </motion.div>

          {futures.length > 0 && (
            <motion.div variants={item} className="card p-4 panel-hover">
              <h2 className="panel-title mb-3 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> FUTURE LEVELS</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {futures.map((f) => (
                  <div key={f.id} className="panel-section p-3">
                    <div className="flex justify-between">
                      <span className={`badge ${f.kind.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>{f.kind}</span>
                      <span className={`badge ${RISK_BADGE[f.riskLevel]}`}>{f.riskLevel}</span>
                    </div>
                    <div className="text-xs mt-2 font-mono">
                      Watch: <span className="text-terminal-text">{formatPrice(f.watchZone[0], cash)} – {formatPrice(f.watchZone[1], cash)}</span>
                    </div>
                    <div className="text-xs text-terminal-muted mt-1 flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${f.status === "APPROACHING" ? "bg-sky-400 animate-pulse" : "bg-terminal-muted"}`} />
                      Status: <span className={f.status === "APPROACHING" ? "text-sky-300" : "text-terminal-textDim"}>{f.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-terminal-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function TrendChip({ value }: { value: string }) {
  const color = TREND_COLOR[value] ?? "";
  return (
    <span className={`badge ${value === "BULLISH" ? "badge-success" : value === "BEARISH" ? "badge-danger" : value === "MIXED" ? "badge-warning" : "badge-neutral"}`}>
      <span className={`font-semibold ${color}`}>{value}</span>
    </span>
  );
}

function BoolMeter({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-terminal-panel2/60 border border-terminal-border/50">
      <span className="text-terminal-muted">{label}</span>
      <div className="flex items-center gap-2">
        <div className="strength-bar w-14">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: value ? "100%" : "12%",
              background: value ? "linear-gradient(90deg,#089981,#22c55e)" : "linear-gradient(90deg,#f23645,#f87171)",
            }}
          />
        </div>
        <span className={`w-3 text-center font-semibold ${value ? "text-emerald-400" : "text-rose-400"}`}>{value ? "✓" : "✗"}</span>
      </div>
    </div>
  );
}

function Indicators({ analysis, cash }: { analysis: any; cash: number }) {
  const ind = analysis.indicators["5m"];
  const rsi = isFinite(ind.rsi) ? ind.rsi : null;
  const adx = isFinite(ind.adx) ? ind.adx : null;
  const stoch = ind.stochastic !== null ? ind.stochastic : null;

  return (
    <div className="space-y-2.5 text-sm">
      <IndMeter label="RSI 14" value={rsi} suffix="%" bar={rsi != null ? rsi / 100 : 0} tone={rsi != null ? (rsi > 70 ? "over" : rsi < 30 ? "under" : "mid") : "mid"} />
      <IndMeter label="ADX 14" value={adx} suffix="" bar={adx != null ? Math.min(100, adx) / 100 : 0} tone="mid" />
      <IndRow label="ATR">{isFinite(ind.atr) ? formatPrice(ind.atr, cash) : "—"}</IndRow>
      <IndMeter label="Stochastic" value={stoch} suffix="" bar={stoch != null ? stoch / 100 : 0} tone={stoch != null ? (stoch > 80 ? "over" : stoch < 20 ? "under" : "mid") : "mid"} />
      <IndRow label="MACD Hist">{ind.macd ? ind.macd.histogram.toFixed(5) : "—"}</IndRow>
      <IndRow label="EMA 9/20/50">{formatPrices([ind.ema["9"], ind.ema["20"], ind.ema["50"]], cash)}</IndRow>
      <IndRow label="VWAP">{ind.vwap !== null ? formatPrice(ind.vwap, cash) : "—"}</IndRow>
    </div>
  );
}

function IndRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center px-2.5 py-2 rounded-lg bg-terminal-panel2/60 border border-terminal-border/50">
      <span className="text-terminal-muted text-xs">{label}</span>
      <span className="font-mono text-terminal-text text-xs">{children}</span>
    </div>
  );
}

function IndMeter({ label, value, suffix, bar, tone }: { label: string; value: number | null; suffix: string; bar: number; tone: "over" | "under" | "mid" }) {
  return (
    <div className="px-2.5 py-2 rounded-lg bg-terminal-panel2/60 border border-terminal-border/50">
      <div className="flex justify-between items-center mb-1">
        <span className="text-terminal-muted text-xs">{label}</span>
        <span className={`font-mono text-xs ${value == null ? "text-terminal-muted" : tone === "over" ? "text-amber-400" : tone === "under" ? "text-sky-300" : "text-emerald-400"}`}>
          {value == null ? "—" : value.toFixed(1)}{suffix}
        </span>
      </div>
      <div className="strength-bar h-1">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(2, Math.round(bar * 100))}%`,
            background: tone === "over" ? "linear-gradient(90deg,#ef4444,#f59e0b)" : tone === "under" ? "linear-gradient(90deg,#38bdf8,#22d3ee)" : "linear-gradient(90deg,#089981,#22c55e)",
          }}
        />
      </div>
    </div>
  );
}

function formatPrices(vals: number[], cash: number) {
  return vals.map((v) => isFinite(v) ? formatPrice(v, cash) : "--").join(" / ");
}