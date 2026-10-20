# Prazos e lembretes no calendário

A página Prazos reúne apenas prazos ainda abertos de favoritas e cartões ativos. Itens arquivados só continuam aparecendo se também forem favoritos. Datas e agrupamento usam o horário de Brasília; a comparação com o instante exato de encerramento evita tratar uma licitação vencida hoje como aberta.

O catálogo distingue Encerrada, Encerra hoje, Encerra amanhã e os demais dias pelo calendário de Brasília, sem arredondar horas para dias.

## Exportação

Adicionar ao calendário (.ics) permite incluir lembretes de exibição de 7, 3 e 1 dia antes do encerramento. Lembretes cujo instante já passou são omitidos. A opção pode ser desmarcada. O calendário precisa importar o arquivo e autorizar as notificações; o suporte a lembretes importados varia entre aplicativos. Não há envio de e-mail nesta entrega.

O evento inclui horário UTC, órgão, fonte oficial válida e UID estável por contratação. O arquivo é uma cópia do prazo consultado: retificações posteriores não sincronizam automaticamente. Confira a fonte oficial antes de preparar a proposta. A reimportação e a atualização de eventos existentes dependem do aplicativo de calendário.

A geração segue os campos VEVENT/VALARM do [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html): CRLF, escape de texto, dobra em até 75 octetos sem dividir caracteres UTF-8, lembretes DISPLAY e nenhum destinatário ou convite. URLs fora de HTTP/HTTPS e quebras de linha na URL são omitidas.

## Validação

52 testes unitários passaram. Novos casos verificam encerramento no mesmo dia, instante exato, viradas de dia/ano, entradas inválidas, três lembretes, omissão de lembretes passados, exportação sem lembretes, UID estável, acentos/emojis, escape e URLs inválidas. TypeScript e lint passaram, com um aviso preexistente no coletor.
