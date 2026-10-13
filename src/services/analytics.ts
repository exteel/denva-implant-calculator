/** DENVA AI v2 calculator funnel events. */
export type AnalyticsEvent =
  | "calculator_started"
  | "city_selected"
  | "scope_selected"
  | "teeth_count_selected"
  | "followup_answered"
  | "result_viewed"
  | "tier_card_selected"
  | "tier_toggled"
  | "all_on_selected"
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
