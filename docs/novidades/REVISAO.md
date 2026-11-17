# Acabaram de chegar — entrega para revisão

## Diagnóstico e limites da investigação

Base: main remota atualizada, commit `7c01b36ac733df85828a2490dde1f6e5b76cc6c1`. Branch exclusiva `feat/acabaram-de-chegar`; branch de trabalho `work` e demais branches preexistentes preservadas.

Foram inspecionados index.html, app.js, catalogo-supabase.js, tema-publico.js, vitrine-v106.js, CSS, painel (produtos, fotos e estoque), migrations, testes e os dois workflows. PRs relevantes pelo histórico Git: #3 (fotos/pagamentos), #6 (editorial), #7 (estoque), #9 (filtros), #10 (deploy). Os refs de PRs 1–10 foram listados por Git. As APIs GraphQL e REST de PRs retornaram Forbidden; estado atual de PRs e integrações externas não pôde ser confirmado.

A consulta anterior usava `created_at.desc`, mas não selecionava a data nem definia empates/nulos; também não paginava produtos, categorias, tamanhos e imagens. app.js usava map/filter preservando a ordem da resposta; não foi encontrada inversão posterior. tema-publico muda a quantidade de colunas, sem reordenar cards.

**Causa do relato em produção não confirmada.** Consulta GET ao JavaScript publicado em lumewoman.com.br retornou HTTP 403 neste ambiente; não foi possível comparar o artefato servido, cache/CDN, dados reais nem esquema remoto. Hipóteses restantes: rascunho antigo publicado recentemente, datas nulas/empatadas, versão publicada diferente ou limite da Data API. Não se afirma que paginação ou nulos causaram o caso real.

**Cadastro não é primeira publicação.** admin/produtos.js cria sempre `publicado:false`, salva tamanhos e então chama setPublicado; a edição e o botão Publicar também só mudam esse booleano. Nenhuma migration versionada registra primeira publicação de produto. O esquema remoto completo não está versionado, portanto não é possível afirmar que a coluna não existe no servidor; apenas não há contrato confiável demonstrado. Não foi consultado nem alterado nenhum registro remoto.

## Implementação

- `catalogo-politica.js`: ordenação por cadastro decrescente, datas desconhecidas por último e UUID crescente em empates; seleção de novidades por primeira publicação, intervalo de 168 horas, sem datas futuras, inválidas ou inferidas. É uma cópia em memória, sem duplicação de registros.
- `catalogo-supabase.js`: consulta seleciona created_at/publicado e ordem total no servidor. Paginação usa Content-Range/count exato; sem contagem, continua por tamanho efetivamente recebido até página vazia. Falhas/páginas incompletas não viram catálogo parcial. Mesma leitura para atualização de tamanhos, sem coluna estoque.
- `index.html`, `app.js`, `styles.css`: seção acima da coleção, até quatro cards e botão Ver todas as novidades com aria-expanded/aria-controls. Expansão não modifica filtros ou busca do catálogo. Mesmo card/modal/carrinho; expiração programada e reavaliação ao voltar à aba. Foco preservado em recálculos, com destino previsível ao remover controle expirado.
- `config.js`: `novidadesPublicacaoConfiavel:false`. Não ativar sem validar origem e imutabilidade da data no ambiente apropriado. Se ativada, uma consulta GET separada lê id/first_published_at; falha não quebra o catálogo e não usa created_at como substituto.
- Os dois workflows só receberam o novo arquivo na lista copiada. Seus gatilhos e destinos não mudaram.
- `tests/browser.spec.cjs`: mocks expõem Content-Range com CORS; casos e expectativas de regressão preservados. Novos testes em novidades.test.cjs, novidades.spec.cjs e publicacao.test.cjs.

## Bloqueio de dados e proposta SQL

`proposta/primeira-publicacao.sql` está fora de supabase/migrations e migrations para não integrar execução automática. É uma proposta NÃO APLICADA. Não executar sem inspecionar esquema real, triggers, RLS e GRANTs e escolher explicitamente o ambiente.

A proposta adiciona first_published_at e publication_tracked. Linhas existentes ficam sem histórico confiável; nem despublicar/republicar as promove a novidade. Cadastros novos são rastreados; a primeira transição para publicado grava o horário do banco. Inserção já publicada também recebe horário do banco. O trigger preserva a data em alterações de categoria, edição e republicação e ignora tentativas comuns de sobrescrita pelos clientes. O dono do banco pode alterar triggers; a confiabilidade pressupõe administração normal. Sem backfill inventado. Eventuais datas legadas exigem evidência histórica e revisão separada.

O teste aplica essa proposta somente a PGlite em memória, com tabela sintética. Não comprova compatibilidade integral com o esquema remoto. Migração separada ou contrato equivalente é necessária para habilitar a funcionalidade automática; a prévia com mocks funciona sem ela.

## Prévia reproduzível e evidências

Na raiz do checkout, com porta 4173 livre:

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
LUME_NEWS_EVIDENCE_DIR=/workspace/lume-novidades-evidence CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache
```

Para executar somente a prévia automatizada, usar `npx playwright test tests/novidades.spec.cjs` com CHROMIUM_PATH. O teste ativa a flag exclusivamente interceptando config.js e responde às APIs com fixtures. O arquivo real continua desativado. Não há dados fictícios em arquivos públicos. Capturas em `/workspace/lume-novidades-evidence/novidades-{320,390,1440}.png` mostram layout com mocks, e não produtos reais.

Cobertura: borda de 168h e milissegundo anterior; datas inválidas/ausentes/futuras; categoria sem reinício do prazo; despublicados; ordenação e empates; zero novidades; flag desligada; coluna indisponível; paginação e limite menor imposto pelo servidor, com/sem Content-Range; expansão, busca/filtro, carrinho, foco e largura mobile/desktop. A suíte anterior cobre estoque, disponibilidade por tamanho, painel, Pix/cartões, entregas e mensagem WhatsApp interceptada, sem enviar pedido real.

## Riscos de publicação e estado da entrega

O workflow de produção dispara em push para main e workflow_dispatch, com condição github.ref == refs/heads/main. O de teste só dispara por workflow_dispatch, mas seu nome "Enviar versao sem publicar" é enganoso: executa wrangler deploy para o site de teste. Nenhum deles será acionado. Nenhum workflow versionado usa pull_request, pull_request_target ou push irrestrito.

Push/PR draft na feature não aciona os workflows inspecionados. Integrações externas de Cloudflare/GitHub não são auditáveis pela API disponível; não se promete ausência de gatilhos externos desconhecidos. Sem merge, deploy, mudança de secrets ou migração remota. Relógio do cliente controla a janela exibida; coerência depende do relógio correto. A leitura paginada não é transação: se a contagem mudar durante a leitura, o carregamento falha com possibilidade de recarregar, em vez de apresentar resultado parcial como completo.

## Resultado da primeira entrega (antes da revisão SQL)

`npm ci --cache /workspace/.npm-cache --no-audit --no-fund`: concluído. Node 24.22.1, npm 11.9.0 e Chromium do sistema.

`CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache`: **13 testes Node + 52 Playwright aprovados; zero falhas, zero testes ignorados** na execução final. Sem build configurado: aplicação estática. `git diff --check` passou. Revisão independente encontrou dois problemas importantes (paginação truncada por limite inferior da API e foco perdido na expiração); reproduções falharam antes das correções e passaram depois. As falhas intermediárias de fixture/CORS foram diagnosticadas e os mocks corrigidos; não há falhas pendentes na suíte final.

Limites: CI usa Node 22, não executado nesta instância; sem validação da aplicação ou do esquema reais de produção. O resultado é uma prévia local revisável, não aprovação para produção.

Branch enviada com sucesso: https://github.com/felipehnrq/lume-woman-site/tree/feat/acabaram-de-chegar . Implementação no commit `42b69a5`. A tentativa de criar PR **draft** contra main retornou `Post https://api.github.com/graphql: Forbidden`; portanto nenhum PR foi criado por esta sessão. Não foram solicitados tokens nem alterados secrets/políticas para contornar a restrição. O conteúdo de revisão e os commits estão preservados na feature. Após higienizar o estado visual das capturas, os três testes responsivos foram repetidos e passaram.


## Continuação — contrato de primeira publicação

Revisão e correções exclusivamente locais na branch `feat/acabaram-de-chegar`. A proposta ganhou transação com lock/timeouts, guards de RLS/tipo/tabela sem particionamento/herança, constraint de coerência e SECURITY INVOKER explícito. Não muda RLS, policies ou grants; não atualiza valores antigos. Uma revisão independente reproduziu bypass por herança clássica na versão anterior; a proposta agora recusa tanto tabelas-pai como filhas antes de qualquer ALTER, com regressões RED→GREEN.

Novos cadastros (inclusive rascunhos) ficam rastreados. Primeiro publicado recebe horário da instrução no banco; edição/categoria/despublicação/republicação e upsert preservam a data. Legados, inclusive rascunhos, ficam NULL e nunca são promovidos automaticamente. Testes agora exercitam anon, authenticated comum, administradora, revogação de admin, grants amplos e por coluna, rollback, conflitos, inspeção READ ONLY e preservação de dados/ACLs. As roles e permissões desses testes são sintéticas e exclusivamente locais.

Arquivos desta etapa: `proposta/primeira-publicacao.sql`, `proposta/inspecao-somente-leitura.sql`, `proposta/validacao-pos-migracao.sql`, `IMPLANTACAO-SEGURA.md`, este relatório, `tests/publicacao.test.cjs` e `tests/publicacao-seguranca.test.cjs`. Aplicação, flag e workflows não foram modificados nesta etapa. Não houve push, PR, merge, deploy, SQL remoto ou alteração de permissões/secrets reais.

O roteiro exato está em [IMPLANTACAO-SEGURA.md](IMPLANTACAO-SEGURA.md): inspeção autorizada somente leitura → ensaio no esquema real sanitizado/versionado e PostgREST → migração separadamente autorizada → comparação de dados, segurança e leitura API → ativação da flag separadamente aprovada. Se faltar SELECT da nova coluna, manter flag false; nenhum GRANT amplo será aplicado por esta proposta.

PGlite executa PostgreSQL 18.6. A tentativa de obter PostgreSQL 17 nativo via Docker foi recusada pelo registro (`unauthorized: authentication required`); não foram solicitadas credenciais. Compatibilidade com a versão nativa do projeto, concorrência em sessões distintas, triggers/RLS/grants reais e metadados PostgREST continuam pendentes. A preparação local não remove esses gates de integração real.

Resultado desta continuação: `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` concluído; `CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache` aprovou **33 testes Node.js + 52 Playwright (85 no total), zero falhas e zero ignorados**. Após acrescentar à inspeção somente leitura as permissões efetivas de schemas/funções, `node --test tests/*.test.cjs` foi repetido e aprovou novamente os 33 testes, inclusive os dois scripts SQL READ ONLY. `git diff --check` passou. Sem teste nativo PostgreSQL 17/PostgREST, sem validação concorrente em duas sessões e sem validação do banco remoto. A flag permanece false; não há aprovação para produção.

## Conferência com a inspeção informada do laboratório — PostgreSQL 17.11

O usuário forneceu resultado de inspeção remota somente leitura: produtos contém created_at/publicado/updated_at, ainda não contém first_published_at; anon tem SELECT de publicados por RLS; authenticated tem SELECT/INSERT/UPDATE/DELETE com gerenciamento condicionado a private.is_admin(); o trigger produtos_set_updated_at chama private.set_updated_at() antes de UPDATE. Essas informações são atribuídas à inspeção fornecida, não a uma nova consulta remota desta sessão.

A proposta é estruturalmente compatível com esse contrato: não altera created_at, updated_at, policies ou grants; não executa UPDATE em produtos e, portanto, não dispara o trigger de updated_at durante a migração. Os novos objetos não têm os nomes do trigger/função existentes. Em UPDATE, a ordem alfabética executa lume_primeira_publicacao antes de produtos_set_updated_at. Se a função existente altera somente NEW.updated_at e retorna NEW, ambos coexistem sem sobrescrever a primeira publicação. Nenhuma alteração na proposta SQL foi necessária.

`tests/publicacao-updated-at.test.cjs` acrescenta um modelo local dos grants informados (inclusive DELETE para authenticated), policies anon/admin e trigger BEFORE UPDATE no schema private. Verifica preservação de ACLs/policies, definição do trigger/função originais, created_at e updated_at legados durante DDL; novo rascunho, primeira publicação com data forjada, edição/despublicação/republicação com tentativa de apagar a data, legado e RLS de contas comuns, inclusive negação de DELETE. Executa o SQL proposto de verdade em PGlite, sem Supabase ou credenciais reais.

**Limites registrados naquela etapa (ver atualização posterior abaixo):** o corpo e os atributos reais de private.set_updated_at(), além do esquema completo, ainda não tinham sido fornecidos. A coexistência foi provada para a função local que apenas faz NEW.updated_at := now(); RETURN NEW, sem afirmar que esse é o corpo remoto. É indispensável revisar a definição real e quaisquer outros triggers/regras; confirmar publicado boolean, ausência de herança/particionamento, nomes livres (inclusive publication_tracked), RLS/roles e permissões efetivas. O SQL usa recursos disponíveis no PostgreSQL 17, mas a execução local continua no PostgreSQL 18.6/PGlite; ensaio PostgreSQL 17.11/PostgREST e concorrência continuam pendentes. A permissão DELETE administrativa é preservada: excluir e reinserir é nova vida de linha, não garantia de histórico permanente; não usar isso para renovar novidades.

Commit bd4b8b7 preservado como ancestral, sem amend/reset/rebase. O push autorizado nesta etapa deve conter somente refs/heads/feat/acabaram-de-chegar, sem force. Nos workflows versionados, push nessa feature ou PR não dispara produção (produção exige push/dispatch em main; teste exige dispatch manual). Integrações externas não versionadas continuam fora da inspeção. Nenhuma ação remota de migração, dado, flag, merge, deploy ou permissão foi autorizada/executada nesta conferência.

Validação desta conferência: teste isolado de coexistência aprovado; `CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache` concluiu com **34 Node.js + 52 Playwright = 86 testes aprovados, zero falhas/ignorados**. `git diff --check` passou. Sem falha local bloqueante para o push normal autorizado da feature; os gates remotos de implantação acima permanecem. Nesta etapa foram alterados somente este relatório, IMPLANTACAO-SEGURA.md e o novo teste publicacao-updated-at.test.cjs; o SQL proposto, a flag e os workflows permanecem iguais ao commit bd4b8b7.


## Ensaio de compatibilidade concluído a partir de 0ed9d53

Nova evidência fornecida pelo usuário, obtida em inspeção SQL somente leitura do laboratório: private.set_updated_at() é SECURITY INVOKER, tem search_path vazio e executa apenas NEW.updated_at = now(); RETURN NEW. Atualizado o modelo de teste para reproduzir explicitamente corpo/atributos e verificar sua preservação. Não foi feita nova inspeção remota nesta sessão.

A disponibilidade local mudou: a imagem oficial postgres:17.11 foi obtida com verificação de checksum/digest, assim como postgrest/postgrest:v12.2.3. O ensaio foi realizado em Docker isolado, com esquema sanitizado baseado no contrato informado, nunca com dados/dump/credenciais reais. A primeira tentativa do harness precisou reconhecer o sufixo Debian de server_version (versão numérica confirmada 170011); a segunda encontrou ausência de mapeamento de portas neste Docker. O transporte final usa HTTP real pela rede interna, sem portas expostas. Essas falhas de infraestrutura/harness não foram contabilizadas como aprovação; ver o resultado final registrado.

Novos arquivos: tests/ensaio-postgres17.cjs, tests/fixtures/novidades-pg17.sql, tests/fixtures/novidades-pg17-validacao.sql, ENSAIO-COMPATIBILIDADE.md e evidência JSON sanitizada. Alterados apenas o teste de coexistência e a documentação; migração proposta, aplicação, flag, workflows e lockfile não mudaram. Papéis, policies e grants criados pelo ensaio pertencem exclusivamente ao banco descartável local. O commit bd4b8b7 e o ponto de partida 0ed9d53 permanecem no histórico, sem rebase/amend/reset.

O ensaio comprova SQL em PostgreSQL 17.11, coexistência do trigger confirmado, preservação de dados/ACL/RLS/policies, legados sem data inventada, novos rascunhos, publicação/edição/republicação, tentativas de sobrescrita, rollback, concorrência de duas sessões e Data API real com anon/authenticated e JWTs locais. Não comprova todos os constraints/triggers não fornecidos do esquema real, nem Auth/gateway, versão do PostgREST ou configuração efetiva do serviço Supabase. O teste de navegador continua usando mocks; não se afirma execução do painel completo contra Supabase.

**Parecer:** GO para solicitar autorização específica de migração controlada apenas no laboratório, com flag false e aplicação condicionada à inspeção final/baseline/backup no projeto correto. NO-GO para ativar a funcionalidade ou publicar produção antes da validação pós-migração e autorização separada. Ver [ENSAIO-COMPATIBILIDADE.md](ENSAIO-COMPATIBILIDADE.md) e a sequência em [IMPLANTACAO-SEGURA.md](IMPLANTACAO-SEGURA.md). Não foi executada nenhuma alteração remota de banco/dados/segurança, merge ou deploy.

Resultado final desta etapa: `node tests/ensaio-postgres17.cjs` terminou com status passed e 12 verificações de estágio aprovadas; containers/rede próprios removidos, sem falha de cleanup. Evidência versionada em `evidencias/ensaio-postgres17.json`. `CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache` aprovou novamente **34 Node.js + 52 Playwright (86 testes), zero falhas/ignorados**. A revisão independente não encontrou falhas Critical/Important. A comparação exata com statement_timestamp() está na suíte SQL/PGlite; no ensaio nativo a primeira data é verificada como presente, não forjada e preservada, incluindo igualdade entre sessões concorrentes. `git diff --check` passou.
