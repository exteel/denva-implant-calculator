import { Suspense } from "react";
import ServicesPage from "@/components/admin/pages/ServicesPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <ServicesPage />
    </Suspense>
  );
}
