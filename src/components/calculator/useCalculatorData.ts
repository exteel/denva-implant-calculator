"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocationKind, LocationPricesResponse, PublicLocation } from "@/lib/contracts";
import { DataUnavailableError, getDataSource } from "@/lib/data";

export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; unavailable: boolean }
  | { status: "ready"; data: T };

export interface LoadState<T> {
  state: Loadable<T>;
  retry: () => void;
}

const pricesCache = new Map<string, Promise<LocationPricesResponse>>();

function loadPrices(kind: LocationKind, id: string): Promise<LocationPricesResponse> {
  const key = `${kind}:${id}`;
  let promise = pricesCache.get(key);
  if (!promise) {
    promise = getDataSource().then((source) => source.getLocationPrices(kind, id));
    pricesCache.set(key, promise);
    // A failed request must not stay cached.
    promise.catch(() => pricesCache.delete(key));
  }
  return promise;
}

function toError(error: unknown): Loadable<never> {
  return { status: "error", unavailable: error instanceof DataUnavailableError };
}

/** Cities and regions for the first screen. */
export function useLocations(): LoadState<PublicLocation[]> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; state: Loadable<PublicLocation[]> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDataSource()
      .then((source) => source.listLocations())
      .then(
        (data) => !cancelled && setResult({ attempt, state: { status: "ready", data } }),
        (error: unknown) => !cancelled && setResult({ attempt, state: toError(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: Loadable<PublicLocation[]> = result?.attempt === attempt ? result.state : { status: "loading" };
  return { state, retry };
}

/** Published prices of the chosen city or region; loads as soon as it is chosen. */
export function usePrices(location: { kind: LocationKind; id: string } | null): LoadState<LocationPricesResponse> {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    state: Loadable<LocationPricesResponse>;
  } | null>(null);
  const key = location ? `${location.kind}:${location.id}` : "";

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    loadPrices(location.kind, location.id).then(
      (data) => !cancelled && setResult({ key, attempt, state: { status: "ready", data } }),
      (error: unknown) => !cancelled && setResult({ key, attempt, state: toError(error) }),
    );
    return () => {
      cancelled = true;
    };
    // `location` is represented by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state: Loadable<LocationPricesResponse> =
    result && result.key === key && result.attempt === attempt ? result.state : { status: "loading" };
  return { state, retry };
}
