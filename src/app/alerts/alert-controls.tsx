"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AlertControls({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState("");

  async function change(remove = false) {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const result = remove
        ? await supabase.from("alerts").delete().eq("id", id).select("id").single()
        : await supabase.from("alerts").update({ is_enabled: !enabled }).eq("id", id).select("id").single();
      if (result.error) throw result.error;
      setConfirmDelete(false);
      setMessage(remove ? "Preferência excluída." : enabled ? "Preferência pausada." : "Preferência retomada. O envio ainda aguarda ativação do serviço.");
      router.refresh();
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? error.code : "";
      setMessage(code === "23514"
        ? "Não foi possível retomar: confira os recursos do seu plano. Você pode excluir esta preferência e criar um resumo diário."
        : "Não foi possível alterar a preferência. Atualize a página e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60" disabled={busy} onClick={() => change()} type="button">{enabled ? "Pausar" : "Retomar"}</button>
        {confirmDelete ? <>
          <span className="text-sm">Excluir esta preferência?</span>
          <button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => change(true)} type="button">Confirmar exclusão</button>
          <button className="px-3 py-2 text-sm underline" disabled={busy} onClick={() => setConfirmDelete(false)} type="button">Cancelar</button>
        </> : <button className="px-3 py-2 text-sm text-red-700 underline dark:text-red-400" disabled={busy} onClick={() => setConfirmDelete(true)} type="button">Excluir</button>}
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </div>
  );
}
