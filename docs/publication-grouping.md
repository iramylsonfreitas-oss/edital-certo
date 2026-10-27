# Publicações equivalentes

O catálogo reúne publicações do PNCP quando há evidência suficiente de que representam a mesma compra. Os registros originais, seus IDs, arquivos e vínculos privados permanecem intactos. A primeira correspondência validada é Cruzaltense/RS, controles `04213529000144-1-000157/2026` e `04213529000144-1-000161/2026`.

## Critérios

- Mesmo órgão, código de unidade (zeros iniciais normalizados), número e ano da compra, modalidade, município, objeto normalizado, prazo, valor global, SRP, amparo legal e situação.
- O prefixo de publicação reconhecido `[Portal de Compras Públicas]` ou `[LICITANET]` não faz parte do objeto usado na comparação. Objetos originais não são reescritos.
- Coleta completa e atual dos itens, com pelo menos dois itens e quantidades/preços/unidades conhecidos. O resumo financeiro de todos os itens deve coincidir.
- Descrições iguais ou uma descrição que começa com a outra em uma fronteira de palavra, acrescida de especificações. Todas as combinações do conjunto precisam concordar; um conflito deixa o conjunto separado.
- Casos com dados insuficientes continuam separados. Título parecido, CNPJ e número/ano isoladamente não bastam. O agrupamento é uma interpretação operacional, não uma declaração jurídica de identidade.

O resumo de comparação é calculado na importação. Alterar itens invalida o agrupamento até um novo resumo completo; alterar metadados também o recalcula. Só chaves que aparecem mais de uma vez passam pela comparação detalhada durante a busca. Nenhum cache compartilhado contém favoritos, sessões ou cartões.

## Comportamento

A busca agrupa antes da paginação. Catálogo, favoritos, urgência e Painel contam oportunidades reunidas, não publicações. O resultado prefere a publicação com descrições de itens mais completas e mantém links para cada fonte e página original no detalhe. URLs antigas continuam válidas.

Um favorito antigo na publicação secundária permanece visível. Em caso de estados antigos conflitantes, favorito tem precedência sobre descartado. Uma nova ação de favoritar, descartar ou limpar atualiza o conjunto transacionalmente, somente para o usuário e organização autorizados. Isso permite remover um favorito antigo sem que ele reapareça por estar em outra publicação.

Acompanhar reutiliza um cartão ativo já existente em qualquer publicação. Se houver apenas um cartão arquivado, ele é reativado com suas notas e etapa. Novos acompanhamentos usam a publicação principal para evitar duplicação por cliques simultâneos em aliases. Cartões antigos múltiplos não são fundidos nem apagados; o pipeline mantém esse histórico e seus valores registrados. O cartão da UFMA criado pelo avaliador não foi alterado.

As RPCs usam `SECURITY INVOKER` e as políticas RLS existentes. As ações também exigem sessão, acesso ativo e papel adequado na organização. Testes transacionais cobrem favorito secundário, paginação, conflito de descrição, mudança de quantidade/unidade, preservação de anotações, acesso cruzado e avaliador bloqueado.

Limites atuais: o protótipo HTML público permanece independente e sem agrupamento. Não foi habilitado envio real de e-mails. Filtros por nomes e melhoria da busca por município continuam como próxima frente.
