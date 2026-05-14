-- Sourced — BOM & Parts Manager
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- Safe to run multiple times (IF NOT EXISTS).

-- ── Parts ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_parts (
  id               text        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  mpn              text,
  manufacturer     text,
  category         text,
  footprint        text,
  description      text,
  notes            text,
  datasheet        text,
  drawer           text,
  stock            integer     NOT NULL DEFAULT 0,
  stock_min        integer     NOT NULL DEFAULT 0,
  -- Phase 1 columns
  part_type        text,
  reel_qty         integer,
  used_in_projects integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- Phase 1 migration: add columns to existing tables
ALTER TABLE bm_parts ADD COLUMN IF NOT EXISTS part_type        text;
ALTER TABLE bm_parts ADD COLUMN IF NOT EXISTS reel_qty         integer;
ALTER TABLE bm_parts ADD COLUMN IF NOT EXISTS used_in_projects integer NOT NULL DEFAULT 0;
ALTER TABLE bm_parts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own their parts" ON bm_parts;
CREATE POLICY "users own their parts" ON bm_parts
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Projects ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_projects (
  id          text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bm_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own their projects" ON bm_projects;
CREATE POLICY "users own their projects" ON bm_projects
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

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
DROP POLICY IF EXISTS "users own their bom items" ON bm_bom_items;
CREATE POLICY "users own their bom items" ON bm_bom_items
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Suppliers (price data per part per shop) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_suppliers (
  id               text        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id          text        NOT NULL,
  shop_id          text,
  shop_name        text        NOT NULL,
  sku              text,
  search_url       text,
  price            numeric(12,4),
  currency         text        NOT NULL DEFAULT 'EUR',
  notes            text,
  ai_generated     boolean     NOT NULL DEFAULT false,
  pack_qty         integer     NOT NULL DEFAULT 1,
  stock            integer,
  -- Phase 1 columns
  moq              integer     NOT NULL DEFAULT 1,
  price_break_qty  integer,
  price_break_price numeric(12,4),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
-- Migration: add columns to existing tables
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS stock            integer;
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS moq              integer NOT NULL DEFAULT 1;
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS price_break_qty  integer;
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS price_break_price numeric(12,4);
ALTER TABLE bm_suppliers ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();
ALTER TABLE bm_suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own their suppliers" ON bm_suppliers;
CREATE POLICY "users own their suppliers" ON bm_suppliers
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Shops ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_shops (
  id                      text        PRIMARY KEY,
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                    text        NOT NULL,
  region                  text,
  url                     text,
  -- Phase 1 columns
  ali_ok                  boolean     NOT NULL DEFAULT false,
  trusted                 boolean     NOT NULL DEFAULT true,
  free_shipping_threshold numeric(12,2),
  shipping_cost           numeric(12,2) NOT NULL DEFAULT 0,
  supports_csv_import     boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);
-- Phase 1 migration
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS ali_ok                  boolean NOT NULL DEFAULT false;
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS trusted                 boolean NOT NULL DEFAULT true;
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS free_shipping_threshold numeric(12,2);
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS shipping_cost           numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE bm_shops ADD COLUMN IF NOT EXISTS supports_csv_import     boolean NOT NULL DEFAULT false;
ALTER TABLE bm_shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own their shops" ON bm_shops;
CREATE POLICY "users own their shops" ON bm_shops
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── AI Matches (Phase 2) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_ai_matches (
  id                   text        PRIMARY KEY,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_input            text        NOT NULL,
  matched_mpn          text,
  matched_manufacturer text,
  matched_part_id      text        REFERENCES bm_parts(id),
  confidence           text,
  confirmed            boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bm_ai_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users own their ai matches" ON bm_ai_matches;
CREATE POLICY "users own their ai matches" ON bm_ai_matches
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
