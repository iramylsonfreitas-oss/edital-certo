# Itens e documentos no detalhe da contratação

## Comportamento

Ao abrir uma contratação autenticada, a página consulta os itens e documentos públicos no PNCP. As duas seções são renderizadas de forma independente com Suspense: o texto do edital pode aparecer antes de a fonte externa responder. Nenhuma chave de serviço é usada nessa consulta.

O número de controle do registro é validado antes de montar a URL, cujo domínio é fixo. Não são usadas URLs enviadas pelo navegador para fazer requisições no servidor.

- Itens: descrição, quantidade, unidade, situação e valores estimados, com até 50 por página e navegação para as próximas páginas.
- Orçamento sigiloso: valores são ocultados e recebem a indicação correspondente. Zeros explicitamente informados em itens sem sigilo continuam sendo exibidos.
- Documentos: título, tipo, data de publicação e link fornecido pelo PNCP. Arquivos inativos são omitidos e links fora de HTTP/HTTPS são bloqueados.
- Lista vazia, HTTP 204 e falha de rede têm mensagens distintas. Erros HTTP 404, 429 e 500 não são apresentados como ausência de dados.
- Timeout de oito segundos por consulta e cache público de cinco minutos. Falhas em uma seção não impedem a outra nem as ações de favorito.
- O link do portal PNCP é usado como alternativa quando o registro não contém link válido do sistema de origem.

A consulta ao vivo continua disponível. A carga em lote e o uso de itens salvos estão preparados conforme `docs/batch-items-validation.md`; sua ativação em produção depende das migrations e da autorização registrada ali. Documentos continuam sob demanda, sem carga em lote nesta etapa.

## Fontes oficiais verificadas

- Manual de Integração do PNCP v2.6, seção 11.13: https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_itens_de_uma_contratacao.html
- Manual de Integração do PNCP v2.6, seção 11.8: https://pncp.gov.br/manual/pt-br/latest/contratacao/consultar_todos_documentos_de_uma_contratacao.html
- Respostas reais e origem documentadas em `fixtures/pncp/attachments/README.md`.

## Verificações

39 testes unitários passaram, incluindo nove do conector e cinco da renderização das seções. As respostas reais retornam um item e quatro documentos, que foram verificados na saída HTML dos componentes. Há cenários de sigilo, URL inválida, registros duplicados, timeout, erro, lista vazia e paginação. TypeScript, lint e build passaram; permanece um aviso preexistente de função não utilizada no coletor.

O teste com uma sessão autenticada real no navegador continua pendente. A instalação local do Chromium falhou; os testes de navegador disponíveis são executados pelo CI. Eles cobrem os fluxos públicos existentes, não o detalhe autenticado.
