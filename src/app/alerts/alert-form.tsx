"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const alertSchema = z.object({
  organizationId: z.string().uuid(),
  profileId: z.string().uuid().nullable(),
  frequency: z.enum(["daily", "immediate"]),
  minimumScore: z.number().int().min(0).max(100),
  emailEnabled: z.boolean(),
  timezone: z.string().min(1).max(80),
  dailySendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
}).refine((value) => value.frequency !== "immediate" || value.minimumScore >= 80, {
  message: "Alertas imediatos exigem score mínimo de 80.",
  path: ["minimumScore"]
});

type OrganizationOption = { id: string; name: string };
type ProfileOption = { id: string; organization_id: string; name: string };

export function AlertForm({ organizations, profiles }: { organizations: OrganizationOption[]; profiles: ProfileOption[] }) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [profileId, setProfileId] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "immediate">("daily");
  const [minimumScore, setMinimumScore] = useState("80");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [dailySendTime, setDailySendTime] = useState("08:00");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const organizationProfiles = profiles.filter((profile) => profile.organization_id === organizationId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const parsed = alertSchema.safeParse({
      organizationId,
      profileId: profileId || null,
      frequency,
      minimumScore: Number(minimumScore),
      emailEnabled,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
      dailySendTime
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Revise os campos do alerta.");
      setBusy(false);
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("alerts").insert({
        organization_id: parsed.data.organizationId,
        profile_id: parsed.data.profileId,
        frequency: parsed.data.frequency,
        minimum_score: parsed.data.minimumScore,
        email_enabled: parsed.data.emailEnabled,
        telegram_enabled: false,
        timezone: parsed.data.timezone,
        daily_send_time: parsed.data.dailySendTime,
        is_enabled: true
      });
      if (error) throw error;
      setMessage("Alerta salvo. A entrega depende da configuração do serviço de e-mail.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o alerta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-medium">Organização
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => { setOrganizationId(event.target.value); setProfileId(""); }} value={organizationId}>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Perfil (opcional)
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setProfileId(event.target.value)} value={profileId}>
          <option value="">Todos os perfis</option>
          {organizationProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Frequência
        <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setFrequency(event.target.value as "daily" | "immediate")} value={frequency}>
          <option value="daily">Resumo diário</option>
          <option value="immediate">Imediato</option>
        </select>
      </label>
      <label className="text-sm font-medium">Score mínimo (0–100)
        <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" max="100" min="0" onChange={(event) => setMinimumScore(event.target.value)} type="number" value={minimumScore} />
      </label>
      <label className="text-sm font-medium">Horário do resumo diário
        <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setDailySendTime(event.target.value)} type="time" value={dailySendTime} />
      </label>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} type="checkbox" />
        Receber por e-mail
      </label>
      <div className="sm:col-span-2">
        <button className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={busy || organizations.length === 0} type="submit">Salvar alerta</button>
        <p aria-live="polite" className="mt-3 min-h-6 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      </div>
    </form>
  );
}
