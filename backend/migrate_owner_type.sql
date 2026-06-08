-- Migration: Add owner_type to allocations
-- Run: docker exec ipam-db psql -U ipam -d ipam -f /tmp/migrate_owner_type.sql

BEGIN;

-- 1. Create enum
CREATE TYPE owner_type_t AS ENUM (
    'customer',     -- pelanggan ISP
    'internal',     -- server/device internal SDI
    'ptp',          -- point-to-point link
    'peering',      -- IX peering / transit
    'management',   -- management network
    'reserved'      -- dicadangkan
);

-- 2. Add column to allocations
ALTER TABLE allocations
    ADD COLUMN owner_type owner_type_t NOT NULL DEFAULT 'customer';

-- 3. Auto-set owner_type based on existing data
-- Rows with customer_id = customer, rows without = internal (best guess)
UPDATE allocations SET owner_type = 'customer'  WHERE customer_id IS NOT NULL;
UPDATE allocations SET owner_type = 'internal'  WHERE customer_id IS NULL AND status != 'available';
UPDATE allocations SET owner_type = 'reserved'  WHERE status = 'available';

-- 4. Add index
CREATE INDEX idx_allocations_owner_type ON allocations (owner_type);

-- 5. Drop and recreate view v_allocation_detail with owner_type
DROP VIEW v_allocation_detail;
CREATE VIEW v_allocation_detail AS
SELECT
    a.id,
    a.prefix::text,
    a.ip_version,
    a.status,
    a.owner_type,
    a.description,
    a.notes,
    a.created_at,
    a.updated_at,
    a.block_id,
    b.prefix::text AS block_prefix,
    b.name         AS block_name,
    b.asn          AS block_asn,
    b.router       AS block_router,
    s.name         AS site_name,
    a.customer_id,
    c.name         AS customer_name,
    c.code         AS customer_code,
    c.contact_email AS customer_email,
    a.vlan_id,
    v.vid          AS vlan_vid,
    v.name         AS vlan_name
FROM allocations a
JOIN ip_blocks b  ON a.block_id    = b.id
LEFT JOIN sites s ON b.site_id     = s.id
LEFT JOIN customers c ON a.customer_id = c.id
LEFT JOIN vlans v ON a.vlan_id     = v.id;

COMMIT;
