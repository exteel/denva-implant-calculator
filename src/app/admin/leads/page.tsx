import { Suspense } from "react";
import LeadsPage from "@/components/admin/pages/LeadsPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <LeadsPage />
    </Suspense>
  );
}
