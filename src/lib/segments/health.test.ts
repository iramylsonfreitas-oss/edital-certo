import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sample from "../../../fixtures/pncp/health-review-sample.json";
import { classifyHealthObject, segmentKey } from "./health";
import rules from "./health-rules.json";

describe("health object classification", () => {
 for (const record of sample.records) it(`reviewed PNCP object ${record.id}`, () => {
   expect(classifyHealthObject(record.object).length > 0).toBe(record.expectedHealth);
 });
 it.each([
   ["Aquisição de medicamentos veterinários", []],
   ["Aquisição de luvas de segurança industrial", []],
   ["Aquisição de notebook para o hospital municipal", []],
   ["Contratação de serviços médicos com fornecimento de medicamentos", []],
   ["Aquisição de materiais especiais para obra", []],
   ["Compra de ventiladores de parede para hospital", []],
   ["Aquisição de luvas cirúrgicas e seringas", ["supplies"]],
   ["Compra de monitores multiparamétricos", ["equipment"]],
   ["Aquisição de medicamentos e equipamentos médicos", ["medicines", "equipment"]],
   ["Locação de equipamentos médicos", []]
 ])("%s", (object, expected) => expect(classifyHealthObject(object)).toEqual(expected));
 it("keeps the generated SQL and frontend classification rules in sync", () => {
   const sql = readFileSync("supabase/migrations/20261027143119_health_catalog_segments.sql", "utf8");
   for (const pattern of [rules.excluded, rules.services, rules.purchase, ...rules.categories.map(c => c.pattern)]) expect(sql).toContain(pattern);
 });
 it("defaults old or invalid links to TI", () => {
   expect(segmentKey(undefined)).toBe("it"); expect(segmentKey("bad")).toBe("it"); expect(segmentKey("health")).toBe("health");
 });
});
