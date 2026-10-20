import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { scoreTender, type InterestProfile, type TenderCandidate } from "@/lib/matching/score";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PanelTender = {
  id: string;
  title: string;
  object: string;
  items_search_text: string | null;
  uf: string | null;
  municipality_code: string | null;
  modality_code: string | null;
  estimated_value: number | null;
  exclusive_me_epp: boolean | null;
  proposal_close_at: string | null;
  agencies: { name: string; sphere: string | null }[] | { name: string; sphere: string | null } | null;
};
type PanelProfile = {
  required_keywords: string[];
  optional_keywords: string[];
  excluded_keywords: string[];
  ufs: string[];
  municipality_codes: string[];
  modality_codes: string[];
  agency_terms: string[];
  spheres: string[];
  minimum_value: number | null;
  maximum_value: number | null;
  exclusive_me_epp: boolean | null;
  cnae_codes: string[];
};

function agencyOf(tender: PanelTender) {
  return Array.isArray(tender.agencies) ? tender.agencies[0] : tender.agencies;
}

function currentTimestamp(): number {
  return new Date().getTime();
}

function asProfile(profile: PanelProfile): InterestProfile {
  return {
    requiredKeywords: profile.required_keywords ?? [], optionalKeywords: profile.optional_keywords ?? [], excludedKeywords: profile.excluded_keywords ?? [],
    ufs: profile.ufs ?? [], municipalityCodes: profile.municipality_codes ?? [], modalityCodes: profile.modality_codes ?? [], agencyTerms: profile.agency_terms ?? [],
    spheres: profile.spheres ?? [], minimumValue: profile.minimum_value, maximumValue: profile.maximum_value, exclusiveMeEpp: profile.exclusive_me_epp, cnaeCodes: profile.cnae_codes ?? []
  };
}

function candidateOf(tender: PanelTender): TenderCandidate {
  const agency = agencyOf(tender);
  return {
    title: tender.title, object: tender.object, itemText: tender.items_search_text ?? "", uf: tender.uf, municipalityCode: tender.municipality_code, modalityCode: tender.modality_code,
    agencyName: agency?.name ?? null, sphere: agency?.sphere ?? null, estimatedValue: tender.estimated_value, exclusiveMeEpp: tender.exclusive_me_epp, cnaeCodes: []
  };
}

function BarChart({ title, values, format = "count" }: { title: string; values: Array<{ label: string; value: number }>; format?: "count" | "currency" }) {
  const rows = values.slice(0, 8);
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const width = 560;
  const rowHeight = 34;
  const labelWidth = 140;
  const chartWidth = 350;
  const height = Math.max(110, rows.length * rowHeight + 22);
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <figcaption className="mb-3 font-semibold">{title}</figcaption>
      {rows.length ? <svg aria-label={title} className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        {rows.map((row, index) => {
          const y = 14 + index * rowHeight;
          const barWidth = Math.max(row.value > 0 ? 2 : 0, chartWidth * row.value / maxValue);
          const valueText = format === "currency" ? row.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : String(row.value);
          return <g key={row.label}><text fill="currentColor" fontSize="13" x="0" y={y + 14}>{row.label.slice(0, 20)}</text><rect fill="#dbeafe" height="18" rx="6" width={chartWidth} x={labelWidth} y={y} /><rect fill="#2563eb" height="18" rx="6" width={barWidth} x={labelWidth} y={y} /><text fill="currentColor" fontSize="12" x={labelWidth + chartWidth + 8} y={y + 14}>{valueText}</text></g>;
        })}
      </svg> : <p className="text-sm text-slate-500">Ainda não há dados para exibir.</p>}
    </figure>
  );
}

export default async function PanelPage() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");
  const { data: organization } = await supabase.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!organization) redirect("/onboarding");
  const [{ data: tenders }, { data: profiles }, { data: cards }, { data: feedback }] = await Promise.all([
    supabase.from("tenders").select("id,title,object,items_search_text,uf,municipality_code,modality_code,estimated_value,exclusive_me_epp,proposal_close_at,agencies(name,sphere)").eq("is_ti", true).not("proposal_close_at", "lt", new Date().toISOString()).order("proposal_close_at").limit(2000),
    supabase.from("interest_profiles").select("required_keywords,optional_keywords,excluded_keywords,ufs,municipality_codes,modality_codes,agency_terms,spheres,minimum_value,maximum_value,exclusive_me_epp,cnae_codes").eq("organization_id", organization.id).eq("is_active", true),
    supabase.from("pipeline_cards").select("tender_id,status,tenders!inner(estimated_value,proposal_close_at)").eq("organization_id", organization.id),
    supabase.from("tender_feedback").select("tender_id,state").eq("organization_id", organization.id).eq("user_id", authData.user.id)
  ]);
  const tenderRows = (tenders ?? []) as unknown as PanelTender[];
  const profileRows = (profiles ?? []) as unknown as PanelProfile[];
  const cardRows = (cards ?? []) as unknown as Array<{ tender_id: string; status: string; tenders: { estimated_value: number | null; proposal_close_at: string | null } | Array<{ estimated_value: number | null; proposal_close_at: string | null }> | null }>;
  const favoriteStates = new Map((feedback ?? []).map((row) => [row.tender_id, row.state]));
  const compatible = new Set<string>();
  for (const tender of tenderRows) {
    if (profileRows.some((profile) => scoreTender(asProfile(profile), candidateOf(tender)).matched)) compatible.add(tender.id);
  }
  const openTenders = tenderRows.filter((tender) => !favoriteStates.has(tender.id) || favoriteStates.get(tender.id) !== "discarded");
  const ufCounts = new Map<string, number>();
  for (const tender of openTenders) if (tender.uf) ufCounts.set(tender.uf, (ufCounts.get(tender.uf) ?? 0) + 1);
  const topUfs = [...ufCounts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const pipelineValues = new Map<string, number>();
  for (const card of cardRows) {
    const tender = Array.isArray(card.tenders) ? card.tenders[0] : card.tenders;
    pipelineValues.set(card.status, (pipelineValues.get(card.status) ?? 0) + (Number(tender?.estimated_value) || 0));
  }
  const stageLabels: Record<string, string> = { triage: "Triagem", analysis: "Em análise", documentation: "Documentação", proposal_sent: "Proposta enviada", won: "Ganha", lost: "Perdida" };
  const stageValues = [...pipelineValues].map(([status, value]) => ({ label: stageLabels[status] ?? status, value }));
  const activePipelineValue = cardRows.reduce((sum, card) => {
    if (card.status === "won" || card.status === "lost") return sum;
    const tender = Array.isArray(card.tenders) ? card.tenders[0] : card.tenders;
    return sum + (Number(tender?.estimated_value) || 0);
  }, 0);
  const now = currentTimestamp();
  const trackedTenderIds = new Set([
    ...[...favoriteStates].filter(([, state]) => state === "favorite").map(([tenderId]) => tenderId),
    ...cardRows.map((card) => card.tender_id)
  ]);
  const weekDeadlineCount = tenderRows.filter((tender) => tender.proposal_close_at && trackedTenderIds.has(tender.id) && new Date(tender.proposal_close_at).getTime() >= now && new Date(tender.proposal_close_at).getTime() <= now + 7 * 86_400_000).length;
  const wonCount = cardRows.filter((card) => card.status === "won").length;
  const lostCount = cardRows.filter((card) => card.status === "lost").length;
  const winRate = wonCount + lostCount ? Math.round(wonCount * 100 / (wonCount + lostCount)) : null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700"><div><Link className="text-sm font-semibold text-blue-700" href="/">Edital Certo</Link><h1 className="mt-2 text-2xl font-bold">Painel</h1></div><AppNavigation active="/panel" /><Link className="text-sm font-semibold text-blue-700" href="/dashboard">Ver oportunidades</Link></header>
      <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Visão geral da sua organização, calculada com as oportunidades e etapas atuais.</p>
      <section aria-label="Indicadores" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Compatíveis com os perfis ativos", value: compatible.size.toLocaleString("pt-BR") }, { label: "Valor estimado no pipeline ativo", value: activePipelineValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) }, { label: "Prazos acompanhados em 7 dias", value: String(weekDeadlineCount) }, { label: "Taxa de ganho", value: winRate === null ? "Sem resultados" : `${winRate}%` }].map((item) => <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" key={item.label}><p className="text-sm text-slate-600 dark:text-slate-300">{item.label}</p><p className="mt-2 text-2xl font-bold">{item.value}</p></article>)}
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2"><BarChart title="Oportunidades abertas por UF" values={topUfs} /><BarChart format="currency" title="Valor estimado por etapa do pipeline" values={stageValues} /></section>
      {!profileRows.length ? <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Cadastre um perfil de interesse para calcular oportunidades compatíveis. <Link className="font-semibold underline" href="/profiles/new">Criar perfil</Link></p> : null}
    </main>
  );
}
