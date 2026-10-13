"use client";

import Link from "next/link";
import { getDashboardCounts } from "../api";
import { useAsync } from "../hooks";
import { Badge, DataState, PageHeader } from "../ui";
import { Card } from "@/components/ui/Card";

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone: "warn" | "bad" | "good" }) {
  return (
    <Link href={href} className="block no-underline">
      <Card className="h-full transition-colors hover:border-brand">
        <p className="text-sm font-bold text-muted">{label}</p>
        <p className="tabular mt-2 text-4xl font-extrabold text-ink">{value}</p>
        <div className="mt-2">
          <Badge tone={value === 0 ? "good" : tone}>{value === 0 ? "Усе гаразд" : "Потребує уваги"}</Badge>
        </div>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data, error, loading, reload } = useAsync(getDashboardCounts, []);
  return (
    <>
      <PageHeader title="Огляд" description="Що потребує уваги просто зараз." />
      <DataState loading={loading} error={error} onRetry={reload}>
        {data ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Ціни на модерації" value={data.pendingPrices} href="/admin/prices/?status=pending" tone="warn" />
              <Stat label="Заявки, не надіслані в Telegram" value={data.failedLeads} href="/admin/leads/?status=failed" tone="bad" />
              <Stat label="Міста без жодної опублікованої ціни" value={data.citiesWithoutPrices.length} href="/admin/benchmarks/" tone="warn" />
            </div>
            {data.citiesWithoutPrices.length > 0 ? (
              <Card>
                <h2 className="text-[17px] font-extrabold">Міста без опублікованих цін</h2>
                <p className="mt-1 text-sm text-muted">
                  Калькулятор покаже «даних поки недостатньо». Внесіть міські орієнтири або регіональний fallback.
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {data.citiesWithoutPrices.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/admin/benchmarks/?scope=city&id=${encodeURIComponent(c.id)}`}
                        className="inline-block rounded-full border border-line-strong px-3 py-1 text-sm font-bold text-ink no-underline hover:border-brand hover:text-brand"
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : null}
      </DataState>
    </>
  );
}
