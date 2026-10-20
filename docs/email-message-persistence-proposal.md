# Proposta: persistência das mensagens de e-mail

Status em 20/10/2026: proposta em revisão, sem migração aplicada e sem integração com o trabalhador. A produção continua apenas preparando oportunidades e oferecendo a prévia do e-mail. Nenhum envio real é habilitado por estes arquivos.

## Problema e comportamento proposto

A simulação em `src/lib/alerts/delivery.ts` conserva o estado em memória. Uma interrupção entre a chamada ao provedor e a gravação da resposta exige identidade estável, conteúdo imutável e histórico durável para uma futura retomada segura.

O SQL em `supabase/ops/drafts/email-message-persistence.sql` propõe três tabelas privadas ao servidor: mensagens, itens da fila vinculados e tentativas. Cada mensagem reserva até 20 itens de um destinatário. O banco confere consentimento, plano, perfil, situação e prazo da oportunidade, endereço confirmado e versões da fila antes de congelar e reclamar a mensagem.

O conteúdo congelado usa exatamente os bytes UTF-8 de `JSON.stringify([from,to,subject,html,text])`, o mesmo formato de hash de `delivery.ts`. O banco guarda SHA-256 e impede alterações posteriores. A chave de idempotência é `edital-certo/<uuid-da-mensagem>` durante todas as tentativas.

A reclamação grava a tentativa antes de retornar o conteúdo ao futuro trabalhador. Uma concessão de dois minutos impede duas reclamações ativas; um token identifica a tentativa e rejeita respostas antigas. Se a concessão expirar, a tentativa anterior fica com resultado desconhecido. O banco limita a cinco tentativas e a 23 horas desde o primeiro início, com espera de 1/2/4/8 minutos. A identidade dos itens permanece reservada quando há incerteza, evitando gerar outra mensagem para o mesmo item.

Uma mensagem sem tentativas pode ser cancelada e liberar seus itens. Após a primeira tentativa, os vínculos são preservados. O aceite do provedor encerra a mensagem e marca os itens como `sent`; esse estado significa aceite, sem comprovar entrega na caixa postal.

## Acesso e validação

RLS está habilitada e as tabelas e RPCs não concedem acesso a `anon` ou `authenticated`. As operações usam `service_role`. A função privada que consulta um único endereço confirmado usa `SECURITY DEFINER`, caminho de busca vazio e execução apenas pelo servidor, sem conceder acesso direto a `auth.users`.

Os testes foram executados no banco de desenvolvimento dentro de uma transação e desfeitos. Incluem reserva duplicada, liberação de rascunho, tentativa de trocar destinatário, hash, conteúdo imutável, concessão exclusiva, retomada com os mesmos bytes/chave, rejeição de resposta antiga, espera, aceite simulado, pausa do alerta, janela de 23 horas, limite de cinco tentativas e privilégios. Foi confirmada a ausência das tabelas e funções propostas após o rollback. Nenhuma chamada a provedor foi feita.

Para repetir em um banco local/de desenvolvimento descartável com as migrações existentes:

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/email-message-persistence-proposal.sql
```

Não executar esse teste em produção: ele cria usuários e oportunidades sintéticos dentro da transação. Os UUIDs de oportunidade são fixos para isolar o conjunto de dados. O teste precisa de uma conexão administrativa para preparar os dados e alterna para os papéis do servidor e do usuário nas verificações.

## Etapas pendentes antes de publicar

1. Recuperar o ambiente de execução e gerar uma migração com o Supabase CLI; este arquivo em `ops/drafts` não é uma migração publicável.
2. Aplicar a migração em desenvolvimento e validar concorrência com conexões independentes. Os testes atuais verificam a recuperação sequencial e os tokens, sem simular dois processos simultâneos.
3. Integrar reserva, composição, congelamento, reclamação e conclusão ao trabalhador, mantendo transporte simulado e sem credenciais de envio. Comparar a máquina de estados SQL com `delivery.ts`, incluindo o mapeamento dos erros do provedor.
4. Verificar o hash também no trabalhador antes de chamar o transporte e montar a mensagem exclusivamente do conteúdo congelado. Nunca manter transação aberta durante chamadas de rede.
5. Definir recuperação/expiração de rascunhos abandonados, limites e seleção das mensagens por execução, telemetria sem conteúdo pessoal e tratamento operacional de mensagens incertas.
6. Antes de ativar envio real, concluir remetente/domínio, cancelamento de inscrição, eventos de entrega/falha e testes da integração com o provedor. Revalidar a autorização imediatamente antes da chamada externa.

A concessão por si só não garante entrega única após atrasos de rede. A integração precisa usar a mesma chave no provedor e respeitar sua janela de idempotência. Uma pausa posterior à reclamação ou uma mudança de dados durante a chamada externa também exige tratamento pelo trabalhador. Mensagens incertas precisam de reconciliação; não devem ser reenviadas sob uma nova identidade automaticamente.

O ambiente de execução estava indisponível nesta etapa. O SQL foi validado pelo banco de desenvolvimento; CLI, compilação da aplicação, testes JavaScript e integração completa não foram executados nesta proposta.
