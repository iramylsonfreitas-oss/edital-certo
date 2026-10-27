# Saúde: primeiro recorte

Medicamentos, materiais hospitalares (incluindo odontológicos) e equipamentos médicos são classificados pelo objeto da compra. O nome da secretaria ou do hospital não é evidência. Serviços médicos, exames, manutenção, obras, limpeza, locação e compras veterinárias ficam fora deste primeiro recorte. Objetos mistos podem ter mais de uma categoria; os itens e o edital precisam ser conferidos antes da proposta.

A classificação é independente de TI e gravada na escrita da licitação. A busca usa índices por prazo e categorias, paginação de 50 registros e as mesmas políticas de acesso. A função antiga de busca continua disponível para compatibilidade. Nenhum perfil, favorito ou acompanhamento existente é reescrito.

O catálogo autenticado já conserva contratações de vários segmentos. Não é necessário ampliar a frequência da coleta. A lista HTML pública e seu fallback continuam sendo de TI; Saúde usa o catálogo persistido. Saúde é filtrada pela URL, inclusive na paginação, busca e limpeza de filtros. Perfis de aderência respeitam o segmento selecionado. O painel calcula compatibilidade apenas entre perfis e oportunidades do mesmo segmento.

A amostra de desenvolvimento tem 40 objetos públicos por ordem estável de md5(id), entre candidatos com termos de saúde. Foram revisados 32 objetos de compras do recorte e oito exclusões. Essa amostra orientou as regras e não mede a precisão em todo o PNCP. Compras genéricas e produtos identificáveis apenas nos itens podem não aparecer nesta versão.

Testes: regras em JavaScript e Postgres, separação TI/Saúde, categorias, paginação, busca e limpeza em 360 px, perfis e acesso por sessão. O banco descartável inclui 53 oportunidades de TI e 54 de Saúde. As consultas privadas permanecem autenticadas, com organização/usuário e RLS.

Envio de e-mails continua desativado. A preparação automática de alertas de Saúde será uma etapa posterior; não é anunciada como disponível nesta entrega. Sem novas assinaturas ou serviços.
