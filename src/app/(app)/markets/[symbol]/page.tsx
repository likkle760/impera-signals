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
import type { Timeframe } from "@/lib/types";

const TFS: Timeframe[] = ["1m", "3m", "5m", "15m", "30m", "1h", "4h"];

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/markets" className="text-sky-400 text-sm hover:underline">← Markets</Link>
        <h1 className="text-xl font-bold text-white">{symbol}</h1>
        <span className="text-sm text-terminal-muted">{analysis?.name}</span>
        <span className="font-mono text-lg text-white">{analysis && formatPrice(analysis.price, cash)}</span>
        {signal && (
          <span className={`badge ${signal.type.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>
            {signal.type}
          </span>
        )}
      </div>

      {!analysis ? (
        <div className="panel p-8 text-center text-terminal-muted text-sm">Loading market data…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <div className="panel p-3">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {TFS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTf(t)}
                      className={`badge cursor-pointer border ${tf === t ? "bg-sky-500/20 border-sky-500/50 text-sky-300" : "bg-terminal-panel border-terminal-border text-terminal-muted"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <MarketChart candles={candles} timeframe={tf} analysis={analysis} />
                <div className="text-[11px] text-terminal-muted mt-1">
                  Entry / SL / TP shown on active signal card below. Lines: EMA 9/20/50, VWAP (dashed), S/R zones.
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <section className="panel p-4">
                <h2 className="panel-title mb-2">TREND</h2>
                <div className={`text-2xl font-bold ${TREND_COLOR[analysis.trend.regime] ?? ""}`}>
                  {analysis.trend.regime}
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <Row label="Strength"><span className="font-mono">{analysis.trend.strength}/100</span></Row>
                  <Row label="Momentum"><span className={`font-mono ${analysis.trend.momentum >= 60 ? "text-emerald-400" : analysis.trend.momentum <= 40 ? "text-rose-400" : "text-white"}`}>{analysis.trend.momentum} · {analysis.trend.momentum >= 60 ? "Strong" : analysis.trend.momentum <= 40 ? "Weak" : "Moderate"}</span></Row>
                  <Row label="Structure"><span>{analysis.structure.structureType}</span></Row>
                  <Row label="HTF"><span className={`${TREND_COLOR[analysis.trend.higherTimeframe] ?? ""}`}>{analysis.trend.higherTimeframe}</span></Row>
                  <Row label="MTF"><span className={`${TREND_COLOR[analysis.trend.mediumTerm] ?? ""}`}>{analysis.trend.mediumTerm}</span></Row>
                  <Row label="STF"><span className={`${TREND_COLOR[analysis.trend.shortTerm] ?? ""}`}>{analysis.trend.shortTerm}</span></Row>
                  <Row label="Session"><span className="text-sky-300">{analysis.session}</span></Row>
                </div>
              </section>

              <section className="panel p-4">
                <h2 className="panel-title mb-2">MARKET STRUCTURE</h2>
                <div className="text-sm font-semibold text-white">{analysis.structure.structureType}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                  <Meter label="Break of Structure" value={analysis.structure.bos} />
                  <Meter label="Change of Character" value={analysis.structure.choch} />
                  <Meter label="Consolidation" value={analysis.structure.consolidation} />
                </div>
              </section>

              <section className="panel p-4">
                <h2 className="panel-title mb-2">SUPPORT / RESISTANCE</h2>
                <div className="text-xs">
                  <div className="text-emerald-400 mb-1">Support</div>
                  {analysis.supportResistance.supports.slice(0, 4).map((s, i) => (
                    <div key={i} className="flex justify-between font-mono">
                      <span>{s.kind}</span>
                      <span>{formatPrice(s.price, cash)}</span>
                    </div>
                  ))}
                  <div className="text-amber-400 mt-2 mb-1">Resistance</div>
                  {analysis.supportResistance.resistances.slice(0, 4).map((r, i) => (
                    <div key={i} className="flex justify-between font-mono">
                      <span>{r.kind}</span>
                      <span>{formatPrice(r.price, cash)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="panel p-4">
              <h2 className="panel-title mb-2">INDICATORS (5M)</h2>
              <Indicators analysis={analysis} cash={cash} />
            </section>

            <section className="panel p-4 lg:col-span-2">
              <h2 className="panel-title mb-2">SIGNAL</h2>
              {signal ? (
                <div className="max-w-md">
                  <SignalCard signal={signal} decimals={cash} />
                </div>
              ) : (
                <div className="border border-dashed border-terminal-border rounded p-4 text-xs text-terminal-muted">
                  NO HIGH-QUALITY SETUP currently on {symbol}. Reasons may include conflicting timeframes, excessive volatility, poor risk/reward, weak structure, large spread, or an unconfirmed setup.
                </div>
              )}
            </section>
          </div>

          {futures.length > 0 && (
            <section className="panel p-4">
              <h2 className="panel-title mb-2">FUTURE LEVELS</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {futures.map((f) => (
                  <div key={f.id} className="bg-terminal-panel2 rounded p-3 border border-terminal-border">
                    <div className="flex justify-between">
                      <span className={`badge ${f.kind.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>{f.kind}</span>
                      <span className={`badge ${RISK_BADGE[f.riskLevel]}`}>{f.riskLevel}</span>
                    </div>
                    <div className="text-xs mt-2 font-mono">
                      Watch: {formatPrice(f.watchZone[0], cash)} – {formatPrice(f.watchZone[1], cash)}
                    </div>
                    <div className="text-xs text-terminal-muted mt-0.5">Status: {f.status}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-terminal-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between bg-terminal-panel2 rounded px-2 py-1">
      <span className="text-terminal-muted">{label}</span>
      <span className={value ? "text-emerald-400" : "text-rose-400"}>{value ? "✓" : "✗"}</span>
    </div>
  );
}

function Indicators({ analysis, cash }: { analysis: any; cash: number }) {
  const ind = analysis.indicators["5m"];
  return (
    <div className="space-y-1 text-sm">
      <IndRow label="RSI">{isFinite(ind.rsi) ? ind.rsi.toFixed(1) : "—"}</IndRow>
      <IndRow label="ADX">{isFinite(ind.adx) ? ind.adx.toFixed(1) : "—"}</IndRow>
      <IndRow label="ATR">{isFinite(ind.atr) ? formatPrice(ind.atr, cash) : "—"}</IndRow>
      <IndRow label="Stochastic">{ind.stochastic !== null ? ind.stochastic.toFixed(0) : "—"}</IndRow>
      <IndRow label="MACD Hist">{ind.macd ? ind.macd.histogram.toFixed(5) : "—"}</IndRow>
      <IndRow label="EMA 9/20/50">{formatPrices([ind.ema["9"], ind.ema["20"], ind.ema["50"]], cash)}</IndRow>
      <IndRow label="VWAP">{ind.vwap !== null ? formatPrice(ind.vwap, cash) : "—"}</IndRow>
    </div>
  );
}

function IndRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-terminal-muted">{label}</span>
      <span className="font-mono text-white">{children}</span>
    </div>
  );
}

function formatPrices(vals: number[], cash: number) {
  return vals.map((v) => isFinite(v) ? formatPrice(v, cash) : "--").join(" / ");
}
