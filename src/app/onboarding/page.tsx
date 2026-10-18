import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OrganizationForm } from "./organization-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: organizations } = await supabase.from("organizations").select("id").limit(1);
  if (organizations?.length) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <p className="text-sm font-semibold text-blue-700">Edital Certo</p>
      <h1 className="mt-4 text-3xl font-bold">Configure sua organização</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">O catálogo é nacional. Você escolhe os estados de interesse nos perfis.</p>
      <OrganizationForm />
    </main>
  );
}

