"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui";
import {
  LayoutDashboard,
  Zap,
  BarChart3,
  Search,
  TrendingUp,
  Globe,
  Star,
  BookOpen,
  History,
  AlertTriangle,
  Settings,
  Shield,
  ChevronDown,
  Radio,
  Activity,
} from "lucide-react";

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: "default" | "success" | "danger" | "warning" | "info";
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Trading",
    items: [
      { href: "/", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" />, badge: "LIVE", badgeVariant: "success" },
      { href: "/signals", label: "Signals", icon: <Zap className="w-4 h-4" /> },
      { href: "/charts", label: "Charts", icon: <BarChart3 className="w-4 h-4" /> },
      { href: "/scanner", label: "Scanner", icon: <Search className="w-4 h-4" /> },
    ],
  },
  {
    title: "Analysis",
    items: [
      { href: "/news", label: "News Calendar", icon: <Radio className="w-4 h-4" />, badge: "FF", badgeVariant: "warning" },
      { href: "/future", label: "Future Ops", icon: <TrendingUp className="w-4 h-4" /> },
      { href: "/markets", label: "Markets", icon: <Globe className="w-4 h-4" /> },
      { href: "/watchlist", label: "Watchlist", icon: <Star className="w-4 h-4" /> },
      { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/journal", label: "Journal", icon: <BookOpen className="w-4 h-4" /> },
      { href: "/history", label: "History", icon: <History className="w-4 h-4" /> },
      { href: "/alerts", label: "Alerts", icon: <AlertTriangle className="w-4 h-4" /> },
      { href: "/settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/portal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.user?.role === "admin") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const allItems: NavSection[] = isAdmin
    ? [...NAV_SECTIONS, { title: "Admin", items: [{ href: "/admin", label: "Admin Panel", icon: <Shield className="w-4 h-4" />, badge: "SECURE", badgeVariant: "info" }] }]
    : NAV_SECTIONS;

  return (
    <motion.aside
      className="hidden lg:flex w-[260px] shrink-0 flex-col sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto scrollbar-hide border-r border-terminal-border/60 bg-terminal-bg/70 backdrop-blur-2xl"
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {/* Brand lockup */}
      <div className="px-5 pt-5 pb-4">
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-terminal-accent via-sky-500 to-terminal-violet flex items-center justify-center shadow-aurora">
            <span className="font-mono font-bold text-terminal-ink text-lg leading-none">◈</span>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-terminal-bull ring-2 ring-terminal-ink animate-pulse-live" />
          </div>
          <div>
            <p className="font-display font-bold tracking-tight text-terminal-text text-sm leading-tight">
              IMPERA <span className="aurora-text">SIGNALS</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-terminal-muted mt-0.5">
              Precision SMC Terminal
            </p>
          </div>
        </motion.div>
        <div className="hairline mt-4" />
      </div>

      <div className="p-3 -mt-1 space-y-4">
        {allItems.map((section, secIdx) => {
          const collapsed = collapsedSections[section.title];
          return (
            <div key={section.title} className="space-y-1">
              <motion.button
                onClick={() => toggleSection(section.title)}
                className="w-full flex items-center justify-between px-3 py-1.5 group"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 * secIdx }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-terminal-muted group-hover:text-terminal-text transition-colors">
                  {section.title}
                </span>
                <motion.span
                  animate={{ rotate: collapsed ? 180 : 0 }}
                  transition={{ duration: 0.25 }}
                  className="text-terminal-muted/60"
                >
                  <ChevronDown className="w-3 h-3" />
                </motion.span>
              </motion.button>

              <motion.div
                key={String(collapsed)}
                initial={false}
                animate={{ height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div className="space-y-0.5 mt-0.5">
                  {section.items.map((item, itemIdx) => {
                    const active =
                      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <motion.div
                        key={item.href}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.05 * itemIdx }}
                      >
                        <Link
                          href={item.href}
                          className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                            active
                              ? "text-terminal-accent"
                              : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-panel/70"
                          }`}
                        >
                          {active && (
                            <>
                              <motion.span
                                layoutId="sidebar-active"
                                className="absolute inset-0 rounded-xl border border-terminal-accent/25"
                                style={{
                                  background: "linear-gradient(90deg, rgba(34,211,238,0.18), rgba(34,211,238,0.03))",
                                  boxShadow: "inset 0 0 0 1px rgba(34,211,238,0.12), 0 0 24px rgba(34,211,238,0.09)",
                                }}
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                              />
                              <motion.span
                                className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full bg-gradient-to-b from-terminal-accent to-terminal-violet"
                                initial={{ opacity: 0, scaleY: 0 }}
                                animate={{ opacity: 1, scaleY: 1 }}
                                transition={{ duration: 0.25 }}
                              />
                            </>
                          )}
                          <span
                            className={`relative w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors ${
                              active ? "text-terminal-accent" : "text-terminal-muted group-hover:text-terminal-text"
                            }`}
                          >
                            {item.icon}
                          </span>
                          <span className="relative flex-1 truncate">{item.label}</span>
                          {item.badge && (
                            <span className="relative">
                              <Badge variant={item.badgeVariant || "default"} size="sm">
                                {item.badge}
                              </Badge>
                            </span>
                          )}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto p-3">
        <div className="hairline mb-3" />
        <motion.div
          className="relative overflow-hidden rounded-2xl border border-terminal-border/60 bg-gradient-to-br from-terminal-bgElevated via-terminal-panel to-terminal-bgElevated/60 p-3.5 shadow-inner-glow"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-terminal-accent/10 blur-2xl" />
          <div className="relative flex items-center gap-2 mb-3">
            <span className="live-dot live-dot-live" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-terminal-muted">
              Engine Status
            </span>
          </div>
          <div className="relative grid grid-cols-2 gap-2">
            <div className="rounded-lg p-2 bg-terminal-bg/60 border border-terminal-border/50">
              <div className="text-[10px] text-terminal-muted uppercase">Live</div>
              <div className="font-mono text-terminal-bull text-sm font-semibold">Active</div>
            </div>
            <div className="rounded-lg p-2 bg-terminal-bg/60 border border-terminal-border/50">
              <div className="text-[10px] text-terminal-muted uppercase">Scan</div>
              <div className="font-mono text-terminal-text text-sm font-semibold">30s</div>
            </div>
          </div>
          <div className="relative flex items-center gap-1.5 mt-3 text-[10px] text-terminal-muted">
            <Activity className="w-3 h-3 text-terminal-accent" />
            Continuous multi-TF analysis
          </div>
        </motion.div>
      </div>
    </motion.aside>
  );
}