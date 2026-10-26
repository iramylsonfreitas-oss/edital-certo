# Persistência das mensagens de e-mail

Status conferido em 26/10/2026: migração versionada, ponte REST e trabalhador simulado implementados na proposta 26, branch `draft/email-message-persistence`. Nenhum envio real está implementado ou habilitado. A migração já existe no desenvolvimento hospedado; o histórico anterior desta documentação estava desatualizado. O trabalhador publicado `prepare-email-alerts` continua preparando a fila.

## Estado atual: reconciliação e agendamento de desenvolvimento

Em 26/10/2026, os 15 identificadores de migração do desenvolvimento foram alinhados aos arquivos da branch. A rotina de prévias está agendada nos minutos 10, 25, 40 e 55 de cada hora. Somente o projeto `afbuozouupuguvkkuvib` foi alterado. Produção e envios permanecem sem alteração.

A auditoria identificou 14 registros antigos: onze tinham o mesmo corpo do repositório; três diferiam por formatação da view ou por correções posteriores de classificação/prioridade. Os corpos atuais de `is_ti_tender`, `is_ti_item` e `claim_pncp_item_job` foram conferidos por hash e coincidem com o repositório. A view foi conferida com `security_invoker=true` e `security_barrier=true`.

`supabase/ops/reconcile-development-migration-history.sql` passou primeiro em transação com rollback, depois foi executado e conferido via listagem independente. Ajustou apenas identificadores, preservou os SQLs históricos originais e registrou a configuração de segurança da view que já estava instalada. Não reaplicou DDL nem alterou dados de usuários. O manifesto `docs/development-migration-history-audit.json` guarda os identificadores e hashes anteriores. Essa reconciliação não equivale a um diff completo de esquema nem autoriza `db push` em produção.

O conector administrativo já autorizado foi utilizado porque não há credenciais de conexão direta configuradas para o CLI. A primeira simulação recebeu erro interno do conector; a consulta confirmou ausência de alterações e a segunda simulação passou. Nenhum segredo de conexão foi solicitado.

`supabase/ops/schedule-email-message-staging.sql` também passou por rollback antes da ativação. Cria ou atualiza um único job nomeado, com URL fixo de desenvolvimento e token lido internamente no servidor. Não cria recurso pago ou credencial nova. A função conserva o limite de cinco mensagens e o orçamento verificado de 45 segundos entre mensagens. A agenda gera até 96 chamadas por dia e usa as cotas da infraestrutura existente.

`supabase/ops/check-email-message-staging.sql` permite verificar, sem dados pessoais, a agenda, o resultado do cron, o registro operacional da função e os contadores. Sucesso do cron sozinho comprova apenas enfileiramento HTTP; o resultado da função precisa ser conferido no registro operacional.

A primeira execução automática foi confirmada em 26/10 às 15h25 no fuso UTC-4 (19h25 UTC): cron concluído, função com `status=succeeded`, `mode=stage_only`, `sends_email=false`, zero novas mensagens por fila sem itens elegíveis. A mensagem preexistente foi preservada e o projeto continua com zero tentativas de envio. O primeiro ciclo não substitui o acompanhamento continuado da operação.

As seções seguintes mantêm a sequência histórica dos testes. As pendências atuais são operação de mensagens incertas, retenção, acompanhamento da rotina e integração futura de provedor/remetente. A proposta permanece em rascunho.

## Registro inicial de retomada em 26/10/2026 (antes da reconciliação)

- Terminal recuperado; testes executados também no checkout local.
- Projeto confirmado pelo conector: `edital-certo-dev`, ref `afbuozouupuguvkkuvib`, conta Iramylson segunda conta. Produção não foi alterada nesta retomada.
- O histórico hospedado registra `20261020204133_email_message_persistence`; o arquivo versionado é `20261020203247_email_message_persistence.sql`. Ambos têm 17.568 bytes e MD5 `ad8e2bf99b281bf0b17e1733f4a09e76`. Não reaplicar o SQL: as estruturas já existem. A reconciliação dos identificadores de histórico continua pendente antes de usar `db push` nesse projeto. Nenhum registro de histórico foi alterado nesta retomada.
- `supabase/tests/email-message-installed.sql` passou no esquema instalado, em transação com rollback. Usa usuário, organização, oportunidade e fila sintéticos, sem selecionar dados de terceiros. Verifica reserva duplicada, hash, exclusividade, recuperação após expiração, token antigo, conflito terminal, retenção dos itens e permissões/RLS.
- A consulta independente após o rollback confirmou uma mensagem preexistente preservada, zero tentativas, zero usuários e oportunidades temporários. A mensagem preexistente em estado `ready` não foi enviada, cancelada nem alterada.
- Advisors de segurança: sem erro novo; tabelas operacionais sem políticas públicas são intencionalmente exclusivas do serviço. O aviso preexistente de proteção contra senhas vazadas permanece fora desta alteração.
- `prepareStoredDigestBatch` prepara no máximo cinco mensagens (até vinte itens por mensagem), para ao esvaziar a fila ou no primeiro erro e retorna somente contadores. Não reclama tentativas, não simula aceite e não envia mensagens. Falhas ambíguas não provocam nova reserva na mesma execução.
- 97 testes unitários, TypeScript e lint passaram localmente. O lint conserva um aviso preexistente no coletor PNCP. O novo teste pós-instalação também foi incluído na CI de banco.

Esta etapa confirma o banco instalado e prepara o ciclo limitado. Ainda não instala agendamento para o novo ciclo, não confirma REST hospedado e não implementa operação de resultados incertos ou retenção. Essas pendências impedem considerar o fluxo completo pronto para produção.

## Função de desenvolvimento recuperada em 26/10/2026

A inspeção do projeto identificou `stage-email-messages` v1, já instalada em 20/10/2026, mas ausente da branch. O código foi recuperado pelo conector e incorporado à proposta. Não confundir essa implantação prévia com publicação em produção.

`src/lib/alerts/staging.ts` usa o preparador limitado, com até cinco mensagens por execução e orçamento de 45 segundos verificado entre mensagens. Esse orçamento não interrompe uma chamada REST já iniciada. O remetente `preview@edital-certo.invalid` é exclusivo das prévias: essas mensagens não podem ser usadas em um futuro envio real. Uma mudança para remetente real exigirá cancelar as prévias sem tentativa e gerar novas mensagens com o conteúdo correto.

A função só trabalha no URL fixo de desenvolvimento. Aceita POST e valida `x-ingestion-token` pela RPC existente antes de inserir o registro operacional. A rotina não reclama mensagens, não aceita resultados simulados, não importa transporte e não possui credencial de provedor. Registra contadores e erros genéricos, sem destinatário ou conteúdo do resumo. Não há cron dessa função instalado no desenvolvimento.

Os cinco registros operacionais preexistentes de 20/10 mostram uma mensagem preparada por REST e quatro execuções sem novas mensagens. A consulta atual continua mostrando uma mensagem e zero tentativas. Isso é evidência histórica; não substitui uma nova execução autorizada após qualquer atualização.

`scripts/verify-staging-public.ts` passou contra o desenvolvimento hospedado com chave publicável: as três tabelas e a RPC privada retornaram 401; GET da função retornou 405; POST sem token e com token inválido retornaram 401. Nenhum corpo ou endereço é impresso. O script rejeita URLs fora do projeto de desenvolvimento e não recebe credenciais privilegiadas.

Os 102 testes unitários, TypeScript e lint passaram. A verificação Deno da função também integra o workflow de banco, com versão fixa. O workflow anterior e97cee5 concluiu com sucesso tanto banco/REST/concorrência quanto qualidade e navegador.

Continuam pendentes a reconciliação do histórico, o agendamento e a operação de resultados incertos. A nova execução positiva autenticada foi concluída após autorização específica do usuário, conforme o registro abaixo.

## Fluxo implementado

1. `recover_email_message_drafts` libera, por execução, no máximo 20 rascunhos sem tentativas abandonados há mais de 15 minutos. Não libera mensagens prontas, tentadas ou incertas.
2. `reserve_next_email_digest` seleciona e reserva atomicamente até 20 itens atuais do mesmo destinatário. A seleção usa locks e a restrição única de destinatário ativo resolve disputas entre trabalhadores. Somente `service_role` recebe o endereço confirmado e os dados necessários ao resumo.
3. `stageNextStoredDigest`, em `src/lib/alerts/stored-worker.ts`, compõe o resumo e congela os bytes por meio da ponte `persisted.ts`. Se a composição omitir um item inválido, a reserva inteira é recusada. Falhas ambíguas de reserva não provocam nova reserva automática; uma reserva sem resposta é recuperada pela expiração do rascunho.
4. `claimStoredMessage` reclama a mensagem, grava a tentativa no banco e verifica UUIDs, token, chave, estrutura, tamanho e SHA-256 dos bytes recuperados. Uma resposta inválida não chega à conclusão simulada.
5. `simulateStoredAttempt` revalida a concessão e a autorização via `validate_email_message_claim` e registra exclusivamente um resultado simulado com o token original. Não recebe transporte, credenciais, callback de envio ou opção de envio real. Uma falha de gravação não provoca outra tentativa.

`stageStoredDigest` também permite testar itens selecionados explicitamente pelo servidor. `stageEmailMessage` conserva seu contrato anterior de reservar e congelar; `freezeReservedMessage` permite congelar a seleção já reservada em uma transação do banco.

## Identidade, concessões e incerteza

As tabelas `email_messages`, `email_message_items` e `email_message_attempts` guardam mensagens, vínculos e histórico. O conteúdo congelado usa os bytes UTF-8 de `JSON.stringify([from,to,subject,html,text])`, com SHA-256. A chave é sempre `edital-certo/<uuid-da-mensagem>`.

A concessão dura dois minutos. O token rejeita respostas antigas. Uma concessão expirada marca a tentativa anterior como desconhecida antes da recuperação. Há limite de cinco tentativas e janela de 23 horas desde o primeiro início; o backoff é de 1/2/4/8 minutos. Os vínculos permanecem reservados quando existe incerteza.

O mapeamento de resultados considera aceite com ID, erros transitórios, rejeições permanentes, resultado desconhecido e conflito de identidade. HTTP 409 com `concurrent_idempotent_requests` permite retry. Outro 409 usa `conflict` e encerra imediatamente como `uncertain`, sem gerar nova mensagem para o mesmo item.

Um aceite simulado marca a fila local como `sent`; por isso o runner só aceita uma instância local descartável. Em uma integração futura, `sent` significará aceite do provedor, sem comprovar entrega na caixa postal. A concessão não garante entrega única após atrasos de rede. Um transporte futuro deverá conservar bytes e chave e respeitar a janela de idempotência do provedor.

## Acesso

RLS está habilitada nas três tabelas, sem políticas para usuários. Tabelas e RPCs revogam acesso de `PUBLIC`, `anon` e `authenticated`, conforme o tipo de objeto; as operações são exclusivas de `service_role`. A função privada que consulta um único endereço confirmado usa `SECURITY DEFINER`, caminho de busca vazio e execução restrita ao servidor, sem conceder acesso direto a `auth.users`.

Reserva, congelamento, reclamação e revalidação conferem consentimento, plano, perfil, vínculo com a organização, endereço confirmado, situação/prazo da oportunidade e versões da fila. A revalidação imediatamente antes do resultado não elimina a possibilidade de mudança durante uma futura chamada externa. Nenhuma transação permanece aberta durante chamadas de rede.

Erros da ponte e do trabalhador usam códigos genéricos; endereços e mensagens do banco não são propagados. Os relatórios do runner contêm contadores e resultados de verificações, sem corpos ou endereços.

## Migração e CI

A migração `supabase/migrations/20261020203247_email_message_persistence.sql` foi criada com Supabase CLI 2.121.0 na execução 39492652515. O arquivo em `supabase/ops/drafts/email-message-persistence.sql` conserva a mesma fonte; a CI exige igualdade entre os dois arquivos.

O terminal desta conversa permaneceu indisponível. O GitHub Actions executa o CLI em uma instância descartável, sem segredos de Supabase hospedado ou de provedor. O workflow `.github/workflows/email-persistence.yml`:

- consulta versão e comandos com `--help`;
- inicializa um projeto local e aplica as migrações anteriores;
- roda a regressão SQL em transação com rollback;
- aplica a migração versionada via `supabase db reset --local --no-seed` e confere o histórico com `migration list --local`;
- carrega dados sintéticos comprometidos apenas na instância descartável, para permitir transações REST independentes;
- roda a ponte e o trabalhador por REST, preserva a migração como artefato e encerra os serviços.

O runner `scripts/test-email-persistence.ts` exige `EMAIL_TEST_DISPOSABLE=true`, API `http://127.0.0.1:54321` e banco `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Recusa uma variável `RESEND_API_KEY`. As chaves usadas são obtidas do próprio CLI local. Não usa credenciais da aplicação.

## Evidências de validação

- Commit de código verificado: `a4945f20adc024e8ed4586962f5cec70027dc98e`.
- [CI 39493079950](https://github.com/iramylsonfreitas-oss/edital-certo/actions/runs/39493079950): lint, tipos, 92 testes unitários, build e testes de navegador aprovados. Há um aviso de lint preexistente no coletor PNCP.
- [Integração de banco 39493080107](https://github.com/iramylsonfreitas-oss/edital-certo/actions/runs/39493080107): regressão SQL, aplicação local da migração versionada, banco/REST, concorrência e ciclo simulado completo aprovados. O runner registrou `real_emails_sent: 0`.
- A documentação foi consolidada depois desses testes; essa consolidação não altera SQL ou TypeScript.

A regressão SQL ampliada também passou no projeto de desenvolvimento `afbuozouupuguvkkuvib`, em transação com rollback. Foram confirmadas a ausência de `email_messages` e de `reserve_next_email_digest` após o rollback. Esse teste não aplica a migração permanentemente.

Os cenários incluem reserva duplicada, recuperação de rascunho, imutabilidade, hash, desvio de destinatário, concessão exclusiva, retomada com mesmos bytes/chave, rejeição de token antigo, backoff, aceite simulado, pausa, limite de cinco tentativas, janela de 23 horas, conflito terminal e privilégios.

A integração REST usa oito reservas e doze reclamações simultâneas, cada chamada em transação independente, e exige um único proprietário. Também testa quatro seleções simultâneas, resumo em lote, recuperação de rascunho, revalidação após pausa e acesso negado a `anon`/`authenticated`. Depois de pausar e retomar um alerta, o cenário refaz a preparação por `claim_email_alert_page`/`save_email_alert_page`: o `updated_at` faz parte da versão da configuração e invalida as linhas antigas.

Para repetir a regressão em um banco descartável com apenas as migrações anteriores à de persistência:

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/email-message-persistence-proposal.sql
```

Não executar esse teste nem a fixture local em produção. A regressão inclui a proposta dentro da transação e precisa de conexão administrativa para preparar usuários sintéticos e alternar papéis.

## Pendências antes da publicação

1. Concluído em desenvolvimento: validação SQL/REST, reconciliação dos 15 identificadores e agendamento de prévias. Ver registro atual no início deste documento.
2. Definir a operação de mensagens incertas e a retenção/limpeza do histórico. A recuperação automática implementada se limita aos rascunhos sem tentativas.
3. Acompanhar as execuções do ciclo de desenvolvimento. O agendamento de prévias foi ativado; envio e simulação de aceite continuam ausentes dessa rotina.
4. Para envio real, implementar adaptador de provedor, timeout, remetente/domínio, descadastro, eventos assinados de entrega/falha e supressão. Revalidar autorização perto da chamada externa e reconciliar resultados incertos.
5. Publicar somente após homologação. O aceite simulado nunca deve ser aplicado à fila real de clientes.

A proposta permanece em rascunho e não foi mesclada em `main`. A produção continua oferecendo preparação de oportunidades e prévia de e-mail.


## Validação autenticada da v2 em 26/10/2026

O usuário autorizou o uso do token operacional existente, condicionado a não contratar recursos ou serviços pagos. A validação usou apenas o projeto de desenvolvimento já existente. Não houve criação de recurso, contratação, ativação de cobrança, cron novo ou envio real.

O token foi utilizado dentro do banco, exclusivamente no cabeçalho da chamada para o URL fixo de desenvolvimento; seu valor não foi retornado, impresso, gravado no repositório nem enviado para outro destino. Essa autorização foi posterior à recusa inicial da revisão automática.

- Requisição 76: HTTP 200, `stage_only`, `sends_email=false`, zero mensagens novas por ausência de fila elegível.
- Foi criada uma conta sintética com endereço `example.invalid`, organização, perfil, alerta e uma oportunidade fictícia. Nenhuma preferência de usuário real foi alterada.
- Requisição 77: HTTP 200, uma mensagem preparada. Banco confirmou estado `ready`, um item associado, hash SHA-256 válido e zero tentativas.
- Requisição 78: HTTP 200, zero mensagens novas. A conta sintética continuou com exatamente uma mensagem e zero tentativas: repetição sem duplicidade.
- A limpeza conferiu identidade e ausência de tentativas antes de remover apenas os dados sintéticos. Consulta independente confirmou zero conta, organização e oportunidade temporárias, uma mensagem preexistente preservada e zero tentativas no projeto.

A API hospedada da v2 está validada com autenticação e gravação real de prévia. O ciclo não está agendado e a proposta permanece em rascunho; produção não foi alterada. Testes de código do commit 6b051dc continuam aprovados: 102 unitários, tipos, lint, build, navegador, Deno, banco/REST local e concorrência. Esta atualização altera somente a documentação.
