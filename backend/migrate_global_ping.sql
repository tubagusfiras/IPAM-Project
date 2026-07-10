-- Global Ping Visibility tables
-- Digunakan untuk menyimpan hasil ping multi-location

CREATE TABLE IF NOT EXISTS ping_results (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip          INET NOT NULL,
    prefix      CIDR NOT NULL,
    block_id    UUID REFERENCES ip_blocks(id) ON DELETE CASCADE,
    icmp_status VARCHAR(20) DEFAULT 'pending',  -- online / offline / pending / error
    icmp_rtt    DOUBLE PRECISION,                -- ms
    icmp_at     TIMESTAMPTZ,
    http_status VARCHAR(20) DEFAULT 'pending',   -- online / offline / pending / error
    http_rtt    DOUBLE PRECISION,
    http_at     TIMESTAMPTZ,
    oracle_sg_status VARCHAR(20) DEFAULT 'pending',
    oracle_us_status VARCHAR(20) DEFAULT 'pending',
    scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ping_results_ip ON ping_results(ip);
CREATE INDEX IF NOT EXISTS idx_ping_results_block ON ping_results(block_id);
CREATE INDEX IF NOT EXISTS idx_ping_results_scanned ON ping_results(scanned_at);
CREATE INDEX IF NOT EXISTS idx_ping_results_status ON ping_results(icmp_status);

CREATE TABLE IF NOT EXISTS ping_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip          INET NOT NULL,
    status      VARCHAR(20) NOT NULL,   -- online / offline
    rtt_ms      DOUBLE PRECISION,
    source      VARCHAR(50) NOT NULL,   -- icmp_local / http_global / oracle_sg / oracle_us
    checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ping_history_ip ON ping_history(ip);
CREATE INDEX IF NOT EXISTS idx_ping_history_checked ON ping_history(checked_at);
CREATE INDEX IF NOT EXISTS idx_ping_history_ip_time ON ping_history(ip, checked_at);
