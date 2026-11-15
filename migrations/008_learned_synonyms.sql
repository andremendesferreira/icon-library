-- Sinônimos aprendidos (scripts/synonymLearning.js): o agente diário do n8n
-- sugere termos em inglês para uma busca sem resultado; os que acham ícones
-- viram sinônimo daquele idioma e entram na busca de todo mundo.
CREATE TABLE learned_synonyms (
  lang        text NOT NULL,
  term        text NOT NULL CHECK (char_length(term) BETWEEN 2 AND 40),
  targets     jsonb NOT NULL,                       -- ["trash", "bin"]
  icons       integer NOT NULL DEFAULT 0,           -- ícones achados no teste
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lang, term)
);

-- Quando o agente tentou um termo sem achar nada: ele só volta depois de 30 dias
ALTER TABLE search_misses ADD COLUMN tried_at timestamptz;

-- A aplicação usa outro papel (iconlibrary_api). Com PG_MIGRATE=false, rode
-- este arquivo com o dono do banco e registre-o em schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iconlibrary_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON learned_synonyms TO iconlibrary_api;
  END IF;
END $$;
