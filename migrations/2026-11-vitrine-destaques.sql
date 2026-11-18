-- Aplicar somente após aprovação da publicação. Não altera produtos nem estoque.
ALTER TABLE public.loja_tema
 ADD COLUMN IF NOT EXISTS produtos_destaque uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];
ALTER TABLE public.loja_tema
 DROP CONSTRAINT IF EXISTS loja_tema_destaques_limite;
ALTER TABLE public.loja_tema
 ADD CONSTRAINT loja_tema_destaques_limite
 CHECK (cardinality(produtos_destaque) <= 4 AND array_position(produtos_destaque, NULL) IS NULL);
-- As políticas RLS existentes de loja_tema continuam controlando leitura e escrita.
