-- DB Security Hardening
-- Membatasi hak akses user aplikasi

-- Buat user read-only untuk reporting (future use)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ipam_readonly') THEN
        CREATE ROLE ipam_readonly WITH LOGIN PASSWORD 'IpamRead0nly!';
    END IF;
END
$$;

-- Revoke superuser dari user aplikasi (setelah aplikasi berjalan)
-- KOMENTAR: Jalanin ini MANUAL setelah aplikasi sukses deploy
-- ALTER USER ipam WITH NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Set koneksi limit untuk keamanan
ALTER USER ipam WITH CONNECTION LIMIT 20;

-- Pastikan schema public tidak bisa ditulis sembarangan
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO ipam;

-- Aktifkan log koneksi
ALTER SYSTEM SET log_connections = 'on';
ALTER SYSTEM SET log_disconnections = 'on';
ALTER SYSTEM SET log_statement = 'ddl';
SELECT pg_reload_conf();
