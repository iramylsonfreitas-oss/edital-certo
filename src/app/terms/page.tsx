import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link className="text-sm font-semibold text-blue-700" href="/signup">← Voltar ao cadastro</Link>
      <h1 className="mt-5 text-3xl font-bold">Termos de uso</h1>
      <p className="mt-2 text-sm text-slate-500">Versão 2026-10-18 · texto inicial para revisão jurídica antes do lançamento público.</p>
      <div className="mt-8 space-y-5 leading-7 text-slate-700 dark:text-slate-200">
        <p>O serviço organiza informações públicas sobre contratações para apoiar a pesquisa comercial. A empresa usuária é responsável por conferir o edital, seus anexos, os prazos e as condições diretamente na fonte oficial.</p>
        <p>Resumos, pontuações, filtros e alertas são ferramentas de apoio e não constituem aconselhamento jurídico, garantia de elegibilidade ou garantia de contratação. A fonte oficial prevalece em caso de divergência.</p>
        <p>O usuário deve proteger suas credenciais e usar os dados e documentos da organização somente conforme as permissões que recebeu. O controlador do serviço deve completar seus dados de contato, política de suporte, preços, cancelamento e regras de disponibilidade antes de oferecer planos pagos.</p>
      </div>
    </main>
  );
}
