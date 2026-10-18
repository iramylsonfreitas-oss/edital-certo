"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function makeSlug(value: string): string {
  const base = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base || "organizacao"}-${suffix}`;
}

export function OrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { error } = await supabase.from("organizations").insert({
        name: name.trim(),
        slug: makeSlug(name),
        created_by: authData.user.id
      });
      if (error) throw error;
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a organização.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">
        Nome da empresa ou consultoria
        <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" maxLength={160} minLength={2} onChange={(event) => setName(event.target.value)} required value={name} />
      </label>
      <button className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">
        Criar organização
      </button>
      <p aria-live="polite" className="min-h-6 text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </form>
  );
}

