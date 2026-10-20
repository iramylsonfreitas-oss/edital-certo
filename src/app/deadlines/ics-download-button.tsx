"use client";

import { useState } from "react";
import { createDeadlineCalendar, type DeadlineEvent } from "@/lib/deadlines/calendar";

export function IcsDownloadButton({ event }: { event: DeadlineEvent }) {
  const [includeReminders, setIncludeReminders] = useState(true);
  const [message, setMessage] = useState("");
  function download() {
    try {
      const content = createDeadlineCalendar(event, includeReminders);
      const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `prazo-licitacao-${new Date(event.deadline).toISOString().slice(0, 10)}.ics`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage("Arquivo preparado. Importe no seu calendário e confira as notificações.");
    } catch {
      setMessage("Não foi possível exportar: confira se o prazo continua aberto e atualize a página.");
    }
  }

  return <div className="grid max-w-sm gap-2">
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={includeReminders} onChange={(event) => setIncludeReminders(event.target.checked)} className="mt-1" />Incluir lembretes de 7, 3 e 1 dia</label>
    <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700" onClick={download} type="button">Adicionar ao calendário (.ics)</button>
    <p className="text-xs text-slate-500">Inclui apenas lembretes futuros. A importação e as notificações dependem do aplicativo de calendário.</p>
    <p aria-live="polite" className="text-xs text-slate-500">{message}</p>
  </div>;
}
