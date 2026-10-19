import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InterestProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function NewProfilePage({ searchParams }: { searchParams: Promise<{ clone?: string; edit?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const [{ data: organizations }, { data: segments }, { data: profiles }] = await Promise.all([
    supabase.from("organizations").select("id,name").order("created_at"),
    supabase.from("segments").select("segment_key,name").eq("is_active", true).order("name"),
    supabase.from("interest_profiles").select("id,organization_id,name,segment_key,required_keywords,optional_keywords,excluded_keywords,ufs,municipality_codes,modality_codes,agency_terms,spheres,minimum_value,maximum_value,cnae_codes,exclusive_me_epp")
  ]);

  if (!organizations?.length) redirect("/onboarding");

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <Link className="text-sm text-blue-700" href="/profiles">← Perfis</Link>
      <h1 className="mt-4 text-3xl font-bold">{params.edit ? "Editar perfil de interesse" : params.clone ? "Duplicar perfil de interesse" : "Novo perfil de interesse"}</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Selecione filtros que façam sentido para a linha de negócio.</p>
      <InterestProfileForm organizations={organizations} segments={segments ?? []} sourceProfiles={profiles ?? []} cloneProfileId={params.clone ?? null} editableProfileId={params.edit ?? null} />
    </main>
  );
}

