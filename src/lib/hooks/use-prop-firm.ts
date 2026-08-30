"use client";
import { useEffect, useMemo, useState } from "react";
import { loadSettings, saveSettings, UserSettings } from "@/lib/settings";
import {
  DEFAULT_PROP_SETTINGS,
  evaluateProp,
  PropFirmSettings,
  PropStatus
} from "@/lib/engine/prop-manager";
import { HistoryEntry } from "@/lib/engine/history";

interface PropResult {
  settings: PropFirmSettings;
  status: PropStatus;
  closedTrades: number;
  update: (patch: Partial<PropFirmSettings>) => void;
  reset: () => void;
  openPosition: (riskUsd: number) => void;
  closePosition: (rMultiple: number) => void;
}

const DAY_MS = 86_400_000;

/**
 * Tracks an in-memory estimate of a funded-account simulation, driven by the
 * engine's signal history. P&L is ESTIMATED from R-multiples — it is a pacing
 * gauge, not a broker statement.
 */
export function usePropFirm(history: HistoryEntry[]): PropResult {
  const settings = useMemo<PropFirmSettings>(() => {
    const s = loadSettings();
    return {
      accountSize: s.propAccountSize,
      maxLossPct: s.propMaxLossPct,
      dailyLossPct: s.propDailyLossPct,
      riskPct: s.propRiskPct,
      consistencyCap: s.propConsistencyCap
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const [trades, setTrades] = useState<
    { ts: number; r: number }[]
  >(() => {
    const s = loadSettings();
    return history
      .filter((h) => h.outcome === "won" || h.outcome === "lost")
      .map((h) => ({ ts: h.updatedAt || h.createdAt || Date.now(), r: h.outcome === "won" ? 1 : -1 }));
  });

  const status = useMemo<PropStatus>(() => {
    const start = settings.accountSize;
    let balance = start;
    let peak = start;
    let totalPnl = 0;
    let dayStart = start;
    const sorted = [...trades].sort((a, b) => a.ts - b.ts);
    const dailyProfits: Record<string, number> = {};
    let bestDay = 0;

    for (const t of sorted) {
      const dayKey = new Date(t.ts).toDateString();
      const riskUsd = balance * (settings.riskPct / 100);
      const pnl = riskUsd * t.r;
      if (dailyProfits[dayKey] === undefined) dailyProfits[dayKey] = 0;
      dailyProfits[dayKey] += pnl;
      balance += pnl;
      totalPnl += pnl;
      peak = Math.max(peak, balance);
      // reset day-start at each new calendar day
      if (Object.keys(dailyProfits).indexOf(dayKey) === 0) dayStart = balance - pnl;
    }

    for (const k of Object.keys(dailyProfits)) {
      if (dailyProfits[k] > bestDay) bestDay = dailyProfits[k];
    }

    const todayKey = new Date().toDateString();
    const todayDayStart = Object.keys(dailyProfits).length
      ? start + Object.values(dailyProfits).slice(0, Math.max(0, Object.keys(dailyProfits).length - (dailyProfits[todayKey] !== undefined ? 1 : 0))).reduce((a, b) => a + b, 0)
      : start;
    const dayPnl = dailyProfits[todayKey] ?? 0;

    return evaluateProp(settings, {
      dailyStart: todayDayStart,
      balance: Math.max(balance, 0),
      dayPnl,
      peakBalance: peak,
      totalPnl,
      bestDayProfit: bestDay,
      bestDayShare: totalPnl > 0 ? bestDay / totalPnl : 0
    });
  }, [settings, trades]);

  const update = (patch: Partial<PropFirmSettings>) => {
    const s = loadSettings();
    const next: UserSettings = {
      ...s,
      propAccountSize: patch.accountSize ?? s.propAccountSize,
      propMaxLossPct: patch.maxLossPct ?? s.propMaxLossPct,
      propDailyLossPct: patch.dailyLossPct ?? s.propDailyLossPct,
      propRiskPct: patch.riskPct ?? s.propRiskPct,
      propConsistencyCap: patch.consistencyCap ?? s.propConsistencyCap
    };
    saveSettings(next);
  };

  const reset = () => setTrades([]);

  const openPosition = (_riskUsd: number) => {
    // positions are opened implicitly on close; kept for API symmetry
  };

  const closePosition = (rMultiple: number) => {
    setTrades((prev) => [...prev, { ts: Date.now(), r: rMultiple }]);
  };

  return { settings, status, closedTrades: trades.length, update, reset, openPosition, closePosition };
}
