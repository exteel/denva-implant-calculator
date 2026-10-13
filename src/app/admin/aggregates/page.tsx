import { Suspense } from "react";
import AggregatesPage from "@/components/admin/pages/AggregatesPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <AggregatesPage />
    </Suspense>
  );
}
