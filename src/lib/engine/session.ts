import type { Session } from "../types";

export interface SessionWindow { start: number; end: number; session: Session; }

export const SESSION_DATES: SessionWindow[] = [
  { start: 0, end: 7, session: "ASIA" },
  { start: 7, end: 12, session: "LONDON" },
  { start: 12, end: 16, session: "LONDON/NEW YORK OVERLAP" },
  { start: 16, end: 21, session: "NEW YORK" },
  // 21–24 UTC (Sydney open at 21:00, Tokyo at 00:00) is the Asia session too,
  // not a dead zone — labeling it OFF HOURS misrepresents live Asia liquidity.
  { start: 21, end: 24, session: "ASIA" }
];

export function getCurrentSession(date = new Date()): Session {
  const utcHour = date.getUTCHours();
  for (const s of SESSION_DATES) {
    if (utcHour >= s.start && utcHour < s.end) return s.session;
  }
  return "OFF HOURS";
}

export const SESSIONS: Session[] = [
  "ASIA",
  "LONDON",
  "NEW YORK",
  "LONDON/NEW YORK OVERLAP",
  "OFF HOURS"
];
