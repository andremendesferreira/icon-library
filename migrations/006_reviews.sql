-- Avaliações dos apoiadores (scripts/reviews.js): nota de 1 a 5 e comentário,
-- publicados na página Sobre depois da moderação. Uma por código de apoiador.
-- Edição de uma avaliação aprovada espera em pending_json; a aprovada fica no
-- ar até a decisão.
CREATE TABLE reviews (
  id            serial PRIMARY KEY,
  supporter     text NOT NULL UNIQUE REFERENCES coffee_supporters (code),
  rating        smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text NOT NULL CHECK (char_length(comment) BETWEEN 10 AND 600),
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  provider      text NOT NULL DEFAULT 'anonymous'
                CHECK (provider IN ('anonymous', 'github', 'google', 'microsoft')),
  provider_hash text,                    -- sha256 de "provedor:id"; o token não é guardado
  avatar        bytea,                   -- PNG 96×96 redesenhado no servidor
  lang          text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  note          text,                    -- motivo da recusa (só para a moderação)
  pending_json  jsonb,                   -- edição esperando revisão
  created_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);
CREATE INDEX reviews_status ON reviews (status, submitted_at);

-- A aplicação usa outro papel (iconlibrary_api). Com PG_MIGRATE=false, rode
-- este arquivo com o dono do banco e registre-o em schema_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iconlibrary_api') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON reviews TO iconlibrary_api;
    GRANT USAGE, SELECT ON SEQUENCE reviews_id_seq TO iconlibrary_api;
  END IF;
END $$;
