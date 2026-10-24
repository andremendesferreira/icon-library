-- Fonte Iconlibrary: ícones enviados por apoiadores (scripts/iconlibrary.js).
-- Só os aprovados aparecem no site; todos ficam sob licença MIT.
CREATE TABLE iconlibrary_icons (
  id              serial PRIMARY KEY,
  slug            text NOT NULL,                 -- nome em kebab-case
  name            text NOT NULL,
  svg             text NOT NULL,                 -- já validado e normalizado
  categories      text[] NOT NULL,
  author          text,                          -- crédito público, opcional
  supporter_code  text NOT NULL REFERENCES coffee_supporters (code),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  license         text NOT NULL DEFAULT 'MIT',
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  review_note     text
);
-- Um nome só pode estar em uso por um ícone pendente ou aprovado; os recusados
-- liberam o nome
CREATE UNIQUE INDEX iconlibrary_icons_slug ON iconlibrary_icons (slug)
  WHERE status <> 'rejected';
CREATE INDEX iconlibrary_icons_status ON iconlibrary_icons (status, created_at);
CREATE INDEX iconlibrary_icons_supporter ON iconlibrary_icons (supporter_code);
