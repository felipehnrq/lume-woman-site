# Novidades Implementation Plan

> Execução local pelo agente, conforme autonomia explícita do usuário. TDD e revisão final antes do commit.

**Goal:** prévia testável sem produção, catálogo preservado.
**Architecture:** política pura de datas/ordem; leitura opcional de publicação; mesmo renderizador de cards em duas seções.
**Tech Stack:** JavaScript estático, Node test, PGlite, Playwright.
**Spec:** docs/superpowers/specs/2026-11-17-novidades-design.md

## Global Constraints
Sem escrita remota, deploy ou merge. Novidade por 7 × 24 horas desde primeira publicação confiável. Flag desativada por padrão.

## Review Focus
Datas inválidas/futuras; paginação parcial; falha da coluna opcional; expiração com página aberta; unicidade dos controles compartilhados.

## Task 1 — dados e política
- [x] Escrever testes Node para bordas de 168h, categoria, despublicação, datas incompletas e empates; confirmar falha.
- [x] Implementar catalogo-politica.js: sortProducts(rows), isNew(product, now), newProducts(rows, now); paginação e ordem total no loader; leitura opcional isolada.
- [x] Verificar testes Node.

## Task 2 — seção e regressões
- [x] Escrever testes Playwright para quatro cards, expansão, zero novidades, flag, expiração, falhas e filtros/busca/carrinho com mocks; confirmar falha.
- [x] Extrair card compartilhado no app.js, adicionar seção acessível e CSS responsivo; expiração programada/retorno à aba.
- [x] Rodar suíte completa, capturar celular/desktop, revisar diff.

## Task 3 — entrega
- [x] Preparar proposta SQL separada e teste isolado, documentar limitações e diagnóstico.
- [x] Commit na feature. Push/PR draft somente se permissões e gatilhos permitirem; API 403 não será contornada com novos tokens.

## Registro de execução

Ruling: autonomia explícita do usuário substitui gates de aprovação intermediária; execução inline na branch própria, sem worktree adicional. Custo: decisões de interface serão revisadas no PR/relatório, não antecipadamente.
Ruling: data histórica não comprovada mantém flag desligada; custo: destaque real depende de contrato de dados/migração separado. Nenhum created_at usado como primeira publicação.
Tasks 1–2: testes novos observados falhando antes da implementação. Revisão independente encontrou truncamento por limite de API e perda de foco na expiração; ambos receberam reproduções RED e correção. Suíte completa final registrada em docs/novidades/REVISAO.md.
Task 3: SQL testado apenas em PGlite, proposta fora de migrations automáticas. Publicação e banco remoto excluídos da execução.
