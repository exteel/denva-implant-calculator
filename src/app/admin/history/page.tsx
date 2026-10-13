import { Suspense } from "react";
import HistoryPage from "@/components/admin/pages/HistoryPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <HistoryPage />
    </Suspense>
  );
}
