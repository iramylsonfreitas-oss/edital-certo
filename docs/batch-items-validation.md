# Carga de itens e identificação de TI — 20/10/2026

## Escopo pronto para revisão

- Rotina `enrich-pncp-items`, independente da coleta principal, com até oito páginas por execução, pausa de seis segundos, timeout de dez segundos e orçamento de execução de 75 segundos.
- Fila por contratação, reserva temporária de 150 segundos, retomada por página e retentativas. HTTP 429 interrompe a rodada e adia a contratação por uma hora.
- Área temporária restrita ao serviço. A última versão completa dos itens é substituída em uma transação somente depois da última página. Falhas não apagam o resultado anterior.
- Alteração no objeto ou na versão da fonte reinicia a fila e invalida a evidência antiga. Uma resposta atrasada com reserva antiga é recusada.
- Evidências específicas nos itens podem incluir uma contratação genérica no catálogo de TI. Exclusões absolutas do objeto são preservadas. Munição, tablet de chocolate, computador de bordo e peças mecânicas com menção auxiliar a software não são tratados como fornecimento de TI.
- Busca e pontuação consideram o texto dos itens, limitado a 64.000 caracteres por contratação. Os itens completos permanecem armazenados e paginados. Consultas e pontuação em lotes excepcionalmente extensos ainda precisam de uma estratégia além desse limite.
- Itens já sincronizados são exibidos sem nova chamada ao PNCP, com data da consulta. Falha na leitura do banco preserva o caminho de consulta ao vivo. Documentos continuam sob demanda nesta etapa.
- Revisão do checkpoint da coleta principal: após `succeeded`, o próximo ciclo começa novamente; um checkpoint parcial antigo não é reutilizado depois de um ciclo concluído.

## Separação e segurança

Mudanças divididas em duas migrations: `20261020122421_batch_pncp_items.sql` adiciona estruturas e funções; `20261020123015_activate_batch_pncp_items.sql` ativa os gatilhos e cria a fila inicial. Não há atualização indiscriminada do campo `is_ti` no catálogo existente.

Fila, reservas e área temporária têm RLS e permissões exclusivas de `service_role`; as funções usam `security invoker`, `search_path` vazio e execução revogada de `anon` e `authenticated`. O worker valida o token privado já existente. O parser compartilhado não aceita URLs arbitrárias de rede nem persiste estimativas marcadas como sigilosas.

## Evidências no desenvolvimento

Ambiente confirmado pela listagem da conta: `edital-certo-dev` (`afbuozouupuguvkkuvib`).

- Primeira rodada: oito páginas, oito contratações concluídas, 50 itens, nenhuma falha.
- Segunda rodada: oito páginas, oito contratações concluídas, 94 itens, nenhuma falha.
- Terceira rodada: oito páginas, oito contratações concluídas, 88 itens, nenhuma falha. Acumulado inicial: 24 contratações e 232 itens.
- Quarta rodada: oito páginas, oito contratações concluídas, 86 itens, nenhuma falha. Acumulado: 32 contratações e 318 itens.
- A contratação `18080655000182-1-000093/2026`, descrita genericamente como equipamentos e materiais permanentes para atenção primária à saúde, foi identificada pelos itens. A revisão confirmou no-break e projetor multimídia; um eletrocardiógrafo com menção a computador foi excluído da evidência de TI.
- Revisão dos resultados encontrou um falso positivo em `00394452000103-1-018837/2026`: itens de peças mecânicas citavam software como meio de operação. A regra foi corrigida; esse exemplo entrou no teste SQL. Não é contado como oportunidade de TI recuperada.
- `supabase/tests/batch-pncp-items.sql` passou com transação revertida: proteção de permissões, reservas distintas, preservação do snapshot anterior, pausa por 429, rejeição de reserva antiga, promoção por item, busca textual, atualização vazia, sigilo e invalidação por alteração da fonte.
- Os 33 casos de classificação SQL anteriores passaram após a adaptação para evidência por itens.
- 43 testes unitários passaram, incluindo cache na interface, fallback ao PNCP, pontuação por itens e reinício do ciclo após sucesso. TypeScript e build passaram. Lint sem erros, com um aviso preexistente no coletor.
- O teste autenticado no navegador continua pendente. A checagem de segurança identificou apenas os avisos informativos esperados para fila/área temporária sem políticas públicas e o aviso preexistente sobre proteção contra senhas vazadas.

## Produção: pendente de autorização

Produção continua sendo `iramylson@gmail.com's Project` (`mbjysvmcikovndohacnq`). A tentativa de aplicar a migration aditiva foi recusada pela revisão automática, que considerou a autorização de ativação em produção insuficiente. Essa tentativa não aplicou a migration. Não foram usados caminhos alternativos para contornar a recusa.

Não mesclar esta alteração antes da autorização e das migrations: a nova interface consulta colunas que ainda não existem em produção. A implantação de preview também depende de um ambiente de banco que contenha essas colunas.

## Sequência após autorização

1. Aplicar as duas migrations em produção, na ordem.
2. Publicar `enrich-pncp-items` com o parser compartilhado e a configuração Deno; publicar o coletor com a correção do checkpoint.
3. Executar uma rodada manual limitada, conferir os dados persistidos, a classificação e a recusa de chamadas sem token.
4. Aplicar `supabase/ops/schedule-item-enrichment.sql`: execução nos minutos 5, 20, 35 e 50 de cada hora. O agendamento de três horas da coleta principal permanece separado.
5. Mesclar após CI, confirmar a publicação e verificar a interface autenticada.

Para interromper a carga, desativar o agendamento `edital-certo-pncp-itens` e aguardar o término da rodada em curso antes de qualquer intervenção nas reservas. Não é necessário apagar fila, itens, empresas ou usuários.
