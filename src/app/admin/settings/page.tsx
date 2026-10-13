import { Suspense } from "react";
import SettingsPage from "@/components/admin/pages/SettingsPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-muted">Завантаження…</p>}>
      <SettingsPage />
    </Suspense>
  );
}
