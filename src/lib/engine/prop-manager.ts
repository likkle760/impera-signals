/**
 * PropManager — helps you trade INSIDE funded-account (prop firm) evaluation
 * rules so you don't blow the account on any single day or breach the max
 * drawdown. It is a discipline/pacing aid, NOT a promise that any trade or
 * evaluation will pass. Markets remain probabilistic.
 *
 * Rule modelling (common prop formats, e.g. FTMO / FundedNext / Topstep):
 *  - MaxLoss%   : total account drawdown allowed before the eval fails (e.g. 10)
 *  - DailyLoss% : max loss allowed in a single day (e.g. 5)
 *  - Consistency: optional min % of total profit that must come from a single day
 */

export interface PropFirmSettings {
  /** starting/evaluation account balance (currency units) */
  accountSize: number;
  /** total max drawdown % (e.g. 10 = 10%) */
  maxLossPct: number;
  /** daily max loss % (e.g. 5 = 5%) */
  dailyLossPct: number;
  /** risk per trade as % of current account (e.g. 0.5 = 0.5%) */
  riskPct: number;
  /** consistency target: max single-day profit share to stay compliant (e.g. 0.5; 0 = off) */
  consistencyCap?: number;
  /** whether the eval is currently in a profit target zone (affects pacing) */
  inProfitTarget?: boolean;
}

export interface PropSession {
  /** starting balance of the current trading day */
  dailyStart: number;
  /** current balance now */
  balance: number;
  /** realized P&L today (signed) */
  dayPnl: number;
  /** all-time peak balance from account start */
  peakBalance: number;
  /** realized P&L from account start */
  totalPnl: number;
  /** profit of the best single day so far */
  bestDayProfit: number;
  /** profit of the best single day so far as a fraction of total profit */
  bestDayShare: number;
}

export interface PropStatus {
  /** absolute balance now */
  balance: number;
  /** blackout if a daily max-loss breach means we must stop trading today */
  dailyBlocked: boolean;
  /** blackout if the total max-drawdown is breached (eval failed) */
  breachingMaxLoss: boolean;
  /** remaining room to today's daily-loss limit (can be negative if breached) */
  dailyRoom: number;
  /** remaining room to the total max-loss level (negative if breached) */
  maxLossRoom: number;
  /** remaining room to the profit target (0/negative = reached) */
  profitRoom: number;
  /** recommended risk $ for the next trade = riskPct% of current balance */
  nextRisk: number;
  /** consistency compliance state */
  consistency: {
    enabled: boolean;
    share: number;
    cap: number;
    okay: boolean;
    advice: string;
  };
  /** human-readable headline guidance */
  guidance: string;
}

export const DEFAULT_PROP_SETTINGS: PropFirmSettings = {
  accountSize: 10000,
  maxLossPct: 10,
  dailyLossPct: 5,
  riskPct: 0.5,
  consistencyCap: 0.5
};

/**
 * Pure evaluation of a session against the prop rules. All inputs are sum-stats
 * so the UI/store can feed in whatever it tracks without coupling to the engine.
 */
export function evaluateProp(s: PropFirmSettings, sess: PropSession): PropStatus {
  const balance = sess.balance;
  const maxLossLevel = s.accountSize * (1 - s.maxLossPct / 100);
  const dailyLossLevel = sess.dailyStart * (1 - s.dailyLossPct / 100);
  const profitTarget = s.accountSize * (1 + (s.maxLossPct > 0 ? s.maxLossPct * 0.5 : 0.1)); // 50% of max as target

  const dailyBlocked = balance <= dailyLossLevel;
  const breachingMaxLoss = balance <= maxLossLevel;
  const dailyRoom = balance - dailyLossLevel;
  const maxLossRoom = balance - maxLossLevel;

  const remainingProfit = Math.max(0, profitTarget - balance);
  const profitRoom = remainingProfit;
  const nextRisk = Math.max(0, balance * (s.riskPct / 100));

  const cap = s.consistencyCap ?? 0;
  const share = sess.totalPnl > 0 ? sess.bestDayShare : 0;
  const consistencyOkay = !cap || cap <= 0 || share <= cap;
  const consistencyAdvice = consistencyOkay
    ? `Best-day profit is ${(share * 100).toFixed(0)}% of total — within the ${(cap * 100).toFixed(0)}% consistency cap.`
    : `Best-day profit is ${(share * 100).toFixed(0)}% of total, ABOVE the ${(cap * 100).toFixed(0)}% cap. Pace your wins across more days to stay compliant.`;

  let guidance: string;
  if (breachingMaxLoss) {
    guidance = `Max-loss breached (${maxLossLevel.toFixed(2)}). The evaluation is effectively failed — stop and review.`;
  } else if (dailyBlocked) {
    guidance = `Daily-loss limit hit. HALT trading today. Protect the account and reset tomorrow at ${sess.dailyStart.toFixed(2)}.`;
  } else if (profitRoom <= 0) {
    guidance = `Profit target reached. Consider withdrawing risk / switching to breakeven protection.`;
  } else if (dailyRoom < nextRisk * 2) {
    guidance = `Near the daily-loss limit (${dailyRoom.toFixed(2)} left). Trade minimal size or sit out today.`;
  } else {
    guidance = `Trading ${balance.toFixed(2)} with ${dailyRoom.toFixed(2)} daily room. Suggested risk: ${nextRisk.toFixed(2)}/trade (${s.riskPct}%).`;
  }

  return {
    balance,
    dailyBlocked,
    breachingMaxLoss,
    dailyRoom,
    maxLossRoom,
    profitRoom,
    nextRisk,
    consistency: {
      enabled: !!cap && cap > 0,
      share,
      cap,
      okay: consistencyOkay,
      advice: consistencyAdvice
    },
    guidance
  };
}

/** Risk-cap a signal: refuse entries once a daily/max-loss blackout is active. */
export function propAllowsTrade(status: PropStatus): boolean {
  return !status.dailyBlocked && !status.breachingMaxLoss;
}
