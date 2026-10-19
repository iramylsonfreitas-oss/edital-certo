"use client";

type DeadlineEvent = { title: string; deadline: string; agency: string; url: string | null };

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function IcsDownloadButton({ event }: { event: DeadlineEvent }) {
  function download() {
    const start = new Date(event.deadline);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const uid = `${encodeURIComponent(event.title.slice(0, 48))}-${start.getTime()}@edital-certo`;
    const description = [event.agency, event.url ? `Fonte oficial: ${event.url}` : ""].filter(Boolean).join("\\n");
    const content = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Edital Certo//Prazos//PT-BR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      `UID:${uid}`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeIcs(`Prazo de licitação: ${event.title}`)}`, `DESCRIPTION:${escapeIcs(description)}`, "END:VEVENT", "END:VCALENDAR", ""
    ].join("\r\n");
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `prazo-licitacao-${start.toISOString().slice(0, 10)}.ics`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }

  return <button className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700" onClick={download} type="button">Exportar .ics</button>;
}
