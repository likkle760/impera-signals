import type { Session } from "../../types";
import { getCurrentSession, SESSIONS, SESSION_DATES } from "../session";
import type { StrategyConfig } from "./strategy-config";

export interface SessionContext {
  session: Session;
  /** 0..1 penalty where 0 = best liquidity (overlap), higher = worse */
  liquidityPenalty: number;
  allowed: boolean;
  label: string;
}

/**
 * SessionFilter — decides whether the current session is tradeable and how deep
 * the order book liquidity is (affects risk + spread penalties). ICT traders
 * favour the London / London-New-York overlap sessions.
 */
export class SessionFilter {
  constructor(private config: StrategyConfig) {}

  /** Test whether a given session is permitted by config (empty = all allowed). */
  isAllowed(session: Session): boolean {
    const allowed = this.config.session.allowed;
    return allowed.length === 0 || allowed.includes(session);
  }

  /** Any session label that is currently open, using the shared session table. */
  labelFor(date = new Date()): string {
    return getCurrentSession(date);
  }

  /** Liquidity penalty for a session (0 = best). */
  liquidity(session: Session): number {
    return this.config.session.liquidity[session] ?? 0.5;
  }

  /** Full context for the current (or given) moment. */
  current(date = new Date()): SessionContext {
    const session = getCurrentSession(date);
    return {
      session,
      liquidityPenalty: this.liquidity(session),
      allowed: this.isAllowed(session),
      label: session
    };
  }

  static sessions(): Session[] {
    return SESSIONS as Session[];
  }
}

export { SESSION_DATES };
