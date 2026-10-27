"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function EvaluationAccessControl({ userId, initiallyEnabled }: { userId: string; initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("set_evaluator_access", { target_user: userId, access_enabled: !enabled });
      if (error || typeof data !== "boolean") throw new Error("Não foi possível alterar o acesso. Atualize a página e tente novamente.");
      setEnabled(data);
      setMessage(data ? "Acesso reativado." : "Acesso bloqueado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível alterar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="font-semibold">Status: {enabled ? "Ativo" : "Bloqueado"}</p>
      <button className="mt-3 min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={busy} onClick={() => void toggle()} type="button">
        {busy ? "Salvando…" : enabled ? "Bloquear acesso" : "Reativar acesso"}
      </button>
      <p aria-live="polite" className="mt-2 min-h-6 text-sm">{message}</p>
    </div>
  );
}
