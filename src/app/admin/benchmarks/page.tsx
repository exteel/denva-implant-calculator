import { Suspense } from "react";
import BenchmarksPage from "@/components/admin/pages/BenchmarksPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <BenchmarksPage />
    </Suspense>
  );
}
