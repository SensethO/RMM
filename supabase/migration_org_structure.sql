-- ──────────────────────────────────────────────────────────────────────────────
-- RMM — Structure organisationnelle (Entreprises / Sites / Services)
-- Exécuter dans Supabase SQL Editor :
-- https://console.supabase.com/project/ebgjazfgxsumzbsvyrna/sql/new
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Entreprises ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  name        text        NOT NULL,
  type        text        DEFAULT 'company',
  description text,
  address     text,
  city        text,
  country     text        DEFAULT 'France',
  phone       text,
  website     text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON organizations(tenant_id);

-- 2. Sites physiques ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  address         text,
  city            text,
  postal_code     text,
  country         text        DEFAULT 'France',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sites_tenant ON sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_org    ON sites(organization_id);

-- 3. Services / Départements ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  organization_id uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  site_id         uuid        REFERENCES sites(id)         ON DELETE SET NULL,
  name            text        NOT NULL,
  description     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_org    ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_site   ON departments(site_id);

-- 4. Colonnes org sur devices ──────────────────────────────────────────────────
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id         uuid REFERENCES sites(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id   uuid REFERENCES departments(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes           text;

CREATE INDEX IF NOT EXISTS idx_devices_org  ON devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_devices_site ON devices(site_id);
CREATE INDEX IF NOT EXISTS idx_devices_dept ON devices(department_id);

-- 5. Données de démo ───────────────────────────────────────────────────────────
DO $$
DECLARE
  t_id  uuid := 'a0000000-dead-beef-0000-000000000001';
  o1    uuid;
  s1    uuid;
  s2    uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE tenant_id = t_id) THEN
    INSERT INTO organizations (tenant_id, name, type, city, country)
      VALUES (t_id, 'SCDB Pro SARL', 'company', 'Paris', 'France')
      RETURNING id INTO o1;

    INSERT INTO sites (tenant_id, organization_id, name, city, country)
      VALUES (t_id, o1, 'Siège Paris', 'Paris', 'France')
      RETURNING id INTO s1;

    INSERT INTO sites (tenant_id, organization_id, name, city, country)
      VALUES (t_id, o1, 'Agence Lyon', 'Lyon', 'France')
      RETURNING id INTO s2;

    INSERT INTO departments (tenant_id, organization_id, site_id, name) VALUES
      (t_id, o1, s1, 'Informatique'),
      (t_id, o1, s1, 'Direction'),
      (t_id, o1, s2, 'Commercial');
  END IF;
END $$;
