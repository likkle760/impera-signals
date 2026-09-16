export interface UserSettings {
  minSignalScore: number;
  maxRiskLevel: string;
  minRiskReward: number;
  /** Minimum multi-confirmation confidence (0-100) to allow a trade. Default 70. */
  minConfidence: number;
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
  /** Higher-frequency mode: fire more MARKET, SWING and LIMIT signals (relaxes
   *  accuracy gates — trend strength + momentum). Hard HTF trend-alignment still
   *  applies in BOTH modes, so it NEVER fades the higher-timeframe trend. This is
   *  now the recommended default so the feed always has setups; higher-risk than
   *  strict mode, so traders wanting only A-grade setups can switch it off. */
  moreSignals: boolean;
  /** Funded-account (prop firm) eval parameters — discipline/pacing targets, not guarantees. */
  propAccountSize: number;
  propMaxLossPct: number;
  propDailyLossPct: number;
  propRiskPct: number;
  propConsistencyCap: number;
  /** Portfolio risk limits (driven by the risk engine — discipline, NOT promises). */
  riskMaxOpenTrades: number;
  riskMaxTotalOpenRiskPct: number;
  riskMaxCorrelatedRiskPct: number;
  riskMaxDailyRiskPct: number;
  riskMaxDrawdownPct: number;
  riskMaxConsecutiveLosses: number;
  riskCooldownMinutes: number;
  riskMaxSpreadToStopPct: number;
  riskMaxVolatilityScore: number;
  /** WIN-RATE OPTIMIZER: prefers A-grade (85+) full-confluence setups and biases
   *  the engine toward an 80%+ historical hit-rate on emitted signals — win rate is a
   *  selectivity target, NOT a profit guarantee. Default ON. */
  winRateOptimizer: boolean;
  /** Low-End Performance Mode: strips glass blur + ambient animation so the
   *  dashboard stays smooth on low-spec hardware. Default OFF. */
  perfMode: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  minSignalScore: 62,
  maxRiskLevel: "HIGH",
  minRiskReward: 1.1,
  minConfidence: 70,
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
  propConsistencyCap: 0.5,
  riskMaxOpenTrades: 4,
  riskMaxTotalOpenRiskPct: 2,
  riskMaxCorrelatedRiskPct: 1.5,
  riskMaxDailyRiskPct: 2,
  riskMaxDrawdownPct: 10,
  riskMaxConsecutiveLosses: 3,
  riskCooldownMinutes: 60,
  riskMaxSpreadToStopPct: 0.25,
  riskMaxVolatilityScore: 70,
  winRateOptimizer: true,
  perfMode: false
};

const KEY = "impera.settings.v6";

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
