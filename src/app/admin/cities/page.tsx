import { Suspense } from "react";
import CitiesPage from "@/components/admin/pages/CitiesPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <CitiesPage />
    </Suspense>
  );
}
