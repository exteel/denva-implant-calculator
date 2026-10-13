"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "./api";
import { describeError } from "./helpers";

export type AuthStatus = "unconfigured" | "loading" | "signed_out" | "forbidden" | "admin";

interface AuthValue {
  status: AuthStatus;
  email: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = api.isSupabaseConfigured;
  const [status, setStatus] = useState<AuthStatus>(configured ? "loading" : "unconfigured");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    const resolve = async (session: { user: { id: string; email?: string | null } } | null) => {
      if (!session) {
        if (!cancelled) {
          setEmail(null);
          setStatus("signed_out");
        }
        return;
      }
      try {
        const isAdmin = await api.checkIsAdmin(session.user.id);
        if (cancelled) return;
        setEmail(session.user.email ?? null);
        setError(null);
        setStatus(isAdmin ? "admin" : "forbidden");
      } catch (e) {
        if (cancelled) return;
        setError(describeError(e));
        setStatus("forbidden");
      }
    };

    api.getSession().then(resolve, (e) => {
      if (!cancelled) {
        setError(describeError(e));
        setStatus("signed_out");
      }
    });

    const unsubscribe = api.onAuthChange((session) => void resolve(session));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [configured]);

  const signIn = useCallback(async (mail: string, password: string) => {
    setError(null);
    await api.signIn(mail, password);
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
  }, []);

  const value = useMemo<AuthValue>(() => ({ status, email, error, signIn, signOut }), [status, email, error, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
