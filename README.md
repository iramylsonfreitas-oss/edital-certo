# Edital Certo

SaaS B2B para descobrir e acompanhar licitações públicas brasileiras, começando por tecnologia da informação. O catálogo foi pensado para receber dados nacionais e os perfis permitem priorizar UFs, municípios, modalidade e segmento.

## O que está incluído

- Next.js App Router e TypeScript com páginas de apresentação, cadastro, login, onboarding, painel, detalhe da oportunidade, perfis e preferências de alerta.
- Supabase Auth SSR e migration PostgreSQL com RLS multiempresa, papéis, planos, cotas iniciais, catálogo, perfil de interesse, alertas, pipeline, auditoria e consentimento registrado.
- Conector PNCP paginado, normalizador, job Edge Function com retry, checkpoint, upsert idempotente e registro de `ingestion_runs`.
- Matching determinístico e busca SQL parametrizada com paginação e ordenação controlada.
- Testes unitários, testes Playwright, CI GitHub Actions, verificação de endpoint e captura explícita de fixture real.

O painel não insere oportunidades de demonstração. Em 18/10/2026, a consulta real do PNCP para modalidade 6 respondeu com dois registros; essa resposta foi salva em `fixtures/pncp/real-response.json` e incluída nos testes do normalizador.

## Requisitos e início local

- Node.js 20.9 ou superior.
- npm.
- Projeto Supabase para login e persistência.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Preencha `.env.local` com os valores do projeto Supabase. Configure também a URL `http://localhost:3000/auth/callback` entre os redirects permitidos no Supabase Auth. Nunca envie valores secretos ao Git.

## Versão HTML independente

Para abrir uma demonstração funcional sem configurar Supabase, gere o arquivo local com:

```bash
npm run build:html
```

O comando cria `Edital_Certo.html`, que pode ser aberto diretamente no navegador. Ele incorpora 50 contratações reais da fixture `fixtures/pncp/ti-interview-sample.json`: 32 classificadas como TI, 21 UFs e Concorrência Eletrônica. A coleta foi parcial por limite de requisições do PNCP; não há dados fictícios na amostra. Busca, filtros, perfil, favoritos, descartes, pipeline, prazos, exportação `.ics` e painel funcionam localmente. O botão de busca ao vivo tenta chamar o endpoint público no navegador. Perfil e ações ficam no `localStorage` desse navegador. Não há login, colaboração entre usuários, alertas enviados ou persistência em servidor nessa versão independente.

Para produção:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## Supabase

1. Aplique em ordem as migrations `supabase/migrations/20261018071000_initial_schema.sql` e `supabase/migrations/20261018143000_harden_tenant_access.sql` em um projeto de desenvolvimento.
2. Verifique RLS com duas contas de teste em organizações distintas antes de carregar dados de clientes.
3. Configure Supabase Auth para senha e magic link.
4. Leia [`docs/operations.md`](docs/operations.md) para publicar o job de ingestão e configurar seu agendamento seguro.

⚠️ **SEGURANÇA:** a chave `SUPABASE_SERVICE_ROLE_KEY`, o token do job, tokens de e-mail, mensageria e cobrança devem ficar apenas em ambiente de servidor. Nunca os exponha no navegador nem em variável `NEXT_PUBLIC_`.

## PNCP

A ingestão do MVP usa a rota oficial `/v1/contratacoes/proposta`, documentada pelo PNCP para contratações com período de recebimento de propostas em aberto. Ela recebe `dataFinal`, código da modalidade, página e tamanho da página; a documentação aceita tamanho de até 500, mas o coletor usa 50 para reduzir respostas grandes. A data de consulta é calculada no fuso de Brasília e o checkpoint é versionado para reiniciar com segurança quando a estratégia mudar. Códigos configurados: 4, 6 e 8. Referência: [Manual oficial da API de Consultas do PNCP](https://www.gov.br/pncp/pt-br/pncp/copy_of_manuais/ManualPNCPAPIConsultasVerso1.0.pdf/@@display-file/file), seção 6.4.

Configure códigos já confirmados no ambiente que tenha conectividade com o PNCP e execute:

```bash
PNCP_MODALITY_CODES="$PNCP_MODALITY_CODES" npm run pncp:verify
```

Para guardar uma resposta recebida de verdade:

```bash
PNCP_FIXTURE_START_DATE="$PNCP_FIXTURE_START_DATE" \
PNCP_FIXTURE_END_DATE="$PNCP_FIXTURE_END_DATE" \
PNCP_FIXTURE_MODALITY_CODE="$PNCP_FIXTURE_MODALITY_CODE" \
npm run pncp:capture-fixture
```

O arquivo `fixtures/pncp/real-response.json` contém a resposta real da captura. Rode o comando novamente para atualizar a amostra; não substitua a fixture por objetos sintéticos. A rota de consulta por ID permanece desabilitada até ser confirmada no Swagger atual.

## Variáveis de ambiente

| Nome | Finalidade |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase usada no navegador e no servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave publicável com RLS habilitada |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial de job confiável; apenas servidor |
| `PNCP_BASE_URL` | Base da API de consulta; padrão `https://pncp.gov.br/api/consulta` |
| `PNCP_MODALITY_CODES` | Códigos confirmados na documentação oficial |
| `PNCP_LOOKBACK_DAYS` | Janela de reconsulta para capturar alterações |
| `INGESTION_JOB_TOKEN` | Token privado que autoriza a execução agendada |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Configuração futura de entrega de e-mail |
| `TELEGRAM_BOT_TOKEN` | Configuração futura de notificações |
| `ASAAS_API_KEY` | Configuração futura de cobrança |

## Limites conhecidos

- Não há um projeto Supabase, domínio de e-mail ou provedor de cobrança conectado neste workspace; deploy, agendamento, envio de alertas e cobrança exigem configuração nesses serviços.
- A interface salva preferências de alerta, mas não entrega e-mails até a integração Resend ser implementada e verificada.
- A consulta de detalhe por ID, itens e arquivos PNCP deve ser concluída após validar as operações correspondentes na documentação vigente.
- Consentimento fica registrado no cadastro; os textos legais são iniciais e exigem dados do controlador, retenção definida e revisão jurídica.
- Fases 2 e 3 estão descritas no backlog; recursos de pipeline, lembretes, preços, concorrência, IA e WhatsApp não são anunciados como ativos no MVP.

## Documentação do projeto

- [`docs/backlog-jira.md`](docs/backlog-jira.md): épicos, histórias, critérios e estimativas.
- [`docs/architecture.md`](docs/architecture.md): diagrama, decisões técnicas e estrutura do repositório.
- [`docs/operations.md`](docs/operations.md): setup de ingestão, segredos e operação.
- [`supabase/migrations/20261018071000_initial_schema.sql`](supabase/migrations/20261018071000_initial_schema.sql): modelo de dados e controles RLS.
- [`supabase/migrations/20261018143000_harden_tenant_access.sql`](supabase/migrations/20261018143000_harden_tenant_access.sql): reforço de acesso aos comentários e visão segura do status do PNCP.
