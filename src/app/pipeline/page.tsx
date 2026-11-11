import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PipelineCardEditor } from "./pipeline-card-editor";

export const dynamic = "force-dynamic";

const stages = [
  { id: "triage", label: "Triagem" },
  { id: "analysis", label: "Em análise" },
  { id: "documentation", label: "Documentação" },
  { id: "proposal_sent", label: "Proposta enviada" },
  { id: "won", label: "Ganha" },
  { id: "lost", label: "Perdida" }
] as const;

type PipelineTender = {
  id: string;
  title: string;
  uf: string | null;
  estimated_value: number | null;
  proposal_close_at: string | null;
  agencies: { name: string }[] | { name: string } | null;
};
type ChecklistItem = { text: string; done: boolean };
type PipelineCard = {
  id: string;
  status: string;
  responsible_name: string;
  notes: string;
  checklist: ChecklistItem[];
  updated_at: string;
  tenders: PipelineTender | PipelineTender[] | null;
};

function tenderOf(card: PipelineCard): PipelineTender | null {
  return Array.isArray(card.tenders) ? card.tenders[0] ?? null : card.tenders;
}

function agencyOf(tender: PipelineTender): string {
  const agency = Array.isArray(tender.agencies) ? tender.agencies[0] : tender.agencies;
  return agency?.name ?? "Órgão não informado";
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ notice?: string; view?: string }> }) {
  const params = await searchParams;
  const archived = params.view === "archived";
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");
  const { data: organization } = await supabase.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!organization) redirect("/onboarding");
  const cardsQuery = supabase
    .from("pipeline_cards")
    .select("id,status,responsible_name,notes,checklist,updated_at,tenders!inner(id,title,uf,estimated_value,proposal_close_at,agencies(name))")
    .eq("organization_id", organization.id)
    .order("updated_at", { ascending: false });
  const { data: rawCards, error } = await (archived ? cardsQuery.not("archived_at", "is", null) : cardsQuery.is("archived_at", null));
  const cards = (rawCards ?? []) as unknown as PipelineCard[];

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
        <div><Link className="text-sm font-semibold text-blue-700" href="/">Edital Certo</Link><h1 className="mt-2 text-2xl font-bold">Pipeline</h1></div>
        <AppNavigation active="/pipeline" />
        <Link className="text-sm font-semibold text-blue-700" href="/dashboard">Ver oportunidades</Link>
      </header>
      {params.notice === "saved" ? <p aria-live="polite" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Alterações salvas.</p> : null}
      {params.notice === "save-error" || params.notice === "invalid" || error ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Não foi possível carregar ou salvar o pipeline. Confira sua permissão e tente novamente.</p> : null}
      <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Acompanhe cada oportunidade até o resultado. As alterações ficam salvas na sua organização.</p>
      <nav aria-label="Visualização do acompanhamento" className="mt-5 flex flex-wrap gap-3 text-sm font-semibold">
        <Link aria-current={!archived ? "page" : undefined} className="rounded-lg border px-3 py-2" href="/pipeline">Em acompanhamento</Link>
        <Link aria-current={archived ? "page" : undefined} className="rounded-lg border px-3 py-2" href="/pipeline?view=archived">Arquivados</Link>
      </nav>
      {cards.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <h2 className="text-lg font-semibold">{archived ? "Nenhum cartão arquivado" : "Seu pipeline está vazio"}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{archived ? "Cartões retirados do acompanhamento ficam aqui e podem ser restaurados." : "Na lista de oportunidades, toque em “Acompanhar” para adicionar uma licitação à Triagem."}</p>
          <Link className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href="/dashboard">Abrir oportunidades</Link>
        </section>
      ) : (
        <section aria-label="Etapas do pipeline" className="mt-6 grid snap-x grid-flow-col auto-cols-[minmax(290px,86vw)] gap-4 overflow-x-auto pb-4 md:grid-flow-row md:auto-cols-auto md:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage) => {
            const stageCards = cards.filter((card) => card.status === stage.id);
            return (
              <section aria-label={`${stage.label}: ${stageCards.length} oportunidades`} className="min-h-52 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50" key={stage.id}>
                <div className="mb-3 flex items-center justify-between px-1"><h2 className="font-semibold">{stage.label}</h2><span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold dark:bg-slate-700">{stageCards.length}</span></div>
                <div className="grid gap-3">
                  {stageCards.map((card) => {
                    const tender = tenderOf(card);
                    if (!tender) return null;
                    const checklist = Array.isArray(card.checklist) ? card.checklist : [];
                    return (
                      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" key={`${card.id}:${archived}`}>
                        <Link className="font-semibold hover:text-blue-700" href={`/tenders/${tender.id}`}>{tender.title}</Link>
                        <p className="mt-2 text-xs text-slate-500">{agencyOf(tender)} · {tender.uf ?? "UF não informada"}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{tender.estimated_value == null ? "Valor não informado" : tender.estimated_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{tender.proposal_close_at ? ` · Prazo ${new Date(tender.proposal_close_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</p>
                        <Link className="mt-3 inline-flex text-sm font-semibold text-blue-700" href={`/pipeline/${card.id}`}>Ver comentários</Link>
                        <PipelineCardEditor
                          isArchived={archived}
                          cardId={card.id}
                          organizationId={organization.id}
                          initialStatus={stage.id}
                          initialResponsible={card.responsible_name ?? ""}
                          initialNotes={card.notes ?? ""}
                          initialChecklist={checklist}
                        />
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      )}
    </main>
  );
}
