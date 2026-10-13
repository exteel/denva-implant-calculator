import { Suspense } from "react";
import DashboardPage from "@/components/admin/pages/DashboardPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <DashboardPage />
    </Suspense>
  );
}
