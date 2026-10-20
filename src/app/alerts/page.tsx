import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AlertForm } from "./alert-form";
import { AppNavigation } from "@/components/app-navigation";
import { AlertControls } from "./alert-controls";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const [alertResult, organizationResult, profileResult, membershipResult, queueResult] = await Promise.all([
    supabase
    .from("alerts")
    .select("id,organization_id,profile_id,frequency,minimum_score,email_enabled,timezone,daily_send_time,is_enabled,email_consent_at")
    .eq("recipient_user_id", data.user.id)
    .order("created_at"),
    supabase.from("organizations").select("id,name").order("created_at"),
    supabase.from("interest_profiles").select("id,organization_id,name").order("name"),
    supabase.from("memberships").select("organization_id,role").eq("user_id", data.user.id),
    supabase.from("email_alert_queue").select("id", { count: "exact", head: true }).eq("recipient_user_id", data.user.id).eq("status", "prepared")
  ]);
  const alerts = alertResult.data ?? [];
  const organizations = organizationResult.data ?? [];
  const profiles = profileResult.data ?? [];
  const canConfigure = !organizationResult.error && !profileResult.error && !membershipResult.error;
  const editableIds = new Set((membershipResult.data ?? []).filter((membership) => membership.role === "admin" || membership.role === "analyst").map((membership) => membership.organization_id));
  const editableOrganizations = organizations.filter((organization) => editableIds.has(organization.id));

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700"><div><Link className="text-sm text-blue-700" href="/dashboard">← Oportunidades</Link><h1 className="mt-3 text-3xl font-bold">Configurações de alerta</h1></div><AppNavigation active="/dashboard" /></header>
      <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950" aria-label="Situação do envio por e-mail">
        <h2 className="font-semibold">Envio por e-mail aguardando ativação</h2>
        <p className="mt-2 text-sm">O sistema já prepara oportunidades compatíveis com seus perfis de TI e preferências autorizadas. Os e-mails ainda não serão enviados: faltam a configuração do remetente e a conclusão da rotina de entrega.</p>
        <p className="mt-2 text-sm">As preferências são pessoais. O destinatário será o e-mail confirmado da sua própria conta.</p>
      </section>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" aria-label="Preparação de alertas">
        <h2 className="font-semibold">Preparação de alertas</h2>
        <Link className="mt-2 inline-block text-sm font-semibold text-blue-700 underline dark:text-blue-300" href="/alerts/preview">Ver prévia do e-mail</Link>
        <p className="mt-2 text-sm">{queueResult.error ? "Não foi possível consultar sua fila agora. Atualize a página para tentar novamente." : `${queueResult.count ?? 0} oportunidade(s) em preparação para você. Nenhum e-mail enviado por esta rotina.`}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">A preparação ocorre gradualmente e confere os prazos e as autorizações. Os registros podem mudar após uma atualização ou pausa. Para começar, salve um <Link className="text-blue-700 underline dark:text-blue-300" href="/profiles">perfil de interesse</Link> com critérios positivos e uma preferência de e-mail.</p>
      </section>
      {canConfigure && editableOrganizations.length > 0 ? <AlertForm organizations={editableOrganizations} profiles={profiles} /> : <p className="mt-6 text-sm">{canConfigure ? "A criação de preferências exige acesso de administrador ou analista a uma organização." : "Não foi possível carregar as opções. Atualize a página para tentar novamente."}</p>}
      <h2 className="mt-8 text-xl font-semibold">Minhas preferências</h2>
      {alertResult.error ? <p className="mt-4 rounded-xl border border-red-300 p-5">Não foi possível carregar suas preferências. Atualize a página para tentar novamente.</p> : alerts.length ? (
        <ul className="mt-6 grid gap-3">
          {alerts.map((alert) => (
            <li className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" key={alert.id}>
              <div className="flex flex-wrap items-center gap-3"><strong>{alert.frequency === "daily" ? "Resumo diário" : "Alerta imediato"}</strong><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800">{alert.is_enabled ? "Salva · aguardando envio" : "Pausada"}</span></div>
              <p className="mt-2 text-sm">{organizations.find((organization) => organization.id === alert.organization_id)?.name ?? "Organização"} · {alert.profile_id ? profiles.find((profile) => profile.id === alert.profile_id)?.name ?? "Perfil" : "Todos os perfis"}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Score mínimo {alert.minimum_score} · {alert.frequency === "daily" ? `${alert.daily_send_time.slice(0, 5)} · ` : ""}{alert.timezone}
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{alert.email_enabled && alert.email_consent_at ? "Recebimento por e-mail autorizado por você." : "Recebimento por e-mail não autorizado."}</p>
              <AlertControls key={`${alert.id}:${alert.is_enabled}`} id={alert.id} enabled={alert.is_enabled} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6">Você ainda não salvou preferências de alerta.</p>
      )}
    </main>
  );
}

