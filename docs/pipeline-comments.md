# Comentários no acompanhamento

Cada cartão do pipeline tem um link **Ver comentários**, disponível também nos arquivados. O histórico mostra autoria, horário em Boa Vista e texto simples, com quebras de linha preservadas. O formulário aceita até 10.000 caracteres. Texto com marcação HTML é exibido literalmente.

Administradores e analistas podem comentar. Analistas podem excluir os próprios comentários; administradores podem moderar qualquer comentário da organização. A exclusão exige confirmação explícita. Leitores apenas consultam. A edição de comentários não tem interface nesta entrega; o banco mantém a regra existente que permite editar ao autor ainda autorizado e ao administrador.

As ações usam a sessão autenticada e RLS. A organização e o autor são obtidos no servidor, e não de campos enviados pelo navegador. Uma repetição do mesmo POST é reconhecida apenas se o identificador, cartão, autor, organização e texto coincidirem. Nenhuma credencial de serviço é usada pela aplicação.

## Autoria e auditoria

A migração `pipeline_comments_audit` acrescenta o nome do autor como retrato do momento da publicação, sem ampliar acesso à tabela de usuários. Comentários antigos recebem a identificação genérica **Integrante da equipe**. Nome e horário informados por um cliente são substituídos pelo nome cadastrado e pelo relógio do banco. Depois da criação, identificador, organização, cartão, autor, nome e data de criação são imutáveis.

Criação, alteração do texto e exclusão geram eventos `pipeline.comment_created`, `pipeline.comment_edited` e `pipeline.comment_deleted`. A auditoria guarda os identificadores e a identidade da sessão; não copia texto do comentário ou nome do autor. As funções de trigger ficam no esquema privado e não podem ser executadas por `anon` ou `authenticated`. A exclusão em cascata de uma organização não tenta inserir uma referência à organização já removida.

O histórico usa páginas de 20 comentários, com ordenação por data e UUID. O cursor mantém a precisão original do banco e passa por validação antes de ser usado no filtro. A página faz consultas limitadas para um cartão, sem consultar comentários para cada cartão do Kanban.

## Verificação e publicação

`supabase/tests/pipeline-comments.sql` exercita autoria, falsificação de rótulo, identidade imutável, moderação, leitor, outra organização, ex-membro e auditoria, com rollback de todos os dados sintéticos.

A CI `Pipeline comments integration` cria um Supabase local descartável e contas sintéticas com e-mail já confirmado, sem enviar mensagens. Verifica as permissões também por REST e abre o navegador para testar publicação, texto escapado, persistência, confirmação de exclusão, paginação de 23 comentários e acesso de outra organização. As credenciais privilegiadas ficam somente no script local de preparação; o navegador recebe apenas a chave pública com RLS.

Aplique a migração antes de publicar a interface. A entrega não configura armazenamento de anexos, convites ou envio de notificações. Esses itens permanecem no backlog e não são necessários para usar os comentários.

A migração `20261027104720_pipeline_comments_audit.sql` foi aplicada somente no desenvolvimento (`afbuozouupuguvkkuvib`) em 27/10/2026. O corpo instalado foi conferido por MD5 `0809ed71c44d6cb19f7ff70de30cff6a`. A regressão SQL passou também nesse ambiente, com rollback. A conferência independente confirmou zero comentários persistidos pelos testes. Não houve alteração no banco de produção.
