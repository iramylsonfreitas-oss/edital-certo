# Acesso de avaliação

O operador cria uma conta individual usando a API administrativa `auth.admin.createUser`, com senha aleatória, `email_confirm: true` e `app_metadata.evaluation_account: true`. Endereço reservado: `avaliador@example.com`. Não há envio de convite, recuperação por e-mail ou aceitação automática dos termos em nome do avaliador.

O operador registra o UUID da conta e o UUID do gestor em `private.evaluation_access` e cria uma organização exclusiva da avaliação. Esse registro é feito fora da interface pública, com privilégio administrativo. Nenhuma senha, chave administrativa ou credencial é versionada.

O gestor entra com sua própria conta em `/settings/access`. RPCs com identidade derivada de `auth.uid()` permitem listar e bloquear/reativar somente avaliadores que ele gerencia. O avaliador não pode se reativar nem gerenciar terceiros. A tabela privada não é exposta pela API.

Políticas RLS restritivas somam a verificação de acesso às políticas existentes de organização e autoria. A verificação consulta o estado atual no banco por instrução, sem depender de expiração/refresh de JWT. Contas comuns continuam autorizadas pelas mesmas políticas existentes. Processos com `service_role` permanecem operacionais. Novas tabelas expostas em futuras migrações devem receber a mesma política `evaluation_access_required`.

Bloquear significa `enabled=false`, nunca excluir o registro: ausência de registro identifica uma conta comum. A função de gestão não permite excluir nem trocar o gestor. A página já exibida ou uma cópia feita pelo avaliador não pode ser retirada, mas novas consultas e gravações são negadas. O proxy redireciona o avaliador bloqueado na próxima requisição protegida; a proteção real é feita no banco. A flag assinada no JWT apenas evita uma consulta adicional no proxy para usuários comuns.

Reativação restaura o acesso à mesma conta e aos seus dados de teste. Não foi contratado serviço novo nem ativado envio real de alertas. O bloqueio da conta específica não altera a possibilidade preexistente de cadastro público de outras contas.
