# Primeira publicação — contrato e sequência de implantação

**Estado:** preparação local na branch `feat/acabaram-de-chegar`. Sem SQL remoto, alteração de permissões remotas, deploy, push, merge ou ativação da flag nesta etapa. Os scripts deste diretório são material de revisão para um operador autorizado, não instruções para executar automaticamente. Flag continua `false`.

## O que foi verificado no repositório

`admin/produtos.js` cria rascunho (`saveNew`), salva tamanhos e chama `setPublicado(id,true)`; `saveEdit` atualiza dados/tamanhos e muda o booleano somente quando necessário. Não envia primeira data nem marcador. O trigger é compatível com esses payloads: nenhum ajuste no painel é necessário para começar a rastrear novos cadastros. Falha ao salvar tamanhos ou publicar deixa o rascunho sem data até publicação bem-sucedida.

As migrations existentes tratam pagamentos e tema, não definem a tabela produtos, suas policies/grants nem todos os triggers. REVIEW.md registra historicamente admin_users, auth.uid() e private.is_admin(), mas isso não é evidência atual do banco. A fixture nova reproduz esse padrão explicitamente como hipótese de contrato, sem afirmar que replica o esquema remoto.

A proposta usa recursos comuns do PostgreSQL (DDL transacional, RLS, trigger BEFORE ROW, SECURITY INVOKER e timestamptz), sem extensão Supabase, secret ou SECURITY DEFINER novo. Testada no PostgreSQL 18.6 do PGlite 0.5.15. Não foi validada em PostgREST nem na versão nativa do projeto. Tentativa de obter imagem PostgreSQL 17 foi recusada pelo registro Docker com `unauthorized: authentication required`; sem solicitação de credenciais ou contorno. Não confundir compatibilidade de sintaxe com validação da implantação real.

## Contrato dos dados

| Evento | publication_tracked | first_published_at |
|---|---|---|
| Produto existente, publicado ou rascunho | false | NULL, histórico desconhecido |
| Novo rascunho após commit da migração | true | NULL até publicação |
| Primeira publicação desse rascunho | true | statement_timestamp() do banco |
| Novo produto inserido já publicado | true | statement_timestamp() do banco |
| Edição, categoria, despublicação ou republicação | preservado | preservada |
| Cliente envia data ou marcador forjado | controlado pelo trigger | valor forjado ignorado |
| Legado despublicado/republicado ou upsert | false | NULL, nunca promovido automaticamente |
| Publicação revertida por rollback | preservado | publicação/data também revertidas |

O horário gravado é o início da instrução de publicação no banco (`statement_timestamp`), não o início da transação (`now`) nem o instante posterior do commit. A visibilidade pública só ocorre após commit.

NULL não significa necessariamente "nunca publicado": também significa histórico desconhecido. O frontend nunca substitui por created_at. Rascunhos existentes antes da migração ficam conservadoramente excluídos mesmo se forem publicados depois. Restaurar ou importar registros sem histórico exige decisão separada; delete/reinsert é nova identidade/vida de linha, fora da garantia de edição/republicação. O dono do banco pode desabilitar triggers ou alterar funções: a proteção cobre clientes normais e depende da administração do banco.

A migração faz ALTER com default constante false para os existentes, troca o default para true para os próximos cadastros e instala o trigger na mesma transação. Não executa UPDATE nos produtos. O lock exclusivo dura até o commit e impede inserção entre classificação e instalação do trigger. Há lock_timeout de 5s e statement_timeout de 30s: falha de lock/timeout exige rollback e reagendamento, nunca repetição cega. Não executar durante transações longas/importações. Não é idempotente: nomes existentes fazem falhar a transação, sem CREATE OR REPLACE ou IF NOT EXISTS que mascarariam outro contrato.

## 1. Inspeção — sem mudanças

1. Operador confirma projeto/ambiente e autorização de leitura. Não inferir que o projeto configurado no JS é o destino de produção. Usar acesso existente, sem copiar valores de credenciais para scripts ou relatórios.
2. Executar `proposta/inspecao-somente-leitura.sql` em sessão administrativa aprovada. O script usa transação READ ONLY, catálogos e contagens agregadas. Preservar os resultados em local restrito e registrar versão, policies, grants, defaults, constraints, triggers, regras e funções. Comparar todas as colunas/grants, não apenas permissões de tabela.
3. Confirmar tabela comum não particionada e sem herança (nenhum vínculo em pg_inherits, como pai ou filha), publicado boolean editável, RLS ativa e papéis anon/authenticated sem privilégios TRIGGER/TRUNCATE, BYPASSRLS, superuser, ownership ou herança que contorne RLS. Verificar se policies permissivas em conjunto deixam ler rascunhos ou escrever como conta comum; RLS habilitada sozinha não prova segurança.
4. Validar auth.uid()/private.is_admin() e concessões de schema/função; claims de metadata do usuário não podem conceder administração. Verificar todos os triggers existentes e sua ordem alfabética: nenhum BEFORE posterior pode alterar publicado, first_published_at ou publication_tracked; nenhuma regra pode desviar as escritas. Revisar efeitos de jobs/importadores, upserts e fluxos de restauração.
5. Confirmar que os novos nomes de colunas, constraint, função e trigger estão livres. Se existirem, PARAR e comparar o contrato; não remover/substituir automaticamente.
6. Confirmar acesso público a id e primeira data apenas em produtos publicados. SELECT em tabela permite ler colunas novas automaticamente, mas grants por coluna não. **Se faltar privilégio, ou se RLS permitir rascunhos, PARAR:** a proposta não concede/revoga permissões nem cria policies. Qualquer correção de ACL/RLS precisa de revisão e autorização próprias. Não liberar SELECT em toda a tabela para resolver uma coluna.
7. Capturar backup/schema export e baseline dos dados por processo aprovado (incluindo identificação e valores originais), sem armazená-los neste repositório. Registrar contagens publicado/rascunho e ACLs/policies para comparação. Não usar apenas contagens como prova de preservação dos dados.

**Saída obrigatória:** esquema real revisado e cópia sanitizada para ensaio. Sem ela, o bloqueio de integração real permanece.

## 2. Ensaio de migração — ambiente isolado aprovado

1. Restaurar o esquema real sanitizado e dados sintéticos em Postgres com a mesma versão do destino, incluindo triggers, grants, RLS e funções. Se necessário, PostgREST com configuração equivalente. Não restaurar dados pessoais/credenciais no workspace.
2. Executar `npm ci --cache /workspace/.npm-cache --no-audit --no-fund` e `CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache`. A suíte SQL usa somente bancos PGlite em memória; papéis/grants dos testes são exclusivamente sintéticos.
3. Aplicar `proposta/primeira-publicacao.sql` só nessa cópia. Confirmar estado anterior preservado campo a campo, ACLs/policies iguais, recusa de herança clássica/particionamento, conflitos de nomes com rollback total e nenhuma alteração de timestamps legados. Ensaiar duas sessões publicando a mesma linha: lock de linha serializa e a primeira data deve permanecer; esse cenário concorrente não é comprovado pelo PGlite de uma sessão.
4. Repetir pelo painel/Data API: cadastrar rascunho, salvar tamanhos, editar, publicar, mudar categoria, despublicar e republicar; testar publicação negada/rollback, inserção já publicada e upsert. Testar anon e conta comum sem capacidade de escrever, administradora revogada e cliente tentando alterar data/marcador. Não enviar WhatsApp real.
5. Testar GET com filtro `publicado=eq.true&select=id,first_published_at&order=id.asc`, paginação e papéis reais através do PostgREST. Confirmar que GET de rascunho por id não retorna linha a visitante/conta comum; não basta aplicar o filtro do frontend. Coluna sem grant ou cache desatualizado pode falhar sem derrubar o catálogo, mas impede ativação.

## 3. Migração do destino — ação remota futura, não autorizada nesta sessão

1. Obter autorização específica para esse projeto e mudança. Manter flag false e confirmar plano de manutenção/backup e plano de recuperação aprovado. Merge em main dispara deploy de produção automaticamente: qualquer integração Git é outra ação autorizada, não parte da migração do banco.
2. Pausar publicações/cadastros e jobs por uma janela controlada; conferir baseline atualizado e ausência de transações longas. Não interromper transações de terceiros automaticamente.
3. Operador executa **uma vez** o arquivo `proposta/primeira-publicacao.sql` em sessão com parada no primeiro erro (ex.: psql `-v ON_ERROR_STOP=1 -f ...`, usando conexão aprovada já configurada). O arquivo contém BEGIN/COMMIT. Se houver erro, executar ROLLBACK na mesma sessão e diagnosticar. Não prosseguir em transação abortada nem remover guards.
4. Não reaplicar outras migrations pendentes de pagamentos/tema por arrasto. Nenhuma permissão muda nesta proposta. Não backfill de created_at, agora, primeira edição ou data de deploy.

## 4. Validação — antes da flag

1. Com escritas ainda pausadas, executar `proposta/validacao-pos-migracao.sql`. Imediatamente após commit: total/valores anteriores iguais ao baseline, novos_rastreados=0, legados=total, legados_com_data_indevida=0 e todas as primeiras datas NULL. Colunas/defaults, constraint validada, trigger habilitado e função SECURITY INVOKER/search_path vazio devem conferir. Comparar dados originais, ACLs/policies e demais triggers com o backup/baseline.
2. Reexecutar inspeção completa e comparar permissões. Não “corrigir” grants automaticamente. Um grant por coluna pode impedir o GET da nova coluna; nesse caso manter flag false e solicitar a mudança mínima separadamente, sob RLS já validada.
3. Validar metadados PostgREST depois do DDL. Se cache de schema estiver desatualizado, usar o procedimento de reload aprovado pelo operador; não executar NOTIFY ou reinício automaticamente nesta sessão.
4. Liberar escritas somente após verificar o contrato. O teste de criação/publicação em projeto real exige autorização específica, sem misturar fixtures com catálogo de produção. Caso não haja autorização de escrita de teste, comprovar em staging equivalente e observar apenas um cadastro legítimo feito pela loja, com leitura autorizada. Rascunho novo fica sem data; primeira publicação recebe horário do banco; edição/republicação preservam. Não fabricar produtos para essa validação.
5. Repetir GET público e conta comum: somente publicados visíveis; first_published_at legada NULL; não expor tokens no registro de evidência. Se a origem da data não estiver comprovada, continuar bloqueado.

## 5. Ativação — mudança separada, após evidências

1. Revisão humana aceita evidências do esquema, segurança, ensaio e validação do destino. Autorizar separadamente a alteração de `novidadesPublicacaoConfiavel` para true e o mecanismo de publicação. Nesta branch/etapa o valor continua false.
2. Validar flag true primeiro em staging: zero novidades oculta seção; novo publicado aparece no máximo sete períodos de 24h; catálogo geral continua completo; categoria, busca, disponibilidade e carrinho funcionam; indisponibilidade da leitura opcional não derruba catálogo.
3. Só então seguir publicação explicitamente aprovada. Após ela, verificar GET, console, mobile/desktop e produto legítimo; não interpretar catálogo carregado com seção oculta como comprovação da coluna opcional. Nenhum pedido real para testar WhatsApp.
4. Se houver problema, desativar a flag pelo processo de publicação aprovado; não apagar colunas/trigger/dados para “reverter”. Manter a captura da primeira publicação ativa preserva histórico durante o diagnóstico. Rollback de schema posterior à utilização exige plano específico; não há DROP automático preparado.

## Deploys conhecidos

`.github/workflows/publicar-producao.yml`: push só em main e dispatch manual, job limitado a refs/heads/main. `publicar-teste.yml`: apenas dispatch manual, com deploy efetivo no site de teste. Não há trigger pull_request, pull_request_target nem push da feature nos workflows versionados. Criar PR ou editar esta branch não aciona esses workflows de produção. Integrações externas não versionadas e configurações atuais do provedor precisam de inspeção humana antes de qualquer ação remota; não foram auditadas nesta etapa. Nenhum workflow foi executado ou alterado aqui.


## Revisão independente desta etapa

Foi reproduzido um bypass na proposta anterior com herança clássica: ALTER TABLE propagava as colunas aos descendentes sem propagar o trigger. Corrigido com recusa explícita de qualquer vínculo em pg_inherits (pai ou filha), lock ONLY e inspeção de herança. Os dois casos receberam testes que falharam antes da correção. Tabelas herdadas/particionadas precisam de desenho separado; não remover o guard para forçar a aplicação.

## Evidência local final

`npm ci` concluiu. `npm test` aprovou 33 testes Node.js e 52 Playwright, sem falhas/ignorados. A suíte Node foi repetida após o último acréscimo de metadados ao script de inspeção e aprovou os mesmos 33 testes. As verificações incluem execução dos scripts de inspeção/validação em transações READ ONLY e comparação de dados/ACLs. Esses resultados não substituem o ensaio no esquema real e na versão do destino.

## Evidência adicional fornecida pelo usuário: laboratório PostgreSQL 17.11

A inspeção informada confirma created_at/publicado/updated_at, ausência de first_published_at, leitura anon de publicados, gerenciamento authenticated por private.is_admin() e grants SELECT/INSERT/UPDATE/DELETE. Informa também o trigger BEFORE UPDATE produtos_set_updated_at → private.set_updated_at(). Ver a seção correspondente em REVISAO.md e o teste publicacao-updated-at.test.cjs.

Isso reduz as incógnitas de esquema, mas não substitui a definição do corpo da função existente. O novo trigger executa antes dela por ordem alfabética; validar que a função posterior só atualiza updated_at e retorna NEW, sem restaurar OLD ou alterar publicado/first_published_at/publication_tracked. Não renomear/remover o trigger existente nem enfraquecer seus grants para forçar compatibilidade. O ensaio nativo/PostgREST deve usar PostgreSQL 17.11, conforme versão informada. A proposta e os gates de inspeção/migração/validação/ativação permanecem separados.
