"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this data. Please try again.",
  retry,
  className = "",
}: {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="p-4 rounded-2xl bg-terminal-bearBg border border-terminal-bearBorder mb-4"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <AlertTriangle className="h-8 w-8 text-terminal-bear" />
      </motion.div>
      <h3 className="text-lg font-semibold text-terminal-text mb-1">{title}</h3>
      <p className="text-sm text-terminal-muted max-w-sm mb-6">{message}</p>
      {retry && (
        <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={retry}>
          Try again
        </Button>
      )}
    </motion.div>
  );
}
