"use client";
import { useMarketState } from "@/lib/hooks/use-market-store";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { DIRECTION_BG, RISK_BADGE } from "@/components/ui/badges";

const STATUS_COLOR: Record<string, string> = {
  WAITING: "text-amber-400",
  APPROACHING: "text-sky-300",
  TRIGGERED: "text-emerald-400",
  INVALIDATED: "text-rose-400",
  EXPIRED: "text-terminal-muted"
};

export default function FuturePage() {
  const state = useMarketState();
  const futures = state.snapshot.futureOpportunities;

  return (
    <div className="space-y-3">
      <div className="panel p-3 text-xs text-terminal-muted">
        The engine monitors price and flags levels where a setup MAY become valid. These do{" "}
        <span className="text-white font-semibold">NOT</span> auto-trigger until configured conditions are satisfied.
      </div>

      {futures.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-terminal-muted">
          No future setups currently detected.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {futures.map((f) => {
            const cash = decimalsFor(f.symbol);
            return (
              <div key={f.id} className="panel p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{f.symbol}</span>
                    <span className="text-[11px] text-terminal-muted">{f.name}</span>
                  </div>
                  <span className={`badge ${f.kind.includes("BUY") ? DIRECTION_BG.BUY : DIRECTION_BG.SELL}`}>
                    {f.kind}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[10px] text-terminal-muted uppercase">Watch Zone</div>
                    <div className="font-mono text-white">
                      {formatPrice(f.watchZone[0], cash)} – {formatPrice(f.watchZone[1], cash)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-terminal-muted uppercase">Stop Loss</div>
                    <div className="font-mono text-rose-400">{formatPrice(f.stopLoss, cash)}</div>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="text-[10px] text-terminal-muted uppercase">Take Profits</div>
                  <div className="grid grid-cols-3 gap-2 mt-0.5">
                    {f.takeProfits.map((tp, i) => (
                      <div key={i} className="bg-terminal-panel2 rounded px-1 py-1 font-mono text-emerald-300 text-[11px] text-center">
                        TP{i + 1}: {formatPrice(tp, cash)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[10px] text-terminal-muted uppercase">Trigger Conditions</div>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-gray-300">
                    {f.triggerConditions.map((c, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-sky-400">•</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${STATUS_COLOR[f.status] ?? ""}`}>{f.status}</span>
                    <span className={`badge ${RISK_BADGE[f.riskLevel]}`}>{f.riskLevel}</span>
                  </div>
                  <span className="font-mono text-sky-300 text-sm">{f.confidence}%</span>
                </div>

                <div className="mt-2">
                  <div className="text-[10px] text-terminal-muted uppercase">Reason</div>
                  <p className="text-xs text-gray-300">{f.reason}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
