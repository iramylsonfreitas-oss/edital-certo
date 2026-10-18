"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PrivacyRequestForm() {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { error } = await supabase.from("data_subject_requests").insert({ user_id: data.user.id, request_type: "deletion", status: "pending" });
      if (error) throw error;
      setMessage("Solicitação registrada para análise. A conta permanece ativa até a conclusão do processo.");
      setConfirmed(false);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Não foi possível registrar a solicitação.";
      setMessage(messageText.includes("duplicate key") ? "Já há uma solicitação de exclusão em andamento." : messageText);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 rounded-2xl border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-slate-800" onSubmit={submit}>
      <h2 className="font-semibold">Solicitar exclusão dos dados</h2>
      <label className="mt-3 flex items-start gap-3 text-sm leading-6">
        <input checked={confirmed} className="mt-1" onChange={(event) => setConfirmed(event.target.checked)} required type="checkbox" />
        <span>Confirmo que desejo abrir uma solicitação de exclusão da minha conta. Entendo que o operador analisará obrigações legais e vínculos da organização antes de concluir.</span>
      </label>
      <button className="mt-4 rounded-lg border border-red-400 px-4 py-2 font-semibold text-red-800 disabled:opacity-50" disabled={busy || !confirmed} type="submit">Registrar solicitação</button>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </form>
  );
}
