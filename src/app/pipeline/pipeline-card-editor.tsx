"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const stages = [
  { id: "triage", label: "Triagem" },
  { id: "analysis", label: "Em análise" },
  { id: "documentation", label: "Documentação" },
  { id: "proposal_sent", label: "Proposta enviada" },
  { id: "won", label: "Ganha" },
  { id: "lost", label: "Perdida" }
] as const;

type Stage = typeof stages[number]["id"];
type ChecklistItem = { text: string; done: boolean };

export function PipelineCardEditor({
  cardId,
  organizationId,
  initialStatus,
  initialResponsible,
  initialNotes,
  initialChecklist
}: {
  cardId: string;
  organizationId: string;
  initialStatus: Stage;
  initialResponsible: string;
  initialNotes: string;
  initialChecklist: ChecklistItem[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Stage>(initialStatus);
  const [responsibleName, setResponsibleName] = useState(initialResponsible);
  const [notes, setNotes] = useState(initialNotes);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function addChecklistItem() {
    const text = newItem.trim();
    if (!text || text.length > 180 || checklist.length >= 50) return;
    setChecklist((items) => [...items, { text, done: false }]);
    setNewItem("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (responsibleName.length > 120 || notes.length > 10_000 || checklist.length > 50) {
      setMessage("Revise os limites dos campos antes de salvar.");
      return;
    }
    setBusy(true);
    setMessage("Salvando…");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("pipeline_cards").update({
        status,
        responsible_name: responsibleName.trim(),
        notes,
        checklist
      }).eq("id", cardId).eq("organization_id", organizationId);
      if (error) throw error;
      setMessage("Cartão salvo.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o cartão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 grid gap-3" onSubmit={(event) => void save(event)}>
      <label className="text-xs font-semibold">Mover para…
        <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" onChange={(event) => setStatus(event.target.value as Stage)} value={status}>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold">Responsável
        <input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" maxLength={120} onChange={(event) => setResponsibleName(event.target.value)} placeholder="Nome da pessoa" value={responsibleName} />
      </label>
      <label className="text-xs font-semibold">Anotações
        <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" maxLength={10_000} onChange={(event) => setNotes(event.target.value)} placeholder="Próxima ação, contexto ou observações" value={notes} />
      </label>
      {checklist.length ? <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold">Checklist</legend>{checklist.map((item, index) => <label className="flex items-start gap-2 text-sm" key={`${index}-${item.text}`}><input checked={item.done} className="mt-1" onChange={(event) => setChecklist((items) => items.map((entry, entryIndex) => entryIndex === index ? { ...entry, done: event.target.checked } : entry))} type="checkbox" /><span>{item.text}</span></label>)}</fieldset> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="text-xs font-semibold">Adicionar ao checklist
          <input className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900" maxLength={180} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addChecklistItem(); } }} placeholder="Ex.: Confirmar documentos" value={newItem} />
        </label>
        <button className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-600" disabled={!newItem.trim() || checklist.length >= 50} onClick={addChecklistItem} type="button">Adicionar</button>
      </div>
      <button className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60" disabled={busy} type="submit">{busy ? "Salvando…" : "Salvar cartão"}</button>
      <p aria-live="polite" className="min-h-5 text-xs text-slate-500 dark:text-slate-400">{message}</p>
    </form>
  );
}
