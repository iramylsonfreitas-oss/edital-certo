import rules from "./health-rules.json";

export const healthCategories = rules.categories;
export const segmentLabels = { it: "Tecnologia da Informação", health: "Saúde" } as const;
export type SegmentKey = keyof typeof segmentLabels;
export function segmentKey(value: unknown): SegmentKey { return value === "health" ? "health" : "it"; }

// Classify the purchase object only. An agency's name or its address is not evidence.
export function classifyHealthObject(object: string): string[] {
  const text = object.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  if (new RegExp(rules.excluded).test(text)) return [];
  if (new RegExp(rules.services).test(text) && !new RegExp(rules.purchase).test(text)) return [];
  return rules.categories.filter(category => new RegExp(category.pattern).test(text)).map(category => category.key);
}
