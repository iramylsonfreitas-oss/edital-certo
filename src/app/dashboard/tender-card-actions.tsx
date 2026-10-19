"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type FeedbackState = "favorite" | "discarded" | null;
type ListMode = "all" | "favorites" | "discarded";

export function FavoriteCount({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ delta: number }>).detail;
      setCount((current) => Math.max(0, current + detail.delta));
    };
    window.addEventListener("tender-favorite-count-change", handleChange);
    return () => window.removeEventListener("tender-favorite-count-change", handleChange);
  }, []);

  return <>{count.toLocaleString("pt-BR")}</>;
}

export function TenderOpportunityCard({
  tenderId,
  organizationId,
  initialFeedback,
  initiallyInPipeline,
  listMode,
  children
}: {
  tenderId: string;
  organizationId: string;
  initialFeedback: FeedbackState;
  initiallyInPipeline: boolean;
  listMode: ListMode;
  children: ReactNode;
}) {
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [inPipeline, setInPipeline] = useState(initiallyInPipeline);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(true);

  async function saveFeedback(nextState: FeedbackState) {
    if (busy) return;
    const previousState = feedback;
    const shouldHide = listMode === "discarded" ? nextState !== "discarded" : nextState === "discarded";
    setFeedback(nextState);
    setVisible(!shouldHide);
    setMessage(shouldHide ? "Oportunidade removida desta lista." : "Salvando…");
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");

      const key = {
        organization_id: organizationId,
        user_id: authData.user.id,
        tender_id: tenderId
      };
      const result = nextState
        ? await supabase.from("tender_feedback").upsert(
          { ...key, state: nextState },
          { onConflict: "organization_id,user_id,tender_id" }
        )
        : await supabase.from("tender_feedback").delete().match(key);
      if (result.error) throw result.error;

      const delta = Number(nextState === "favorite") - Number(previousState === "favorite");
      if (delta) window.dispatchEvent(new CustomEvent("tender-favorite-count-change", { detail: { delta } }));
      setMessage(shouldHide ? "Status salvo; a oportunidade saiu desta lista." : "Alteração salva.");
    } catch (error) {
      setFeedback(previousState);
      setVisible(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function addToPipeline() {
    if (busy || inPipeline) return;
    setBusy(true);
    setMessage("Salvando no pipeline…");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { error } = await supabase.from("pipeline_cards").insert({
        organization_id: organizationId,
        tender_id: tenderId,
        status: "triage",
        created_by: authData.user.id
      });
      if (error) {
        if (error.code === "23505") {
          setInPipeline(true);
          setMessage("Esta oportunidade já está no pipeline.");
          return;
        }
        throw error;
      }
      setInPipeline(true);
      setMessage("Oportunidade adicionada à Triagem.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível adicionar ao pipeline.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return <></>;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800">
      {children}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          aria-pressed={feedback === "favorite"}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-700"
          disabled={busy}
          onClick={() => void saveFeedback(feedback === "favorite" ? null : "favorite")}
          type="button"
        >
          {feedback === "favorite" ? "★ Favorita · remover" : "☆ Favoritar"}
        </button>
        {listMode === "discarded" ? (
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60 dark:border-slate-600" disabled={busy} onClick={() => void saveFeedback(null)} type="button">
            Restaurar
          </button>
        ) : (
          <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-slate-600 dark:text-rose-300 dark:hover:bg-rose-950" disabled={busy} onClick={() => void saveFeedback("discarded")} type="button">
            Descartar
          </button>
        )}
        {inPipeline ? (
          <Link className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800" href="/pipeline">Abrir no pipeline</Link>
        ) : (
          <button className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60" disabled={busy} onClick={() => void addToPipeline()} type="button">
            Acompanhar
          </button>
        )}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-slate-500 dark:text-slate-400">{message}</p>
    </article>
  );
}
