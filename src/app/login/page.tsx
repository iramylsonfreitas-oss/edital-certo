import { LoginForm } from "./login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <Link className="text-sm font-semibold text-blue-700" href="/">Edital Certo</Link>
      <h1 className="mt-5 text-3xl font-bold">Acesse sua conta</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">Entre com senha ou receba um link seguro por e-mail.</p>
      <LoginForm />
    </main>
  );
}

