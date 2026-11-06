# LUME WOMAN — redesign editorial e disponibilidade pública

Base: main, commit 7e481bf512b99d745783f90e373fa7f8ae626302.
Branch local: design/redesign-editorial-premium. Revisão em 6 de novembro de 2026.

## Escopo entregue

- Hero editorial com composição vertical no celular, tipografia e espaçamento refinados.
- Cards com fotografias completas, sem zoom ou distorção; miniaturas e carrinho usam contain.
- Menu mobile progressivo, teclado, Escape e fechamento ao navegar; links visíveis sem JavaScript.
- Link para pular à coleção, foco na busca, filtros com aria-pressed e alvos de toque maiores.
- Animação curta somente no hero, sem ocultação por opacity ou IntersectionObserver. Produtos inseridos dinamicamente permanecem visíveis. prefers-reduced-motion desativa animações, transições e rolagem suave.
- Logo, fontes, cores, grade, textos e controles de zoom/posição do banner continuam sob controle do painel. Nenhum arquivo administrativo, de pagamentos, entregas, autenticação ou configuração foi alterado.
- Atualização somente dos tamanhos públicos, por GET sem sessão, a cada 60 segundos com aba visível, no retorno à aba e na restauração pelo histórico. Intervalo mínimo de 15 segundos, uma atualização por vez, timeout de 10 segundos por consulta.
- Consulta de três colunas, páginas de 500 registros com ordem determinística. Falha ou resposta inválida mantém os dados conhecidos e o carrinho. Uma página parcial com erro não é aplicada. Produtos só são redesenhados se os tamanhos mudarem.
- Validação dos tamanhos conhecidos ao adicionar e antes de finalizar. Item que perdeu disponibilidade permanece no carrinho para revisão/remoção; não é enviado ao WhatsApp. Nenhuma reserva, baixa, cobrança ou mensagem foi realizada.

## Inspeção das alterações anteriores e publicação

Não havia PR aberto na inspeção. Todas as cinco branches anteriores são ancestrais da main:
fix/fotos-condicoes-pagamento (5 commits atrás), fix/banner-e-avisos-admin (3), fix/indexacao-google (1), preparar-v10-6 (7), teste-v10-5-vendas (18).
O arquivo REVIEW.md anterior foi preservado integralmente, inclusive a indicação de migrações antigas ainda pendentes. A presença desses arquivos no Git não foi tratada como autorização para executá-los.

Ambos os workflows usam workflow_dispatch. O workflow de teste também executa deploy no Worker de teste, apesar do texto “sem publicar”. Nenhum workflow foi disparado. Apenas seus blocos de preparação foram reproduzidos localmente em diretórios temporários. Os quatro arquivos públicos alterados já constam nas listas de cópia; não foi necessário alterar os workflows.

## Parte interrompida: contagens exatas de estoque

O contrato público atual não permite implementar com segurança os cinco rótulos pedidos.
A inspeção somente de leitura do projeto configurado rtbdqvbbvsxhgxnaiaom confirmou:

- anon tem SELECT apenas em id, produto_id, tamanho e ordem de produto_tamanhos.
- A política pública aceita somente estoque > 0 de produtos publicados.
- A quantidade estoque não é pública. Ausência de linha não distingue zero, tamanho removido e produto despublicado.

Por instrução do usuário, não houve alteração de banco, RLS, permissões ou infraestrutura. Não foi feita consulta pública à coluna proibida, não há service_role no cliente e não há contagem inventada a partir de tamanhos. A interface mantém “Indisponível” quando não existem tamanhos públicos; não afirma “Esgotado”.

### Proposta para aprovação futura (não implementada)

Criar uma projeção pública separada, com apenas produto_id, tamanho e faixa_disponibilidade, limitada a 0, 1, 2, 3 ou 4 (4 significa 4 ou mais). Incluir explicitamente zero para tamanhos cadastrados de produtos publicados. Não retornar identificadores administrativos, fornecedores, custos, vendas nem saldo exato acima de três.

Manter a projeção consistente com o estoque administrativo em uma transação, por mecanismo de banco revisado; isso requer migração e políticas próprias, portanto uma tarefa separada e autorizada. A tabela original e suas restrições permaneceriam intactas. Visitantes teriam somente leitura de produtos publicados, sem INSERT/UPDATE/DELETE. As atualizações seriam restritas ao mecanismo interno, com privilégios mínimos. Não adicionar uma view que contorne a RLS atual.

Antes da liberação: testar visitante/conta comum/admin, produtos despublicados, tamanhos removidos, zero e todas as cinco faixas; validar atomicidade, paginação e volume. Se uma API em Worker for escolhida, limitar filtros/volume, não aceitar SQL arbitrário, guardar credenciais apenas no servidor e usar acesso restrito à projeção, sem permissões de escrita. Falha/ausência continua sendo estado desconhecido, nunca zero.

Com esse contrato aprovado, mapear por tamanho: 4 → Disponível; 3 → Restam 3 unidades; 2 → Restam 2 unidades; 1 → Última unidade; 0 → Esgotado. Sem somar tamanhos para criar urgência. O carrinho continuará preliminar, com validação da quantidade conhecida antes da finalização e confirmação final pela loja.

## Evidências e limites

- npm test: 3 testes Node/Postgres isolado e 29 testes Chromium, incluindo os 23 testes de navegador anteriores.
- Novos testes: atualização periódica, retorno à aba, intervalo mínimo, aba oculta, ausência de sobreposição, erro de rede, resposta inválida, paginação e falha na segunda página, tamanho removido, carrinho preservado, menu por teclado, reduced motion e configurações de tema.
- Fotos verticais, horizontais e quadradas, modal/galeria, busca e ausência de rolagem horizontal em 320×568, 390×844, 844×390 e 1440×900.
- Carrinho persistido, quantidades, remoção, CEP, retirada, entrega, oito combinações de pagamentos, mensagens de WhatsApp interceptadas, login/autorização/logout e navegação administrativa: regressões existentes.
- Sintaxe de todos os arquivos JavaScript e git diff --check aprovados.
- Preparação local dos dois workflows aprovada, sem executar os passos de deploy.
- GET real da consulta de tamanhos: HTTP 200, 29 registros, somente produto_id/tamanho/ordem. Nenhuma gravação remota.
- Documentação atual de RLS consultada. Changelog Supabase consultado; nenhuma mudança de schema, SDK ou autenticação foi necessária.

Capturas opcionais: LUME_EVIDENCE_DIR=/caminho npm run test:browser -- --grep 'fotografias completas'.
As capturas usam produtos, fotos geométricas e Auth simulados; não são aprovação visual das fotografias reais nem de publicação. Fontes externas podem usar fallback nos testes. O banner real mantém enquadramento escolhido no painel.

Limites: não há contagem exata ou validação quantitativa de saldo; o polling atualiza tamanhos dos produtos carregados, não preços, fotos nem novos produtos. Recarregar a página continua usando as regras anteriores de restauração do carrinho. As consultas paginadas não são uma transação de banco; a loja confirma o saldo. Não foram medidos Core Web Vitals em produção nem certificada conformidade WCAG integral; verificar contraste das cores personalizadas e conteúdo real antes da aprovação. Não houve login administrativo real, compra real ou teste em Safari/iOS.

## PR e reversão

Título sugerido: Refinar vitrine editorial e atualizar disponibilidade pública por tamanho.
O PR deve informar explicitamente que as faixas quantitativas estão bloqueadas, conforme a seção acima.

A integração recusou criar a branch com HTTP 403 “Resource not accessible by integration”; o Git confirmou HTTP 403 na verificação de push. O PR remoto não foi criado. Esta branch local parte do commit real da main, obtido por fetch depois de restabelecer a rede.

Para enviar em um ambiente com escrita autorizada: revisar a base, garantir que a branch remota com esse nome não contém trabalho de outra pessoa, fazer push sem force e abrir PR em rascunho para main. Nunca sobrescrever branch existente nem resolver divergências automaticamente.

Antes de merge, basta fechar o PR e descartar a branch de revisão. Depois de eventual merge autorizado, preparar um revert do commit de merge/alteração em nova branch, executar npm test e revisar o PR de reversão. Qualquer publicação dessa reversão exige autorização própria. Não existe mudança de banco a reverter.

Não houve merge, publicação, execução de workflows ou migração.
