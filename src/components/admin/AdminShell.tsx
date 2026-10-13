"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Logo } from "@/components/ui/Logo";
import { AuthProvider, useAuth } from "./auth";
import { describeError } from "./helpers";
import { Button, Notice, TextField, useAction } from "./ui";

const NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/admin/leads-dashboard/", label: "Дашборд заявок" },
  { href: "/admin/", label: "Огляд" },
  { href: "/admin/cities/", label: "Міста та регіони" },
  { href: "/admin/clinics/", label: "Клініки" },
  { href: "/admin/services/", label: "Каталог послуг" },
  { href: "/admin/prices/", label: "Прайси клінік" },
  { href: "/admin/import/", label: "Імпорт Excel" },
  { href: "/admin/benchmarks/", label: "Міські орієнтири" },
  { href: "/admin/aggregates/", label: "Агрегати міста" },
  { href: "/admin/history/", label: "Історія змін" },
  { href: "/admin/leads/", label: "Заявки" },
  { href: "/admin/settings/", label: "Налаштування" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  );
}

function CenterCard({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4">
          <Logo href="/admin/" />
          <p className="mt-1 text-sm text-muted">Адмін-панель калькулятора імплантації</p>
        </div>
        {children}
      </Card>
    </main>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const auth = useAuth();

  if (auth.status === "unconfigured") {
    return (
      <CenterCard>
        <Notice tone="warn" role="status">
          <p className="font-bold">Supabase не налаштовано</p>
          <p className="mt-1">
            Адмін-панель працює лише з підключеною базою. Додайте змінні середовища{" "}
            <code className="rounded bg-canvas px-1">NEXT_PUBLIC_SUPABASE_URL</code> та{" "}
            <code className="rounded bg-canvas px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (локально — у{" "}
            <code className="rounded bg-canvas px-1">.env.local</code>, на GitHub Pages — у секретах репозиторію),
            після чого перезберіть сайт.
          </p>
        </Notice>
      </CenterCard>
    );
  }
  if (auth.status === "loading") {
    return (
      <CenterCard>
        <p className="text-sm text-muted" role="status">Перевірка сесії…</p>
      </CenterCard>
    );
  }
  if (auth.status === "signed_out") return <SignIn />;
  if (auth.status === "forbidden") {
    return (
      <CenterCard>
        <Notice tone="bad" role="alert">
          <p className="font-bold">Ваш акаунт не має прав адміністратора</p>
          <p className="mt-1">
            {auth.email ? `Ви увійшли як ${auth.email}. ` : ""}Попросіть власника додати вас до списку адміністраторів.
          </p>
          {auth.error ? <p className="mt-1 text-xs">{auth.error}</p> : null}
        </Notice>
        <Button variant="secondary" className="mt-4 w-full" onClick={() => void auth.signOut()}>
          Вийти
        </Button>
      </CenterCard>
    );
  }
  return <Frame>{children}</Frame>;
}

function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(() => auth.signIn(email.trim(), password), (err) => {
      const text = describeError(err);
      return /invalid login credentials/i.test(text) ? "Невірний e-mail або пароль." : text;
    });
  }

  return (
    <CenterCard>
      <form onSubmit={submit} className="space-y-3">
        <TextField label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Пароль"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <Notice tone="bad" role="alert">{error}</Notice> : null}
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? "Вхід…" : "Увійти"}
        </Button>
      </form>
    </CenterCard>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const pathname = usePathname() ?? "/admin/";
  const current = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const isActive = (href: string) => (href === "/admin/" ? current === "/admin/" : current.startsWith(href));

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="border-b border-line bg-paper lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:py-5">
          <div>
            <Logo href="/admin/" />
            <p className="hidden text-xs text-muted lg:block">Адмін-панель</p>
          </div>
          <div className="text-right lg:mt-4 lg:text-left">
            <p className="max-w-[12rem] truncate text-xs text-muted" title={auth.email ?? ""}>{auth.email}</p>
            <button type="button" onClick={() => void auth.signOut()} className="text-xs font-bold text-brand hover:underline">
              Вийти
            </button>
          </div>
        </div>
        <nav aria-label="Розділи адмін-панелі" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-6">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold no-underline transition-colors ${
                  active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-canvas"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
