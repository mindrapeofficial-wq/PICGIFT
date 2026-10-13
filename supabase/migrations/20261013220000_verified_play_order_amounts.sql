-- Missing Google accounting data must not delay delivery of a verified purchase.
-- Stripe continues supplying its explicit Checkout amount and currency.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.picgift_orders
 ALTER COLUMN amount_cents DROP NOT NULL,
 ALTER COLUMN currency DROP NOT NULL,
 ADD COLUMN amount_source text NOT NULL DEFAULT 'checkout'
  CHECK (amount_source IN ('checkout','google_orders','unavailable')),
 ADD COLUMN play_order_total jsonb,
 ADD COLUMN play_test_purchase boolean;
ALTER TABLE public.picgift_orders DROP CONSTRAINT picgift_orders_amount_cents_check;
ALTER TABLE public.picgift_orders ADD CONSTRAINT picgift_orders_amount_cents_check CHECK (amount_cents >= 0);
-- Earlier Play amounts were inferred from the EUR catalog and are not receipts.
UPDATE public.picgift_orders SET amount_cents=NULL,currency=NULL,amount_source='unavailable'
 WHERE provider='google_play';
COMMENT ON COLUMN public.picgift_orders.play_order_total IS 'Verified Google Orders total Money: exact currencyCode, units and nanos. Null until available; excludes buyer address and other personal order metadata.';
COMMENT ON COLUMN public.picgift_orders.amount_cents IS 'Hundredths of currency units when exactly representable; for Google, use play_order_total as authoritative. Null is unknown or not exactly representable, never zero revenue.';
COMMENT ON COLUMN public.picgift_orders.amount_source IS 'checkout: existing Stripe amount; google_orders: verified provider total; unavailable: accounting pending, independent of credit delivery.';
COMMENT ON COLUMN public.picgift_orders.play_test_purchase IS 'Google ProductPurchaseV2 testPurchaseContext is present. True purchases are license tests, not real revenue; null means not yet classified.';
COMMIT;
