import { DataUnavailableError, type CalculatorDataSource } from "./types";

export { DataUnavailableError };
export type { CalculatorDataSource };

let cached: Promise<CalculatorDataSource> | null = null;

async function load(): Promise<CalculatorDataSource> {
  // Next inlines NEXT_PUBLIC_DATA_SOURCE at build time (see next.config.ts).
  // In a normal build the condition is the constant `"" === "fixture"`, so
  // the bundler drops this dynamic import and the fixture module never ships.
  if (process.env.NEXT_PUBLIC_DATA_SOURCE === "fixture") {
    const { fixtureDataSource } = await import("./fixture");
    return fixtureDataSource;
  }
  const { createSupabaseDataSource } = await import("./supabase-source");
  return createSupabaseDataSource();
}

/** The data source for this build. Rejects with DataUnavailableError when none is configured. */
export function getDataSource(): Promise<CalculatorDataSource> {
  cached ??= load().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}
