# Resumo de e-mail e simulação da entrega

Esta etapa acrescenta a prévia autenticada em `/alerts/preview`, o conteúdo HTML/texto e um núcleo de entrega testado com transporte injetado. Não existe adaptador de envio real, chamada HTTP para provedor, credencial de e-mail ou ativação por variável de ambiente nestes módulos.

## Conteúdo e prévia

`src/lib/alerts/digest.ts` compõe até vinte oportunidades únicas com prazo futuro válido. Inclui título, órgão, UF, prazo no fuso de Brasília, valor efetivamente informado, aderência quando disponível, explicação e links para a oportunidade e as preferências. Valor ausente não vira zero; valor zero informado é preservado. Todos os textos da fonte são escapados, os identificadores dos links são validados e campos extensos são limitados. O HTML tem idioma português, tabela de apresentação, estilos inline, hierarquia de títulos e versão em texto. Não usa scripts, imagens, pixels de rastreamento ou recursos externos. O limite de tamanho é 95 KB.

A página consulta somente a fila do usuário autenticado, sob RLS, com preferência/canal/perfil ativos e prazo futuro. Também filtra a situação divulgada no PNCP. Se não houver oportunidade pessoal válida, mostra três licitações reais do catálogo como exemplo de formato, identificado explicitamente e sem pontuação inventada. Falha de consulta não é convertida em exemplo silenciosamente. A prévia não confirma novamente a aderência completa e não autoriza entrega; o futuro envio precisa revalidar todos os critérios. O conteúdo é mostrado em iframe isolado, sem permissão de scripts ou formulários. Links abrem o sistema em outra aba.

## Núcleo de entrega, ainda sem integração de produção

`src/lib/alerts/delivery.ts` congela remetente, destinatário, assunto, HTML e texto e calcula um hash SHA-256. A chave lógica deriva do identificador persistente da mensagem; todas as novas tentativas usam o mesmo conteúdo e a mesma chave. Alteração do conteúdo é bloqueada. As chamadas recebem uma interface de transporte; o módulo não sabe enviar pela rede.

O núcleo distingue aceitação pelo provedor, rejeição definitiva, falha transitória e resultado incerto. Aceitação não significa entrega na caixa de entrada. Respostas 429/5xx e conflito concorrente de idempotência permitem nova tentativa com intervalo crescente; rejeições permanentes encerram a tentativa. Timeout/erro desconhecido preserva a incerteza. Há limite de cinco tentativas e corte após 23 horas da primeira tentativa, antes da retenção de 24 horas documentada pelo Resend. Um resultado incerto não é declarado como enviado nem é retomado indefinidamente. Retirada de elegibilidade cancela tentativas pendentes.

Referência consultada: [Idempotency Keys — Resend](https://resend.com/changelog/idempotency-keys).

**Limite desta etapa:** o estado é um valor serializável retornado ao chamador. Ainda falta sua persistência transacional no banco, reserva exclusiva por mensagem, reconciliação após interrupção e vínculo com a fila existente. Não há garantia de entrega em produção nem execução automática deste núcleo. O teste de restauração via JSON valida a máquina de estados, não substitui essa integração.

## Validação

- 69 testes unitários passaram, incluindo cinco de composição e sete de entrega simulada; TypeScript e lint passaram sem erros. O lint mantém um aviso anterior no coletor PNCP.
- `npm run email:simulate` usa apenas endereços `example.invalid` e transporte local. Simula resposta desconhecida, serializa/restaura o estado e aceita a segunda tentativa com chave idêntica. O resultado informa `real_emails_sent=0`.
- Foram cobertos escape de HTML, links, prazos inválidos/encerrados, limite de tamanho, duplicatas, valores ausentes/zero, exemplo sem score, backoff, limite de tentativas, conflitos de idempotência, alteração de payload e cancelamento.

## Ainda falta para a entrega real

Persistir mensagens e tentativas com controle de concorrência, integrar esse núcleo ao job com revalidação imediatamente anterior ao envio, configurar adaptador do provedor e remetente/domínio verificado, implementar descadastro e eventos assinados de devolução/reclamação com supressão. Somente depois validar a ativação do envio real. A prévia e a simulação não alteram a fila para `sent`.
