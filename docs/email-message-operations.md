# Operação e retenção das mensagens

Escopo: preparação e manutenção em desenvolvimento. Nenhum provedor ou envio real foi ativado.

## Implantação de desenvolvimento em 26/10/2026

A migração foi criada pelo CLI e aplicada no projeto `afbuozouupuguvkkuvib`. O arquivo foi alinhado ao identificador gerado no banco: `20261026194430_email_message_operations.sql`, MD5 `3d43efdd5c3a4e0c914e50278566c073`. Não houve alteração em produção.

Os testes SQL passaram antes e depois da aplicação, sempre com rollback dos dados sintéticos. A manutenção sobre os dados atuais retornou quatro contadores zerados. A agenda diária foi ativada para 03h20 UTC (23h20 no fuso UTC-4), após simulação com rollback. O comando exato armazenado no job foi executado manualmente e registrou `maintenance_only`, `sends_email=false` e zero alterações. A primeira execução diária pelo relógio foi confirmada com sucesso em 27/10/2026 às 03h20 UTC (26/10 às 23h20 em Boa Vista).

O script `supabase/ops/schedule-email-message-maintenance.sql` registra apenas contagens no histórico operacional, sem endereços ou conteúdo. Não usa rede, token ou credencial de provedor. Usa as extensões e cotas existentes; nenhum serviço pago foi contratado.

## Resultados incertos

`maintain_email_message_history(p_limit)` encerra uma mensagem em `dispatching` somente depois que a concessão expira e que a janela de 23 horas ou o limite de cinco tentativas termina. A tentativa aberta fica registrada como `unknown`, a mensagem fica `uncertain` e o token antigo é invalidado. Os itens continuam vinculados à mesma mensagem. Nenhum retry ou nova identidade é criado pela manutenção.

Para mensagens em `retry` além da janela/limite, o encerramento é `uncertain` se houve resultado desconhecido ou conflito; caso contrário é `failed`. Uma concessão ainda válida não é interrompida. A recuperação normal dentro da janela continua sendo responsabilidade do trabalhador; esta função não chama o trabalhador de entrega.

A consulta administrativa em `supabase/ops/check-email-message-staging.sql` mostra os identificadores necessários à investigação sem retornar endereço ou conteúdo. Enquanto não houver integração com um provedor, a ação operacional para `uncertain` é manter a reserva e investigar. Não alterar para `sent`, liberar itens ou recriar a mensagem para tentar eliminar o aviso. A futura conciliação precisará de confirmação do provedor com a mesma identidade e histórico auditável.

## Retenção conservadora

| Registro | Regra |
|---|---|
| Mensagem aceita | Remove mensagem, conteúdo e tentativas após 90 dias, somente com aceite registrado e todos os itens da fila ainda em `sent` |
| Fila de mensagem aceita | Preservada como registro de deduplicação, mesmo após a limpeza da mensagem |
| Cancelada sem tentativa | Remove após 30 dias da criação, somente sem tentativa e sem item vinculado |
| Incerta, falha ou ativa | Preservada, com seus vínculos; não participa da limpeza |
| Aceita recentemente ou com item fora de `sent` | Preservada |

Na limpeza de aceitas, criação, primeiro início e todas as finalizações precisam ser anteriores ao corte de 90 dias. Tentativa sem finalização impede a limpeza. Os itens da fila são bloqueados e conferidos novamente antes da remoção. O orçamento é compartilhado entre encerramentos e remoções: padrão 50 mensagens, mínimo 1 e máximo 100 por chamada. Linhas disputadas por outro trabalhador são ignoradas.

Esses prazos são escolhas operacionais desta implementação. Ainda não há limpeza automática de mensagens `failed`/`uncertain`, filas de deduplicação ou logs gerais de ingestão. Não remover esses registros para economizar espaço antes de existir uma política de anonimização que preserve o bloqueio de reenvio.

A RPC é exclusiva de `service_role`; não cria permissão para usuários comuns. Retorna apenas quatro contadores: `quarantined`, `expired_failed`, `purged_accepted` e `purged_canceled`. Não recebe data de corte arbitrária, transporte ou destinatário.

## Validação

`supabase/tests/email-message-operations.sql` testa quarentena, tentativa desconhecida, bloqueio de reenvio, falha sem incerteza, concessão válida, retenção de aceitas/canceladas, preservação dos registros protegidos, orçamento e permissões. Usa dados sintéticos e rollback.

A CI anterior falhou no teste de concorrência por supor que um lote vencedor consumia toda a fila. Com `SKIP LOCKED`, outros seletores podem manter temporariamente bloqueados alguns itens e deixá-los para outra rodada. O runner agora drena os lotes restantes dentro do limite da fixture e exige ausência de itens preparados sem reserva, sem reduzir a verificação de exclusividade.
