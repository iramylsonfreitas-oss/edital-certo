import Link from "next/link";

export default function AccessBlockedPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-3xl font-bold">Acesso de avaliação bloqueado</h1>
      <p className="mt-4">O responsável por este acesso interrompeu a avaliação. Fale com ele se precisar continuar.</p>
      <Link className="mt-6 inline-block rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white" href="/login">Voltar ao login</Link>
    </main>
  );
}
