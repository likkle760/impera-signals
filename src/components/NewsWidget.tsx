"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio, ChevronRight } from "lucide-react";

interface NewsRow {
  title: string;
  time: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
}

const IMPACT_DOT: Record<string, string> = {
  HIGH: "bg-rose-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-slate-500",
};
const IMPACT_RING: Record<string, string> = {
  HIGH: "border-rose-500/40",
  MEDIUM: "border-amber-500/40",
  LOW: "border-slate-500/40",
};

/** Compact "upcoming high-impact news" widget for the dashboard. */
export function NewsWidget() {
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setRows(data.events ?? []);
    } catch {
      /* silently ignore — widget is decorative on the dashboard */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 30000);
    const r = setInterval(load, 5 * 60 * 1000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load]);

  // Only show upcoming events (next 12h), high/medium first, nearest first.
  const upcoming = rows
    .map((r) => ({ r, t: new Date(r.time).getTime() }))
    .filter(({ t }) => t >= now - 30 * 60 * 1000 && t <= now + 12 * 60 * 60 * 1000)
    .sort((a, b) => a.t - b.t)
    .slice(0, 5);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    const diff = d.getTime() - now;
    const m = Math.max(0, Math.round(diff / 60000));
    if (m < 60) return m < 1 ? "now" : `+${m}m`;
    return `+${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between p-5 pb-3 border-b border-terminal-border/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-terminal-warnBg text-terminal-warn">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-heading-md font-bold text-terminal-text">Upcoming News</h2>
            <p className="text-caption text-terminal-muted">ForexFactory — next 12h</p>
          </div>
        </div>
      </div>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center py-10 px-6 text-center">
          <div className="text-4xl mb-3 opacity-40">🗓</div>
          <p className="text-terminal-muted text-sm">No high-impact releases in the next 12h</p>
        </div>
      ) : (
        <div className="p-3 space-y-1.5">
          {upcoming.map(({ r, t }, i) => (
            <div
              key={`${r.title}-${t}`}
              className={`flex items-center gap-3 rounded-lg border border-transparent p-2 hover:bg-terminal-panel/50 transition-colors ${r.impact === "HIGH" ? IMPACT_RING.HIGH : r.impact === "MEDIUM" ? IMPACT_RING.MEDIUM : IMPACT_RING.LOW}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${IMPACT_DOT[r.impact]} ${i === 0 ? "animate-pulse-live" : ""}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-terminal-text truncate">{r.title}</p>
                <p className="text-caption text-terminal-muted">
                  {r.impact} · {r.currencies.join(" ")}
                </p>
              </div>
              <span className="font-mono text-xs text-terminal-accent flex-shrink-0">{fmt(r.time)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-3">
        <Link
          href="/news"
          className="inline-flex w-full items-center justify-center gap-1.5 text-caption font-semibold text-terminal-accent hover:underline py-1"
        >
          Open full calendar <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
