# Edital Certo

Protótipo estático para acompanhar oportunidades de licitações públicas de TI. O site é publicado gratuitamente pelo GitHub Pages e lê `data/dados.json` do mesmo repositório. Perfil, favoritos, descartes e pipeline ficam somente no armazenamento local do navegador.

## Fonte dos dados

A coleta usa a API oficial de consulta do PNCP, na rota de contratações com período de recebimento de propostas em aberto (`/api/consulta/v1/contratacoes/proposta`). O robô mantém registros publicados nos últimos sete dias, filtra palavras de TI e modalidades com códigos 4, 6 e 8, e mantém por até sete dias registros anteriores cujo prazo acabou recentemente.

A API de propostas abertas aceita `dataFinal`, mas não oferece `dataInicial` nessa consulta. Para limitar o volume, o script pede contratações com encerramento nos próximos 365 dias e depois seleciona publicações da última semana. Isso significa que prazos que terminem depois desse horizonte não entram nesta coleta. O limite máximo documentado para `tamanhoPagina` é 50; chamadas têm pausa de um segundo, timeout de 30 segundos e até três tentativas. Uma execução pode levar vários minutos; erro parcial fica indicado em `status` e no log do GitHub Actions.

Os códigos de modalidade usados foram conferidos em respostas reais do PNCP: 4 (Concorrência Eletrônica), 6 (Pregão Eletrônico) e 8 (Dispensa). ⚠️ A API pode mudar seus campos, limites ou comportamento. Confira o Swagger oficial e os logs de `data/dados.json` periodicamente.

## Atualização manual

1. Abra o repositório no GitHub.
2. Toque em **Actions** e escolha **Atualizar dados do PNCP** na lista à esquerda.
3. Toque em **Run workflow**, confirme o branch `main` e rode.
4. Abra a execução. Verde indica que todas as páginas foram coletadas e salvas; vermelho indica erro ou coleta parcial. Em ambos os casos, abra o log e veja `data/dados.json` para a mensagem e o status.

O agendamento usa UTC (`0 */3 * * *`), ou seja, roda às 00h, 03h, 06h e assim por diante em UTC. O GitHub pode desativar agendas em repositórios públicos sem atividade por 60 dias. Para evitar isso, abra o repositório e use **Actions → Atualizar dados do PNCP → Enable workflow** se a agenda tiver sido desativada; também faça uma atualização manual de tempos em tempos.

## Publicação

Depois de criar o repositório público `edital-certo`, escolha **Settings → Pages → Deploy from a branch → main → /(root)**. O endereço costuma ser `https://SEU-USUARIO.github.io/edital-certo/`. O workflow de dados usa somente o `GITHUB_TOKEN` automático do GitHub Actions e a permissão `contents: write`; não coloque senha, chave ou token nos arquivos.
