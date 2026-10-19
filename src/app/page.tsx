import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <div className="max-w-3xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">Edital Certo</p>
        <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
          Licitações compatíveis com o que sua empresa vende.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Acompanhe oportunidades do PNCP em todo o Brasil, filtre por segmento e região e receba alertas no prazo certo.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white" href="/login">
            Entrar
          </Link>
          <Link className="rounded-lg border border-slate-300 px-5 py-3 font-semibold" href="/signup">
            Criar conta
          </Link>
        </div>
      </div>
      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {[
          ["Busca nacional", "Dados públicos organizados por órgão, modalidade, região e prazo."],
          ["Perfis de interesse", "Combine palavras-chave, valores, modalidade, UF e exclusões."],
          ["Acompanhamento", "Salve oportunidades e organize o trabalho comercial da equipe."]
        ].map(([title, description]) => (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" key={title}>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

