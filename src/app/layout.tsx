import type { Metadata } from "next";
import "./globals.css";
import { MarketStoreProvider } from "@/lib/hooks/use-market-store";

export const metadata: Metadata = {
  title: "IMPERA SIGNALS V2",
  description: "Systematic 5m market-analysis dashboard: displacement, FVG, iFVG, structure, premium/discount and confluence-based signals with backtesting and paper-trading"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MarketStoreProvider>{children}</MarketStoreProvider>
      </body>
    </html>
  );
}
