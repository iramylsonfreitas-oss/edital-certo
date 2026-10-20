import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { deadlineState, DEADLINE_TIMEZONE } from "@/lib/deadlines/time";
import { IcsDownloadButton } from "./ics-download-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DeadlineTender = { id: string; title: string; uf: string | null; proposal_close_at: string | null; official_url: string | null; agencies: { name: string }[] | { name: string } | null };
type DeadlineRecord = { tender_id: string; tenders: DeadlineTender | DeadlineTender[] | null };
type DeadlineItem = { id: string; title: string; deadline: string; agency: string; uf: string; url: string | null };

function getTender(record: DeadlineRecord): DeadlineTender | null {
  return Array.isArray(record.tenders) ? record.tenders[0] ?? null : record.tenders;
}

export default async function DeadlinesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");
  const { data: organization } = await supabase.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!organization) redirect("/onboarding");
  const [{ data: favoriteRows }, { data: pipelineRows }] = await Promise.all([
    supabase.from("tender_feedback").select("tender_id,tenders!inner(id,title,uf,proposal_close_at,official_url,agencies(name))").eq("organization_id", organization.id).eq("user_id", authData.user.id).eq("state", "favorite"),
    supabase.from("pipeline_cards").select("tender_id,tenders!inner(id,title,uf,proposal_close_at,official_url,agencies(name))").eq("organization_id", organization.id).is("archived_at", null)
  ]);
  const records = [...(favoriteRows ?? []), ...(pipelineRows ?? [])] as unknown as DeadlineRecord[];
  const seen = new Set<string>();
  const now = new Date();
  const deadlines: DeadlineItem[] = records.flatMap((record) => {
    const tender = getTender(record);
    if (!tender?.proposal_close_at || seen.has(record.tender_id) || deadlineState(tender.proposal_close_at, now)?.expired !== false) return [];
    seen.add(record.tender_id);
    const agency = Array.isArray(tender.agencies) ? tender.agencies[0] : tender.agencies;
    return [{ id: tender.id, title: tender.title, deadline: tender.proposal_close_at, agency: agency?.name ?? "Órgão não informado", uf: tender.uf ?? "UF não informada", url: tender.official_url }];
  }).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  const groups = [
    { title: "Próximos 7 dias", items: deadlines.filter((item) => deadlineState(item.deadline, now)!.days <= 7) },
    { title: "De 8 a 14 dias", items: deadlines.filter((item) => deadlineState(item.deadline, now)!.days > 7 && deadlineState(item.deadline, now)!.days <= 14) },
    { title: "Após 14 dias", items: deadlines.filter((item) => deadlineState(item.deadline, now)!.days > 14) }
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
        <div><Link className="text-sm font-semibold text-blue-700" href="/">Edital Certo</Link><h1 className="mt-2 text-2xl font-bold">Prazos</h1></div>
        <AppNavigation active="/deadlines" />
        <Link className="text-sm font-semibold text-blue-700" href="/dashboard">Ver oportunidades</Link>
      </header>
      <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Prazos em aberto das oportunidades favoritas e dos cartões em acompanhamento. Horário de Brasília.</p>
      {deadlines.length ? <div className="mt-6 grid gap-8">{groups.map((group) => <section key={group.title}><h2 className="text-lg font-bold">{group.title} <span className="text-sm font-normal text-slate-500">({group.items.length})</span></h2>{group.items.length ? <ul className="mt-3 grid gap-3">{group.items.map((item) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" key={item.id}><div className="min-w-0 flex-1"><Link className="font-semibold hover:text-blue-700" href={`/tenders/${item.id}`}>{item.title}</Link><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.agency} · {item.uf}</p><p className="mt-1 text-sm font-semibold text-rose-700 dark:text-rose-300">Encerra {new Date(item.deadline).toLocaleString("pt-BR", { timeZone: DEADLINE_TIMEZONE })}</p></div><IcsDownloadButton event={{ id: item.id, title: item.title, deadline: item.deadline, agency: item.agency, url: item.url }} /></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Nenhum prazo neste período.</p>}</section>)}</div> : <section className="mt-8 rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"><h2 className="font-semibold">Ainda não há prazos acompanhados</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Favorite uma licitação ou adicione-a ao pipeline para ver o prazo aqui.</p><Link className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href="/dashboard">Abrir oportunidades</Link></section>}
    </main>
  );
}
