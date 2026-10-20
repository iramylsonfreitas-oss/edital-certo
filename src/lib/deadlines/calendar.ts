import { toSafeHttpUrl } from "../security/safe-url";

export type DeadlineEvent = { id: string; title: string; deadline: string; agency: string; url: string | null };
const dayMs = 86_400_000;
const encoder = new TextEncoder();
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

// RFC 5545: fold by UTF-8 octets, without splitting a code point.
function foldLine(value: string): string {
  let line = "", bytes = 0;
  const lines: string[] = [];
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { lines.push(line); line = " "; bytes = 1; }
    line += character;
    bytes += size;
  }
  lines.push(line);
  return lines.join("\r\n");
}

export function createDeadlineCalendar(event: DeadlineEvent, includeReminders = true, now = new Date()): string {
  const start = new Date(event.deadline);
  if (!event.id || !Number.isFinite(start.getTime()) || !Number.isFinite(now.getTime()) || start <= now) {
    throw new Error("O prazo está encerrado ou não é válido.");
  }
  const safeUrl = event.url && !/[\r\n]/.test(event.url) ? toSafeHttpUrl(event.url) : null;
  const description = [event.agency, safeUrl ? `Fonte oficial: ${safeUrl}` : "", "Confira retificações e o prazo na fonte oficial."].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Edital Certo//Prazos//PT-BR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${encodeURIComponent(event.id)}@edital-certo`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 30 * 60_000))}`,
    `SUMMARY:${escapeText(`Prazo de licitação: ${event.title}`)}`, `DESCRIPTION:${escapeText(description)}`,
    ...(safeUrl ? [`URL:${safeUrl}`] : [])
  ];
  if (includeReminders) for (const days of [7, 3, 1]) {
    if (start.getTime() - days * dayMs <= now.getTime()) continue;
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:-P${days}D`,
      `DESCRIPTION:${escapeText(`Licitação encerra em ${days} ${days === 1 ? "dia" : "dias"}: ${event.title}`)}`, "END:VALARM");
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
