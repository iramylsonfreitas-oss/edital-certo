import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AlertForm } from "./alert-form";
import { AppNavigation } from "@/components/app-navigation";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const [{ data: alerts }, { data: organizations }, { data: profiles }] = await Promise.all([
    supabase
    .from("alerts")
    .select("id,frequency,minimum_score,email_enabled,telegram_enabled,timezone,daily_send_time,is_enabled")
    .order("created_at"),
    supabase.from("organizations").select("id,name").order("created_at"),
    supabase.from("interest_profiles").select("id,organization_id,name").order("name")
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700"><div><Link className="text-sm text-blue-700" href="/dashboard">← Oportunidades</Link><h1 className="mt-3 text-3xl font-bold">Configurações de alerta</h1></div><AppNavigation active="/dashboard" /></header>
      <AlertForm organizations={organizations ?? []} profiles={profiles ?? []} />
      {alerts?.length ? (
        <ul className="mt-6 grid gap-3">
          {alerts.map((alert) => (
            <li className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" key={alert.id}>
              <strong>{alert.frequency === "daily" ? "Resumo diário" : "Alerta imediato"}</strong>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Score mínimo {alert.minimum_score} · E-mail {alert.email_enabled ? "ativo" : "inativo"} · {alert.timezone}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6">Ainda não há alertas configurados para esta organização.</p>
      )}
    </main>
  );
}

