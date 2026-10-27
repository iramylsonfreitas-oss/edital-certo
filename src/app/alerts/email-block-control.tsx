"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function EmailBlockControl({ reason }: { reason: string }) {
  const router = useRouter();
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  async function resume() {
    if (!confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const result = await createSupabaseBrowserClient().rpc("resume_email_after_unsubscribe",{ p_confirm:true });
      if (result.error || result.data !== true) { setError("Não foi possível autorizar o recebimento. Tente novamente."); return; }
      router.refresh();
    } catch { setError("Não foi possível autorizar o recebimento. Tente novamente."); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950" aria-label="Bloqueio de recebimento">
    <h2 className="font-semibold">Recebimento por e-mail pausado</h2>
    {reason === "unsubscribe" ? <>
      <p className="mt-2 text-sm">Você cancelou os alertas pelo link de um e-mail. Para voltar, autorize novamente o recebimento. As preferências continuarão pausadas; retome apenas as desejadas.</p>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />Autorizo novamente o recebimento por e-mail das minhas preferências de alerta.</label>
      <button type="button" onClick={resume} disabled={!confirmed || busy} className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{busy ? "Salvando…" : "Autorizar recebimento"}</button>
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    </> : <p className="mt-2 text-sm">O recebimento foi bloqueado após uma devolução permanente ou reclamação. Revise o endereço confirmado da sua conta. O bloqueio exige verificação antes de uma nova ativação.</p>}
  </section>;
}
