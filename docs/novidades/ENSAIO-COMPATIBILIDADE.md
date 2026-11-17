# Parecer de compatibilidade — Novidades

**GO para solicitar autorização de migração controlada no laboratório, com flag false.** O ensaio não concede autorização de execução. **NO-GO para ativação da flag ou publicação em produção** antes da validação remota autorizada e revisão humana.

## Evidência incorporada

O usuário confirmou por inspeção SQL somente leitura do Supabase Lume woman laboratório (PostgreSQL 17.11): `private.set_updated_at()` é SECURITY INVOKER, possui search_path vazio e executa somente `NEW.updated_at = now(); RETURN NEW`. O teste de coexistência reproduz corpo/atributos e verifica que a migração não os altera. A nova função atua na primeira publicação; a existente continua atualizando updated_at. Não há conflito de campos na definição informada.

## Ambiente ensaiado

- PostgreSQL **17.11 nativo**, versão numérica **170011**, imagem oficial com digest fixado no harness.
- PostgREST **12.2.3**, imagem oficial também fixada por digest. A versão do PostgREST do serviço Supabase não foi informada.
- Rede Docker `--internal`, sem portas expostas, banco descartável em tmpfs; HTTP real de dentro da rede. Nomes aleatórios, sem reutilizar containers alheios. Containers/rede removidos pelo script.
- Esquema sintético equivalente ao contrato conhecido: UUIDs, created_at/publicado/updated_at, RLS anon de publicados, authenticated por private.is_admin(), grants SELECT e SELECT/INSERT/UPDATE/DELETE, trigger atualizado confirmado. Inclui auxiliares de asserção/baseline exclusivos dos testes.
- JWTs HS256 e usuários administrativos/comuns sintéticos, gerados localmente. Não usa chaves, Auth, gateway, dados ou conexões do projeto real. TRUST só no banco efêmero dessa rede; não copiar essa configuração para ambiente persistente.

## Verificações

O harness `tests/ensaio-postgres17.cjs` aplica a proposta SQL existente sem modificá-la e exige sucesso em cada asserção:

1. Versão exata do PostgreSQL e disponibilidade de PostgREST.
2. Erro real 42703 ao consultar a coluna inexistente antes da migração.
3. Preservação campo a campo dos produtos legados, incluindo created_at/updated_at; comparação de ACL, RLS, policies e definições do trigger/função existentes.
4. Legados, inclusive rascunhos republicados, continuam sem data e não rastreados.
5. Novos rascunhos rastreados sem data; primeira publicação usa horário do banco e neutraliza data/marcador enviados pelo cliente.
6. Edição, mudança de categoria, despublicação e republicação preservam a primeira data e atualizam updated_at.
7. SQL com rollback não deixa publicação/data persistida.
8. GET real de first_published_at após migração/reload **local** de schema; anon lê a data correta em publicado e NULL no legado, sem acesso a rascunho.
9. JWT administrativo cria/publica/edita; anon não escreve; conta comum não insere, sobrescreve ou exclui por RLS. Respostas vazias de UPDATE/DELETE são verificadas como zero linhas, não sucesso de escrita.
10. Preferência HTTP `tx=rollback` é confirmada em Preference-Applied e por releitura do valor persistido.
11. Duas conexões PostgreSQL: sessão A publica e mantém lock; a espera PgSleep é observada antes de iniciar B. B tenta publicar/forjar a data após o lock, e ambas retornam a mesma primeira data.
12. Scripts de inspeção e validação somente leitura executam no banco local. Toda falha propaga código de saída; evidência final registra status e verificações, nunca JWT/secret.

Os 12 checks de estágio do harness agrupam essas asserções; não são contados como testes Node/Playwright adicionais. O artefato `evidencias/ensaio-postgres17.json` registra versões/digests/status da execução final. As tentativas intermediárias que falharam no harness não validaram o fluxo; o resultado final completo é a evidência utilizada.

## Reproduzir

Com Docker local, Node e as imagens/digests do harness já disponíveis:

```sh
node tests/ensaio-postgres17.cjs
CHROMIUM_PATH=/usr/bin/chromium npm test --cache /workspace/.npm-cache
```

O harness não baixa imagens. Por padrão grava `/workspace/lume-ensaio17-evidence/resultado.json`; pode-se definir LUME_PG17_EVIDENCE_DIR para outra pasta local. Não executar esse script com endpoints/credenciais remotos: ele usa exclusivamente os containers que cria e não aceita conexão externa de banco/API.

## Riscos e condição para autorização

O esquema foi reconstruído a partir das evidências fornecidas, não de um dump completo. Antes da aplicação, confirmar tipos, nomes livres (incluindo publication_tracked), ausência de herança/particionamento, demais triggers/regras, permissões efetivas e baseline/backup. O guard da proposta aborta em incompatibilidades detectáveis; não substituir essa inspeção por confiança no nome do projeto.

A versão/configuração real do PostgREST, cache de schema, gateway e Auth precisam de validação no laboratório após uma migração separadamente autorizada. O painel inteiro não foi ligado ao banco local: há regressão de navegador com mocks e integração real do contrato HTTP, documentadas separadamente. O horário de primeira publicação é o início da instrução, não commit; DELETE administrativo seguido de INSERT é nova vida de linha. Nenhuma dessas operações deve ser usada para renovar destaque legado.

## Procedimento obrigatório após autorização específica

1. Confirmar projeto correto; executar a inspeção READ ONLY, comparar esquema/segurança, capturar backup e baseline; pausar escritas/jobs na janela aprovada.
2. Aplicar somente `proposta/primeira-publicacao.sql` com parada no primeiro erro. Não reaplicar migrations pendentes não relacionadas. Em erro, rollback na mesma sessão e diagnosticar, sem remover guards.
3. Com flag false e escritas pausadas, executar validação READ ONLY; comparar dados/ACLs/policies/triggers com baseline. Todos os legados devem continuar sem data.
4. Verificar cache e GET reais da Data API como anon/conta comum/admin. Qualquer refresh de cache, escrita de teste ou correção de permissão exige seu próprio escopo autorizado. Sem produto fictício em produção.
5. Após liberar escritas, observar uma publicação legítima autorizada e confirmar data e preservação em edição/republicação conforme o plano aprovado. Só então considerar pedido separado para ativar flag/publicar.

A sequência detalhada, limites de lock/timeouts e plano de contenção estão em [IMPLANTACAO-SEGURA.md](IMPLANTACAO-SEGURA.md). Nenhum passo remoto foi executado nesta etapa.

## Resultado registrado

Execução final: **12 estágios nativos aprovados**, status passed, recursos de teste removidos sem falha. `npm test`: **34 Node.js + 52 Playwright aprovados**, zero falhas/ignorados. Comparação direta first_published_at = statement_timestamp() é coberta em PGlite; o ensaio nativo confirma ausência de data forjada, persistência e igualdade entre sessões concorrentes, sem declarar essa comparação exata nativa. Revisão independente sem falhas Critical/Important. A evidência JSON contém somente versões/digests/checks/timestamps, sem credenciais.
