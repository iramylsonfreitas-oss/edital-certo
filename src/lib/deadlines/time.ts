export const DEADLINE_TIMEZONE = "America/Sao_Paulo";
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEADLINE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"
});

function calendarDay(date: Date): number {
  const parts = dayFormatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return Date.UTC(value("year"), value("month") - 1, value("day"));
}

export function deadlineState(value: string | null, now = new Date()) {
  if (!value) return null;
  const target = new Date(value);
  if (!Number.isFinite(target.getTime()) || !Number.isFinite(now.getTime())) return null;
  const days = Math.round((calendarDay(target) - calendarDay(now)) / 86_400_000);
  const expired = target.getTime() <= now.getTime();
  const text = expired ? "Encerrada" : days === 0 ? "Encerra hoje" : days === 1 ? "Encerra amanhã" : `Faltam ${days} dias`;
  return { expired, days, text };
}
