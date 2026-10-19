import Link from "next/link";

const navigationItems = [
  { href: "/dashboard", label: "Oportunidades", icon: "⌕" },
  { href: "/pipeline", label: "Pipeline", icon: "▤" },
  { href: "/deadlines", label: "Prazos", icon: "◷" },
  { href: "/panel", label: "Painel", icon: "▥" }
] as const;

export function AppNavigation({ active }: { active: (typeof navigationItems)[number]["href"] }) {
  return (
    <>
      <nav aria-label="Navegação principal" className="hidden gap-2 md:flex">
        {navigationItems.map((item) => (
          <Link
            aria-current={active === item.href ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active === item.href ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <nav
        aria-label="Navegação móvel"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:hidden"
      >
        {navigationItems.map((item) => (
          <Link
            aria-current={active === item.href ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${active === item.href ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "text-slate-500 dark:text-slate-300"}`}
            href={item.href}
            key={item.href}
          >
            <span aria-hidden="true" className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
