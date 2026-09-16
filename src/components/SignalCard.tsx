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
  const [showRisk, setShowRisk] = useState(false);
  const cash = decimals;
  const d = signal.direction;

  const risk = signal.riskAnalysis;
  const riskMoney = risk ? formatMoney(risk.riskAmount) : "";

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

        {risk && (
          <div className="mt-2 bg-black/30 border border-sky-500/20 rounded overflow-hidden">
            <button
              onClick={() => setShowRisk(!showRisk)}
              className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-sky-500/5"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-terminal-muted uppercase">Risk Engine</span>
                {risk.decision === "APPROVED" ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">APPROVED</span>
                ) : (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">REJECTED</span>
                )}
                {risk.positionSize && (
                  <span className="text-[10px] font-mono text-sky-300 hidden sm:inline">
                    {risk.riskPercent}% · {riskMoney} · {risk.positionSize.label}
                  </span>
                )}
              </div>
              <span className="text-terminal-muted text-xs">{showRisk ? "▲" : "▼"}</span>
            </button>
            {showRisk && (
              <div className="px-2 pb-2">
                {risk.positionSize && (
                  <div className="grid grid-cols-3 gap-2 mt-0.5 text-[11px]">
                    <div>
                      <div className="text-[9px] text-terminal-muted uppercase">Risk/trade</div>
                      <div className="font-mono text-white">{risk.riskPercent}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-terminal-muted uppercase">Risk $</div>
                      <div className="font-mono text-white">{riskMoney}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-terminal-muted uppercase">Position</div>
                      <div className="font-mono text-sky-300">{risk.positionSize.label}</div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Open trades</span>
                    <span className="font-mono text-white">{risk.openTrades}/{risk.maxOpenTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Projected open risk</span>
                    <span className="font-mono text-white">{risk.projectedOpenRiskPct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Correlated exposure</span>
                    <span className="font-mono text-white">{risk.correlatedExposurePct.toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Daily risk left</span>
                    <span className={`font-mono ${risk.maxDailyRiskRemainingPct < 0.5 ? "text-rose-300" : "text-white"}`}>
                      {risk.maxDailyRiskRemainingPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Daily loss</span>
                    <span className={`font-mono ${risk.dailyLossPct >= 5 ? "text-rose-300" : "text-white"}`}>
                      {risk.dailyLossPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Drawdown</span>
                    <span className={`font-mono ${risk.drawdownPct >= 10 ? "text-rose-300" : "text-white"}`}>
                      {risk.drawdownPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                {risk.cooldownActive && (
                  <div className="mt-1 text-[10px] font-semibold text-amber-300">Cooldown active</div>
                )}
                {risk.reasons.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {risk.reasons.map((r, i) => (
                      <li key={i} className="text-[10px] leading-snug text-gray-300">· {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {!risk && signal.universeConfidence && (
          <div className="mt-2 flex items-center justify-between bg-black/30 border border-cyan-500/20 rounded px-2 py-1">
            <div className="text-[10px] text-terminal-muted uppercase">Confidence</div>
            <div className="text-[11px] font-mono text-cyan-300">
              {signal.universeConfidence.total} · {signal.universeConfidence.grade}
            </div>
          </div>
        )}

        {signal.universeConfidence?.components && (
          <div className="mt-2">
            <div className="text-[10px] text-terminal-muted uppercase">Confidence breakdown</div>
            <div className="grid grid-cols-4 gap-x-3 gap-y-0.5 mt-0.5 text-[10px]">
              {Object.entries(signal.universeConfidence.components).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-terminal-muted capitalize">{k}</span>
                  <span className="font-mono text-white">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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
        {signal.validationNote && (
          <div className="mt-2 flex items-center justify-between bg-amber-500/10 border border-amber-500/40 rounded px-2 py-1">
            <div className="text-[10px] text-amber-200/80 uppercase">Validation</div>
            <div className="text-[11px] font-bold text-amber-300">{signal.validationNote}</div>
          </div>
        )}
        {signal.institutionalEntry && (
          <div className="mt-2 bg-black/30 border border-cyan-500/20 rounded px-2 py-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-terminal-muted uppercase">Institutional Order Block</div>
              <span className="text-[10px] font-semibold text-cyan-300">
                {signal.institutionalEntry.side === "LONG" ? "demand" : "supply"}
                {signal.institutionalEntry.zone ? ` ${signal.institutionalEntry.zone}` : ""}
              </span>
            </div>
            {signal.institutionalEntry.reasons.length > 0 && (
              <p className="text-[10px] text-gray-300 leading-snug mt-1">
                {signal.institutionalEntry.reasons.join(" · ")}
              </p>
            )}
          </div>
        )}
        {signal.narrative && (
          <div className="mt-2 bg-black/30 border border-emerald-500/20 rounded px-2 py-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-terminal-muted uppercase">Narrative</div>
              <span className="text-[10px] font-semibold text-emerald-300">{signal.narrative.state}</span>
            </div>
            <p className="text-[11px] text-gray-200 leading-snug mt-1">{signal.narrative.headline}</p>
            <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{signal.narrative.story}</p>
            {signal.narrative.confirm && (
              <p className="text-[10px] text-emerald-200/80 leading-snug mt-1">
                <span className="text-terminal-muted">Confirm: </span>{signal.narrative.confirm}
              </p>
            )}
            {signal.narrative.invalidate && (
              <p className="text-[10px] text-rose-200/80 leading-snug mt-0.5">
                <span className="text-terminal-muted">Invalidate: </span>{signal.narrative.invalidate}
              </p>
            )}
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

/** Compact USD formatting for risk amounts ($1.2k / $48.50 / etc.). */
function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (abs >= 100) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}
