# Validação das ações de oportunidades — 20/10/2026

## Fluxo real autenticado em produção

Usada uma única contratação real: `18080655000182-1-000093/2026`, de Engenheiro Caldas/MG. Antes dos testes não havia feedback nem cartão para essa contratação. Os testes não enviam mensagens ou alertas.

- Favoritar na lista: estado salvo no banco, contador atualizado e botão mantido após recarregar. A visualização Favoritas incluiu a oportunidade.
- Remover favorito: oportunidade saiu da lista Favoritas e o feedback foi removido.
- Descartar: oportunidade saiu da lista padrão e continuou acessível na visualização Descartadas após recarregar.
- Restaurar: removeu o descarte e devolveu a oportunidade à lista padrão.
- Acompanhar: criou um único cartão em Triagem; após recarregar, a lista apresentou Abrir no pipeline.
- Edição do cartão: mudança para Em análise, responsável temporário, anotação e checklist marcado foram persistidos e confirmados no navegador após recarregar e em consulta do banco.

## Correção encontrada

A resposta local removia o cartão, mas o total de resultados e a contagem de oportunidades urgentes permaneciam com o valor anterior até uma atualização manual. Após salvar o feedback, a interface agora solicita a atualização dos dados do servidor em segundo plano. O contador de favoritos reinicia com o valor confirmado pelo servidor quando esse valor muda. A resposta imediata do botão e o tratamento de falha permanecem disponíveis.

## Limites

Esta checagem cobre o fluxo de um usuário com acesso à organização. Não substitui testes de isolamento entre organizações, testes de concorrência ou automação autenticada no CI. Naquela validação, a interface ainda não oferecia retirada de cartões; o cartão temporário foi removido pelo operador com restrição ao ID do teste. O arquivamento reversível foi implementado na etapa seguinte, conforme `docs/pipeline-archive.md`.
