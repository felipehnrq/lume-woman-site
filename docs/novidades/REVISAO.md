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

## Resultado verificado nesta instância

`npm ci --cache /workspace/.npm-cache --no-audit --no-fund`: concluído. Node 24.22.1, npm 11.9.0 e Chromium do sistema.

`CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache`: **13 testes Node + 52 Playwright aprovados; zero falhas, zero testes ignorados** na execução final. Sem build configurado: aplicação estática. `git diff --check` passou. Revisão independente encontrou dois problemas importantes (paginação truncada por limite inferior da API e foco perdido na expiração); reproduções falharam antes das correções e passaram depois. As falhas intermediárias de fixture/CORS foram diagnosticadas e os mocks corrigidos; não há falhas pendentes na suíte final.

Limites: CI usa Node 22, não executado nesta instância; sem validação da aplicação ou do esquema reais de produção. O resultado é uma prévia local revisável, não aprovação para produção.

Branch enviada com sucesso: https://github.com/felipehnrq/lume-woman-site/tree/feat/acabaram-de-chegar . Implementação no commit `42b69a5`. A tentativa de criar PR **draft** contra main retornou `Post https://api.github.com/graphql: Forbidden`; portanto nenhum PR foi criado por esta sessão. Não foram solicitados tokens nem alterados secrets/políticas para contornar a restrição. O conteúdo de revisão e os commits estão preservados na feature. Após higienizar o estado visual das capturas, os três testes responsivos foram repetidos e passaram.
