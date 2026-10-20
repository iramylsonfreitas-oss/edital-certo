# Validação do filtro de TI — 20/10/2026

## Problema corrigido

O protótipo público filtrava TI, mas `search_tenders_for_list` consultava todos os setores do catálogo persistido. O perfil calculava aderência depois da paginação e não substituía esse filtro.

A migration `20261020113516_classify_ti_catalog.sql` classifica o objeto de cada contratação, mantém os registros originais e restringe a busca padrão a TI antes de contar e paginar. Favoritos e descartes já selecionados pelo usuário permanecem acessíveis. O contador e os gráficos também passam a consultar TI.

O campo `is_ti` é calculado por trigger na inserção ou alteração do objeto; a busca usa um índice parcial de prazo. As funções usam `security invoker`, `search_path` vazio e permissões restritas ao serviço. Nenhuma política de acesso entre organizações foi ampliada.

## Amostra revisada

Revisão técnica feita pelo assistente, sem validação comercial humana. Seleção determinística por `md5(source_id)` no desenvolvimento: 20 aceitos e 20 rejeitados que continham termos ambíguos como sistema, rede, servidor e monitor. Essa amostra dirigida não estima precisão ou cobertura de todo o PNCP.

- Os 20 aceitos continham produtos ou serviços de TI, inclusive editais mistos com equipamentos de informática.
- Entre os 20 rejeitados, 19 não indicavam TI no objeto ou precisavam da lista de itens para uma decisão. Um era uma compra legítima de TI descartada: `00508903000188-1-002026/2026`, discos rígidos para Storage Server.
- Foram acrescentados `storage server`, `disco rígido` e `discos rígidos` às evidências fortes. A descrição real entrou nos testes.
- Monitores de vídeo também receberam evidência específica, com teste negativo para monitor cardíaco. A regra foi atualizada no protótipo e no banco.
- Descrições genéricas de materiais permanentes continuam exigindo consulta aos itens. Regras textuais ainda podem confundir o destinatário da compra com o objeto, ou excluir objetos mistos; A03 permanece em andamento.

## Evidências de execução

- Produção: `iramylson@gmail.com's Project`, separado de `edital-certo-dev`.
- A segunda rodada do novo coletor retomou da página 7 para a 17: 500 registros, 499 inseridos, 1 atualizado, sem erro. A coleta nacional continua parcial.
- Após essa rodada: 4.920 contratações armazenadas; a regra revisada identificou 273 de TI, com 256 propostas ainda não encerradas no instante da consulta. Esses números são uma fotografia do catálogo parcial.
- 33 casos SQL passaram no desenvolvimento e na produção; o teste inclui comparação do cache com o classificador e ausência de registros fora de TI na busca padrão.
- Busca testada com papel `authenticated`, sem executar a classificação como usuário final. A primeira página retornou apenas TI.
- `EXPLAIN ANALYZE` da primeira página em produção: 50 registros, 15,746 ms de execução no banco. Isso não mede o carregamento completo no celular.
- Testes locais do coletor: 37/37. Testes unitários: 25/25. TypeScript e build passaram; lint sem erros, com um aviso preexistente de função não utilizada no coletor.

## Próximas verificações

Revisar uma amostra independente de produção, carregar itens e documentos para objetos genéricos e validar a jornada autenticada no navegador após a publicação. Não considerar A02 ou A03 concluídas com base em duas rodadas e uma amostra dirigida.
