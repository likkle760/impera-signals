import { parsePair } from "../market/correlation";

/**
 * Contract specifications used to compute REAL monetary risk per position —
 * the missing link that previously let a displayed signal imply a fixed lot.
 *
 * Sizing model (standard retail CFD conventions):
 *
 *   riskAmountUSD  = accountEquity × maxRiskPerTrade%
 *   perLotRiskUSD  = |entry − stop| × usdPerUnitPerLot × quote→USD conversion
 *   lots           = riskAmountUSD / perLotRiskUSD
 *
 * `usdPerUnitPerLot` = USD value of a 1.00 price move per 1.00 lot BEFORE any
 * quote-currency conversion. Examples:
 *   - EURUSD standard lot: 0.0001 pip → $10/pip → $100,000 per 1.00 move.
 *   - XAUUSD: 1 lot = 100 oz → $1.00 move = $100.
 *   - ES futures: $50 per index point.
 *   - BTCUSD CFD: $1 per $1 move per unit.
 */

export interface ContractSpec {
  /** USD per 1.00 of price movement per 1.00 lot (before quote-currency conversion). */
  usdPerUnitPerLot: number;
  /** ISO quote currency when NOT USD (so cross-pairs convert correctly). */
  quoteCcy?: string;
  /** units per 1 lot */
  lotSize: number;
  /** unit label for humans ("oz", "bbl", "pt", …) */
  unitName: string;
  /** how the recommended size is expressed */
  labelKind: "lots" | "units" | "contracts";
}

/** Metals — 1 standard lot, portfolio-typical sizes. */
const METALS: Record<string, Partial<ContractSpec>> = {
  XAUUSD: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz" },
  XAUJPY: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "JPY" },
  XAUCHF: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "CHF" },
  XAUAUD: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "AUD" },
  XAUCAD: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "CAD" },
  XAUNZD: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "NZD" },
  XAUGBP: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "GBP" },
  XAUEUR: { usdPerUnitPerLot: 100, lotSize: 100, unitName: "oz", quoteCcy: "EUR" },
  XAGUSD: { usdPerUnitPerLot: 5000, lotSize: 5000, unitName: "oz" },
  XAGJPY: { usdPerUnitPerLot: 5000, lotSize: 5000, unitName: "oz", quoteCcy: "JPY" },
  XPTUSD: { usdPerUnitPerLot: 50, lotSize: 50, unitName: "oz" },
  XPDUSD: { usdPerUnitPerLot: 25, lotSize: 25, unitName: "oz" },
  XCUUSD: { usdPerUnitPerLot: 2500, lotSize: 2500, unitName: "lb" }
};

/** Commodity CFDs — 1 lot = 1,000 barrels. */
const OILS: Record<string, Partial<ContractSpec>> = {
  USOIL: { usdPerUnitPerLot: 1000, lotSize: 1000, unitName: "bbl" },
  UKOIL: { usdPerUnitPerLot: 1000, lotSize: 1000, unitName: "bbl" },
  BCO: { usdPerUnitPerLot: 1000, lotSize: 1000, unitName: "bbl" }
};

/** Crypto CFDs — USD per USD move per unit. */
const CRYPTO: Record<string, number> = {
  BTCUSD: 1, ETHUSD: 1, SOLUSD: 1, BNBUSD: 1, XRPUSD: 10
};

/** Index CFDs — $1 per index point per unit. */
const INDICES: string[] = [
  "US30", "US100", "NAS100", "UT100", "ET30", "US500",
  "GER40", "UK100", "FRA40", "JP225", "AUS200"
];

/** Futures tick/point values in USD per price point. */
const FUTURES: Record<string, number> = {
  ES: 50,  // $12.50 per 0.25 tick
  NQ: 20,
  YM: 5,
  CL: 1000,
  GC: 100,
  NG: 10000
};

export function contractForSymbol(symbol: string): ContractSpec {
  const s = symbol.toUpperCase();

  const metal = METALS[s];
  if (metal) {
    return {
      usdPerUnitPerLot: metal.usdPerUnitPerLot!,
      quoteCcy: metal.quoteCcy,
      lotSize: metal.lotSize!,
      unitName: metal.unitName!,
      labelKind: "lots"
    };
  }

  const oil = OILS[s];
  if (oil) {
    return {
      usdPerUnitPerLot: oil.usdPerUnitPerLot!,
      lotSize: oil.lotSize!,
      unitName: oil.unitName!,
      labelKind: "lots"
    };
  }

  if (CRYPTO[s]) {
    return {
      usdPerUnitPerLot: CRYPTO[s],
      lotSize: 100000, // displayed as units, not lots
      unitName: s.slice(0, 3),
      labelKind: "units"
    };
  }

  if (INDICES.includes(s)) {
    return {
      usdPerUnitPerLot: 1,
      lotSize: 1,
      unitName: "pt",
      labelKind: "units"
    };
  }

  if (FUTURES[s]) {
    return {
      usdPerUnitPerLot: FUTURES[s],
      lotSize: 1,
      unitName: "pt",
      labelKind: "contracts"
    };
  }

  // Default: standard forex 1-lot = 100,000 base units, converting the quote
  // leg into account currency (USD) when the pair is not XXXUSD.
  const { quote } = parsePair(s);
  return {
    usdPerUnitPerLot: 100_000,
    quoteCcy: quote === "USD" ? undefined : quote,
    lotSize: 100_000,
    unitName: "",
    labelKind: "lots"
  };
}

/**
 * Convert the quote currency of a spec into USD using the prices we already
 * have in the snapshot (no external lookups). Missing pairs default to 1.0
 * (approximation, documented to the trader rather than silently ignored).
 */
export function usdPerUnitMultiplier(
  spec: ContractSpec,
  snapshots: Array<{ symbol: string; price: number }> | Record<string, { price: number }>
): number {
  if (!spec.quoteCcy || spec.quoteCcy === "USD") return 1;
  const usdPrice: Record<string, number> = {};
  const list = Array.isArray(snapshots)
    ? snapshots.map((x) => ({ symbol: x.symbol, price: x.price }))
    : Object.entries(snapshots).map(([symbol, v]) => ({ symbol, price: v.price }));
  for (const s of list) {
    const { base, quote } = parsePair(s.symbol);
    if (quote === "USD") usdPrice[base] = s.price; // USD per 1 base
    else if (base === "USD") usdPrice[quote] = s.price > 0 ? 1 / s.price : 0; // USD per 1 quote
  }
  const conv = usdPrice[spec.quoteCcy];
  return conv && conv > 0 ? conv : 1;
}

/** Human label for a computed position size. */
export function formatPositionSize(
  spec: ContractSpec,
  lots: number
): { lots: number; units: number; label: string } {
  const units = lots * spec.lotSize;
  if (spec.labelKind === "lots") {
    const extra = spec.unitName ? ` ≈ ${Math.round(units)} ${spec.unitName}` : "";
    return { lots, units, label: `${lots.toFixed(2)} lots${extra}` };
  }
  if (spec.labelKind === "contracts") {
    return { lots, units, label: `${lots.toFixed(2)} contracts (~${Math.round(units)} ${spec.unitName})` };
  }
  return { lots, units, label: `${Math.round(units)} units (${spec.unitName})` };
}