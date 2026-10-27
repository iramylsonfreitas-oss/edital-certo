# Integração de e-mail em desenvolvimento

A integração com Resend está implementada para um piloto com até dez destinatários explicitamente permitidos. O envio permanece desativado por uma trava no código da função `deliver-email-alerts`, além da configuração por ambiente. Nenhum domínio foi cadastrado, nenhum serviço pago foi contratado e nenhum e-mail real foi enviado.

## Fluxo implementado

O trabalhador reserva um resumo elegível somente para os destinatários permitidos, gera um token de cancelamento e congela remetente, destinatário, assunto e conteúdo. Cada mensagem mantém a mesma chave de idempotência e os mesmos bytes nas tentativas. O envio usa apenas a API fixa do Resend, com timeout, sem redirecionamentos ou retries internos. As concessões, a janela de 23 horas e o limite de cinco tentativas continuam controlados pelo banco.

`/api/email/events` verifica a assinatura Svix sobre os bytes originais antes de interpretar o evento. O banco confere identidade, remetente, destinatário e primeira tentativa. Um recibo válido pode conciliar uma resposta perdida, encerrando a mensagem e preservando a deduplicação da fila. Eventos repetidos são idempotentes; um evento tardio não rebaixa entrega ou bloqueio. O histórico de eventos armazena identificadores e hashes, sem cópia de endereço, assunto ou conteúdo.

Devolução permanente, reclamação e supressão bloqueiam os alertas do endereço atual confirmado. A função não libera automaticamente esses bloqueios. Os eventos suportados são `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed` e `email.suppressed`.

`GET /email/unsubscribe?token=…` apresenta confirmação sem alterar dados. O POST aceita confirmação explícita ou o formato de um clique do provedor. O banco guarda somente o hash do token; o link permanece utilizável após a retenção do conteúdo. Reautorizar pela conta exige consentimento explícito e remove apenas um cancelamento voluntário do próprio usuário. As preferências continuam pausadas até uma retomada individual.

## Implantação de desenvolvimento em 27/10/2026

A migração `20261027100351_email_provider_integration.sql` foi aplicada somente no projeto `afbuozouupuguvkkuvib`. A função `deliver-email-alerts` foi publicada com trava de envio fechada e autenticação pelo token interno do agendador. Não há cron para o envio real. As rotas Next e a interface estão no PR; dependem da publicação da aplicação para uso externo.

Os testes SQL com rollback validaram tokens, cancelamento, reautorização, escopo do piloto, conciliação, repetição, ordem dos eventos, bloqueios e permissões. Após os testes, o ambiente continuou sem tentativas e sem eventos de provedor. O teste REST com transporte simulado roda somente em banco local descartável e impede uso de credenciais reais. A CI também verifica as funções com Deno, testes unitários, tipos, lint, build e navegador.

## Configuração necessária para um piloto real

1. Verificar um domínio controlado pelo projeto no Resend, configurando os registros DNS exigidos. As duas conexões consultadas estavam sem domínios.
2. Publicar as rotas da aplicação e configurar no servidor `EMAIL_PROVIDER_DATABASE_URL` com a URL exata de desenvolvimento, `EMAIL_PROVIDER_SERVICE_KEY`, `EMAIL_FROM` e `RESEND_WEBHOOK_SECRET`. Nunca usar prefixo `NEXT_PUBLIC_` nessas credenciais.
3. Cadastrar o webhook no provedor apontando para `/api/email/events`, selecionar os eventos suportados e testar a assinatura. O remetente deve corresponder exatamente a `EMAIL_FROM`.
4. Configurar na função de desenvolvimento `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_ALLOWED_RECIPIENTS`, `RESEND_WEBHOOK_SECRET` e `EMAIL_SEND_ENABLED=true`. Usar chave limitada a envio e somente destinatários de teste consentidos.
5. Conferir o cancelamento por POST e o recebimento dos eventos antes de abrir a trava `deliveryDeploymentEnabled` no código. Executar um piloto manual, verificar o registro durável e só depois definir agenda e orçamento dentro das cotas disponíveis.

O código recusa banco de produção, remetente de preview, endereço de teste e destinatário fora da lista. URLs, credenciais e domínio de produção não são inferidos pelo piloto. As mensagens antigas de preview não possuem token de cancelamento e não podem ser enviadas por este trabalhador.

## Revisão de segurança

As tabelas internas têm RLS e acesso exclusivo de serviço. `email_delivery_blocks` permite ao usuário ler somente seu próprio bloqueio. A RPC de reautorização usa `SECURITY DEFINER` deliberadamente para remover apenas o bloqueio voluntário da identidade obtida por `auth.uid()`, com confirmação obrigatória; `anon` e `PUBLIC` não podem executá-la. O aviso do advisor sobre essa RPC é esperado e o controle de escopo faz parte dos testes. Os avisos informativos de ausência de políticas nas tabelas internas refletem a negação de acesso a clientes. A proteção contra senhas vazadas já estava desativada antes desta mudança e não foi alterada.

O histórico de eventos e os hashes dos links ainda não têm limpeza automática: preservar esses registros evita invalidar cancelamentos e perder deduplicação de recibos. A retenção do conteúdo e das tentativas segue `email-message-operations.md`.
