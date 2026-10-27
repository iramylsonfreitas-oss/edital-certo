import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EvaluationAccessControl } from "./evaluation-access-control";
import { formatEvaluationActivity } from "@/lib/evaluation-activity";

export const dynamic = "force-dynamic";

export default async function AccessSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: evaluators, error } = await supabase.rpc("managed_evaluator_activity");

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <Link className="text-sm text-blue-700 dark:text-blue-300" href="/dashboard">← Oportunidades</Link>
      <h1 className="mt-4 text-3xl font-bold">Acessos de avaliação</h1>
      <p className="mt-3 text-slate-600 dark:text-slate-300">Controle quem pode continuar testando o sistema. Cada avaliador usa um espaço separado dos seus dados.</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">O bloqueio impede novas consultas e alterações, inclusive em sessões abertas. Ele não apaga os testes já salvos. Você pode reativar o acesso depois.</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">O último uso é registrado ao abrir páginas com a conta de avaliação, com precisão de até um minuto. Horários de Brasília. Atualize esta página para consultar novos acessos.</p>
      {error ? <p role="alert" className="mt-6 text-rose-700 dark:text-rose-300">Não foi possível consultar os acessos. Atualize a página para tentar novamente.</p>
        : evaluators?.length ? <ul className="mt-6 grid gap-4">{evaluators.map((evaluator: { user_id: string; email: string; label: string; enabled: boolean; last_access_at: string | null; last_sign_in_at: string | null }) => (
          <li className="rounded-xl border border-slate-300 p-5 dark:border-slate-700" key={evaluator.user_id}>
            <h2 className="text-lg font-semibold">{evaluator.label}</h2>
            <p className="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">{evaluator.email}</p>
            <dl className="mt-4 grid gap-2 text-sm">
              <div><dt className="font-semibold">Último uso registrado</dt><dd>{formatEvaluationActivity(evaluator.last_access_at) ?? "Ainda sem registro de uso desde esta atualização."}</dd></div>
              <div><dt className="font-semibold">Último login</dt><dd>{formatEvaluationActivity(evaluator.last_sign_in_at) ?? "Nenhum login registrado."}</dd></div>
            </dl>
            <EvaluationAccessControl userId={evaluator.user_id} initiallyEnabled={evaluator.enabled} />
          </li>
        ))}</ul> : <p className="mt-6">Nenhum acesso de avaliação sob sua gestão.</p>}
    </main>
  );
}
