CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
CREATE TYPE ip_version_t   AS ENUM ('IPv4', 'IPv6');
CREATE TYPE block_status_t AS ENUM ('active', 'reserved', 'deprecated');
CREATE TYPE alloc_status_t AS ENUM ('active', 'reserved', 'available', 'deprecated');
CREATE TYPE owner_type_t  AS ENUM ('customer', 'internal', 'ptp', 'peering', 'management', 'reserved');
CREATE TYPE vlan_status_t  AS ENUM ('active', 'reserved', 'deprecated');

-- ------------------------------------------------------------
-- SITES / LOKASI
-- ------------------------------------------------------------
CREATE TABLE sites (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        CITEXT NOT NULL UNIQUE,
    city        VARCHAR(100),
    region      VARCHAR(100),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- CUSTOMERS / TENANTS
-- ------------------------------------------------------------
CREATE TABLE customers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          CITEXT NOT NULL,
    code          VARCHAR(50),
    contact_name  VARCHAR(100),
    contact_email VARCHAR(150),
    contact_phone VARCHAR(30),
    description   TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON customers (name);

-- ------------------------------------------------------------
-- IP BLOCKS (parent /24, /48, dll)
-- ------------------------------------------------------------
CREATE TABLE ip_blocks (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prefix      CIDR NOT NULL UNIQUE,
    ip_version  ip_version_t NOT NULL GENERATED ALWAYS AS (
                    CASE WHEN family(prefix) = 4 THEN 'IPv4'::ip_version_t
                         ELSE 'IPv6'::ip_version_t END
                ) STORED,
    name        VARCHAR(200),
    asn         VARCHAR(20),
    router      VARCHAR(200),
    operator    VARCHAR(200),
    site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
    status      block_status_t NOT NULL DEFAULT 'active',
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ip_blocks_prefix ON ip_blocks USING gist (prefix inet_ops);
CREATE INDEX idx_ip_blocks_site   ON ip_blocks (site_id);

-- ------------------------------------------------------------
-- VLANs
-- ------------------------------------------------------------
CREATE TABLE vlans (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vid         INTEGER NOT NULL CHECK (vid BETWEEN 1 AND 4094),
    name        CITEXT,
    status      vlan_status_t NOT NULL DEFAULT 'active',
    site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vid, site_id)
);

CREATE INDEX idx_vlans_vid  ON vlans (vid);
CREATE INDEX idx_vlans_site ON vlans (site_id);

-- ------------------------------------------------------------
-- ALLOCATIONS (sub-prefix per customer dalam sebuah block)
-- ------------------------------------------------------------
CREATE TABLE allocations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_id    UUID NOT NULL REFERENCES ip_blocks(id) ON DELETE CASCADE,
    prefix      CIDR NOT NULL,
    ip_version  ip_version_t NOT NULL GENERATED ALWAYS AS (
                    CASE WHEN family(prefix) = 4 THEN 'IPv4'::ip_version_t
                         ELSE 'IPv6'::ip_version_t END
                ) STORED,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    vlan_id     UUID REFERENCES vlans(id) ON DELETE SET NULL,
    status      alloc_status_t NOT NULL DEFAULT 'active',
    owner_type  owner_type_t   NOT NULL DEFAULT 'customer',
    description TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (prefix)
);

CREATE INDEX idx_allocations_block    ON allocations (block_id);
CREATE INDEX idx_allocations_prefix   ON allocations USING gist (prefix inet_ops);
CREATE INDEX idx_allocations_customer ON allocations (customer_id);
CREATE INDEX idx_allocations_vlan     ON allocations (vlan_id);

-- ------------------------------------------------------------
-- AUDIT LOG
-- ------------------------------------------------------------
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(60) NOT NULL,
    record_id   UUID,
    action      VARCHAR(10) NOT NULL,
    changed_by  VARCHAR(100) DEFAULT 'system',
    old_data    JSONB,
    new_data    JSONB,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_changed_at ON audit_log (changed_at DESC);

-- ------------------------------------------------------------
-- VIEWS
-- ------------------------------------------------------------
CREATE VIEW v_block_summary AS
SELECT
    b.id,
    b.prefix::text,
    b.ip_version,
    b.name,
    b.asn,
    b.router,
    b.operator,
    b.status,
    s.name AS site_name,
    masklen(b.prefix) AS prefix_length,
    COUNT(a.id) AS total_allocations,
    COUNT(a.id) FILTER (WHERE a.status = 'active') AS active_allocations,
    COUNT(a.id) FILTER (WHERE a.status = 'available') AS available_allocations
FROM ip_blocks b
LEFT JOIN sites s ON b.site_id = s.id
LEFT JOIN allocations a ON a.block_id = b.id
GROUP BY b.id, s.name;

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

-- ------------------------------------------------------------
-- AUTO updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['sites','customers','ip_blocks','vlans','allocations']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            tbl, tbl
        );
    END LOOP;
END $$;
