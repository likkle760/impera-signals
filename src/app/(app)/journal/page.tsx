"use client";
import { useMemo, useState } from "react";
import { decimalsFor } from "@/lib/formatting";
import { formatPrice } from "@/lib/utils";
import { DIRECTION_BG } from "@/components/ui/badges";
import {
  JournalTrade,
  JournalDirection,
  JOURNAL_SYMBOLS,
  loadJournal,
  saveJournal,
  computePnl,
  computeJournalStats,
  pnlText,
  newTradeId
} from "@/lib/engine/journal";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const PRESET_STRATEGIES = [
  "Market", "Buy Limit", "Sell Limit", "Scalp", "Day Trade", "Swing"
];

function ymd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function JournalPage() {
  const [trades, setTrades] = useState<JournalTrade[]>(() => loadJournal());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [editing, setEditing] = useState<JournalTrade | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fSym, setFSym] = useState("XAUUSD");
  const [fDir, setFDir] = useState<JournalDirection>("BUY");
  const [fEntry, setFEntry] = useState("");
  const [fExit, setFExit] = useState("");
  const [fQty, setFQty] = useState("");
  const [fFees, setFFees] = useState("0");
  const [fDate, setFDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [fStrategy, setFStrategy] = useState("Market");
  const [fNotes, setFNotes] = useState("");

  const stats = useMemo(() => computeJournalStats(trades), [trades]);
  const year = new Date(cursor).getFullYear();
  const month = new Date(cursor).getMonth();

  const monthTrades = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return trades
      .filter((t) => ymd(t.openedAt).startsWith(prefix))
      .sort((a, b) => b.openedAt - a.openedAt);
  }, [trades, year, month]);

  function persist(next: JournalTrade[]) {
    setTrades(next);
    saveJournal(next);
  }

  function resetForm() {
    setEditing(null);
    setFSym("XAUUSD");
    setFDir("BUY");
    setFEntry("");
    setFExit("");
    setFQty("");
    setFFees("0");
    setFStrategy("Market");
    setFNotes("");
    setShowForm(false);
  }

  function openForm(dayTs?: number) {
    setEditing(null);
    if (dayTs) {
      const d = new Date(dayTs);
      setFDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    setShowForm(true);
  }

  function submit() {
    const entry = parseFloat(fEntry);
    if (!isFinite(entry) || entry <= 0) return;
    const qty = parseFloat(fQty) || 0;
    const fees = parseFloat(fFees) || 0;
    const date = fDate ? new Date(fDate + "T09:00:00").getTime() : Date.now();
    const open = new Date(fDate + "T09:00:00");
    const openedAt = open.getTime();
    const exitStr = fExit.trim();

    if (editing) {
      const exit = exitStr ? parseFloat(exitStr) : null;
      const closed = exit != null && isFinite(exit);
      const outcome = !closed
        ? "OPEN"
        : Math.abs(computePnl(fDir, entry, exit, qty, fees)) <= Math.max(qty * 1e-9, 1e-9) && qty > 0
          ? "BREAKEVEN"
          : computePnl(fDir, entry, exit, qty, fees) > 0
            ? "WIN"
            : "LOSS";
      const pnl = closed ? computePnl(fDir, entry, exit, qty, fees) : null;
      persist(
        trades.map((t) =>
          t.id === editing.id
            ? {
                ...editing,
                symbol: fSym,
                direction: fDir,
                entry,
                exit: closed ? exit : null,
                quantity: qty,
                fees,
                pnl,
                outcome,
                strategy: fStrategy,
                notes: fNotes,
                openedAt,
                closedAt: closed ? openedAt : null
              }
            : t
        )
      );
      resetForm();
      return;
    }

    const exit = exitStr ? parseFloat(exitStr) : null;
    const closed = exit != null && isFinite(exit);
    const rawPnl = closed ? computePnl(fDir, entry, exit, qty, fees) : 0;
    let outcome: JournalTrade["outcome"];
    if (!closed) outcome = "OPEN";
    else if (qty > 0 && Math.abs(rawPnl) <= 1e-9) outcome = "BREAKEVEN";
    else outcome = rawPnl > 0 ? "WIN" : "LOSS";
    const trade: JournalTrade = {
      id: newTradeId(),
      symbol: fSym,
      direction: fDir,
      entry,
      exit: closed ? exit : null,
      quantity: qty,
      fees,
      pnl: closed ? rawPnl : null,
      outcome,
      strategy: fStrategy,
      notes: fNotes,
      openedAt,
      closedAt: closed ? openedAt : null
    };
    persist([trade, ...trades]);
    setCursor(startOfDay(openedAt));
    resetForm();
  }

  function remove(id: string) {
    persist(trades.filter((t) => t.id !== id));
  }

  function openEdit(t: JournalTrade) {
    setEditing(t);
    setFSym(t.symbol);
    setFDir(t.direction);
    setFEntry(String(t.entry));
    setFExit(t.exit != null ? String(t.exit) : "");
    setFQty(String(t.quantity));
    setFFees(String(t.fees));
    setFStrategy(t.strategy);
    setFNotes(t.notes);
    const d = new Date(t.openedAt);
    setFDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setShowForm(true);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  const dayPnl = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of trades) {
      if (t.outcome === "OPEN" || t.pnl == null) continue;
      const key = ymd(t.closedAt ?? t.openedAt);
      m[key] = (m[key] ?? 0) + t.pnl;
    }
    return m;
  }, [trades]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Trade Journal</h1>
          <p className="text-xs text-terminal-muted">Log your trades, track your profits, review your performance.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView(view === "calendar" ? "list" : "calendar")}
            className="btn btn-ghost"
          >
            {view === "calendar" ? "List View" : "Calendar View"}
          </button>
          <button onClick={() => openForm()} className="btn btn-primary">+ Log Trade</button>
        </div>
      </div>

      {/* Stats dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard label="Net P&L" value={`$${pnlText(stats.netPnl)}`} accent={stats.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} accent="text-sky-300" sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatCard label="Trades" value={String(stats.closedTrades)} accent="text-white" sub={`${stats.activeTrades} open`} />
        <StatCard label="Profit Factor" value={isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "—"} accent="text-emerald-400" />
        <StatCard label="Expectancy" value={`$${stats.expectancy.toFixed(2)}`} accent={stats.expectancy >= 0 ? "text-emerald-400" : "text-rose-400"} />
        <StatCard label="Avg Win" value={`$${stats.avgWin.toFixed(2)}`} accent="text-emerald-300" />
        <StatCard label="Avg Loss" value={`$-${Math.abs(stats.avgLoss).toFixed(2)}`} accent="text-rose-300" />
        <StatCard label="Best / Worst" value={`$${stats.bestTrade.toFixed(0)} / $${stats.worstTrade.toFixed(0)}`} accent="text-white" />
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="panel w-full max-w-lg p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">{editing ? "Edit Trade" : "Log New Trade"}</h2>
              <button onClick={resetForm} className="text-terminal-muted hover:text-white text-lg leading-none">&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="panel-title block mb-1">Instrument</span>
                <select
                  value={fSym}
                  onChange={(e) => setFSym(e.target.value)}
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white"
                >
                  {JOURNAL_SYMBOLS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Direction</span>
                <div className="flex gap-1.5">
                  {(["BUY", "SELL"] as JournalDirection[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setFDir(d)}
                      className={`badge cursor-pointer border ${fDir === d ? DIRECTION_BG[d] : "bg-terminal-panel2 border-terminal-border text-terminal-muted"}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Date</span>
                <input
                  type="date"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white"
                />
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Entry Price</span>
                <input
                  type="number" step="any" value={fEntry}
                  onChange={(e) => setFEntry(e.target.value)}
                  placeholder="e.g. 4620.5"
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white mono"
                />
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Exit Price (blank = open)</span>
                <input
                  type="number" step="any" value={fExit}
                  onChange={(e) => setFExit(e.target.value)}
                  placeholder="e.g. 4632.0"
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white mono"
                />
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Quantity</span>
                <input
                  type="number" step="any" value={fQty}
                  onChange={(e) => setFQty(e.target.value)}
                  placeholder="e.g. 0.1"
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white mono"
                />
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Fees</span>
                <input
                  type="number" step="any" value={fFees}
                  onChange={(e) => setFFees(e.target.value)}
                  placeholder="0"
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white mono"
                />
              </label>

              <label className="block">
                <span className="panel-title block mb-1">Strategy</span>
                <select
                  value={fStrategy}
                  onChange={(e) => setFStrategy(e.target.value)}
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white"
                >
                  {PRESET_STRATEGIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className="block col-span-2">
                <span className="panel-title block mb-1">Notes</span>
                <textarea
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  rows={2}
                  placeholder="Why did you take this trade? What happened?"
                  className="w-full bg-terminal-panel2 border border-terminal-border rounded px-2 py-1.5 text-sm text-white resize-none"
                />
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={resetForm} className="btn btn-ghost">Cancel</button>
              <button onClick={submit} className="btn btn-primary">{editing ? "Save Changes" : "Log Trade"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar / list */}
      {view === "calendar" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="panel p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => { const d = new Date(cursor); setCursor(new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime()); }} className="btn btn-ghost px-2">‹</button>
                <span className="text-sm font-semibold text-white">{MONTHS[month]} {year}</span>
                <button onClick={() => { const d = new Date(cursor); setCursor(new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()); }} className="btn btn-ghost px-2">›</button>
              </div>
              <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1).getTime()); }} className="btn btn-ghost text-xs">Today</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-terminal-muted uppercase mb-1">
              {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day == null) return <div key={`e${i}`} />;
                const ts = new Date(year, month, day).getTime();
                const key = ymd(ts);
                const dayTrades = trades.filter((t) => ymd(t.openedAt) === key);
                const pnl = dayPnl[key];
                const isToday = key === ymd(Date.now());
                return (
                  <button
                    key={key}
                    onClick={() => openForm(ts)}
                    className={`min-h-[64px] rounded border p-1 text-left flex flex-col gap-1 transition-colors ${
                      isToday ? "border-sky-500/60 bg-sky-500/10" : "border-terminal-border bg-terminal-panel2 hover:border-sky-500/40"
                    }`}
                  >
                    <span className="text-[11px] font-semibold text-terminal-muted">{day}</span>
                    {dayTrades.slice(0, 2).map((t) => (
                      <span key={t.id} className={`badge px-1 py-0 text-[9px] leading-none ${t.direction === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {t.symbol} {t.outcome === "OPEN" ? "▸" : t.pnl == null ? "" : t.pnl > 0 ? "+" : t.pnl < 0 ? "-" : "="}
                      </span>
                    ))}
                    {dayTrades.length > 2 && <span className="text-[9px] text-terminal-muted">+{dayTrades.length - 2} more</span>}
                    {pnl != null && (
                      <span className={`text-[11px] mono font-semibold mt-auto ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="panel p-4">
              <div className="panel-title mb-2">Month Performance</div>
              <div className="text-sm">
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Net P&L</span><span className={`mono font-semibold ${monthPnl(monthTrades) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pnlText(monthPnl(monthTrades))}</span></div>
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Closed</span><span className="mono">{monthTrades.filter((t) => t.outcome !== "OPEN").length}</span></div>
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Wins</span><span className="mono text-emerald-400">{monthTrades.filter((t) => t.outcome === "WIN").length}</span></div>
                <div className="flex justify-between py-1"><span className="text-terminal-muted">Losses</span><span className="mono text-rose-400">{monthTrades.filter((t) => t.outcome === "LOSS").length}</span></div>
              </div>
            </div>

            <div className="panel p-4">
              <div className="panel-title mb-2">Best Performing Symbols</div>
              <div className="space-y-1.5">
                {stats.byOutcome.slice(0, 5).map((s) => (
                  <div key={s.symbol} className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium">{s.symbol}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-terminal-muted">{s.wins}W/{s.losses}L</span>
                      <span className={`mono ${s.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pnlText(s.pnl)}</span>
                    </span>
                  </div>
                ))}
                {stats.byOutcome.length === 0 && <div className="text-xs text-terminal-muted">No closed trades yet.</div>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-terminal-muted uppercase text-[10px] border-b border-terminal-border">
                <th className="p-2">Date</th>
                <th className="p-2">Symbol</th>
                <th className="p-2">Dir</th>
                <th className="p-2">Entry</th>
                <th className="p-2">Exit</th>
                <th className="p-2">Qty</th>
                <th className="p-2">P&L</th>
                <th className="p-2">Outcome</th>
                <th className="p-2">Strategy</th>
                <th className="p-2">Notes</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {[...trades].sort((a, b) => b.openedAt - a.openedAt).map((t) => (
                <tr key={t.id} className="border-b border-terminal-panel2 hover:bg-terminal-panel2/50 align-top">
                  <td className="p-2 text-terminal-muted">{new Date(t.openedAt).toLocaleDateString("en-GB")}</td>
                  <td className="p-2 font-semibold text-white">{t.symbol}</td>
                  <td className="p-2"><span className={`badge ${DIRECTION_BG[t.direction]}`}>{t.direction}</span></td>
                  <td className="p-2 mono">{formatPrice(t.entry, decimalsFor(t.symbol))}</td>
                  <td className="p-2 mono">{t.exit != null ? formatPrice(t.exit, decimalsFor(t.symbol)) : <span className="text-terminal-muted">—</span>}</td>
                  <td className="p-2 mono">{t.quantity}</td>
                  <td className={`p-2 mono font-semibold ${t.pnl == null ? "text-terminal-muted" : t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {t.pnl == null ? "—" : pnlText(t.pnl)}
                  </td>
                  <td className="p-2">
                    <span className={`badge ${
                      t.outcome === "WIN" ? "bg-emerald-500/15 text-emerald-400" :
                      t.outcome === "LOSS" ? "bg-rose-500/15 text-rose-400" :
                      t.outcome === "BREAKEVEN" ? "bg-slate-500/15 text-slate-300" :
                      "bg-sky-500/15 text-sky-300"
                    }`}>{t.outcome}</span>
                  </td>
                  <td className="p-2 text-terminal-muted">{t.strategy}</td>
                  <td className="p-2 text-terminal-muted max-w-[200px] truncate">{t.notes || "—"}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="btn btn-ghost px-1.5 py-0.5 text-[10px]">Edit</button>
                      <button onClick={() => remove(t.id)} className="btn btn-ghost px-1.5 py-0.5 text-[10px] text-rose-400">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trades.length === 0 && (
            <div className="p-10 text-center text-sm text-terminal-muted">
              No trades logged yet. Click &ldquo;+ Log Trade&rdquo; to record your first trade.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div className="panel p-3">
      <div className="panel-title mb-1">{label}</div>
      <div className={`text-sm font-bold mono ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-terminal-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function monthPnl(trades: JournalTrade[]): number {
  return trades.filter((t) => t.outcome !== "OPEN" && t.pnl != null).reduce((s, t) => s + (t.pnl ?? 0), 0);
}
