# Retirar e restaurar acompanhamento

O botão **Retirar do acompanhamento** arquiva o cartão. A visualização **Arquivados** permite restaurá-lo na etapa anterior com responsável, anotações e checklist preservados. Comentários e documentos vinculados não são excluídos.

Arquivados deixam de participar do painel e dos prazos baseados no pipeline. Favoritos são independentes: uma licitação favoritada continua em Prazos mesmo com cartão arquivado. O catálogo público não é alterado.

Ao tocar novamente em Acompanhar no catálogo, o mesmo cartão é reativado, preservando dados e autoria. A operação é atômica por organização/contratação, sem criar duplicatas. Novas oportunidades continuam entrando em Triagem.

## Permissões e auditoria

A função `follow_tender` é security invoker, com search_path vazio, disponível somente para authenticated e sujeita às políticas existentes. Administradores e analistas podem alterar; leitores apenas consultam. O arquivamento e a restauração registram eventos no mecanismo privado de auditoria existente. Não são ampliadas permissões de acesso entre organizações.

## Validação

`supabase/tests/archive-pipeline-cards.sql` passou no desenvolvimento com rollback: criação idempotente, arquivamento, restauração no mesmo ID, preservação de dados e comentário, eventos de auditoria, permissão de analista, bloqueio de leitor, isolamento entre organizações e ausência de EXECUTE para anon.

44 testes unitários e checagem de tipos passaram. Lint sem erros, com um aviso preexistente no coletor. A publicação requer as migrations `20261020140334_archive_pipeline_cards.sql` e `20261020140616_audit_pipeline_archive_changes.sql`, nessa ordem, antes da nova interface.
