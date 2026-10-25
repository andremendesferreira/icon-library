-- Relatos de bug enviados pelo formulário do rodapé (scripts/reports.js).
-- Lidos e marcados como resolvidos em /admin. O IP não é guardado.
CREATE TABLE bug_reports (
  id           serial PRIMARY KEY,
  message      text NOT NULL,
  email        text,                           -- opcional, para resposta
  page         text,                           -- endereço da página
  lang         text,                           -- idioma do site
  browser      text,                           -- user agent
  screen       text,                           -- largura×altura da janela
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);
CREATE INDEX bug_reports_status ON bug_reports (status, created_at);
