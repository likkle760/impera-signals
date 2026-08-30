import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { PortalData } from "./store-types";

/**
 * Persistence backend for portal data (users + licenses + sessions).
 *
 * Two backends, chosen at runtime by env:
 *   - DATABASE_URL set  -> PostgreSQL (survives redeploys on any host, no disk)
 *   - otherwise         -> local JSON file at DATA_DIR/portal.json
 *
 * The whole PortalData object is stored as a single JSON blob in one row, so
 * there is no per-entity schema to maintain — the file layout and DB layout
 * stay identical.
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "portal.json");

let pool: Pool | null = null;

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensureTable(p: Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS portal_state (
      id        TEXT PRIMARY KEY,
      payload   JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function loadPortalData(): Promise<PortalData | null> {
  const p = getPool();
  if (p) {
    try {
      await ensureTable(p);
      const r = await p.query<{ payload: PortalData }>(
        "SELECT payload FROM portal_state WHERE id = 'main'"
      );
      return r.rows[0]?.payload ?? null;
    } catch (err) {
      console.error("portal: failed to load from postgres, falling back to disk", err);
    }
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as PortalData;
    }
  } catch (err) {
    console.error("portal: failed to read data file", err);
  }
  return null;
}

export async function persistPortalData(data: PortalData): Promise<void> {
  const p = getPool();
  if (p) {
    try {
      await ensureTable(p);
      await p.query(
        `INSERT INTO portal_state (id, payload, updated_at)
         VALUES ('main', $1, now())
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [JSON.stringify(data)]
      );
      return;
    } catch (err) {
      console.error("portal: failed to persist to postgres, falling back to disk", err);
    }
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
