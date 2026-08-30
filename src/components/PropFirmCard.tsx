"use client";
import { usePropFirm } from "@/lib/hooks/use-prop-firm";
import type { HistoryEntry } from "@/lib/engine/history";

export default function PropFirmCard({ history }: { history: HistoryEntry[] }) {
  const { status, settings, update } = usePropFirm(history);

  const roomColor = (v: number) => (v < 0 ? "#f43f5e" : v < settings.dailyLossPct * settings.accountSize * 0.1 ? "#f59e0b" : "#10b981");
  const blocked = status.dailyBlocked || status.breachingMaxLoss;

  const rows: [string, string][] = [
    ["Balance", `$${status.balance.toFixed(2)}`],
    ["Daily room", `$${status.dailyRoom.toFixed(2)}`],
    ["Max-loss room", `$${status.maxLossRoom.toFixed(2)}`],
    ["Next risk", `$${status.nextRisk.toFixed(2)} (${settings.riskPct}%)`]
  ];

  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="panel-title">FUNDED-ACCOUNT PACER</h2>
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 999,
            background: blocked ? "#3f1d2b" : "#142c22",
            color: blocked ? "#f43f5e" : "#10b981"
          }}
        >
          {blocked ? "HALT" : status.profitRoom <= 0 ? "TARGET" : "ACTIVE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-terminal-panel2 rounded p-2">
            <div className="text-[10px] text-terminal-muted uppercase">{k}</div>
            <div
              className="font-mono"
              style={{ color: k === "Daily room" ? roomColor(status.dailyRoom) : k === "Max-loss room" ? roomColor(status.maxLossRoom) : "#e6edf3" }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-terminal-muted uppercase">Consistency</div>
      <p className="text-[11px] text-amber-200/80 leading-snug">{status.consistency.advice}</p>

      <div className="mt-2 text-[10px] text-terminal-muted uppercase">Guidance</div>
      <p className="text-[11px] leading-snug" style={{ color: blocked ? "#f43f5e" : "#9ca3af" }}>
        {status.guidance}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[10px] text-terminal-muted uppercase">
          Risk %/trade
          <input
            type="number"
            step="0.1"
            value={settings.riskPct}
            onChange={(e) => update({ riskPct: Math.max(0.1, Number(e.target.value) || 0.5) })}
            style={inputStyle}
          />
        </label>
        <label className="text-[10px] text-terminal-muted uppercase">
          Daily loss %
          <input
            type="number"
            step="1"
            value={settings.dailyLossPct}
            onChange={(e) => update({ dailyLossPct: Number(e.target.value) || 5 })}
            style={inputStyle}
          />
        </label>
      </div>
      <p className="mt-2 text-[10px] text-terminal-muted">
        Estimated from your signal history (R-multiples) — pacing gauge, not a broker statement. No pass is guaranteed.
      </p>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #30363d",
  background: "#161b22",
  color: "#e6edf3",
  fontSize: 13
};
