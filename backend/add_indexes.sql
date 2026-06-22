-- IPAM Performance Indexes
-- Created: 2026-06-23
-- Purpose: Improve query performance for common searches and filters

-- ============================================
-- Enable pg_trgm extension for fuzzy text search
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- Full-text search indexes (ILIKE queries)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_code_trgm ON customers USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_allocations_desc_trgm ON allocations USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_blocks_name_trgm ON ip_blocks USING gin (name gin_trgm_ops);

-- ============================================
-- Composite indexes for common filter patterns
-- ============================================
CREATE INDEX IF NOT EXISTS idx_allocations_status_owner ON allocations (status, owner_type);
CREATE INDEX IF NOT EXISTS idx_blocks_status_version ON ip_blocks (status, ip_version);
CREATE INDEX IF NOT EXISTS idx_vlans_site_status ON vlans (site_id, status);

-- ============================================
-- Partial indexes (smaller, faster for active records)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_allocations_active ON allocations (prefix) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers (name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_blocks_active ON ip_blocks (prefix) WHERE status = 'active';

-- ============================================
-- Index for audit log queries
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audit_table_action ON audit_log (table_name, action, changed_at DESC);

-- ============================================
-- Verify indexes created
-- ============================================
SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('customers', 'allocations', 'ip_blocks', 'vlans', 'audit_log') ORDER BY tablename, indexname;
