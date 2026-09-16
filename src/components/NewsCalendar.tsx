"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio, ChevronRight, Calendar } from "lucide-react";

interface NewsRow {
  title: string;
  time: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  currencies: string[];
  forecast?: string;
  previous?: string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
}

const IMPACT_DOT: Record<string, string> = {
  HIGH: "bg-rose-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-slate-500",
};
const IMPACT_TXT: Record<string, string> = {
  HIGH: "text-rose-400",
  MEDIUM: "text-amber-400",
  LOW: "text-slate-400",
};

/** Always-visible compact economic calendar. Shows the next ~24h of releases
 *  with live countdowns so high-impact news is in view on every page. */
export function NewsCalendar() {
  const [rows, setRows] = useState<NewsRow[]>([]);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/news", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setRows(data.events ?? []);
    } catch {
      /* silently ignore — calendar is supplementary UI */
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

  // Upcoming events in the next 24h (allow 30m grace for just-published items).
  const upcoming = rows
    .map((r) => ({ r, t: new Date(r.time).getTime() }))
    .filter(({ t }) => t >= now - 30 * 60 * 1000 && t <= now + 24 * 60 * 60 * 1000)
    .sort((a, b) => a.t - b.t)
    .slice(0, 12);

  const highSoon = upcoming.filter(({ r, t }) => r.impact === "HIGH" && t > now).length;

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const countdown = (iso: string) => {
    const diff = new Date(iso).getTime() - now;
    if (diff <= 0) return "now";
    const m = Math.max(1, Math.round(diff / 60000));
    if (m < 60) return `+${m}m`;
    return `+${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
  };

  const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return "TODAY";
    if (d.toDateString() === tomorrow.toDateString()) return "TOMORROW";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div className="px-3">
      <div className="relative overflow-hidden rounded-2xl border border-terminal-border/60 bg-terminal-bg/50">
        <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-terminal-warnBg text-terminal-warn">
              <Radio className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-terminal-text">
                News Calendar
              </p>
              <p className="text-[9px] text-terminal-muted">ForexFactory · next 24h</p>
            </div>
          </div>
          {highSoon > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-300 border border-rose-400/40">
              {highSoon} HIGH
            </span>
          )}
        </div>

        <div className="hairline mx-3.5" />

        {upcoming.length === 0 ? (
          <div className="px-3.5 py-5 text-center">
            <Calendar className="w-4 h-4 mx-auto mb-1.5 opacity-40" />
            <p className="text-[10px] text-terminal-muted">No releases in the next 24h</p>
          </div>
        ) : (
          <div className="space-y-0.5 py-1.5">
            {upcoming.map(({ r, t }) => (
              <div
                key={`${r.title}-${t}`}
                className="flex items-center gap-2 px-3.5 py-1 rounded-lg hover:bg-terminal-panel/60 transition-colors"
              >
                <div className="w-10 flex-shrink-0 flex flex-col leading-tight">
                  <span className="font-mono text-[10px] text-terminal-text">{fmtTime(r.time)}</span>
                  <span className={`text-[8px] uppercase tracking-wider ${t > now ? "text-terminal-muted" : "text-terminal-accent"}`}>
                    {dayLabel(r.time)}
                  </span>
                </div>
                <div className="w-1.5 flex-shrink-0">
                  <span className={`block w-1.5 h-1.5 rounded-full ${IMPACT_DOT[r.impact]} ${t > now && r.impact === "HIGH" ? "animate-pulse-live" : ""}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-terminal-text truncate">{r.title}</p>
                  <p className={`text-[9px] uppercase tracking-wider ${IMPACT_TXT[r.impact]}`}>
                    {r.impact} · {r.currencies.join(" ")}
                  </p>
                </div>
                <span className="font-mono text-[9px] text-terminal-accent flex-shrink-0">{countdown(r.time)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="px-3.5 pb-3">
          <Link
            href="/news"
            className="inline-flex w-full items-center justify-center gap-1 text-[10px] font-semibold text-terminal-accent hover:underline py-1 rounded-lg border border-terminal-accent/20 hover:bg-terminal-accent/5 transition-colors"
          >
            Full calendar <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}