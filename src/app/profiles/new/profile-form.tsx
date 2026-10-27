"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const profileFormSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  segmentKey: z.enum(["it", "health"]),
  requiredKeywords: z.array(z.string()),
  optionalKeywords: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
  ufs: z.array(z.string().regex(/^[A-Z]{2}$/)),
  municipalityCodes: z.array(z.string()),
  modalityCodes: z.array(z.string()),
  agencyTerms: z.array(z.string()),
  spheres: z.array(z.string()),
  minimumValue: z.number().nonnegative().nullable(),
  maximumValue: z.number().nonnegative().nullable(),
  cnaeCodes: z.array(z.string()),
  exclusiveMeEpp: z.boolean().nullable()
});

type OrganizationOption = { id: string; name: string };
type SegmentOption = { segment_key: string; name: string };
type SourceProfile = {
  id: string;
  organization_id: string;
  name: string;
  segment_key: string;
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
  cnae_codes: string[];
  exclusive_me_epp: boolean | null;
};

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function InterestProfileForm({
  organizations,
  segments,
  sourceProfiles,
  cloneProfileId,
  editableProfileId
}: {
  organizations: OrganizationOption[];
  segments: SegmentOption[];
  sourceProfiles: SourceProfile[];
  cloneProfileId: string | null;
  editableProfileId: string | null;
}) {
  const router = useRouter();
  const editableProfile = sourceProfiles.find((profile) => profile.id === editableProfileId) ?? null;
  const clonedProfile = sourceProfiles.find((profile) => profile.id === cloneProfileId) ?? null;
  const initialProfile = editableProfile ?? clonedProfile;

  const [organizationId, setOrganizationId] = useState(initialProfile?.organization_id ?? organizations[0]?.id ?? "");
  const [name, setName] = useState(initialProfile ? `${initialProfile.name}${editableProfile ? "" : " (cópia)"}` : "");
  const [segmentKey, setSegmentKey] = useState(initialProfile?.segment_key ?? "it");
  const [requiredKeywords, setRequiredKeywords] = useState(initialProfile?.required_keywords.join(", ") ?? "");
  const [optionalKeywords, setOptionalKeywords] = useState(initialProfile?.optional_keywords.join(", ") ?? "");
  const [excludedKeywords, setExcludedKeywords] = useState(initialProfile?.excluded_keywords.join(", ") ?? "");
  const [ufs, setUfs] = useState(initialProfile?.ufs.join(", ") ?? "");
  const [municipalities, setMunicipalities] = useState(initialProfile?.municipality_codes.join(", ") ?? "");
  const [modalities, setModalities] = useState(initialProfile?.modality_codes.join(", ") ?? "");
  const [agencyTerms, setAgencyTerms] = useState(initialProfile?.agency_terms.join(", ") ?? "");
  const [spheres, setSpheres] = useState(initialProfile?.spheres.join(", ") ?? "");
  const [minimumValue, setMinimumValue] = useState(initialProfile?.minimum_value?.toString() ?? "");
  const [maximumValue, setMaximumValue] = useState(initialProfile?.maximum_value?.toString() ?? "");
  const [cnaeCodes, setCnaeCodes] = useState(initialProfile?.cnae_codes.join(", ") ?? "");
  const [exclusiveMeEpp, setExclusiveMeEpp] = useState(
    initialProfile?.exclusive_me_epp == null ? "" : String(initialProfile.exclusive_me_epp)
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const profileInput = {
      organizationId,
      name,
      segmentKey,
      requiredKeywords: splitList(requiredKeywords),
      optionalKeywords: splitList(optionalKeywords),
      excludedKeywords: splitList(excludedKeywords),
      ufs: splitList(ufs).map((uf) => uf.toUpperCase()),
      municipalityCodes: splitList(municipalities),
      modalityCodes: splitList(modalities),
      agencyTerms: splitList(agencyTerms),
      spheres: splitList(spheres),
      minimumValue: parseValue(minimumValue),
      maximumValue: parseValue(maximumValue),
      cnaeCodes: splitList(cnaeCodes),
      exclusiveMeEpp: exclusiveMeEpp === "" ? null : exclusiveMeEpp === "true"
    };
    const parsed = profileFormSchema.safeParse(profileInput);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Revise os campos.");
      setBusy(false);
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const profileValues = {
        organization_id: parsed.data.organizationId,
        name: parsed.data.name,
        segment_key: parsed.data.segmentKey,
        required_keywords: parsed.data.requiredKeywords,
        optional_keywords: parsed.data.optionalKeywords,
        excluded_keywords: parsed.data.excludedKeywords,
        ufs: parsed.data.ufs,
        municipality_codes: parsed.data.municipalityCodes,
        modality_codes: parsed.data.modalityCodes,
        agency_terms: parsed.data.agencyTerms,
        spheres: parsed.data.spheres,
        minimum_value: parsed.data.minimumValue,
        maximum_value: parsed.data.maximumValue,
        cnae_codes: parsed.data.cnaeCodes,
        exclusive_me_epp: parsed.data.exclusiveMeEpp
      };
      const { error } = editableProfile
        ? await supabase.from("interest_profiles").update(profileValues).eq("id", editableProfile.id)
        : await supabase.from("interest_profiles").insert({ ...profileValues, created_by: authData.user.id });
      if (error) throw error;
      router.push("/profiles");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o perfil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 space-y-6" onSubmit={submit}>
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Organização
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setOrganizationId(event.target.value)} value={organizationId}>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          Nome do perfil
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" maxLength={120} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} />
        </label>
        <label className="text-sm font-medium">
          Segmento
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setSegmentKey(event.target.value)} value={segmentKey}>
            {segments.map((segment) => <option key={segment.segment_key} value={segment.segment_key}>{segment.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">
          UFs (vazio = Brasil todo)
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setUfs(event.target.value)} placeholder="AM, SP, DF" value={ufs} />
        </label>
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2">
        <label className="text-sm font-medium">Palavras obrigatórias<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setRequiredKeywords(event.target.value)} placeholder="notebook, servidor" value={requiredKeywords} /></label>
        <label className="text-sm font-medium">Palavras opcionais<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setOptionalKeywords(event.target.value)} placeholder="suporte, licença" value={optionalKeywords} /></label>
        <label className="text-sm font-medium">Palavras excluídas<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setExcludedKeywords(event.target.value)} placeholder="recondicionado" value={excludedKeywords} /></label>
        <label className="text-sm font-medium">Modalidades (códigos PNCP)<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setModalities(event.target.value)} value={modalities} /></label>
        <label className="text-sm font-medium">Municípios (códigos IBGE)<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setMunicipalities(event.target.value)} value={municipalities} /></label>
        <label className="text-sm font-medium">Órgãos (termos)<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setAgencyTerms(event.target.value)} value={agencyTerms} /></label>
        <label className="text-sm font-medium">Esferas (códigos)<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setSpheres(event.target.value)} value={spheres} /></label>
        <label className="text-sm font-medium">CNAEs<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setCnaeCodes(event.target.value)} value={cnaeCodes} /></label>
        <label className="text-sm font-medium">Valor mínimo (R$)<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" min="0" onChange={(event) => setMinimumValue(event.target.value)} type="number" value={minimumValue} /></label>
        <label className="text-sm font-medium">Valor máximo (R$)<input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" min="0" onChange={(event) => setMaximumValue(event.target.value)} type="number" value={maximumValue} /></label>
        <label className="text-sm font-medium">
          Exclusividade ME/EPP
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setExclusiveMeEpp(event.target.value)} value={exclusiveMeEpp}>
            <option value="">Qualquer</option><option value="true">Exclusiva</option><option value="false">Não exclusiva</option>
          </select>
        </label>
      </section>

      <p aria-live="polite" className="min-h-6 text-sm text-red-700">{message}</p>
      <button className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">
        {editableProfile ? "Atualizar perfil" : "Salvar perfil"}
      </button>
    </form>
  );
}

