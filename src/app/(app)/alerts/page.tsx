"use client";
import { useMarketState, useMarketStore } from "@/lib/hooks/use-market-store";
import { formatTime } from "@/lib/utils";

const KIND_COLOR: Record<string, string> = {
  "NEW BUY": "text-emerald-400",
  "NEW SELL": "text-rose-400",
  "NEW BUY LIMIT": "text-emerald-400",
  "NEW SELL LIMIT": "text-rose-400",
  "SIGNAL TRIGGERED": "text-sky-300",
  "SIGNAL INVALIDATED": "text-rose-400",
  "TP HIT": "text-emerald-400",
  "SL HIT": "text-rose-400",
  "RISK INCREASED": "text-amber-400",
  "SETUP CANCELLED": "text-rose-400"
};

export default function AlertsPage() {
  const state = useMarketState();
  const store = useMarketStore();

  return (
    <div className="space-y-3">
      <div className="panel p-4 flex items-center justify-between">
        <p className="text-xs text-terminal-muted">
          Browser notifications are supported. Telegram/Discord delivery can be added via an API integration layer.
        </p>
        <button
          onClick={() => store.requestNotificationPermission()}
          className="btn btn-primary text-xs"
        >
          Enable Browser Alerts
        </button>
      </div>

      <div className="panel divide-y divide-terminal-panel2">
        {state.alerts.length === 0 ? (
          <div className="p-6 text-center text-xs text-terminal-muted">
            No alerts yet. They will appear here as new signals are detected.
          </div>
        ) : (
          state.alerts.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-3">
              <span className="w-2 h-2 rounded-full mt-1.5 bg-sky-500 flex-none" />
              <div className="flex-1">
                <div className={`text-xs font-semibold ${KIND_COLOR[a.kind] ?? "text-white"}`}>{a.kind}</div>
                <div className="text-xs text-gray-300">{a.message}</div>
              </div>
              <span className="text-[11px] text-terminal-muted font-mono">{formatTime(a.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
