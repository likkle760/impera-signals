"use client";
import { useMemo, useState } from "react";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice, formatTime } from "@/lib/utils";
import { DIRECTION_BG, RISK_BADGE } from "@/components/ui/badges";

const OUTCOMES = ["All", "pending", "won", "lost", "invalidated", "expired"];

export default function HistoryPage() {
  const state = useMarketState();
  const [outcome, setOutcome] = useState("All");
  const [q, setQ] = useState("");

  const entries = useMemo(() => {
    return state.history.filter((h) => {
      if (outcome !== "All" && h.outcome !== outcome) return false;
      if (q && !h.symbol.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [state.history, outcome, q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search symbol…"
          className="bg-terminal-panel border border-terminal-border rounded px-3 py-1.5 text-sm text-white placeholder:text-terminal-muted"
        />
        {OUTCOMES.map((o) => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`badge cursor-pointer border capitalize ${outcome === o ? "bg-sky-500/20 border-sky-500/50 text-sky-300" : "bg-terminal-panel border-terminal-border text-terminal-muted"}`}
          >
            {o}
          </button>
        ))}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-terminal-muted uppercase text-[10px] border-b border-terminal-border">
              <th className="p-2">Time</th>
              <th className="p-2">Symbol</th>
              <th className="p-2">Type</th>
              <th className="p-2">Entry</th>
              <th className="p-2">SL</th>
              <th className="p-2">TP1</th>
              <th className="p-2">Score</th>
              <th className="p-2">Risk</th>
              <th className="p-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 200).map((h) => (
              <tr key={h.id} className="border-b border-terminal-panel2 hover:bg-terminal-panel2/50">
                <td className="p-2 font-mono text-terminal-muted">{formatTime(h.createdAt)}</td>
                <td className="p-2 font-semibold text-white">{h.symbol}</td>
                <td className="p-2"><span className={`badge ${h.type.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>{h.type}</span></td>
                <td className="p-2 font-mono">{formatPrice(h.entry, decimalsFor(h.symbol))}</td>
                <td className="p-2 font-mono text-rose-400">{formatPrice(h.stopLoss, decimalsFor(h.symbol))}</td>
                <td className="p-2 font-mono text-emerald-300">{formatPrice(h.takeProfits[0], decimalsFor(h.symbol))}</td>
                <td className="p-2 font-mono text-sky-300">{h.confidence}</td>
                <td className="p-2"><span className={`badge ${RISK_BADGE[h.riskLevel]}`}>{h.riskLevel}</span></td>
                <td className={`p-2 font-semibold capitalize ${h.outcome === "won" ? "text-emerald-400" : h.outcome === "lost" ? "text-rose-400" : "text-terminal-muted"}`}>
                  {h.outcome}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <div className="p-6 text-center text-xs text-terminal-muted">No history yet. Signals appear here as they are generated.</div>}
      </div>
    </div>
  );
}
