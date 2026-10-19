"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type OrganizationOption = { id: string; name: string };
type Feedback = { organization_id: string; state: "favorite" | "discarded" };

export function FeedbackControls({
  tenderId,
  organizations,
  feedback
}: {
  tenderId: string;
  organizations: OrganizationOption[];
  feedback: Feedback[];
}) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const currentFeedback = feedback.find((item) => item.organization_id === organizationId)?.state ?? null;

  async function save(state: "favorite" | "discarded" | null) {
    if (!organizationId) return;
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const query = supabase.from("tender_feedback");
      const result = state
        ? await query.upsert({ organization_id: organizationId, user_id: authData.user.id, tender_id: tenderId, state }, { onConflict: "organization_id,user_id,tender_id" })
        : await query.delete().eq("organization_id", organizationId).eq("user_id", authData.user.id).eq("tender_id", tenderId);
      if (result.error) throw result.error;
      setMessage(state === "favorite" ? "Licitação favoritada." : state === "discarded" ? "Licitação descartada." : "Status removido.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Ações da oportunidade" className="mt-8 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-end gap-3">
        {organizations.length > 1 && (
          <label className="text-sm font-medium">Organização
            <select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" onChange={(event) => setOrganizationId(event.target.value)} value={organizationId}>
              {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        )}
        <button className={`rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${currentFeedback === "favorite" ? "bg-amber-100 text-amber-900" : "border border-slate-300"}`} disabled={busy || !organizationId} onClick={() => void save(currentFeedback === "favorite" ? null : "favorite")} type="button">{currentFeedback === "favorite" ? "Remover favorito" : "Favoritar"}</button>
        <button className={`rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${currentFeedback === "discarded" ? "bg-red-100 text-red-900" : "border border-slate-300"}`} disabled={busy || !organizationId} onClick={() => void save(currentFeedback === "discarded" ? null : "discarded")} type="button">{currentFeedback === "discarded" ? "Reincluir" : "Descartar"}</button>
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-600 dark:text-slate-300">{message || (organizations.length === 0 ? "Crie uma organização no onboarding para salvar oportunidades." : "")}</p>
    </section>
  );
}
