import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link className="text-sm font-semibold text-blue-700" href="/signup">← Voltar ao cadastro</Link>
      <h1 className="mt-5 text-3xl font-bold">Política de privacidade</h1>
      <p className="mt-2 text-sm text-slate-500">Versão 2026-10-18 · texto inicial para revisão jurídica antes do lançamento público.</p>
      <div className="mt-8 space-y-5 leading-7 text-slate-700 dark:text-slate-200">
        <p>O Edital Certo usa dados de conta, organização e preferências de busca para autenticar usuários, organizar oportunidades e entregar notificações solicitadas. Dados públicos de contratações são obtidos de fontes governamentais e associados aos perfis de interesse.</p>
        <p>Os dados podem ser processados pela infraestrutura Supabase, pela hospedagem da aplicação e, quando habilitado, por provedores de e-mail ou pagamento. Segredos desses provedores ficam em ambiente de servidor.</p>
        <p>O acesso a dados comerciais da organização é limitado por papéis e políticas de segurança do banco. O titular pode solicitar uma cópia ou exclusão de seus dados pelo canal de suporte do controlador. A exclusão considera obrigações legais e registros que devam ser retidos.</p>
        <p>O titular pode solicitar esclarecimentos, correção, exportação ou exclusão ao controlador do serviço. Antes do lançamento, publique os dados de contato do controlador, os prazos de retenção, as bases legais específicas e o canal de atendimento LGPD.</p>
        <p>Usuários autenticados podem baixar a exportação JSON e registrar solicitações de exclusão na área <Link className="font-semibold text-blue-700 underline" href="/settings/privacy">Privacidade e seus dados</Link>.</p>
      </div>
    </main>
  );
}
