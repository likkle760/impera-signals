"use client";
import { useState } from "react";
import type { Signal } from "@/lib/engine/analysis-types";
import { formatPrice } from "@/lib/utils";
import { DIRECTION_BG, RISK_BADGE, TREND_COLOR } from "./ui/badges";
import { SignalFormatter } from "@/lib/engine/formatter";

export default function SignalCard({
  signal,
  decimals,
  compact = false
}: {
  signal: Signal;
  decimals: number;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const cash = decimals;
  const d = signal.direction;

  const copy = () => {
    const text = new SignalFormatter().format(signal, decimals);
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const dirBorder = d === "BUY" ? "border-emerald-500/30" : "border-rose-500/30";

  return (
    <div
      className={`panel overflow-hidden ${dirBorder} ${compact ? "" : ""}`}
      style={{ borderTopWidth: 3, borderTopColor: d === "BUY" ? "#10b981" : "#f43f5e" }}
    >
      <div className="p-3">
        {/* Prominent LONG / SHORT callout */}
        <div className="flex items-center justify-between mb-3">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded font-bold text-sm ${
              d === "BUY" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
            }`}
          >
            <span className="text-base leading-none">{d === "BUY" ? "▲" : "▼"}</span>
            {d === "BUY" ? "LONG" : "SHORT"}
          </div>
          <span className={`badge ${signal.type.includes("BUY") ? DIRECTION_BG["BUY"] : DIRECTION_BG["SELL"]}`}>
            {signal.type}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{signal.symbol}</span>
            <span className="text-[11px] text-terminal-muted">{signal.name}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div>
            <div className="text-[10px] text-terminal-muted uppercase">Entry</div>
            <div className="font-mono text-white">
              {formatPrice(signal.entryZone[0], cash)} – {formatPrice(signal.entryZone[1], cash)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-terminal-muted uppercase">Stop Loss</div>
            <div className="font-mono text-rose-400">{formatPrice(signal.stopLoss, cash)}</div>
          </div>
        </div>

        <div className="mt-2">
          <div className="text-[10px] text-terminal-muted uppercase">Take Profits</div>
          <div className="grid grid-cols-3 gap-2 mt-0.5">
            {signal.takeProfits.map((tp, i) => (
              <div key={i} className="bg-terminal-panel2 rounded px-2 py-1 font-mono text-emerald-300 text-xs text-center">
                TP{i + 1}: {formatPrice(tp, cash)}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <div>
            <div className="text-[10px] text-terminal-muted uppercase">R:R</div>
            <div className="font-mono text-white text-sm">1:{signal.riskReward.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-[10px] text-terminal-muted uppercase">Score</div>
            <div className="font-mono text-sky-300 text-sm">{signal.confidence}</div>
          </div>
          <div>
            <div className="text-[10px] text-terminal-muted uppercase">Risk</div>
            <span className={`badge ${RISK_BADGE[signal.riskLevel]}`}>{signal.riskLevel}</span>
          </div>
          <div>
            <div className="text-[10px] text-terminal-muted uppercase">Trend</div>
            <span className={`text-sm font-semibold ${TREND_COLOR[signal.trendLabel] ?? ""}`}>
              {signal.trendLabel.replace("SLIGHTLY ", "SLT ")}
            </span>
          </div>
        </div>

        <div className="mt-2">
          <div className="text-[10px] text-terminal-muted uppercase">Timeframes</div>
          <div className="text-xs text-white">{signal.timeframes.join(" / ")}</div>
        </div>
        <div className="mt-2">
          <div className="text-[10px] text-terminal-muted uppercase">Setup</div>
          <div className="text-xs text-sky-300">{signal.setupName}</div>
        </div>
        <div className="mt-2">
          <div className="text-[10px] text-terminal-muted uppercase">Status</div>
          <div className="text-xs text-white">{signal.status}</div>
        </div>
        <div className="mt-2">
          <div className="text-[10px] text-terminal-muted uppercase">Reason</div>
          <p className="text-xs text-gray-300 leading-snug">{signal.reason}</p>
        </div>
        {signal.winRate != null && (
          <div className="mt-2 flex items-center justify-between bg-terminal-panel2 rounded px-2 py-1">
            <div className="text-[10px] text-terminal-muted uppercase">Live win-rate</div>
            <div className="text-xs font-mono text-emerald-300">
              {signal.winRate}% <span className="text-terminal-muted">/ {signal.winRateTrades ?? 0} bt</span>
            </div>
          </div>
        )}
        {signal.winRate != null && signal.winRate < 45 && (
          <div className="mt-2 flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
            <div className="text-[10px] text-amber-200/80 uppercase">⚠ Accuracy</div>
            <div className="text-[11px] font-semibold text-amber-300">
              Historically weak — consider skipping
            </div>
          </div>
        )}
        {signal.newsVerdict && (
          <div className="mt-2">
            <div className="text-[10px] text-terminal-muted uppercase">Live verdict</div>
            <p className="text-[11px] text-amber-200/80 leading-snug">{signal.newsVerdict}</p>
          </div>
        )}
      </div>

      <button
        onClick={copy}
        className={`w-full py-2 text-sm font-semibold transition-colors border-t ${
          copied
            ? "bg-emerald-600 text-white"
            : d === "BUY"
            ? "bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/20"
            : "bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border-rose-500/20"
        }`}
      >
        {copied ? "COPIED ✓" : `COPY SIGNAL · ${signal.type}`}
      </button>
    </div>
  );
}
