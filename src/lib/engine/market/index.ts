/**
 * Market intelligence layer — the discretionary-trader brain behind the signal
 * engines. Implements the ADVANCED FOREX + GOLD MARKET INTELLIGENCE engine:
 *
 *  - Liquidity sweep + quality (§4/§5)          liquidity-sweep.ts
 *  - Displacement (§6)                           displacement.ts
 *  - Imbalance / FVG (§7)                        imbalance.ts
 *  - Supply/Demand + Order blocks (§8/§9)        supply-demand.ts
 *  - Premium/Discount + Session (§10/§11)        premium-discount.ts
 *  - Narrative / Story (§17/§18)                 narrative.ts
 *  - Correlation + DXY (§14/§15)                 correlation.ts
 *  - XAUUSD-specific config (§13)                asset-config.ts
 *  - Funded mode + risk hardening (§41/§42)      funded-mode.ts
 *  - Signal journal (§43)                        signal-journal.ts
 *  - Validation: walk-forward/MC/sensitivity (§34/§37/§38/§39) validation.ts
 *
 * ALL components are no-look-ahead by construction (they only read bars <= upto).
 * NOTHING here is "validated for live use" yet — the validation suite exists to
 * prove that before any gate opens.
 */

export { LiquiditySweepEngine } from "./liquidity-sweep";
export type {
  LiquiditySweepResult,
  LiquiditySweep,
  LiquidityPool,
  SweepInput,
  LevelRef
} from "./liquidity-sweep";

export { DisplacementEngine } from "./displacement";
export type { DisplacementResult } from "./displacement";

export { ImbalanceEngine } from "./imbalance";
export type { FVGPool, FvgInput } from "./imbalance";

export { SupplyDemandEngine } from "./supply-demand";
export type { OrderBlockZone, SupplyDemandZone, ZoneInput } from "./supply-demand";

export { PremiumDiscountEngine } from "./premium-discount";
export type { PremiumDiscountResult, RangePD, Commitment } from "./premium-discount";

export { NarrativeEngine } from "./narrative";
export type { Narrative, MarketNarrativeInput, SignalState } from "./narrative";

export { CorrelationEngine, dxyContext, parsePair } from "./correlation";
export type { CorrelationResult, CorrelationInput, DxyContext, Currency } from "./correlation";

export { XAUUSD_CONFIG, isGoldSymbol, swingConfigForSymbol, scalpConfigForSymbol } from "./asset-config";

export { FundedMode, DEFAULT_FUNDED } from "./funded-mode";
export type { FundedSettings, FundedVerdict, HaltReason } from "./funded-mode";

export { SignalJournal, mfeMae } from "./signal-journal";
export type { SignalJournalEntry, JournalSignalOutcome } from "./signal-journal";

export { ValidationSuite } from "./validation";
export type {
  TradeResult, WalkForwardResult, MonteCarloResult, SensitivityResult
} from "./validation";