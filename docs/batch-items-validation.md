# Carga de itens e identificação de TI — 20/10/2026

## Escopo implementado

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
- A checagem de segurança identificou apenas os avisos informativos esperados para fila/área temporária sem políticas públicas e o aviso preexistente sobre proteção contra senhas vazadas.

## Ativação em produção — 20/10/2026

Após autorização do usuário, as duas migrations foram aplicadas em produção (`mbjysvmcikovndohacnq`), na ordem. A rotina `enrich-pncp-items` está ativa na versão 1, com o mesmo hash validado em desenvolvimento (`8c066cd75e2627dc6913cdbb6c149cdc8d39abde9135a93b0cd874557efe3e78`). O coletor principal foi atualizado para a versão 3 com a correção do checkpoint.

- Rodada limitada: HTTP 200, oito páginas, oito contratações concluídas, 88 itens e nenhuma falha. O estado `partial` indica que ainda há fila a processar.
- Duas contratações passaram a ser identificadas pelos itens: `04888830000158-1-000008/2026` (notebooks, impressoras, no-breaks e tablets) e `14472412000139-1-000008/2026` (desenvolvimento e locação de software).
- Chamada sem token: HTTP 401. Usuários autenticados não têm SELECT na fila nem na área temporária; possuem acesso de leitura aos itens. Nenhuma estimativa sigilosa apareceu preenchida e a área temporária ficou vazia ao fim da rodada.
- Agendamento `edital-certo-pncp-itens` ativo nos minutos 5, 20, 35 e 50. A coleta principal continua no agendamento separado de três horas.
- Navegador autenticado validado em produção em 20/10/2026: login por senha, lista com indicação de TI pelos itens e detalhe de `18080655000182-1-000093/2026` com 33 itens salvos, data da consulta e link do edital oficial. Não foram alterados favoritos, perfis ou pipeline durante essa checagem. O CI cobre os fluxos públicos; testes unitários cobrem renderização e fallback.
- Primeira execução agendada às 09h05 (America/Boa_Vista): oito contratações e 42 itens, sem falhas. Acumulado das duas rodadas: 16 contratações, 130 itens e três contratações identificadas pelos itens.
- A leitura do histórico operacional é restrita; a interface distingue a indisponibilidade desse status da disponibilidade do catálogo salvo.

A cobertura cresce gradualmente conforme a fila é processada. Essa primeira rodada não demonstra cobertura nacional completa.

Para interromper a carga, desativar o agendamento `edital-certo-pncp-itens` e aguardar o término da rodada em curso antes de qualquer intervenção nas reservas. Não é necessário apagar fila, itens, empresas ou usuários.
