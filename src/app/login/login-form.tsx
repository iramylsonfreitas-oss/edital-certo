"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` }
      });
      if (error) throw error;
      setMessage("Confira sua caixa de entrada para acessar sua conta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-5">
      <form className="space-y-4" onSubmit={submitPassword}>
        <label className="block text-sm font-medium">
          E-mail
          <input autoComplete="email" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
        </label>
        <label className="block text-sm font-medium">
          Senha
          <input autoComplete="current-password" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        <button className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60" disabled={busy} type="submit">
          Entrar com senha
        </button>
      </form>
      <button className="w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold disabled:opacity-60" disabled={busy || !email} onClick={sendMagicLink} type="button">
        Enviar link mágico
      </button>
      <p aria-live="polite" className="min-h-6 text-sm text-slate-600 dark:text-slate-300">{message}</p>
    </div>
  );
}

