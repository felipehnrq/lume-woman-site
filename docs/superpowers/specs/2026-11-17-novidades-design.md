# Acabaram de chegar — prévia segura

A seção acima da coleção compartilha cards, modal, disponibilidade e carrinho com o catálogo. Mostra quatro peças; um botão expande todas as novidades sem retirar produtos do catálogo. Os filtros e busca da coleção continuam locais à coleção.

Novidade significa publicação comprovada no intervalo [agora - 168 horas, agora], excluindo exatamente 168 horas. Datas inválidas, sem fuso, ausentes ou futuras não qualificam. Categoria não reinicia prazo. Despublicados não entram. A ordem geral usa created_at desc, datas ausentes por último e UUID crescente nos empates; created_at é cadastro, nunca substitui publicação.

Alternativas: usar created_at para novidades foi descartado por confundir cadastro com publicação; inferir pelo navegador foi descartado por não ser histórico confiável. Escolha técnica: first_published_at registrado pelo banco e imutável, com leitura opcional isolada. A flag novidadesPublicacaoConfiavel fica falsa até revisão de esquema, migração e validação separadas. Se a leitura opcional falhar, só novidades desaparece.

Sem alterações remotas, deploy, merge, migrações aplicadas ou credenciais novas. Uma proposta SQL fora das migrations automáticas não faz backfill de datas inventadas. Produtos legados continuam sem destaque até evidência histórica revisada. Preview e evidências usam mocks.
