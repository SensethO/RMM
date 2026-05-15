-- ─── Fix: device_id unique PAR TENANT (pas globalement) ─────────────────────
-- Exécuter dans Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ebgjazfgxsumzbsvyrna/sql/new

-- 1. Supprimer la contrainte UNIQUE globale sur device_id
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_id_key;

-- 2. Ajouter une contrainte UNIQUE composite (tenant_id, device_id)
--    → le même device_id peut exister sous des tenants différents
ALTER TABLE devices
  ADD CONSTRAINT devices_tenant_device_unique UNIQUE (tenant_id, device_id);

-- 3. Supprimer l'index dupliqué si présent
DROP INDEX IF EXISTS devices_device_id_tenant;

-- 4. Recréer l'index composite utile pour les requêtes
CREATE INDEX IF NOT EXISTS devices_device_id_tenant ON devices(device_id, tenant_id);

-- 5. Vérification
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'devices';
