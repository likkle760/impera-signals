"use client";
import { useEffect, useState, useCallback } from "react";
import { StatCard, PageHeader } from "@/components/ui";
import { motion } from "framer-motion";
import { ShieldCheck, KeyRound, Users, BadgeCheck, CircleX, Layers, Sparkles, CheckCircle2 } from "lucide-react";

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

const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] as const } },
};

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
    return (
      <div className="space-y-4">
        <div className="skeleton-title" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-card h-24" />)}
        </div>
      </div>
    );
  }

  if (notAdmin) {
    return (
      <div className="panel empty-state animate-in">
        <div className="empty-icon">🛡</div>
        <div className="empty-title">Admin access only</div>
        <div className="empty-desc">This panel is restricted to administrator accounts.</div>
      </div>
    );
  }

  const filtered = filter === "all" ? licenses : licenses.filter((l) => l.status === filter);

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <PageHeader
          eyebrow="ADMIN PORTAL"
          eyebrowIcon={<ShieldCheck className="w-3.5 h-3.5" />}
          title="License"
          highlight="Control"
          description="Manage users, generate license keys and revoke access across the Impera platform."
          right={flash && (
            <span className="badge bg-sky-500/20 border-sky-500/40 text-sky-300 animate-scale-in">
              <CheckCircle2 className="w-3 h-3" /> {flash}
            </span>
          )}
        />
      </motion.div>

      {/* Summary */}
      <motion.div variants={item} className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Licenses" value={summary.total} icon={<KeyRound className="w-5 h-5" />} variant="accent" />
        <StatCard label="Available" value={summary.available} icon={<BadgeCheck className="w-5 h-5" />} variant="success" />
        <StatCard label="Active" value={summary.active} icon={<Sparkles className="w-5 h-5" />} variant="info" />
        <StatCard label="Revoked" value={summary.revoked} icon={<CircleX className="w-5 h-5" />} variant="danger" />
        <StatCard label="Users" value={users.length} icon={<Users className="w-5 h-5" />} variant="warning" />
      </motion.div>

      {/* Generate */}
      <motion.div variants={item} className="card p-4 panel-hover">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 rounded-xl bg-terminal-accentBg text-terminal-accent border border-terminal-accent/25">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Generate License Keys</div>
              <div className="text-[11px] text-terminal-muted">IMPERA-XXXX-XXXX-XXXX format</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={2000} value={genCount}
              onChange={(e) => setGenCount(Math.max(1, Math.min(2000, +e.target.value || 1)))}
              className="input w-28 py-2 font-mono"
            />
            <button onClick={generate} disabled={busy} className="btn btn-primary">
              {busy ? <span className="animate-pulse">…</span> : <><KeyRound className="w-4 h-4" /> GENERATE KEYS</>}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Users */}
      <motion.div variants={item} className="card overflow-hidden panel-hover">
        <div className="p-4 border-b border-terminal-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-terminal-accent" />
            <h3 className="panel-title">USERS ({users.length})</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>License</th>
                <th>Created</th>
                <th>Last Login</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="text-terminal-text font-medium">{u.name}</div>
                    <div className="text-[11px] text-terminal-muted">{u.email}</div>
                  </td>
                  <td>
                    <span className={`badge ${u.role === "admin" ? "bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300" : "bg-sky-500/10 border-sky-500/30 text-sky-300"}`}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-terminal-muted">{u.licenseKey}</td>
                  <td className="text-[11px] text-terminal-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="text-[11px] text-terminal-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "—"}</td>
                  <td>
                    <span className={`badge ${u.revoked ? "badge-danger" : "badge-success"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.revoked ? "bg-rose-400" : "bg-emerald-400 animate-pulse-live"}`} />
                      {u.revoked ? "REVOKED" : "ACTIVE"}
                    </span>
                  </td>
                  <td>
                    {u.role !== "admin" && !u.revoked && (
                      <button
                        onClick={() => revokeUser(u.id)}
                        className="btn btn-danger btn-sm px-2 py-1"
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
      </motion.div>

      {/* Licenses */}
      <motion.div variants={item} className="card overflow-hidden panel-hover">
        <div className="p-4 border-b border-terminal-border/60 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-terminal-accent" />
            <h3 className="panel-title">LICENSE KEYS ({licenses.length})</h3>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "available", "active", "revoked"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`filter-chip ${filter === f ? "filter-chip-active" : ""}`}
              >
                {f.toUpperCase()}
                <span className="text-[10px] opacity-70">
                  {f === "all" ? licenses.length : licenses.filter((l) => l.status === f).length}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          <table className="table">
            <thead className="sticky top-0 bg-terminal-bgElevated/95 backdrop-blur-xl z-10">
              <tr>
                <th>Key</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Activated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.key}>
                  <td className="font-mono text-[11px] text-terminal-text">{l.key}</td>
                  <td>
                    <span className={`badge ${
                      l.status === "available" ? "badge-success"
                      : l.status === "active" ? "badge-info"
                      : "badge-danger"
                    }`}>{l.status.toUpperCase()}</span>
                  </td>
                  <td className="text-[11px] text-terminal-muted">{l.assignedEmail || "—"}</td>
                  <td className="text-[11px] text-terminal-muted">{l.activatedAt ? new Date(l.activatedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    {l.status !== "revoked" && (
                      <button
                        onClick={() => revokeKey(l.key)}
                        className="btn btn-danger btn-sm px-2 py-1"
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
      </motion.div>
    </motion.div>
  );
}