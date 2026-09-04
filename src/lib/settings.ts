export interface UserSettings {
  minSignalScore: number;
  maxRiskLevel: string;
  minRiskReward: number;
  scanSeconds: number;
  scalpingMode: boolean;
  dayTradeMode: boolean;
  swingMode: boolean;
  notifications: boolean;
  dataMode: "demo" | "live";
  /** User choice: push new signals to the Telegram bot. */
  telegramEnabled: boolean;
  /** Max number of Telegram signals sent per single scan (spam guard). */
  telegramMaxPerScan: number;
  /** OPT-IN aggressive mode: fire more frequent market + swing signals (relaxes
   *  accuracy gates). Keeps trend-alignment so it never fades the trend, but is
   *  higher-risk. Default OFF = strict, high-conviction signals only. */
  moreSignals: boolean;
  /** Funded-account (prop firm) eval parameters — discipline/pacing targets, not guarantees. */
  propAccountSize: number;
  propMaxLossPct: number;
  propDailyLossPct: number;
  propRiskPct: number;
  propConsistencyCap: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  minSignalScore: 62,
  maxRiskLevel: "HIGH",
  minRiskReward: 1.1,
  scanSeconds: 60,
  scalpingMode: true,
  dayTradeMode: true,
  swingMode: true,
  notifications: true,
  dataMode: "live",
  telegramEnabled: true,
  telegramMaxPerScan: 1,
  moreSignals: true,
  propAccountSize: 10000,
  propMaxLossPct: 10,
  propDailyLossPct: 5,
  propRiskPct: 0.5,
  propConsistencyCap: 0.5
};

const KEY = "impera.settings.v2";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: UserSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
