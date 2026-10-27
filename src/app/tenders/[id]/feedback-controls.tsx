"use client";

import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type OrganizationOption = { id: string; name: string };
type Feedback = { organization_id: string; state: "favorite" | "discarded" };

export function FeedbackControls({
  tenderId,
  organizations,
  feedback,
  followedOrganizations
}: {
  tenderId: string;
  organizations: OrganizationOption[];
  feedback: Feedback[];
  followedOrganizations: string[];
}) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [followed, setFollowed] = useState(followedOrganizations);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedbackByOrganization, setFeedbackByOrganization] = useState<Record<string, Feedback["state"] | null>>({});
  const currentFeedback = Object.hasOwn(feedbackByOrganization, organizationId)
    ? feedbackByOrganization[organizationId]
    : feedback.find((item) => item.organization_id === organizationId && item.state === "favorite")?.state ?? feedback.find((item) => item.organization_id === organizationId)?.state ?? null;

  async function save(state: "favorite" | "discarded" | null) {
    if (!organizationId) return;
    const previousFeedback = currentFeedback;
    setBusy(true);
    setMessage("");
    setFeedbackByOrganization((current) => ({ ...current, [organizationId]: state }));
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.rpc("set_tender_group_feedback", {
        p_organization_id: organizationId, p_tender_id: tenderId, p_state: state
      });
      if (result.error) throw result.error;
      setMessage(state === "favorite" ? "Licitação favoritada." : state === "discarded" ? "Licitação descartada." : "Status removido.");
    } catch (error) {
      setFeedbackByOrganization((current) => ({ ...current, [organizationId]: previousFeedback }));
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o status.");
    } finally {
      setBusy(false);
    }
  }

  async function follow() {
    if (busy || !organizationId) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().rpc("follow_tender", { p_organization_id: organizationId, p_tender_id: tenderId });
      if (error) throw new Error("Não foi possível acompanhar este edital. Verifique sua sessão e permissão.");
      setFollowed(current => [...current, organizationId]);
      setMessage("Acompanhamento ativado na etapa Triagem.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível acompanhar."); }
    finally { setBusy(false); }
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
        {followed.includes(organizationId)
          ? <Link className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href="/pipeline">Abrir no pipeline</Link>
          : <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy || !organizationId} onClick={() => void follow()} type="button">Acompanhar</button>}
        <button className={`rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${currentFeedback === "favorite" ? "bg-amber-100 text-amber-900" : "border border-slate-300"}`} disabled={busy || !organizationId} onClick={() => void save(currentFeedback === "favorite" ? null : "favorite")} type="button">{currentFeedback === "favorite" ? "Remover favorito" : "Favoritar"}</button>
        <button className={`rounded-lg px-4 py-2 font-semibold disabled:opacity-50 ${currentFeedback === "discarded" ? "bg-red-100 text-red-900" : "border border-slate-300"}`} disabled={busy || !organizationId} onClick={() => void save(currentFeedback === "discarded" ? null : "discarded")} type="button">{currentFeedback === "discarded" ? "Reincluir" : "Descartar"}</button>
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-slate-600 dark:text-slate-300">{message || (organizations.length === 0 ? "Crie uma organização no onboarding para salvar oportunidades." : "")}</p>
    </section>
  );
}
