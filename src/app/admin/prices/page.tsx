import { Suspense } from "react";
import PricesPage from "@/components/admin/pages/PricesPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <PricesPage />
    </Suspense>
  );
}
