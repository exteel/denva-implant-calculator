import { Suspense } from "react";
import ImportPage from "@/components/admin/pages/ImportPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <ImportPage />
    </Suspense>
  );
}
