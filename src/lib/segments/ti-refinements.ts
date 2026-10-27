import rules from "./ti-refinements.json";

export function refineTiObject(text: string): string | null {
  let value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matches = (pattern: string) => new RegExp(pattern.replaceAll("[[:space:]]", "\\s")).test(value);
  if (matches(rules.fleetSupply) && !matches(rules.softwareProcurement)) return null;
  if (matches(rules.buildingWorks) && !matches(rules.infrastructure)) return null;
  if (matches(rules.cartridge) && !matches(rules.printing) && !matches(rules.infrastructure)) return null;
  if (matches(rules.pointCloud) && !matches(rules.infrastructure)) return null;
  if (!matches(rules.printing)) value = value.replace(new RegExp(rules.cartridge, "g"), " ");
  return value.replace(new RegExp(rules.pointCloud.replaceAll("[[:space:]]", "\\s"), "g"), " ");
}
