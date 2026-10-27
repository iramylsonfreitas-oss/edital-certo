# Lentidão na navegação autenticada

O problema relatado é a troca entre páginas da aplicação com login, independente da otimização anterior do catálogo HTML público. O fluxo observado é clique no menu ou busca → renderização Next → autenticação → consultas Supabase → página pronta.

## Evidência inicial em produção

Foi possível entrar pela autenticação segura e navegar na conta autorizada, sem alterar registros. Um ciclo de cliques até o título da página pronta observou Pipeline em 2.051 ms, Prazos em 2.579 ms, Painel em 3.040 ms e Oportunidades em 3.436 ms. São medições indicativas no navegador remoto, incluindo automação e rede, não métricas puras de servidor nem tempos garantidos no aparelho do usuário. O ensaio da paginação também ultrapassou a primeira espera do teste; não foi atribuída a ele uma duração exata porque a observação seguinte ocorreu depois.

A aplicação estava em `iad1` e o banco de produção em `us-west-2`. O código fazia a consulta do contador de prazos depois de aguardar a busca e demais consultas, acrescentando uma etapa sequencial. As rotas dinâmicas não tinham `loading.tsx`; por isso o menu podia parecer parado até o término dos dados. A busca por formulário e a limpeza dos filtros faziam recarga completa do documento.

Em consultas sem resultado persistido, o fallback buscava o JSON público bruto. Na captura conferida, eram 3.035.546 bytes, acima do limite de entrada de cache observado nos logs da CI anterior. A chamada com `next.revalidate` não resolvia esse excesso de tamanho. A API de logs de runtime da conta retornou 403; isso limita a observabilidade disponível e não é evidência de ausência de erros.

## Correções

- Uma única região de execução, `pdx1`, próxima do banco existente em Oregon. Não move o banco, muda plano ou ativa múltiplas regiões.
- Consulta de prazos em paralelo com as consultas independentes, retirando uma etapa de espera do caminho da lista.
- Cache de 15 minutos da projeção pública do PNCP, depois de remover os campos não usados. A captura de 1.195 registros ficou em 891.551 bytes. Identificadores e objetos completos foram preservados. O fetch bruto não tenta gravar uma entrada acima de 2 MB e tem timeout de cinco segundos.
- `next/form` para buscar por navegação interna, e `Link` para limpar os filtros. O formulário é reinicializado quando os filtros da URL mudam, preservando coerência nos campos.
- Carregamento progressivo das páginas principais e rotas de perfis, alertas, privacidade e detalhes. A navegação fica acessível durante a espera. Esse retorno visual é distinto da redução de tempo do servidor.

## Segurança e verificação

Somente a captura pública entra no cache compartilhado. Sessões, identidade, busca pessoal, perfis, favoritos e registros da organização não entram nele. As consultas autenticadas continuam usando a sessão e as políticas RLS. Nenhuma alteração de autenticação, permissões ou esquema do banco é necessária.

Os testes unitários conferem tamanho da projeção na captura real, preservação de todos os IDs e objetos, campos usados pelos filtros e links e rejeição de fonte inválida. A integração cria somente contas sintéticas em Supabase local descartável, com e-mail confirmado e sem envio de mensagens. O navegador confere sessão, busca e limpeza sem recarga do documento, navegação de 360 px e ausência de conteúdo de outra organização.

Após a publicação, a conferência deve confirmar `pdx1` na implantação, recarregar o navegador para obter a versão nova e repetir o ciclo de páginas até o conteúdo final. A exibição do skeleton não deve ser contada como página pronta. Medir também busca fria/quente e paginação, sem usar a melhora da lista pública como prova da navegação autenticada.
