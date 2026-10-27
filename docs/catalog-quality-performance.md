# Qualidade dos resultados e velocidade — 27/10/2026

Prioridade atual: validar A02, A03 e A06 do plano comercial antes de ampliar o produto. A revisão foi feita na versão pública e por consultas somente de leitura na base de produção. Não ativa e-mail, cobrança ou serviços pagos.

## Captura pública

Fonte: `https://iramylsonfreitas-oss.github.io/edital-certo/data/dados.json`. Captura de 27/10/2026 às 08h39 UTC, status `ok`, 1.195 registros e 3.035.546 bytes. SHA-256: `1bd18be4b5c9af43902101d95101c037b1e577110522ea65e92ea46c0cd975b8`.

| Verificação | Resultado |
|---|---:|
| Identificadores PNCP duplicados | 0 |
| Objetos vazios | 0 |
| Prazos ausentes ou não interpretáveis | 0 |
| UFs representadas | 27 |
| Sem link do sistema de origem | 238 |
| Grupos com mesmo órgão, objeto e prazo, mas IDs diferentes | 6 |

Na primeira observação ao vivo, a busca padrão exibiu 919 cartões simultâneos. Durante a análise, 281 registros da captura já tinham encerrado o prazo. Essa contagem muda ao longo do dia. O coletor mantém encerrados por até sete dias e a interface os oculta por padrão. Presença na captura não significa que a contratação continua aberta. Não remover automaticamente procedimentos de IDs diferentes só por repetirem órgão e descrição.

O JSON do protótipo e o catálogo autenticado têm processos de coleta e retenção diferentes. Suas quantidades não representam o mesmo universo e não devem ser somadas ou apresentadas como cobertura completa do PNCP.

## Revisão técnica da amostra

Seleção reproduzível: ordenar pelo MD5 do identificador e examinar os primeiros 40 objetos. A evidência integral e o rótulo de cada registro estão em `catalog-quality-review-20261027.json`.

| Resultado da revisão do objeto | Registros |
|---|---:|
| TI explícita no objeto | 29 |
| Compra mista que inclui TI | 8 |
| Exige termo de referência para decidir o escopo | 1 |
| Fora de TI | 2 |

Os dois falsos positivos identificados são `92963560000160-1-001374/2026` (levantamento de edificação com nuvem de pontos) e `52030830000165-1-000104/2026` (reforma de pisos da área de TI). Uma palavra pode indicar o local da obra ou outro significado técnico, sem caracterizar a aquisição de TI. Esses casos precisam entrar na revisão coordenada do classificador do coletor e do banco. Esta alteração de desempenho não muda o classificador.

A amostra é composta somente por registros já aceitos. Não mede falsos negativos, cobertura nacional ou precisão de todo o PNCP. Compras mistas não são automaticamente incorretas; exigem revisão de itens e validação comercial. A03 continua em andamento.

## Coleta e banco de produção

A conferência encontrou 14.585 contratações persistidas, 999 classificadas como TI e 275 com prazo futuro naquele instante. As últimas oito rodadas de ingestão não tinham erro: cinco `succeeded` e três `partial`. As três parciais processaram páginas e avançaram até a rodada seguinte `succeeded`; parcialidade por orçamento de páginas não significa indisponibilidade. Isso valida as rodadas observadas, sem afirmar estabilidade indefinida.

Uma execução da primeira página de `search_tenders_for_list`, com papel `authenticated` e sem identidade de usuário real, retornou 50 linhas em 533,509 ms no banco. É uma medição isolada, não o tempo de carregamento do celular. Não houve gravação ou alteração de credenciais, contas ou registros reais.

## Correção de velocidade

A versão pública passa a renderizar 50 cartões por página. Busca, perfil, contagens e ordenação continuam usando a lista completa. Filtros novos retornam à primeira página; a navegação anterior/próxima mantém o filtro. Nenhum registro é removido para reduzir o trabalho de renderização.

Os formatadores de data são reutilizados. Cada renderização calcula prazo e aderência uma vez por registro e reaproveita os resultados nas contagens, com o mesmo instante de referência. O limite exato do encerramento e a virada do dia no fuso de Brasília permanecem cobertos pelos testes.

A CI `Public catalog quality and mobile performance` serve o HTML e o JSON localmente, sem consultar o PNCP. Reproduz o relógio da captura, mantendo `performance.now()` real. Testa largura de 360 px, ausência de rolagem horizontal, paginação sem repetição, busca além dos primeiros 50 registros, estado vazio e limites de data. Compara três renderizações da versão anterior e da nova no Chromium com CPU desacelerada quatro vezes. Os números medem renderização em laboratório, sem simular a rede ou substituir teste em aparelho físico.

## Pendências desta prioridade

1. Corrigir os dois significados ambíguos com regressões coordenadas no coletor e no banco.
2. Revisar itens/TR dos nove casos mistos ou indefinidos e obter validação comercial humana.
3. Verificar falsos negativos em amostra independente de registros rejeitados.
4. Completar links oficiais quando o sistema de origem não informa endereço.
5. Medir a jornada autenticada com conta sintética e reavaliar o fallback que carrega o JSON completo em buscas vazias.

A02, A03 e A06 só devem ser encerradas depois dessas verificações e do teste na versão publicada.
