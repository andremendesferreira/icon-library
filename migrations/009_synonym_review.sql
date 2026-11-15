-- Sinônimos aprendidos: nova análise pedida no /admin, com uma nota para o
-- modelo ("filhote de galinha: chick"). O agente diário pega estes primeiro e,
-- se achar ícones, troca os termos antigos (scripts/synonymLearning.js).
ALTER TABLE learned_synonyms
  ADD COLUMN review_hint text CHECK (char_length(review_hint) <= 200),
  ADD COLUMN review_requested_at timestamptz;

-- Nada de GRANT novo: a aplicação já tem SELECT/UPDATE em learned_synonyms.
-- Com PG_MIGRATE=false, rode com o dono do banco e registre em
-- schema_migrations (INSERT INTO schema_migrations (name) VALUES
-- ('009_synonym_review.sql')).
