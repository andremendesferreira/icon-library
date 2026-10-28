-- Edições dos ícones da Iconlibrary pelo próprio autor (scripts/iconlibrary.js).
--
-- Ícone pendente ou recusado: a edição muda o próprio ícone, que volta para a
-- fila. Ícone aprovado: a versão no ar continua como está e a edição fica
-- guardada nas colunas revision_*, até a moderação aprovar (aí ela substitui a
-- atual) ou recusar (aí ela é descartada).
ALTER TABLE iconlibrary_icons
  ADD COLUMN submitted_at          timestamptz,
  ADD COLUMN revision_name         text,
  ADD COLUMN revision_slug         text,
  ADD COLUMN revision_svg          text,
  ADD COLUMN revision_categories   text[],
  ADD COLUMN revision_author       text,
  ADD COLUMN revision_submitted_at timestamptz;

-- Último envio (criação ou edição): a moderação automática usa para saber que
-- um ícone já julgado mudou e precisa ser visto de novo
UPDATE iconlibrary_icons SET submitted_at = created_at;
ALTER TABLE iconlibrary_icons
  ALTER COLUMN submitted_at SET NOT NULL,
  ALTER COLUMN submitted_at SET DEFAULT now();

-- Um nome proposto numa revisão também fica reservado
CREATE UNIQUE INDEX iconlibrary_icons_revision_slug ON iconlibrary_icons (revision_slug)
  WHERE revision_slug IS NOT NULL;
