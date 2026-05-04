CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  manufacturer TEXT,
  mpn TEXT,
  footprint TEXT,
  value TEXT,
  location TEXT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUST')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_search ON parts USING gin (
  to_tsvector('simple', coalesce(sku,'') || ' ' || coalesce(name,'') || ' ' || coalesce(category,'') || ' ' || coalesce(manufacturer,'') || ' ' || coalesce(mpn,'') || ' ' || coalesce(location,''))
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parts_updated_at ON parts;
CREATE TRIGGER trg_parts_updated_at
BEFORE UPDATE ON parts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
