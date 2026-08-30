"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
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
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/signals", label: "Signals", icon: <Zap className="w-5 h-5" /> },
  { href: "/charts", label: "Charts", icon: <BarChart3 className="w-5 h-5" /> },
  { href: "/scanner", label: "Scanner", icon: <Search className="w-5 h-5" /> },
  { href: "/markets", label: "Markets", icon: <Globe className="w-5 h-5" /> },
  { href: "/watchlist", label: "Watchlist", icon: <Star className="w-5 h-5" /> },
  { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-5 h-5" /> },
  { href: "/future", label: "Future", icon: <TrendingUp className="w-5 h-5" /> },
  { href: "/journal", label: "Journal", icon: <BookOpen className="w-5 h-5" /> },
  { href: "/history", label: "History", icon: <History className="w-5 h-5" /> },
  { href: "/alerts", label: "Alerts", icon: <AlertTriangle className="w-5 h-5" /> },
  { href: "/settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/signals", label: "Signals", icon: <Zap className="w-5 h-5" /> },
  { href: "/", label: "Home", icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/charts", label: "Charts", icon: <BarChart3 className="w-5 h-5" /> },
  { href: "/settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
];

export function MobileNavigation({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/portal/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d?.user?.role === "admin") setIsAdmin(true);
      })
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed top-0 left-0 bottom-0 w-72 bg-terminal-bg border-r border-terminal-border z-50 lg:hidden flex flex-col"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 380, damping: 35 }}
            >
              <div className="flex items-center justify-between px-5 h-16 border-b border-terminal-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-terminal-accentBg border border-terminal-accent/30 flex items-center justify-center">
                    <span className="font-mono font-bold text-terminal-accent text-base">◈</span>
                  </div>
                  <div>
                    <p className="font-display font-bold tracking-tight text-terminal-text text-sm">
                      IMPERA <span className="text-terminal-accent">SIGNALS</span>
                    </p>
                    <p className="text-caption text-terminal-muted">Institutional SMC Terminal</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-1">
                {NAV_ITEMS.map((item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.3 }}
                  >
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all relative ${
                        isActive(item.href)
                          ? "bg-terminal-accent/10 text-terminal-accent"
                          : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-panel/60"
                      }`}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </motion.div>
                ))}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive("/admin")
                        ? "bg-terminal-accent/10 text-terminal-accent"
                        : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-panel/60"
                    }`}
                  >
                    <Shield className="w-5 h-5" />
                    <span>Admin Panel</span>
                  </Link>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Bottom navigation for small screens */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-terminal-panel/95 backdrop-blur-xl border-t border-terminal-border px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5">
        <div className="flex items-stretch justify-around">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 rounded-xl py-1.5 transition-colors"
              >
                <span
                  className={`flex items-center justify-center w-10 h-8 rounded-lg transition-all ${
                    active ? "text-terminal-accent" : "text-terminal-muted"
                  }`}
                >
                  {item.icon}
                </span>
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-terminal-accent" : "text-terminal-muted"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
