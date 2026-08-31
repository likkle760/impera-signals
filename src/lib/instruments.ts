import type { Instrument, Timeframe } from "./types";

export const ALL_TIMEFRAMES: Timeframe[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d"
];

export const HFT_TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "15m"];
export const STRUCTURE_TIMEFRAMES: Timeframe[] = ["15m", "30m"];
export const HTF_TIMEFRAMES: Timeframe[] = ["1h", "4h"];

export const DEFAULT_INSTRUMENTS: Instrument[] = [
  { symbol: "EURUSD", name: "Euro / US Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", assetClass: "forex", baseDecimals: 3, pipSize: 0.01, enabled: true },
  { symbol: "USDCHF", name: "US Dollar / Swiss Franc", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "USDCAD", name: "US Dollar / Canadian Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "AUDUSD", name: "Australian Dollar / US Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "NZDUSD", name: "NZD / US Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "EURGBP", name: "Euro / British Pound", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "EURJPY", name: "Euro / Japanese Yen", assetClass: "forex", baseDecimals: 3, pipSize: 0.01, enabled: true },
  { symbol: "GBPJPY", name: "British Pound / Japanese Yen", assetClass: "forex", baseDecimals: 3, pipSize: 0.01, enabled: true },
  { symbol: "AUDJPY", name: "Australian Dollar / Japanese Yen", assetClass: "forex", baseDecimals: 3, pipSize: 0.01, enabled: true },
  { symbol: "EURAUD", name: "Euro / Australian Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "GBPAUD", name: "British Pound / Australian Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "AUDCAD", name: "Australian Dollar / Canadian Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "NZDJPY", name: "NZD / Japanese Yen", assetClass: "forex", baseDecimals: 3, pipSize: 0.01, enabled: true },
  { symbol: "CADCHF", name: "Canadian Dollar / Swiss Franc", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "GBPCHF", name: "British Pound / Swiss Franc", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "NZDCHF", name: "NZD / Swiss Franc", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "AUDCHF", name: "Australian Dollar / Swiss Franc", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "EURNZD", name: "Euro / NZ Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },
  { symbol: "AUDNZD", name: "Australian Dollar / NZ Dollar", assetClass: "forex", baseDecimals: 5, pipSize: 0.0001, enabled: true },

  { symbol: "XAUUSD", name: "Gold", assetClass: "metals", baseDecimals: 2, pipSize: 0.1, enabled: true, providerSymbol: "XAU_USD" },
  { symbol: "XAGUSD", name: "Silver", assetClass: "metals", baseDecimals: 3, pipSize: 0.01, enabled: true, providerSymbol: "XAG_USD" },

  { symbol: "USOIL", name: "WTI Crude Oil (Spot)", assetClass: "commodities", baseDecimals: 2, pipSize: 0.01, enabled: true },
  { symbol: "UKOIL", name: "Brent Crude Oil (Spot)", assetClass: "commodities", baseDecimals: 2, pipSize: 0.01, enabled: true },
  { symbol: "BCO", name: "Brent Crude Oil Futures", assetClass: "commodities", baseDecimals: 2, pipSize: 0.01, enabled: true },

  { symbol: "BTCUSD", name: "Bitcoin", assetClass: "crypto", baseDecimals: 1, pipSize: 1, enabled: true, providerSymbol: "BTCUSDT" },
  { symbol: "ETHUSD", name: "Ethereum", assetClass: "crypto", baseDecimals: 2, pipSize: 0.1, enabled: true, providerSymbol: "ETHUSDT" },
  { symbol: "SOLUSD", name: "Solana", assetClass: "crypto", baseDecimals: 3, pipSize: 0.01, enabled: true, providerSymbol: "SOLUSDT" },
  { symbol: "BNBUSD", name: "BNB", assetClass: "crypto", baseDecimals: 2, pipSize: 0.1, enabled: true, providerSymbol: "BNBUSDT" },
  { symbol: "XRPUSD", name: "Ripple", assetClass: "crypto", baseDecimals: 4, pipSize: 0.0001, enabled: true, providerSymbol: "XRPUSDT" },

  { symbol: "US30", name: "US Dow Jones 30", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "US100", name: "Nasdaq 100", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "NAS100", name: "Nasdaq 100 (United)", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "UT100", name: "Nasdaq 100 Tech (United)", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "ET30", name: "Dow Jones 30 (United)", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "US500", name: "S&P 500", assetClass: "indices", baseDecimals: 1, pipSize: 0.1, enabled: true },
  { symbol: "GER40", name: "Germany DAX 40", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "UK100", name: "UK FTSE 100", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "FRA40", name: "France CAC 40", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "JP225", name: "Japan Nikkei 225", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },
  { symbol: "AUS200", name: "Australia ASX 200", assetClass: "indices", baseDecimals: 1, pipSize: 1, enabled: true },

  { symbol: "ES", name: "E-mini S&P 500 Futures", assetClass: "futures", baseDecimals: 1, pipSize: 0.25, enabled: true },
  { symbol: "NQ", name: "E-mini Nasdaq-100 Futures", assetClass: "futures", baseDecimals: 1, pipSize: 0.25, enabled: true },
  { symbol: "YM", name: "E-mini Dow Futures", assetClass: "futures", baseDecimals: 0, pipSize: 1, enabled: true },
  { symbol: "CL", name: "WTI Crude Oil Futures", assetClass: "futures", baseDecimals: 2, pipSize: 0.01, enabled: true },
  { symbol: "GC", name: "Gold Futures", assetClass: "futures", baseDecimals: 2, pipSize: 0.1, enabled: true },
  { symbol: "NG", name: "Natural Gas Futures", assetClass: "futures", baseDecimals: 3, pipSize: 0.001, enabled: true }
];
