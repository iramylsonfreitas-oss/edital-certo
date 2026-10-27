export function tenderTitle(value: string, maximum = 240): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maximum) return text;
  const boundary = text.lastIndexOf(" ", maximum - 1);
  return `${text.slice(0, boundary > maximum / 2 ? boundary : maximum - 1).trimEnd()}…`;
}

export function tenderValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Valor não informado";
}
