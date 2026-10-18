"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            privacy_consent: privacyAccepted,
            privacy_policy_version: "2026-10-18",
            privacy_consent_at: new Date().toISOString()
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`
        }
      });
      if (error) throw error;
      setMessage("Se a confirmação por e-mail estiver ativa, confira sua caixa de entrada para confirmar o cadastro.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-medium">
        Nome
        <input autoComplete="name" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setFullName(event.target.value)} required value={fullName} />
      </label>
      <label className="block text-sm font-medium">
        E-mail
        <input autoComplete="email" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
      </label>
      <label className="block text-sm font-medium">
        Senha
        <input autoComplete="new-password" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
      </label>
      <label className="flex items-start gap-3 text-sm leading-6 text-slate-700 dark:text-slate-200">
        <input checked={privacyAccepted} className="mt-1" onChange={(event) => setPrivacyAccepted(event.target.checked)} required type="checkbox" />
        <span>Li e aceito os <Link className="font-semibold text-blue-700 underline" href="/terms" target="_blank">termos de uso</Link> e a <Link className="font-semibold text-blue-700 underline" href="/privacy" target="_blank">política de privacidade</Link>.</span>
      </label>
      <button className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">
        Criar conta
      </button>
      <p aria-live="polite" className="min-h-6 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">Já possui cadastro? <Link className="font-semibold text-blue-700" href="/login">Entrar</Link></p>
    </form>
  );
}

