-- Sourced — BOM & Parts Manager
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → paste → Run
-- Tables use user_id = auth.uid() for row-level security.

-- ── Parts ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_parts (
  id          text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  mpn         text,
  manufacturer text,
  category    text,
  footprint   text,
  description text,
  notes       text,
  datasheet   text,
  drawer      text,
  stock       integer     NOT NULL DEFAULT 0,
  stock_min   integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bm_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their parts" ON bm_parts
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Projects ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_projects (
  id          text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bm_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their projects" ON bm_projects
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── BOM Items ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_bom_items (
  id                    text        PRIMARY KEY,
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id            text        NOT NULL,
  part_id               text        NOT NULL,
  quantity              integer     NOT NULL DEFAULT 1,
  reference             text,
  notes                 text,
  preferred_supplier_id text,
  preferred_shop_id     text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bm_bom_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their bom items" ON bm_bom_items
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Suppliers (price data per part per shop) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_suppliers (
  id           text        PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id      text        NOT NULL,
  shop_id      text,
  shop_name    text        NOT NULL,
  sku          text,
  search_url   text,
  price        numeric(12,4),
  currency     text        NOT NULL DEFAULT 'EUR',
  notes        text,
  ai_generated boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bm_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their suppliers" ON bm_suppliers
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Shops ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_shops (
  id         text        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  region     text,
  url        text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bm_shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their shops" ON bm_shops
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
