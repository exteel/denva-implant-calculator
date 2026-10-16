import type { Jaw, JawScenarioChoice, LocationKind, PatientTier, ToothLocation, ToothStatus } from "@/lib/contracts";
import type { JawAnswers, UnknownScope } from "@/engine/v3";
import type { CalcState } from "./model";

/** ТЗ §11.1: calculator state lives in localStorage only — never in the URL. */
const KEY = "denva-calculator-v3";

export type StepName = "city" | "counts" | "question" | "result";

export interface ChosenLocation {
  kind: LocationKind;
  id: string;
  name: string;
}

export interface SavedSession {
  v: 3;
  location: ChosenLocation | null;
  state: CalcState;
  step: StepName;
  questionIndex: number;
}

const STEPS: StepName[] = ["city", "counts", "question", "result"];

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const LOCATIONS: readonly ToothLocation[] = ["adjacent", "separate", "unknown"];
const STATUSES: readonly ToothStatus[] = ["removed", "partly_present", "extraction_recommended", "implants_installed", "unknown"];
const TIERS: readonly PatientTier[] = ["minimum", "classic", "premium"];
const SCENARIOS: readonly JawScenarioChoice[] = ["bridges", "aox4", "aox6", "aox8"];
const UNKNOWNS: readonly UnknownScope[] = ["separate", "significant", "all", "none"];

const pick = <T extends string>(list: readonly T[], value: unknown): T | null =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;

const clampCount = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), 14) : 0;

const asRecord = (v: unknown): Record<string, unknown> => (isObject(v) ? v : {});

/** Merges untrusted JSON over the defaults so a stale / hand-edited entry cannot crash the UI. */
export function reviveState(raw: unknown): CalcState {
  const src = asRecord(raw);
  const counts = asRecord(src.counts);
  const unknown = asRecord(src.unknown);
  const choice = pick(UNKNOWNS, unknown.choice);

  const jaw = (key: Jaw) => {
    const a = asRecord(asRecord(src.answers)[key]);
    const t = asRecord(asRecord(src.tiers)[key]);
    const installed: JawAnswers["installed"] =
      a.installed === "unknown" ? "unknown" : typeof a.installed === "number" ? Math.trunc(a.installed) : null;
    return {
      answers: { location: pick(LOCATIONS, a.location), status: pick(STATUSES, a.status), installed },
      tiers: { implant: pick(TIERS, t.implant) ?? "classic", crown: pick(TIERS, t.crown) ?? "classic" },
      scenario: pick(SCENARIOS, asRecord(src.scenario)[key]) ?? "bridges",
    };
  };
  const upper = jaw("upper");
  const lower = jaw("lower");

  return {
    counts: { upper: clampCount(counts.upper), lower: clampCount(counts.lower) },
    unknown: { active: unknown.active === true && choice !== null, choice },
    answers: { upper: upper.answers, lower: lower.answers },
    tiers: { upper: upper.tiers, lower: lower.tiers },
    scenario: { upper: upper.scenario, lower: lower.scenario },
    includeTemporary: src.includeTemporary === true,
    currency: src.currency === "EUR" ? "EUR" : "UAH",
  };
}

export function loadSession(storage: Pick<Storage, "getItem"> | null = safeStorage()): SavedSession | null {
  try {
    const text = storage?.getItem(KEY);
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    if (!isObject(raw) || raw.v !== 3) return null;
    const loc = raw.location;
    const location: ChosenLocation | null =
      isObject(loc) && (loc.kind === "city" || loc.kind === "region") && typeof loc.id === "string" && typeof loc.name === "string"
        ? { kind: loc.kind, id: loc.id, name: loc.name }
        : null;
    const step = STEPS.includes(raw.step as StepName) ? (raw.step as StepName) : "city";
    return {
      v: 3,
      location,
      state: reviveState(raw.state),
      step,
      questionIndex: typeof raw.questionIndex === "number" && raw.questionIndex >= 0 ? Math.trunc(raw.questionIndex) : 0,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(session));
  } catch {
    // Private mode / quota: the calculator still works, it just won't remember.
  }
}

export function clearSession(storage: Pick<Storage, "removeItem"> | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // ignore
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
