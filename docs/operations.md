# Operação do MVP

## Variáveis e segredos

1. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente do Next.js.
2. No Supabase, configure o Auth para e-mail/senha e magic link e inclua a URL de callback `/auth/callback` na lista de redirecionamentos permitidos.
3. Aplique `supabase/migrations/20261018071000_initial_schema.sql` em homologação e confirme as políticas RLS com usuários de organizações distintas.
4. A migration `20261019121500_secure_ingestion_scheduler.sql` cria um token aleatório no Vault. A função compara o cabeçalho `x-ingestion-token` com esse segredo por uma RPC restrita; não copie o token para o repositório nem para o navegador. Os códigos padrão são 4, 6 e 8, já observados nos registros PNCP desta integração. `PNCP_MODALITY_CODES`, `PNCP_LOOKBACK_DAYS` e `PNCP_BASE_URL` são ajustes opcionais da Edge Function; os códigos aceitos permanecem limitados a 4, 6 e 8 até validação adicional.
5. Não grave a chave `SUPABASE_SERVICE_ROLE_KEY` no navegador nem em variáveis prefixadas com `NEXT_PUBLIC_`. No Supabase hospedado, a função recebe as variáveis reservadas do projeto; em execução local, use um arquivo privado `supabase/functions/.env` ignorado pelo Git.

## Publicar a função de ingestão

Depois de autenticar a CLI e vincular o projeto correto:

```bash
supabase functions deploy ingest-pncp --project-ref "$SUPABASE_PROJECT_REF"
```

A função está configurada para validar um token próprio em `x-ingestion-token` e tem `verify_jwt = false` em `supabase/config.toml`. A chamada só segue após a validação pela RPC `validate_ingestion_job_token`, cuja execução é concedida apenas a `service_role`. A função consulta os últimos três dias, percorre até dez páginas por rodada e grava o checkpoint para continuar depois. Há pausa de seis segundos entre consultas; erros HTTP 429 recebem espera exponencial e respeitam `Retry-After` quando o PNCP o envia.

## Agendar a execução a cada três horas

Depois do deploy e da aplicação das migrations, execute `supabase/ops/schedule-ingestion.sql` no SQL Editor do projeto. O script grava a URL do projeto no Vault e cria ou substitui o agendamento `0 */3 * * *`. O `ingestion_job_token` é criado pela migration no Vault. A chamada usa `pg_net` com limite de 120 segundos. Não é necessário guardar chave publicável no Vault para esse job.

Para testar sem revelar o token, rode a chamada abaixo no SQL Editor do Supabase. O SQL lê o token diretamente do Vault e retorna um identificador de solicitação:

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
    || '/functions/v1/ingest-pncp',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-ingestion-token', (select decrypted_secret from vault.decrypted_secrets where name = 'ingestion_job_token')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
);
```

O resultado desta consulta é o identificador da solicitação. Consulte o resultado HTTP em `net._http_response` usando esse identificador.

Uma chamada pode retornar `partial` quando o limite de páginas por execução for atingido. O checkpoint permite que a próxima execução continue; `succeeded` significa que as modalidades configuradas foram percorridas. Se o PNCP limitar a consulta com HTTP 429 mesmo após os intervalos, a execução registra `failed` e preserva o checkpoint para a próxima rodada.

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

- O código da Edge Function, a validação privada do token, o retry, a paginação, a deduplicação e o checkpoint estão disponíveis neste repositório.
- No projeto de desenvolvimento `edital-certo-dev`, a função está publicada e o agendamento de três em três horas está ativo. A primeira consulta real adicionou 719 registros, mas terminou com HTTP 429; o checkpoint foi salvo e o coletor foi ajustado para consultar mais devagar. Confirme as próximas execuções antes de considerar a ingestão estável.
- A publicação em produção ainda depende de revisão e merge da PR. A configuração do projeto de desenvolvimento não deve ser tratada como configuração de produção.
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
