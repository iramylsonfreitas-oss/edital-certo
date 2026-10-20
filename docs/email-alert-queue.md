# Preparação automática de alertas

O worker `prepare-email-alerts` pontua oportunidades e prepara registros persistentes. Não chama Resend, não recebe endereços de e-mail e não possui chave ou opção de ativar envios. As mensagens e a entrega são uma etapa posterior.

## Critérios e deduplicação

- Processa perfis ativos de TI e contratações PNCP classificadas como TI, divulgadas (`situacaoCompraId=1`) e com prazo futuro conhecido. Suspensas, anuladas, revogadas e encerradas ficam fora.
- Usa a mesma função `scoreTender` da busca, incluindo itens, filtros regionais, exclusões, valores e dados efetivamente disponíveis. Não presume preço, exclusividade ou CNAE ausentes. Perfis vazios ou apenas com exclusões, e resultados de score zero, não entram na fila.
- Exige preferência habilitada, canal autorizado, data de autorização, e-mail confirmado, conta não bloqueada/excluída, vínculo atual com a organização e recurso do plano. A elegibilidade é conferida ao reservar e salvar a página.
- Há uma linha por usuário/licitação, inclusive com perfis ou organizações sobrepostos. A preferência de menor horário previsto tem precedência; em empate, o maior score. Entradas inválidas podem ser substituídas por outra preferência válida. Um registro marcado como enviado não volta à preparação. Esse estado só foi simulado em transação de teste; não existe envio nesta versão.
- Para resumo diário, calcula o próximo horário no fuso escolhido; se o horário do dia passou, usa o dia seguinte. Uma oportunidade que encerra antes desse horário não é preparada para esse resumo. O modo imediato deixa o registro disponível desde a preparação, conforme o plano; não significa envio instantâneo nesta versão.

## Execução e recuperação

`email_alert_scans` guarda um cursor por preferência/perfil, configurações, prazo de reserva e contadores. Apenas `service_role` tem acesso. A seleção usa `FOR UPDATE SKIP LOCKED`; cada página tem token exclusivo e reserva de dois minutos.

Cada página contém até 100 contratações e congela seus identificadores e versões. Um ciclo considera somente registros existentes em seu início. Mudanças no perfil ou na preferência invalidam a página e reiniciam o ciclo. Mudanças na fonte ou encerramentos ocorridos durante a pontuação fazem o registro ser ignorado; o próximo ciclo o reavalia. Versões incluem o órgão, sem sobrescrever campos da contratação no cálculo do hash.

Salvar resultados, atualizar matches, deduplicar a fila e avançar o cursor ocorre em uma única transação. Uma falha não avança o cursor. O registro de falha agenda nova tentativa após cinco minutos; uma interrupção antes disso pode ser recuperada após vencer a reserva. Um ciclo concluído aguarda quinze minutos antes de recomeçar. Há limite de seis páginas e orçamento de cinquenta segundos por execução, conferido entre páginas.

Uma limpeza limitada a 500 entradas por execução cancela preparações que perderam autorização, vínculo, perfil, validade do plano, prazo ou versão dos dados. A futura entrega deverá repetir a validação imediatamente antes de cada tentativa; o estado da fila por si só não autoriza envio.

`email_alert_queue` permite somente leitura do próprio destinatário enquanto membro da organização. O cliente não pode inserir, marcar como enviado ou executar os RPCs de processamento. A exportação da conta inclui a fila pessoal. Excluir uma preferência/perfil desvincula a referência e a limpeza cancela a preparação; a chave de deduplicação permanece até a exclusão dos dados associados. Os logs guardam contadores e erros genéricos, sem e-mails, perfis completos ou segredos.

## Implantação e operação

1. Aplicar `20261020182944_prepare_email_alert_queue.sql` no projeto correto.
2. Publicar `supabase/functions/prepare-email-alerts` com os módulos locais de pontuação. `verify_jwt=false` usa o token privado existente `x-ingestion-token`, validado contra Vault; não é endpoint público de processamento.
3. Executar `supabase/ops/schedule-email-alert-preparation.sql` somente após a função estar ativa. A agenda roda nos minutos 8, 23, 38 e 53, usando URL e token do Vault, sem imprimi-los.
4. Conferir `ingestion_runs` com `source_key='email-alert-preparation'`: `metadata.mode='prepare_only'` e `sends_email=false`. Não expor a tabela operacional inteira aos usuários para mostrar esse status.
5. Publicar a interface: ela mostra a contagem pessoal em preparação e informa que a entrega permanece pendente.

Para interromper somente esta rotina, remover o job `edital-certo-preparar-alertas`. Os dados e os coletores PNCP continuam preservados.

## Validação realizada

- 57 testes unitários passaram, incluindo cinco cenários novos de preparação. TypeScript, lint e checagem Deno passaram; o lint mantém um aviso anterior no coletor PNCP.
- `supabase/tests/prepare-email-alert-queue.sql` passou no desenvolvimento com `service_role` real e rollback: 101 contratações em duas páginas, retomada, falha/backoff, reserva exclusiva, token antigo/repetido, sobreposição de perfis, mudança de configuração e fonte, prazo, registro enviado preservado, fusos de Boa Vista/Brasília, acesso pessoal e bloqueio por e-mail não confirmado ou remoção de vínculo.
- A função publicada no desenvolvimento foi invocada com o token do Vault e registrou execução bem-sucedida em preparação, sem envios. A ausência de preferências reais elegíveis resultou em zero páginas, como esperado.
- Um teste de integração criou conta e organização exclusivamente de teste no desenvolvimento e usou o catálogo real existente. A função respondeu HTTP 200, avaliou 376 contratações em quatro páginas e preparou três correspondências de score 100. Uma segunda varredura forçada avaliou as mesmas 376, inseriu zero duplicatas e manteve três registros. A conta, organização e fila de teste foram removidas após a conferência, sem alterar o catálogo.

## Ainda pendente

O conteúdo HTML/texto, a prévia e o núcleo de entrega simulada estão descritos em `docs/email-digest-preview.md`. Ainda faltam persistência e reserva das mensagens, integração com a fila e o provedor real, histórico de aceitação/entrega, descadastro, eventos assinados de devolução/reclamação e supressão. Exigem testes próprios antes da ativação real, além do remetente/domínio verificado e credenciais configuradas no servidor.
