import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import rules from "./ti-refinements.json";

it("checks contextual rules and reviewed cases in the public collector without network requests", () => {
  const output = execFileSync(process.execPath, ["scripts/coletar-pncp.mjs"], { encoding: "utf8", env: { ...process.env, PNCP_TEST_ONLY: "1" } });
  expect(output).toContain("nenhuma chamada foi feita ao PNCP");
});

it("keeps SQL and public catalog contextual rules aligned", () => {
  const sql = readFileSync("supabase/migrations/20261027173533_refine_reviewed_catalog_quality.sql", "utf8") + readFileSync("supabase/migrations/20261027174309_preserve_explicit_ti_services.sql", "utf8");
  for (const pattern of Object.values(rules)) expect(sql).toContain(pattern);
});
