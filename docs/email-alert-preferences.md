# Preferências pessoais de alerta

Esta etapa prepara as preferências de e-mail; não cria um job de envio nem ativa o Resend. A tela informa essa limitação antes do formulário e nos estados de sucesso. Nenhum e-mail foi enviado na validação.

## Comportamento

- Cada preferência pertence ao usuário destinatário e a uma organização. O destino futuro é o e-mail confirmado da conta, nunca um endereço arbitrário informado por um colega.
- A autorização começa desmarcada e é necessária para salvar pela interface. O horário diário usa o fuso escolhido explicitamente; o padrão visual é Brasília, com Boa Vista e demais opções brasileiras disponíveis.
- Apenas administradores e analistas podem criar. Um destinatário ainda membro pode consultar, alterar, pausar ou excluir suas próprias preferências, mesmo após virar leitor. Colegas e administradores da mesma organização não podem ler ou controlar preferências de terceiros.
- Pausar conserva a autorização anterior, permitindo retomada. Desabilitar o canal no banco revoga a autorização; uma nova autorização registra um novo horário no servidor. Excluir remove a preferência e seu histórico de entregas associado. A fila de preparação mantém um registro pessoal para deduplicação, sujeito às regras de acesso e exclusão da conta.
- A retomada de alertas imediatos confere novamente o plano. Uma redução de plano não impede pausar ou excluir uma preferência existente.
- Configurações exatamente iguais para o mesmo destinatário são únicas, inclusive quando pausadas. Isso evita cadastros repetidos; não substitui a idempotência da futura entrega.
- Falhas de consulta aparecem como erro, sem serem apresentadas como uma lista vazia. As mutações exigem o retorno da linha alterada para não anunciar sucesso quando RLS não encontrou uma linha permitida.

## Banco e implantação

Migration: `20261020180434_personal_email_alert_preferences.sql`.

`alerts.recipient_user_id` usa `auth.uid()` apenas em novas inserções. Registros antigos não recebem um destinatário presumido: ficam sem destinatário, pausados e com o canal de e-mail desabilitado. Se existirem, devem ser recriados pelo interessado com nova autorização.

O trigger mantém destinatário e organização imutáveis, valida o nome do fuso contra `pg_timezone_names`, exige precisão de minutos no horário e controla `email_consent_at` no servidor. Um cliente não pode antecipar a data da autorização nem mudá-la na pausa. RLS exige propriedade pessoal e vínculo atual com a organização; o histórico segue a mesma regra via a preferência. A exportação da conta inclui destinatário e autorização e filtra o usuário autenticado explicitamente.

Aplique a migration antes de publicar a nova interface. Ela acrescenta colunas e mantém os campos antigos para compatibilidade. O serviço de entrega permanece ausente e desativado.

## Validação

`supabase/tests/personal-email-alerts.sql` executa uma transação no projeto de desenvolvimento e desfaz todos os dados sintéticos. Verifica isolamento entre colegas e organizações, tentativa de redirecionar destinatário, autorização forjada, retirada e renovação da autorização, horários inválidos, duplicidade, histórico pessoal, pausa, redução de plano e exclusão. O teste passou no desenvolvimento. Lint e TypeScript passaram; os 52 testes unitários existentes passaram. O lint conserva um aviso anterior no coletor PNCP, sem erro.

Na conferência da interface publicada, verificar aviso de envio pendente, botão de salvar desabilitado antes da autorização, opções de fuso e ausência de erros de carregamento. Não marcar autorização em nome de um usuário real para criar dados de teste. O ciclo completo de autorização e controle já é exercitado com contas sintéticas apenas no desenvolvimento.

## Próxima etapa

O processamento paginado e a fila de preparação foram acrescentados em `docs/email-alert-queue.md`. Falta a entrega: montar resumos HTML/texto, aplicar idempotência e novas tentativas no provedor, incluir descadastro e tratar eventos de entrega/devolução. Antes de cada tentativa real, revalidar preferência habilitada, autorização, associação à organização, e-mail confirmado, critérios e prazo. Validar por simulação antes de ativar o remetente.

As contas Resend conectadas foram consultadas nesta etapa e não tinham domínios de envio cadastrados. A ativação real exige definir remetente e domínio, verificar o DNS e configurar as credenciais no servidor.
