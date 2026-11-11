-- Buscas sem resultado (scripts/searchMisses.js): um contador por termo e
-- conjunto, para saber que ícones as pessoas procuram e não acham. Sem IP nem
-- nada que identifique quem buscou.
CREATE TABLE search_misses (
  term        text NOT NULL CHECK (char_length(term) BETWEEN 2 AND 40),
  icon_set    text NOT NULL,
  count       integer NOT NULL DEFAULT 1,
  langs       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- buscas por idioma do site
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (term, icon_set)
);
CREATE INDEX search_misses_count ON search_misses (count DESC, last_seen DESC);

-- A aplicação usa outro papel (iconlibrary_api). Com PG_MIGRATE=false, rode
-- este arquivo com o dono do banco e registre-o em schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iconlibrary_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON search_misses TO iconlibrary_api;
  END IF;
END $$;
