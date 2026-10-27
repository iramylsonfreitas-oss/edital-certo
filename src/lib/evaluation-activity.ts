/** Ignore speculative route loads so hovering a link does not count as a visit. */
export function shouldRecordEvaluatorAccess(method: string, headers: Pick<Headers, "get" | "has">) {
  return method === "GET"
    && !headers.has("next-router-prefetch")
    && !headers.has("x-middleware-prefetch")
    && !/prefetch/i.test(headers.get("purpose") ?? "")
    && !/prefetch/i.test(headers.get("sec-purpose") ?? "");
}

export function formatEvaluationActivity(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo"
  }).format(date);
}
