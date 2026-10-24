-- Apoiadores do "pague um café" (scripts/coffee.js)
CREATE TABLE IF NOT EXISTS coffee_supporters (
  session_id  text PRIMARY KEY,
  code        text UNIQUE NOT NULL,
  amount      integer,
  currency    text,
  paid_at     timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  devices     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);
