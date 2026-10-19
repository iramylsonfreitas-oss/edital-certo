import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppNavigation } from "@/components/app-navigation";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: profiles } = await supabase
    .from("interest_profiles")
    .select("id,name,segment_key,ufs,is_active,updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700"><div><Link className="text-sm text-blue-700" href="/dashboard">← Oportunidades</Link><h1 className="mt-3 text-3xl font-bold">Perfis de interesse</h1></div><AppNavigation active="/dashboard" /></header>
      <Link className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href="/profiles/new">Criar perfil</Link>
      {profiles?.length ? (
        <ul className="mt-6 grid gap-3">
          {profiles.map((profile) => (
            <li className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" key={profile.id}>
              <h2 className="font-semibold">{profile.name}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Segmento: {profile.segment_key} · UFs: {profile.ufs.length ? profile.ufs.join(", ") : "Brasil"}
              </p>
              <div className="mt-4 flex gap-4 text-sm font-semibold text-blue-700">
                <Link href={`/profiles/new?edit=${profile.id}`}>Editar</Link>
                <Link href={`/profiles/new?clone=${profile.id}`}>Duplicar</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6">Ainda não há perfis cadastrados.</p>
      )}
    </main>
  );
}

