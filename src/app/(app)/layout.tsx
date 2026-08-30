import AppLayout from "@/components/layout/AppLayout";
import AuthGuard from "./AuthGuard";

export default function AppRouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppLayout>{children}</AppLayout>
    </AuthGuard>
  );
}
