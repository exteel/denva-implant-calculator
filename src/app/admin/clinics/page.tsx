import { Suspense } from "react";
import ClinicsPage from "@/components/admin/pages/ClinicsPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <ClinicsPage />
    </Suspense>
  );
}
