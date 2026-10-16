import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = __dirname;
const sources = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-utils.ts")
  .map((f) => ({ file: f, text: readFileSync(join(dir, f), "utf8") }));

/**
 * The engine also runs inside a Supabase Edge Function (Deno): relative
 * imports only, no framework / DOM / Node APIs, no default exports.
 */
describe("engine v3 stays portable", () => {
  it("has source files", () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it("imports only relative modules", () => {
    for (const { file, text } of sources) {
      const specs = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specs) expect(spec.startsWith("."), `${file}: ${spec}`).toBe(true);
    }
  });

  it("imports contracts by a relative path, never through an alias", () => {
    for (const { file, text } of sources) expect(text, file).not.toMatch(/["']@\//);
  });

  it("uses no DOM / Node / React APIs and no default exports", () => {
    const banned = /\b(window|document|localStorage|process\.|require\(|Buffer|Intl\.|toLocale|Date\.now|new Date|Math\.random)\b|from\s+["']react|export\s+default/;
    for (const { file, text } of sources) {
      // comments may mention these words
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(banned);
    }
  });

  it("rounds nothing inside the calculation files", () => {
    for (const file of ["calc.ts", "meta.ts", "flow.ts", "unknown.ts"]) {
      const text = sources.find((s) => s.file === file)?.text ?? "";
      expect(text, file).not.toMatch(/Math\.(round|floor|ceil)|toFixed/);
    }
  });
});
