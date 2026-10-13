import { Suspense } from "react";
import LeadsDashboardPage from "@/components/admin/pages/LeadsDashboardPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <LeadsDashboardPage />
    </Suspense>
  );
}
