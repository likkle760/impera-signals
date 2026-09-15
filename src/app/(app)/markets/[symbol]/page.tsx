"use client";
import { useMemo, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { useMarketState, useMarketStore } from "@/lib/hooks/use-market-store";
import { DEFAULT_INSTRUMENTS } from "@/lib/instruments";
import MarketChart, { ChartOverlay } from "@/components/MarketChart";
import SignalCard from "@/components/SignalCard";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { TREND_COLOR, RISK_BADGE, DIRECTION_BG } from "@/components/ui/badges";
import { PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, Layers, TrendingUp, TrendingDown, MapPin, Gauge, Zap, ShieldCheck, Waves } from "lucide-react";
import type { Timeframe } from "@/lib/types";
import type { InstrumentAnalysis } from "@/lib/engine/analysis-types";

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
  const signals = useMemo(() => state.snapshot.signals.filter((s) => s.symbol === symbol), [state.snapshot.signals, symbol]);
  const signal = signals[0];
  const futures = useMemo(() => state.snapshot.futureOpportunities.filter((f) => f.symbol === symbol), [state.snapshot.futureOpportunities, symbol]);

  const knownSymbol = DEFAULT_INSTRUMENTS.some((i) => i.enabled && i.symbol === symbol);
  if (!analysis && state.lastAnalysis > 0 && !knownSymbol) return notFound();

  const explanation = useMemo(() => (analysis ? buildExplanation(analysis) : []), [analysis]);

  const overlays = useMemo<ChartOverlay[]>(() => {
    const arr: ChartOverlay[] = [];
    if (signal) {
      arr.push({ price: signal.entry, color: signal.type.includes("BUY") ? "#10b981" : "#f43f5e", label: "ENTRY" });
      arr.push({ price: signal.stopLoss, color: "#ef4444", dashed: true, label: "SL" });
      signal.takeProfits.forEach((tp, i) => arr.push({ price: tp, color: "#34d399", dashed: true, label: `TP${i + 1}` }));
    } else {
      const f = futures.find((x) => x.status !== "INVALIDATED" && x.status !== "EXPIRED");
      if (f) {
        arr.push({ price: f.watchZone[0], color: "#f59e0b", dashed: true, label: "WATCH" });
        arr.push({ price: f.watchZone[1], color: "#f59e0b", dashed: true });
        arr.push({ price: f.stopLoss, color: "#ef4444", dashed: true, label: "SL" });
      }
    }
    return arr;
  }, [signal, futures]);

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
                <MarketChart candles={candles} timeframe={tf} analysis={analysis} overlays={overlays} />
                <div className="text-[11px] text-terminal-muted mt-1.5 flex items-center gap-1.5">
                  <Gauge className="w-3 h-3 text-terminal-accent" />
                  Entry / SL / TP (signal) or WATCH zone + SL (future level) drawn on the chart. Lines: EMA 9/20/50, VWAP (dashed), S/R zones.
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

            {/* Why this read */}
            <section className="card p-4 panel-hover lg:col-span-2">
              <h2 className="panel-title mb-1 flex items-center gap-1.5"><Waves className="w-3.5 h-3.5" /> WHY THIS READ</h2>
              <p className="text-sm text-terminal-text mb-3">{summaryFor(analysis, symbol)}</p>
              <ul className="space-y-2">
                {explanation.map((e, i) => (
                  <li key={i} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-terminal-panel2/60 border border-terminal-border/50 text-sm">
                    <ExplainDot tone={e.tone} />
                    <span className="text-terminal-textDim leading-snug">{e.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          </motion.div>

          {/* Potential signals & entries */}
          <motion.div variants={item} className="card p-4 panel-hover">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="panel-title flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> POTENTIAL SIGNALS &amp; ENTRIES</h2>
              {signals.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="badge badge-success">{signals.length} active</span>
                  <span className="badge badge-neutral">{futures.length} watch levels</span>
                </div>
              )}
            </div>

            {signals.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {signals.map((s) => (
                  <div key={s.id} className="rounded-xl border border-terminal-border/50 p-3 bg-terminal-panel2/40">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`badge ${s.type.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>{s.type}</span>
                      <span className="text-[11px] text-terminal-muted">{s.status}</span>
                    </div>
                    <SignalCard signal={s} decimals={cash} />
                  </div>
                ))}
              </div>
            )}

            {signals.length === 0 && futures.length === 0 ? (
              <div className="empty-state py-8 border border-dashed border-terminal-border/70 rounded-xl">
                <div className="empty-icon text-4xl">◈</div>
                <div className="empty-title text-sm">NO HIGH-QUALITY SETUP</div>
                <div className="empty-desc">
                  No confirmed setup on {symbol} right now. Reasons may include conflicting timeframes, excessive
                  volatility, poor risk/reward, weak structure, large spread, or an unconfirmed price reaction.
                </div>
              </div>
            ) : null}

            {futures.length > 0 && (
              <>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-terminal-muted mb-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-terminal-accent" /> PRE-STAGED WATCH LEVELS ({futures.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {futures.map((f) => (
                    <div key={f.id} className="panel-section p-3">
                      <div className="flex justify-between gap-2 flex-wrap">
                        <span className={`badge ${f.kind.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>{f.kind}</span>
                        <span className={`badge ${RISK_BADGE[f.riskLevel]}`}>{f.riskLevel}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono">
                        <LevelRow label="Watch" value={formatPrice(f.watchZone[0], cash) + " – " + formatPrice(f.watchZone[1], cash)} accent="text-amber-300" />
                        <LevelRow label="Stop" value={formatPrice(f.stopLoss, cash)} accent="text-rose-300" />
                        <LevelRow label="TP1" value={formatPrice(f.takeProfits[0], cash)} accent="text-emerald-300" />
                        <LevelRow label="TP2" value={formatPrice(f.takeProfits[1], cash)} accent="text-emerald-300" />
                        <LevelRow label="TP3" value={formatPrice(f.takeProfits[2], cash)} accent="text-emerald-300" />
                        <LevelRow label="Confidence" value={f.confidence + "%"} accent="text-sky-300" />
                      </div>
                      <p className="text-[11px] text-terminal-muted mt-2 leading-snug">{f.reason}</p>
                      <div className="flex items-center gap-2 mt-2 text-[11px]">
                        <span className={`w-1.5 h-1.5 rounded-full ${f.status === "APPROACHING" ? "bg-sky-400 animate-pulse" : "bg-terminal-muted"}`} />
                        <span className="text-terminal-muted">Status</span>
                        <span className={f.status === "APPROACHING" ? "text-sky-300" : "text-terminal-textDim"}>{f.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

function LevelRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-terminal-muted">{label}</span>
      <span className={accent}>{value}</span>
    </div>
  );
}

function ExplainDot({ tone }: { tone: "bull" | "bear" | "neutral" | "info" }) {
  const cls =
    tone === "bull" ? "bg-emerald-400 text-emerald-900"
    : tone === "bear" ? "bg-rose-400 text-rose-900"
    : tone === "info" ? "bg-sky-400 text-sky-900"
    : "bg-slate-400 text-slate-900";
  return (
    <span className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center ${cls}`}>
      {tone === "bull" ? "▲" : tone === "bear" ? "▼" : tone === "info" ? "●" : "—"}
    </span>
  );
}

function summaryFor(analysis: InstrumentAnalysis, symbol: string): string {
  const r = analysis.trend.regime;
  const mom = analysis.trend.momentum;
  return `${symbol} is ${r === "BULLISH" ? "trending higher" : r === "BEARISH" ? "trending lower" : "trading in a range"} (${r})${
    analysis.trend.strength > 0 ? ` with ${analysis.trend.strength}/100 trend strength` : ""
  }${analysis.trend.higherTimeframe !== "NEUTRAL" ? `, holding a ${analysis.trend.higherTimeframe.toLowerCase()} read on the higher timeframes` : ""}. Momentum is ${
    mom >= 60 ? "hot" : mom <= 40 ? "subdued" : "neutral"
  } during the ${analysis.session} session. Score: ${analysis.trend.momentum}/100 momentum, ${analysis.trend.volatilityScore}/100 volatility.${
    analysis.simulated ? " Data is SIMULATED (demo) — never for real-money trading." : ""
  }`;
}

function buildExplanation(a: InstrumentAnalysis): { tone: "bull" | "bear" | "neutral" | "info"; text: string }[] {
  const out: { tone: "bull" | "bear" | "neutral" | "info"; text: string }[] = [];
  const { trend, structure, liquidity, fvg, orderBlocks } = a;

  if (trend.directionalBias === "BUY") {
    out.push({ tone: "bull", text: "Directional bias is LONG — we only chase entries that build higher into resistance, never buys into a falling market." });
  } else if (trend.directionalBias === "SELL") {
    out.push({ tone: "bear", text: "Directional bias is SHORT — we favour positions that press lower into support and avoid fading the trend." });
  } else {
    out.push({ tone: "neutral", text: "No directional bias — price is ranging; we react only on a confirmed break/CHoCH, not guesses at tops/bottoms." });
  }

  if (trend.higherTimeframe.includes("BULLISH")) {
    out.push({ tone: "bull", text: `Higher-timeframe trend is ${trend.higherTimeframe.toLowerCase()} — new longs align with the bigger picture.` });
  } else if (trend.higherTimeframe.includes("BEARISH")) {
    out.push({ tone: "bear", text: `Higher-timeframe trend is ${trend.higherTimeframe.toLowerCase()} — shorts align with the bigger picture.` });
  } else {
    out.push({ tone: "neutral", text: "Higher-timeframe read is flat — stay patient until structure confirms a new leg." });
  }

  if (structure.bos) out.push({ tone: "info", text: "Break of structure (BOS) is confirmed — momentum favours the trend direction." });
  if (structure.choch) out.push({ tone: "info", text: "Change of character (CHoCH) detected — a short-term reversal is in play; entries respect the new leg." });
  if (structure.consolidation) out.push({ tone: "neutral", text: "Market is consolidating — the cleanest entries usually arrive on the first impulse out of the range." });

  const mom = trend.momentum;
  out.push({ tone: mom >= 60 ? "bull" : mom <= 40 ? "bear" : "neutral", text: `Momentum is ${mom >= 60 ? "strong" : mom <= 40 ? "weak" : "moderate"} (${mom}/100).` });

  const eqLows = liquidity.equalLows.length;
  const eqHighs = liquidity.equalHighs.length;
  const sweeps = liquidity.sweeps.length;
  if (eqLows > 0) out.push({ tone: "bull", text: `${eqLows} equal-low${eqLows > 1 ? "s" : ""} below offer liquidity that price may sweep before a rally.` });
  if (eqHighs > 0) out.push({ tone: "bear", text: `${eqHighs} equal-high${eqHighs > 1 ? "s" : ""} above hold sell-side liquidity that price may tap before a drop.` });
  if (sweeps > 0) out.push({ tone: "info", text: `${sweeps} liquidity sweep${sweeps > 1 ? "s" : ""} detected on the current window — classic stop-hunt before continuation.` });

  const unfilledBull = fvg.filter((g) => g.type === "bullish" && !g.filled);
  const unfilledBear = fvg.filter((g) => g.type === "bearish" && !g.filled);
  if (unfilledBull.length > 0) out.push({ tone: "bull", text: `${unfilledBull.length} unfilled bullish FVG below provide a discount entry target for longs.` });
  if (unfilledBear.length > 0) out.push({ tone: "bear", text: `${unfilledBear.length} unfilled bearish FVG above act as premium regions for shorts.` });

  const demand = orderBlocks?.bullish?.length ?? 0;
  const supply = orderBlocks?.bearish?.length ?? 0;
  if (demand > 0 || supply > 0) {
    out.push({ tone: "info", text: `${demand} demand and ${supply} supply order-blocks frame the canvas — price reacts around these zones.` });
  }

  const spreadBps = (a.spread / Math.max(a.price, 1e-9)) * 1e4;
  if (spreadBps > 6) out.push({ tone: "neutral", text: `Spread is wide (${spreadBps.toFixed(1)} pips) — slippage eats edge; prefer limit entries.` });
  if (trend.volatilityScore > 60) out.push({ tone: "neutral", text: `Volatility is elevated (${trend.volatilityScore}/100) — expect wider swings; size smaller.` });

  if (a.simulated) out.push({ tone: "neutral", text: "This data feed is SIMULATED (demo). Setups here are for observation only — never trade them with real money." });

  return out.slice(0, 10);
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