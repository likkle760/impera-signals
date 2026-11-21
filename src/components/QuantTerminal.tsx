"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Radar, RefreshCw, Pause, Play, Zap, Radio, Globe } from "lucide-react";
import { useMarketState, useMarketStore } from "@/lib/hooks/use-market-store";

const INTERVALS = [10, 30, 60, 120];

/**
 * Live quant terminal control strip — runtime scan interval, pause/resume,
 * manual scan, cadence telemetry and a rolling feed of newly emitted signals.
 * Auto-scan itself is the global MarketStore loop; this panel controls it
 * rather than starting a second (duplicate) interval.
 */
export function QuantTerminal() {
  const store = useMarketStore();
  const state = useMarketState();
  const [now, setNow] = useState(() => Date.now());

  // Local 1s clock ONLY for cadence display — never triggers a re-scan.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lastAgo = state.lastAnalysis ? Math.max(0, Math.floor((now - state.lastAnalysis) / 1000)) : null;
  const nextIn = state.autoScan
    ? Math.max(0, state.scanSeconds - Math.floor((now - state.lastScanStart) / 1000))
    : null;

  // Current live setups from the latest scan (includes SIM observation rows,
  // clearly tagged). History is intentionally SIM-free, so it would look empty
  // in demo mode — this feed reflects what the terminal actually sees.
  const recent = [...state.snapshot.signals]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card p-5 panel-hover"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Title + status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-terminal-accent/10 border border-terminal-accent/25 flex items-center justify-center">
            <Radar className="w-5 h-5 text-terminal-accent" />
          </div>
          <div>
            <h2 className="panel-title flex items-center gap-2">
              LIVE QUANT TERMINAL
              <span className={`badge ${state.autoScan ? "badge-success" : "badge-warning"} badge-dot ${state.autoScan ? "badge-dot-live" : ""}`}>
                {state.autoScan ? "AUTO-SCAN ON" : "PAUSED"}
              </span>
            </h2>
            <p className="text-caption-xs text-terminal-muted mt-0.5">
              Continuously re-scans every market and emits new signals automatically
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-terminal-panel2 rounded-lg p-1">
            {INTERVALS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => store.setScanInterval(sec)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                  state.scanSeconds === sec
                    ? "bg-terminal-accent/20 text-terminal-accent"
                    : "text-terminal-muted hover:text-terminal-text"
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => store.toggleAutoScan()}
            className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
            title={state.autoScan ? "Pause auto-scan" : "Resume auto-scan"}
          >
            {state.autoScan ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {state.autoScan ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={() => store.runScan()}
            className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
            title="Scan all markets now"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Scan Now
          </button>
        </div>
      </div>

      <div className="hairline my-4" />

      {/* Telemetry */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Telemetry label="Scans Run" value={String(state.scanCount)} icon={<Activity className="w-3.5 h-3.5" />} />
        <Telemetry label="Markets Scanned" value={String(state.instruments.length)} icon={<Globe className="w-3.5 h-3.5" />} />
        <Telemetry label="Live Setups" value={String(state.snapshot.signals.filter((s) => s.status === "ACTIVE" || s.status === "TRIGGERED" || s.status === "WAITING").length)} icon={<Zap className="w-3.5 h-3.5" />} />
        <Telemetry
          label={state.autoScan ? "Next Scan" : "Last Scan"}
          value={state.autoScan ? (nextIn == null ? "—" : `${nextIn}s`) : (lastAgo == null ? "—" : `${lastAgo}s ago`)}
          icon={<Radio className="w-3.5 h-3.5" />}
          live={state.autoScan}
        />
      </div>

      {/* Rolling new-signal feed */}
      <div className="mt-4">
        <div className="text-caption-xs font-semibold text-terminal-muted mb-2">LIVE SIGNAL FEED · LATEST SCAN</div>
        {recent.length === 0 ? (
          <div className="text-xs text-terminal-muted py-3 text-center">No live setups yet — the next scan will populate this feed.</div>
        ) : (
          <div className="space-y-1.5">
            {recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 panel-section px-3 py-2 text-[11px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-mono font-semibold ${s.direction === "BUY" ? "text-terminal-bull" : "text-terminal-bear"}`}>
                    {s.direction === "BUY" ? "▲" : "▼"}
                  </span>
                  <span className="font-mono font-semibold text-terminal-text">{s.symbol}</span>
                  {s.simulated && <span className="text-[9px] px-1 rounded bg-terminal-warnBg text-terminal-warn">SIM</span>}
                  <span className="text-terminal-muted truncate">{s.type}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-terminal-muted">{s.confidence}%</span>
                  <span className="text-sky-300">{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Telemetry({ label, value, icon, live }: { label: string; value: string; icon: React.ReactNode; live?: boolean }) {
  return (
    <div className="panel-section p-3">
      <div className="text-caption-xs font-semibold text-terminal-muted flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className={`font-mono text-lg font-bold mt-1 ${live ? "text-terminal-accent animate-pulse-live" : "text-terminal-text"}`}>
        {value}
      </div>
    </div>
  );
}

