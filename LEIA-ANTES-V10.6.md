# Lume Woman — V10.6, versão de testes revisada

## O que foi preparado
- Novos textos comerciais, organização do conteúdo, seção Sobre a Lume e depoimentos autorizados.
- Controles no painel para enquadramento da imagem principal e conteúdo editorial.
- Ajuste de segurança: ambiente de TESTE usa `modoTeste: true`, com identificação das mensagens.
- A rotina de PRODUÇÃO continua convertendo a configuração para `modoTeste: false` apenas na publicação oficial.
- Prévia do banner no painel com textos de referência coerentes com a V10.6.

## Antes de liberar em produção
1. Colocar os arquivos desta versão na branch de TESTE do GitHub sem sobrescrever a versão oficial.
2. Avaliar a migração `migrations/2026-11-v106.sql` no Supabase; adiciona apenas colunas à tabela existente `loja_tema`. Verificar permissões (RLS e Storage) antes de executar.
3. Testar abertura do site e do painel; salvar texto sobre a loja, ajuste do banner e depoimento autorizado; verificar também estoque, carrinho, entrega e WhatsApp.
4. Confirmar se o conteúdo dinâmico do Supabase não está substituindo as novas frases padrão do banner. Ajustá-lo pelo painel, se necessário.
5. Aprovar a versão de teste antes de publicar na loja principal.

## Importante
- O ZIP não foi publicado, e a migração SQL não foi executada.
- A presença de `noindex,nofollow,noarchive` no HTML mantém o site fora da indexação por mecanismos de busca. Isso merece revisão separada quando a produção estiver pronta para aparecer em buscadores.
- O arquivo `wrangler.jsonc.` (com um ponto final no nome) veio do pacote original e não é usado pelos dois workflows; não o renomeie sem antes revisar as configurações de implantação.
- Não envie chaves secretas do Supabase ou da Cloudflare para o repositório.
