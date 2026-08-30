"use client";
import { useEffect, useState, useCallback } from "react";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  licenseKey: string;
  createdAt: string;
  lastLoginAt: string | null;
  revoked: boolean;
}

interface LicRow {
  key: string;
  status: "available" | "active" | "revoked";
  assignedEmail: string | null;
  deviceFingerprint: string | null;
  activatedAt: string | null;
  createdAt: string;
}

type Filter = "all" | "available" | "active" | "revoked";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [notAdmin, setNotAdmin] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [licenses, setLicenses] = useState<LicRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, available: 0, active: 0, revoked: 0 });
  const [filter, setFilter] = useState<Filter>("all");
  const [genCount, setGenCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const notify = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(null), 2500);
  };

  const load = useCallback(async () => {
    try {
      const [uRes, kRes] = await Promise.all([
        fetch("/api/portal/admin/users", { cache: "no-store" }),
        fetch("/api/portal/admin/keys", { cache: "no-store" })
      ]);
      if (uRes.status === 403 || kRes.status === 403) {
        setNotAdmin(true);
        return;
      }
      const u = await uRes.json();
      const k = await kRes.json();
      setUsers(u.users || []);
      setLicenses(k.licenses || []);
      setSummary(k.summary || { total: 0, available: 0, active: 0, revoked: 0 });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: genCount })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        notify(`Generated ${data.created.length} keys`);
        load();
      } else {
        notify(data?.error || "Failed to generate keys");
      }
    } finally {
      setBusy(false);
    }
  };

  const revokeUser = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/admin/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id })
      });
      const data = await res.json();
      notify(res.ok ? "User revoked" : data.error || "Failed");
      load();
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (key: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/portal/admin/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key })
      });
      const data = await res.json();
      notify(res.ok ? "License revoked" : data.error || "Failed");
      load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="text-terminal-muted animate-pulse">Loading admin panel…</div>;
  }

  if (notAdmin) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">🛡</div>
        <p className="text-terminal-muted">Admin access only.</p>
      </div>
    );
  }

  const filtered =
    filter === "all" ? licenses : licenses.filter((l) => l.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="panel-title text-lg text-white normal-case">ADMIN PORTAL</h2>
        {flash && <span className="badge bg-sky-500/20 border-sky-500/40 text-sky-300">{flash}</span>}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="TOTAL LICENSES" value={summary.total} color="text-white" />
        <Stat label="AVAILABLE" value={summary.available} color="text-emerald-400" />
        <Stat label="ACTIVE" value={summary.active} color="text-sky-300" />
        <Stat label="REVOKED" value={summary.revoked} color="text-rose-400" />
        <Stat label="USERS" value={users.length} color="text-fuchsia-300" />
      </div>

      {/* Generate */}
      <div className="panel p-4 flex items-end gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-terminal-muted mb-1">Generate keys</div>
          <input
            type="number" min={1} max={2000} value={genCount}
            onChange={(e) => setGenCount(Math.max(1, Math.min(2000, +e.target.value || 1)))}
            className="w-28 bg-terminal-panel2 border border-terminal-border rounded px-3 py-1.5 text-white text-sm"
          />
        </div>
        <button onClick={generate} disabled={busy} className="btn btn-primary">
          {busy ? "…" : "GENERATE KEYS"}
        </button>
        <span className="text-[11px] text-terminal-muted">Keys follow the IMPERA-XXXX-XXXX-XXXX format.</span>
      </div>

      {/* Users */}
      <div className="panel overflow-hidden">
        <div className="p-4 border-b border-terminal-border">
          <h3 className="panel-title">USERS ({users.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-terminal-muted border-b border-terminal-border">
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">License</th>
                <th className="p-3">Created</th>
                <th className="p-3">Last Login</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-terminal-border/50 hover:bg-terminal-panel/40">
                  <td className="p-3">
                    <div className="text-white">{u.name}</div>
                    <div className="text-[11px] text-terminal-muted">{u.email}</div>
                  </td>
                  <td className="p-3">
                    <span className={`badge ${u.role === "admin" ? "bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300" : "bg-sky-500/10 border-sky-500/30 text-sky-300"}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 mono text-[11px] text-terminal-muted">{u.licenseKey}</td>
                  <td className="p-3 text-[11px] text-terminal-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 text-[11px] text-terminal-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</td>
                  <td className="p-3">
                    <span className={`badge ${u.revoked ? "bg-rose-500/15 border-rose-500/40 text-rose-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
                      {u.revoked ? "REVOKED" : "ACTIVE"}
                    </span>
                  </td>
                  <td className="p-3">
                    {u.role !== "admin" && !u.revoked && (
                      <button
                        onClick={() => revokeUser(u.id)}
                        className="badge cursor-pointer bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/25"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-terminal-muted">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Licenses */}
      <div className="panel overflow-hidden">
        <div className="p-4 border-b border-terminal-border flex items-center justify-between flex-wrap gap-3">
          <h3 className="panel-title">LICENSE KEYS ({licenses.length})</h3>
          <div className="flex gap-1 flex-wrap">
            {(["all", "available", "active", "revoked"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`badge cursor-pointer border ${
                  filter === f ? "bg-sky-500/20 border-sky-500/50 text-sky-300" : "bg-terminal-panel2 border-terminal-border text-terminal-muted hover:text-white"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-terminal-panel">
              <tr className="text-left text-[11px] uppercase tracking-wider text-terminal-muted border-b border-terminal-border">
                <th className="p-3">Key</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned To</th>
                <th className="p-3">Activated</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.key} className="border-b border-terminal-border/50 hover:bg-terminal-panel/40">
                  <td className="p-3 mono text-[11px] text-white">{l.key}</td>
                  <td className="p-3">
                    <span className={`badge ${
                      l.status === "available" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : l.status === "active" ? "bg-sky-500/10 border-sky-500/30 text-sky-300"
                      : "bg-rose-500/15 border-rose-500/40 text-rose-400"
                    }`}>{l.status.toUpperCase()}</span>
                  </td>
                  <td className="p-3 text-[11px] text-terminal-muted">{l.assignedEmail || "—"}</td>
                  <td className="p-3 text-[11px] text-terminal-muted">{l.activatedAt ? new Date(l.activatedAt).toLocaleDateString() : "—"}</td>
                  <td className="p-3">
                    {l.status !== "revoked" && (
                      <button
                        onClick={() => revokeKey(l.key)}
                        className="badge cursor-pointer bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/25"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-terminal-muted">No licenses in this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="panel p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-terminal-muted mt-1">{label}</div>
    </div>
  );
}
