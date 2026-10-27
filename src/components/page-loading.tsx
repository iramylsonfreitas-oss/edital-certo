import { AppNavigation } from "./app-navigation";

export function PageLoading({ title, active }: { title: string; active: "/dashboard" | "/pipeline" | "/deadlines" | "/panel" }) {
  return <main aria-busy="true" className="mx-auto min-h-screen max-w-6xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
      <h1 className="text-2xl font-bold">Carregando {title}…</h1>
      <AppNavigation active={active} />
    </header>
    <p role="status" className="mt-6 text-sm text-slate-600 dark:text-slate-300">Carregando página…</p>
    <div aria-hidden="true" className="mt-5 grid gap-4">
      {[0,1,2].map(item=><div key={item} className="h-24 rounded-xl bg-slate-100 motion-safe:animate-pulse dark:bg-slate-800" />)}
    </div>
  </main>;
}
