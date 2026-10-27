import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrivacyRequestForm } from "./privacy-request-form";

export const dynamic = "force-dynamic";

export default async function PrivacySettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: requests } = await supabase.from("data_subject_requests").select("id,request_type,status,created_at,completed_at").order("created_at", { ascending: false }).limit(20);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <Link className="text-sm text-blue-700" href="/dashboard">← Oportunidades</Link>
      <h1 className="mt-4 text-3xl font-bold">Privacidade e seus dados</h1>
      <Link className="mt-3 inline-block text-blue-700 underline dark:text-blue-300" href="/settings/access">Gerenciar acessos de avaliação</Link>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Exporte os dados associados à sua conta ou solicite a exclusão.</p>
      <a className="mt-6 inline-flex rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white" href="/api/privacy/export">Baixar meus dados (JSON)</a>
      <PrivacyRequestForm />
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Solicitações recentes</h2>
        {requests?.length ? <ul className="mt-3 grid gap-2">{requests.map((request) => <li className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700" key={request.id}>{request.request_type === "deletion" ? "Exclusão" : "Exportação"} · {request.status} · {new Date(request.created_at).toLocaleString("pt-BR")}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Nenhuma solicitação pendente.</p>}
      </section>
      <p className="mt-8 text-sm text-slate-500">A exclusão é revisada pelo operador para respeitar obrigações legais e remover corretamente a conta, as organizações e os documentos vinculados.</p>
    </main>
  );
}
