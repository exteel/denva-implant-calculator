/** DENVA AI v3 calculator funnel events (ТЗ §11.9: start, completion, voluntary lead). */
export type AnalyticsEvent =
  | "calculator_started"
  | "city_selected"
  | "counts_continue"
  | "unknown_scope_selected"
  | "question_answered"
  | "result_viewed"
  | "calculation_completed"
  | "tier_toggled"
  | "tier_preset_applied"
  | "scenario_selected"
  | "temporary_toggled"
  | "currency_changed"
  | "params_changed"
  | "lead_cta_clicked"
  | "lead_submitted"
  | "lead_failed"
  | "lead_retry";

/**
 * Calculator analytics. Events go to `window.dataLayer` so Google Tag Manager
 * (or any tag manager) can be attached later without code changes.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

export type AnalyticsParams = Record<string, unknown>;
type Sink = (event: AnalyticsEvent, params: AnalyticsParams) => void;

const sinks = new Set<Sink>();

/** Extra listener (tests, future backend beacon). Returns an unsubscribe. */
export function addAnalyticsSink(sink: Sink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  sinks.forEach((sink) => sink(event, params));
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...params });
  if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event, params);
  }
}
