const pncpDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/;
const explicitTimezonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function getBrasiliaOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    timeZoneName: "longOffset",
    hour: "2-digit"
  }).formatToParts(instant);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset ?? "");
  if (!match) throw new Error("Não foi possível interpretar o fuso horário de Brasília.");
  const sign = match[1] === "+" ? 1 : -1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function normalizePncpDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  if (explicitTimezonePattern.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  }

  const match = pncpDateTimePattern.exec(value);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", fraction = "0"] = match;
  const milliseconds = Math.trunc(Number(`0.${fraction}`) * 1000);
  const wallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), milliseconds);
  let offsetMinutes = getBrasiliaOffsetMinutes(new Date(wallClock));
  let instant = wallClock - offsetMinutes * 60_000;
  offsetMinutes = getBrasiliaOffsetMinutes(new Date(instant));
  instant = wallClock - offsetMinutes * 60_000;
  const normalized = new Date(instant);
  return Number.isNaN(normalized.getTime()) ? null : normalized.toISOString();
}
