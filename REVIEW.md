# Correções para revisão — fotos e condições de pagamento

Branch local: `fix/fotos-condicoes-pagamento`.
Referência inicial: `main`, commit `46f46fe4f0d54efaff2bcfa7b2500eb331c0daaa`.

Nenhuma publicação foi executada. A referência `main` foi preservada. Nenhuma configuração ou migração foi gravada no Supabase conectado. O envio da branch ao GitHub foi recusado com HTTP 403, tanto pela integração quanto pela verificação de acesso do Git. Por isso, não há PR remoto.

## Comportamento entregue

- Imagens ampliadas e miniaturas usam `object-fit: contain`, sem distorção. A altura da imagem ampliada acompanha o espaço disponível no celular; o modal mantém rolagem para descrições longas, tamanhos e botão de adicionar.
- Cards usam enquadramento vertical, imagem completa e espaço reservado para o botão. O zoom no hover foi removido para evitar novos cortes.
- A galeria mantém a ordem, a troca de fotos e o fechamento por Escape. As miniaturas informam o estado selecionado com `aria-pressed`.
- O novo item **Pagamentos** no painel tem três seletores: **Exibir Pix na vitrine**, **Exibir cartão de crédito na vitrine** e **Exibir cartão de débito na vitrine**. A administradora pode marcar ou desmarcar cada método e salvar. Os três métodos são fixos e vêm habilitados por padrão.
- O painel também edita as instruções de Pix, crédito, débito, o número máximo de parcelas (1 a 12), a condição com/sem juros e a orientação geral.
- O padrão continua sendo Pix, cartão de débito e cartão de crédito em até **3x sem juros**, com parcelas a confirmar. O texto padrão do carrinho e as preferências enviadas ao WhatsApp foram preservados.
- Depois de salvar e atualizar a página, carrinho e política de pagamentos refletem somente os métodos habilitados. Textos e parcelamento do crédito não são divulgados quando esse método está oculto. A mensagem do WhatsApp inclui apenas as condições do método escolhido e habilitado.
- Se todos os métodos forem ocultados, o pedido continua pelo WhatsApp, com **pagamento a combinar**; isso não acrescenta um quarto método ao painel.
- Falha na leitura pública oculta as escolhas e exibe um aviso para combinar o pagamento com a loja. Assim, uma falha não reativa métodos que podem ter sido desativados. O pedido pelo WhatsApp continua disponível. O painel não permite editar dados que não conseguiu carregar e só confirma uma gravação quando o banco devolve a linha salva.
- A logo original foi preservada. `marca.css`, `tema-publico.js`, `admin/tema-logo-admin.js`, os arquivos de configuração e todos os assets continuam iguais à referência `main`. Os trechos de logo dos HTMLs também foram preservados; as mudanças nesses HTMLs são na interface de pagamentos.
- Não foram adicionados cobrança online, campos de cartão ou cálculos de juros/descontos. Os textos são orientações comerciais; o total continua sendo confirmado pela equipe.

## Supabase: inspeção e proposta

O projeto configurado no repositório é **Lume woman laboratório** (`rtbdqvbbvsxhgxnaiaom`). A inspeção foi somente de leitura e confirmou:

- Não existe `public.loja_pagamentos` no banco conectado.
- `public.admin_users` já contém a autorização administrativa e possui RLS.
- `private.is_admin()` consulta essa tabela usando `auth.uid()`, com `search_path` vazio. A função e o acesso ao schema já estão disponíveis para o papel autenticado.
- `loja_tema` e `loja_entregas` já usam leitura pública e edição condicionada a essa função. A nova tabela segue esse padrão, sem alterar essas tabelas ou a função existente.

A migração `supabase/migrations/20261105023233_personalizar_pagamentos.sql` foi criada com `supabase migration new personalizar_pagamentos` (CLI 2.81.3). Ela cria somente uma linha de configuração, limita os valores, habilita RLS e concede leitura pública. A segunda migração, `20261105025942_selecionar_pagamentos_vitrine.sql`, acrescenta os três campos booleanos de exibição, todos com padrão `true`, sem recriar ou apagar dados existentes. Apenas administradores podem atualizar as colunas editáveis, incluindo os seletores de visibilidade. Visitantes e contas comuns não podem gravar; inserção, exclusão e alteração do identificador não são concedidas ao navegador.

**As duas migrações estão pendentes de revisão e aplicação em ambiente aprovado.** Até lá, o novo formulário informa que não conseguiu carregar a configuração; a vitrine atualizada combina o pagamento pelo WhatsApp, sem oferecer opções cuja configuração não foi consultada. A persistência foi validada em um Postgres local isolado, sem modificar o projeto remoto.

O advisor de segurança do projeto conectado retornou um aviso preexistente: proteção contra senhas vazadas desativada. A configuração de Auth não foi alterada. [Orientação do Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Validações executadas

Não havia suíte automatizada no repositório original. Foi adicionada uma suíte de desenvolvimento com dependências fixadas e lockfile.

| Verificação | Resultado |
| --- | --- |
| `npm test` | **26 testes passaram**: 3 de contrato/validação/Postgres e 23 de navegador |
| Postgres isolado com PGlite | Migração executada; padrões comparados com o frontend; leitura pública; atualização administrativa; negação a visitantes e contas comuns; remoção imediata da permissão após retirar o admin; restrições de parcelas/textos e bloqueio de inserção/exclusão/alteração de ID |
| Navegador Chromium | Telas de 320×568, 390×844, 844×390 e 1440×900; fotos verticais, horizontais e quadradas; miniaturas por teclado; rolagem do modal; busca e produto sem estoque |
| Carrinho e entregas | Adição, alteração de quantidade, remoção, persistência após recarregar, validação de CEP, retirada/local e bloqueio quando as entregas estão indisponíveis |
| Pagamentos | Todas as oito combinações de métodos visíveis, incluindo nenhum; persistência dos seletores; padrões atuais; rejeição de método oculto mesmo após adulterar o HTML; leitura na vitrine/política; mensagens de WhatsApp; falhas de leitura/gravação e texto malicioso renderizado como texto puro |
| Login e painel | Senha incorreta, entrada administrativa, sessão persistida, conta sem autorização, logout, resposta de gravação após logout; navegação em produtos, estoque, fotografias, entregas, vendas e personalização |
| API pública real, somente leitura | 12 produtos publicados, 2 categorias ativas, 29 tamanhos disponíveis e 45 registros de fotos acessíveis; leitura das configurações de entrega e tema |
| Conferência visual local com catálogo/fotos reais | Vitrine e modal em celular/desktop; nenhum erro JavaScript observado |
| Preparação local dos dois workflows | Arquivos montados em diretórios temporários, novos scripts incluídos; 45 referências de recursos válidas em cada versão; nenhuma etapa de deploy executada |
| Sintaxe de todos os arquivos JavaScript | Passou em `node --check` |
| `git diff --check` | Passou |
| Logo e fotos aprovadas | Arquivos e trechos de logo comparados com `main`; regras de enquadramento e código da galeria mantidos desde a correção anterior |

Os testes de navegador usam a mesma versão do SDK Supabase do painel, com respostas de Auth e Data API simuladas. Não houve login com credenciais de uma administradora real, gravação de produtos/estoque/entregas no projeto remoto ou envio de mensagens. As aberturas de WhatsApp foram interceptadas e suas URLs validadas. Esses testes verificam a interface e suas integrações; a validação final no ambiente aprovado ainda deve cobrir o login real e a gravação pela Data API após aplicar a migração.

Para reproduzir: `npm ci`, depois `npm test`. O Chromium padrão é `/usr/bin/chromium`; use `CHROMIUM_PATH` para indicar outro executável. Os testes exigem permissão para abrir um servidor HTTP local. Não é necessário conectar a um banco remoto.

## Arquivos alterados e adicionados

| Arquivos | Finalidade |
| --- | --- |
| `styles.css`, `app.js` | Enquadramento, galeria, estado acessível das miniaturas e condições no WhatsApp |
| `index.html` | Pontos de exibição das condições e carregamento dos novos módulos |
| `pagamentos.js`, `pagamentos-publico.js` | Padrões/validação compartilhados, leitura pública e textos dinâmicos |
| `admin/admin.js`, `admin/index.html`, `admin/pagamentos-admin.js` | Rota, formulário e persistência administrativa |
| `politicas/pagamentos.html` | Condições atualizadas também na página institucional |
| `supabase/migrations/20261105023233_personalizar_pagamentos.sql`, `supabase/migrations/20261105025942_selecionar_pagamentos_vitrine.sql` | Configuração com restrições, privilégios e RLS; campos de exibição dos três métodos; não aplicadas ao projeto conectado |
| `.github/workflows/publicar-teste.yml`, `.github/workflows/publicar-producao.yml` | Inclusão dos novos scripts no pacote; gatilhos manuais preservados |
| `package.json`, `package-lock.json`, `playwright.config.cjs` | Ferramentas de teste com versões fixadas |
| `tests/browser.spec.cjs`, `tests/pagamentos-rls.test.cjs`, `tests/pagamentos.test.cjs`, `tests/server.cjs` | Suíte de regressão, autorização e servidor local de testes |
| `.gitignore`, `.assetsignore` | Exclusão de dependências, relatórios e arquivos de desenvolvimento dos artefatos públicos |
| `REVIEW.md` | Relatório de revisão e limites das validações |

As configurações de login, o upload/armazenamento de fotos, o catálogo, os estoques, as modalidades de entrega e os demais módulos do painel foram preservados. A otimização existente em `admin/fotos.js` também foi conferida: ela já redimensiona proporcionalmente, sem recortar o arquivo.

## Material local para revisão

- [Vitrine no celular](/workspace/lume-review/vitrine-celular.png)
- [Modal no celular](/workspace/lume-review/modal-celular.png)
- [Modal no desktop](/workspace/lume-review/modal-desktop.png)
- [Painel de pagamentos com os seletores, dados simulados](/workspace/lume-review/admin-pagamentos-selecao.png)
- [Arquivos atualizados para envio manual](/workspace/lume-review/lume-fotos-pagamentos-atualizado.zip)
- [Instruções para corrigir o acesso e enviar a branch manualmente](/workspace/lume-review/ENVIO-MANUAL.md)
- [Patch completo](/workspace/lume-review/fotos-pagamentos.patch)
- [Bundle da branch](/workspace/lume-review/fotos-pagamentos.bundle)

A revisão das alterações e da migração deve ocorrer antes de qualquer publicação. Nenhuma autorização de publicação foi presumida.
