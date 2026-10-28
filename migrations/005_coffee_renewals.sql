-- Renovações do "pague um café" (scripts/coffee.js): um novo pagamento com o
-- código no link do Stripe (client_reference_id) estende o mesmo código, e o
-- apoiador continua dono dos ícones que publicou
CREATE TABLE coffee_renewals (
  session_id  text PRIMARY KEY,
  code        text NOT NULL REFERENCES coffee_supporters (code),
  amount      integer,
  currency    text,
  paid_at     timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coffee_renewals_code ON coffee_renewals (code);
