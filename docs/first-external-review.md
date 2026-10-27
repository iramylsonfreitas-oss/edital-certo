# Primeira avaliação externa — 27/10/2026

Relato recebido do responsável pelo produto. As quantidades relatadas são uma fotografia daquela consulta, sem estimativa de precisão nacional.

## Primeira rodada de correções

- Confirmado: vacina meningocócica classificada por “cartucho”. Refinar o contexto do objeto e itens incidentais, preservando aquisições reais de computadores e software, inclusive para hospitais e gestão de frotas. Fitas para mainframe não são cartuchos médicos. Os exemplos usados no ajuste são regressões de desenvolvimento, não uma amostra independente de acurácia.
- Confirmado: um rotulador conectado a computador fazia um edital de estruturas metálicas entrar em TI. O item principal passa a determinar esse caso. Editais mistos com computadores reais continuam no catálogo.
- Mostrar quantidade/valor dos itens de TI. A evidência de cada item é calculada na importação e armazenada; a consulta das páginas soma esses valores sem repetir expressões de classificação. Percentual só pode ser calculado com coleta completa e valores positivos para todos os itens. O denominador é o valor dos itens consultados, que pode diferir do valor global declarado. Valores parciais ou sigilosos não permitem extrapolar.
- Confirmado: 37 de 267 editais abertos de TI tinham valor zero no instante da consulta. Normalizar para ausência e exibir “Valor não informado”; manter valor bruto na origem. Zero não prova orçamento sigiloso. A ordenação por valor coloca ausentes ao final; filtros monetários não os tratam como gratuitos.
- Confirmado no código: Painel somava TI e Saúde, enquanto Oportunidades abria TI por padrão. Segmentar, incluir registros sem prazo como na lista e excluir descartados do usuário. Explicitar que o pipeline continua sendo da organização inteira e que o gráfico mostra até oito UFs. Consultar em páginas para respeitar o limite da API.
- Confirmado no CSS: regra de cor dos links fora das camadas do Tailwind sobrepunha utilitários de cor. Remover essa sobrescrita.
- Disponibilizar Acompanhar/Abrir no pipeline no detalhe usando a mesma RPC existente, sem mudar permissões.
- Cortar títulos na fronteira de palavras e preservar siglas/grafia oficial. Não alterar irreversivelmente os objetos importados.
- A antiga opção “Maior aderência” era relevância de texto, e não classificação global por perfil. Renomear para “Relevância da busca” e explicar quando aparece a nota de perfil. Classificação global por perfil permanece pendente.

## Próximas prioridades

1. Revisar possíveis duplicidades com proveniência e vínculos preservados. Cruzaltense tem controles PNCP `04213529000144-1-000157/2026` e `04213529000144-1-000161/2026`, mesmo órgão/número/ano. Isso exige comparação de modalidade, unidade, documentos, datas e itens; título igual não prova identidade. Não apagar registros nem cartões do avaliador.
2. Substituir códigos por seleções legíveis; município por busca de nome; melhorar filtros decisórios conforme disponibilidade real dos dados. Ordenação global por perfil e buscas salvas.
3. Preparar remetente e entrega de alertas com testes de idempotência. Envio real continua desativado. Nenhuma contratação nova é autorizada por este relato.
4. Avisos sobre retificações, responsáveis reais, etapas adicionais e histórico de cartões. Exportação CSV.
5. Documentos da empresa, extração com IA e histórico de preços em fase posterior.

Datas de impugnação, esclarecimentos e recursos não devem ser inferidas somente por subtração da data da sessão: exigem regras aplicáveis, calendário e conferência do edital antes de apresentar um prazo como confirmado.

O edital UFMA colocado em Triagem pelo avaliador é um dado de uso real; permanece intacto.
