# Backlog Jira — Edital Certo

Estimativas em story points. Cada item liga requisito, entrega prevista e critério verificável.

## Entregas recentes e sequência de continuidade — 27/10/2026

| Item | Situação verificável | O que falta |
|---|---|---|
| E5-03 — Alertas de e-mail | Integração, persistência, cancelamento e recibos assinados implementados no PR #26; envio desativado em desenvolvimento | Domínio remetente verificado, DNS, credenciais e validação de um piloto real antes de ativar |
| E6-02 — Comentários | Interface e auditoria implementadas no PR #27; migração e regressão SQL validadas em desenvolvimento | Concluir as verificações do PR e publicar a interface com a migração correspondente no ambiente de destino |
| E6-02 — Anexos privados | Modelo de documentos existe; upload privado ainda não tem fluxo de uso | Próxima entrega que pode avançar sem depender do remetente: armazenamento privado, limites, permissões e testes de isolamento |
| E1-02 — Convites | Organização e papéis existem; convite não tem fluxo completo | Implementar aceite seguro; envio de convite depende do remetente |
| E6-03 — Lembretes | Calendário com lembretes opcionais e exportação .ics implementados | Disparo por e-mail continua sujeito à ativação do remetente |

Os PRs #26 e #27 não equivalem a funcionalidades publicadas em produção. Os critérios completos abaixo continuam sendo a referência de aceite; concluir comentários não conclui o item de anexos. Cobrança, IA e canais adicionais permanecem posteriores ao fluxo principal de descoberta e acompanhamento.

## Épico E1 — Identidade, organizações e acesso

### E1-01 — Entrar com senha ou magic link (5 pts)
**Descrição:** Como usuário, quero acessar por senha ou link enviado ao meu e-mail para usar o painel.

**Aceite:** login com senha cria sessão; magic link retorna por callback seguro; erros não revelam se um e-mail está cadastrado; logout encerra a sessão.

**Requisitos/entrega:** requisito 1; telas `/login`, callback Supabase, cookies SSR.

### E1-02 — Criar organização e convidar membros com papéis (8 pts)
**Descrição:** Como administrador, quero criar uma organização e convidar analistas e leitores.

**Aceite:** fundador recebe papel admin; admin convida membros; analista edita perfis e pipeline; leitor consulta; usuário de outra organização não lê nem altera registros.

**Requisitos/entrega:** requisito 1; `organizations`, `memberships`, testes RLS.

## Épico E2 — Perfis de interesse e cotas

### E2-01 — Criar e editar perfil por segmento e região (8 pts)
**Descrição:** Como analista, quero filtrar oportunidades pelas palavras-chave e atributos que minha empresa atende.

**Aceite:** suporta palavras obrigatórias, opcionais e excluídas; UF, município, modalidade, órgão, esfera, valor, CNAE e ME/EPP; valida limites no servidor.

**Requisitos/entrega:** requisito 2; `interest_profiles`, validação Zod, formulário de perfil.

### E2-02 — Duplicar perfil e aplicar limite de plano (5 pts)
**Descrição:** Como analista, quero duplicar um perfil e ajustá-lo para outra linha de negócio.

**Aceite:** duplicação inclui filtros; ID e nome são novos; gratuito não passa de um perfil nem cinco palavras-chave; API recusa excesso.

**Requisitos/entrega:** requisito 2 e monetização; serviço de cotas.

## Épico E3 — Catálogo público e ingestão

### E3-01 — Consultar publicações do PNCP por página (8 pts)
**Descrição:** Como serviço, quero recuperar licitações publicadas dentro da janela configurada para manter o catálogo atualizado.

**Aceite:** usa rota/parâmetros confirmados no Swagger atual; percorre todas as páginas/modalidades configuradas; mantém checkpoint; registra execução e erro.

**Requisitos/entrega:** requisito 3; conector `fetchNew`, job horário, `ingestion_runs`.

### E3-02 — Normalizar e deduplicar contratação, órgão e itens (8 pts)
**Descrição:** Como sistema, quero normalizar dados do PNCP sem criar duplicatas em reexecuções.

**Aceite:** chaves compostas da fonte impedem duplicação; mudanças atualizam registro; fixture de resposta real cobre o mapeamento.

**Requisitos/entrega:** requisitos 3 e 6; `tenders`, `agencies`, `tender_items`, `tender_files`.

### E3-03 — Retentar falhas transitórias com espera exponencial (5 pts)
**Descrição:** Como operador, quero que erros transitórios sejam repetidos sem sobrecarregar a fonte.

**Aceite:** 429 e 5xx usam espera progressiva e teto; erros permanentes encerram a página; toda falha fica registrada.

**Requisitos/entrega:** requisito 3; política de retry e métricas.

## Épico E4 — Matching e busca

### E4-01 — Calcular score de aderência reproduzível (8 pts)
**Descrição:** Como usuário, quero entender por que uma oportunidade combina com o perfil.

**Aceite:** score de 0 a 100; critérios de exclusão encerram a correspondência; explicação informa termos e filtros compatíveis; mesmos dados dão o mesmo score.

**Requisitos/entrega:** requisito 4; serviço puro de matching e testes unitários.

### E4-02 — Buscar e ordenar catálogo (8 pts)
**Descrição:** Como usuário, quero buscar e paginar licitações por texto, relevância, prazo e valor.

**Aceite:** filtros são parametrizados; paginação tem limite; índices cobrem busca e atributos; benchmark com um milhão de linhas fica abaixo de um segundo no ambiente-alvo.

**Requisitos/entrega:** requisito 5; busca PostgreSQL e teste de performance.

## Épico E5 — Oportunidades e alertas

### E5-01 — Ver detalhes e arquivos oficiais (5 pts)
**Descrição:** Como usuário, quero revisar órgão, objeto, itens, prazos, valor e arquivos da oportunidade.

**Aceite:** link oficial é exibido quando fornecido; data de atualização da fonte aparece; ausência de item ou arquivo não quebra a página.

**Requisitos/entrega:** requisito 6; página `/tenders/[id]`.

### E5-02 — Favoritar e descartar licitação (3 pts)
**Descrição:** Como usuário, quero salvar uma oportunidade ou removê-la da lista padrão.

**Aceite:** favorito e descarte são por organização/usuário; descarte fica fora da busca padrão; ação pode ser desfeita.

**Requisitos/entrega:** requisito 8; `tender_feedback`.

### E5-03 — Enviar alerta imediato e resumo diário sem duplicar (8 pts)
**Descrição:** Como usuário, quero receber e-mails quando houver aderência ao meu perfil.

**Aceite:** score mínimo configurável; imediatos a partir de 80 no plano adequado; diário agrupa oportunidades; chave única impede envio duplicado; erros e provider ID ficam registrados.

**Requisitos/entrega:** requisito 7; Resend, `alerts`, `alert_deliveries`.

## Épico E6 — Pipeline e documentos

### E6-01 — Mover oportunidade pelo Kanban e auditar (8 pts)
**Descrição:** Como analista, quero registrar o estágio e responsável de cada oportunidade.

**Aceite:** estados seguem o fluxo definido; mudança grava autor, origem, destino e horário; apenas admin/analista edita.

**Requisitos/entrega:** requisito 9; `pipeline_cards`, `audit_logs`.

### E6-02 — Comentar, anexar e criar checklist (8 pts)
**Descrição:** Como equipe, quero manter análise e documentos ligados ao cartão.

**Aceite:** comentários e arquivos ficam isolados por organização; uploads validam tipo e tamanho; ações registradas.

**Requisitos/entrega:** requisito 9; `comments`, `documents`, políticas Storage.

### E6-03 — Lembrar prazos e exportar calendário (8 pts)
**Descrição:** Como usuário, quero receber lembretes e adicionar datas ao meu calendário.

**Aceite:** D-7, D-3 e D-1 no fuso configurado; envio deduplicado; arquivo .ics validado.

**Requisitos/entrega:** requisito 10; job e exportador .ics.

## Épico E7 — Inteligência, planos e conformidade

### E7-01 — Painel gerencial e inteligência de mercado (13 pts)
**Descrição:** Como gestor, quero acompanhar pipeline, conversão, preços e concorrentes por período e segmento.

**Aceite:** estatísticas identificam fonte e período; filtros respeitam organização; preços usam dados homologados confirmados.

**Requisitos/entrega:** requisitos 11–13.

### E7-02 — Consultoria multiempresa (8 pts)
**Descrição:** Como consultor, quero alternar entre organizações clientes sem misturar os dados.

**Aceite:** troca de contexto valida vínculo; testes tentam acessar cliente não autorizado; cota por cliente é aplicada no servidor.

**Requisitos/entrega:** requisito 14.

### E7-03 — Cobrança, cotas e feature flags (13 pts)
**Descrição:** Como administrador, quero contratar e gerenciar plano com limites aplicados no backend.

**Aceite:** webhooks validados; estado de assinatura idempotente; plano controla usuários, perfis e recursos; falha do provedor não libera acesso pago.

**Requisitos/entrega:** requisito de monetização; Asaas ou Stripe atrás de interface.

### E7-04 — Privacidade LGPD e auditoria (8 pts)
**Descrição:** Como titular, quero consultar, exportar e solicitar exclusão dos meus dados.

**Aceite:** consentimento versionado; exportação legível; remoção respeita obrigações de retenção; logs não contêm segredos.

**Requisitos/entrega:** requisitos não funcionais; telas e rotina de privacidade.

## Épico E8 — IA e canais extras

### E8-01 — Resumir edital com referência de página (13 pts)
**Descrição:** Como analista, quero localizar obrigações e riscos no edital sem perder a referência ao documento.

**Aceite:** cada alegação cita página e trecho; interface pede revisão humana; documento inválido não gera resumo sem aviso.

**Requisitos/entrega:** requisito 15; interface de LLM isolada.

### E8-02 — Comparar habilitação e validade de certidões (8 pts)
**Descrição:** Como analista, quero comparar edital e documentos da empresa.

**Aceite:** divergências aparecem com página de origem; alerta com 15 dias; acesso limitado por organização.

**Requisitos/entrega:** requisito 16.

### E8-03 — Perguntar ao edital e optar por Telegram/WhatsApp (13 pts)
**Descrição:** Como usuário, quero consultar trechos e escolher canais de notificação.

**Aceite:** respostas sempre citam o texto recuperado; opt-in registrado; usuário pode revogar canal.

**Requisitos/entrega:** requisitos 17 e 18.

## Épico E9 — Qualidade e operação

### E9-01 — CI, E2E e guia de deploy (8 pts)
**Descrição:** Como equipe, quero detectar regressões e configurar ambientes reproduzíveis.

**Aceite:** CI executa lint, types, testes e build; Playwright valida login, perfil, busca e isolamento; README lista configuração e operação.

**Requisitos/entrega:** requisito de testes/deploy; GitHub Actions e documentação.

