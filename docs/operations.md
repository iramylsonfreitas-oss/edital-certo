# Operação do MVP

## Variáveis e segredos

1. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente do Next.js.
2. No Supabase, configure o Auth para e-mail/senha e magic link e inclua a URL de callback `/auth/callback` na lista de redirecionamentos permitidos.
3. Aplique `supabase/migrations/20261018071000_initial_schema.sql` em homologação e confirme as políticas RLS com usuários de organizações distintas.
4. Cadastre `INGESTION_JOB_TOKEN`, `PNCP_MODALITY_CODES`, `PNCP_LOOKBACK_DAYS` e, se necessário, `PNCP_BASE_URL` como segredos da Edge Function `ingest-pncp`. `PNCP_MODALITY_CODES` só deve receber códigos conferidos no catálogo oficial de domínios.
5. Não grave a chave `SUPABASE_SERVICE_ROLE_KEY` no navegador nem em variáveis prefixadas com `NEXT_PUBLIC_`. No Supabase hospedado, a função recebe as variáveis reservadas do projeto; em execução local, use um arquivo privado `supabase/functions/.env` ignorado pelo Git.

## Publicar a função de ingestão

Depois de autenticar a CLI e vincular o projeto correto:

```bash
supabase functions deploy ingest-pncp --project-ref "$SUPABASE_PROJECT_REF"
```

A função está configurada para validar um token próprio em `x-ingestion-token` e tem `verify_jwt = false` em `supabase/config.toml`. O token precisa ser aleatório, longo, compartilhado somente entre o agendador e a função e rotacionado se houver suspeita de exposição.

## Agendar a execução horária

Depois do deploy, habilite Cron e `pg_net` no Supabase. Crie no Vault os segredos `project_url`, `publishable_key` e `ingestion_job_token`; a chave publicável não concede acesso sem RLS, e o token do job deve ser aleatório e privado. Em seguida execute `supabase/ops/schedule-ingestion.sql` no SQL Editor. O script cria ou substitui o job horário e injeta os valores do Vault na chamada. Não coloque tokens em migrations versionadas nem no repositório.

Para conferir a função antes de ativar a agenda, use o comando abaixo em um terminal com acesso ao projeto. O segredo é lido de variável local e não deve ser colado em tickets ou conversas:

```bash
curl --fail-with-body --request POST \
  "$SUPABASE_URL/functions/v1/ingest-pncp" \
  --header "Content-Type: application/json" \
  --header "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  --header "x-ingestion-token: $INGESTION_JOB_TOKEN" \
  --data '{}'
```

Uma chamada pode retornar `partial` quando o limite de páginas por execução for atingido. O checkpoint permite que a próxima execução continue; `succeeded` significa que as modalidades configuradas foram percorridas.

## Verificação do PNCP e fixture real

Antes da primeira execução, confira a documentação e os domínios atuais do PNCP, valide a consulta na rede autorizada e capture uma resposta real:

```bash
PNCP_MODALITY_CODES="$PNCP_MODALITY_CODES" npm run pncp:verify
PNCP_FIXTURE_START_DATE="$PNCP_FIXTURE_START_DATE" \
PNCP_FIXTURE_END_DATE="$PNCP_FIXTURE_END_DATE" \
PNCP_FIXTURE_MODALITY_CODE="$PNCP_FIXTURE_MODALITY_CODE" \
npm run pncp:capture-fixture
```

O arquivo `fixtures/pncp/real-response.json` contém uma resposta HTTP real capturada em 18/10/2026 para modalidade 6. O teste do conector lê essa fixture e valida município IBGE e horário de Brasília. Nenhuma fixture é sintetizada para aparentar uma captura da fonte.

## Situação atual e operação manual

- O job de ingestão, retry, paginação, deduplicação, checkpoint e histórico de execução estão no código da Edge Function.
- O agendamento não pode ser ativado neste repositório: depende de um projeto Supabase vinculado e dos segredos privados do operador.
- A captura da fixture PNCP depende de uma rede com acesso ao domínio PNCP e de um código de modalidade confirmado; a primeira amostra já foi obtida.
- O formulário de alertas grava preferências; a entrega por Resend depende da Edge Function de envio, domínio de e-mail verificado e credenciais. Não considere alertas entregues até essa integração estar configurada e testada.
- Pagamentos, Telegram/WhatsApp e recursos de IA são integrações externas ainda não habilitadas no MVP.

## Rotina de validação

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

O teste E2E exige o Chromium instalado por `npx playwright install chromium`.
