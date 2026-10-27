import { expect, it } from "vitest";
import { tenderTitle, tenderValue } from "./presentation";

it.each([null, undefined, 0, -1, Number.NaN])("does not display an unknown value as free: %s", value => {
  expect(tenderValue(value)).toBe("Valor não informado");
});
it("preserves a known value", () => expect(tenderValue(1000)).toMatch(/1\.000,00/));
it("truncates at a word boundary and preserves original abbreviations", () => {
  expect(tenderTitle("  AQUISIÇÃO  DE NOTEBOOKS PARA A UFMA  ", 25)).toBe("AQUISIÇÃO DE NOTEBOOKS…");
  expect(tenderTitle("Notebook UFMA")).toBe("Notebook UFMA");
});
