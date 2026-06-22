#!/bin/bash
# IPAM Database Restore Script
# Restore PostgreSQL database dari backup file

set -e

# ============================================
# KONFIGURASI
# ============================================
DB_CONTAINER="ipam-db"
DB_NAME="ipam"
DB_USER="ipam"
BACKUP_DIR="/opt/backups/ipam"
LOG_FILE="/var/log/ipam/restore.log"

# ============================================
# SETUP LOGGING
# ============================================
mkdir -p /var/log/ipam
exec > >(tee -a "$LOG_FILE") 2>&1

echo "========================================"
echo "IPAM Restore Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# ============================================
# CHECK ARGUMENTS
# ============================================
if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_file.sql.gz> [--drop-existing]"
    echo ""
    echo "Available backups:"
    ls -lth "$BACKUP_DIR"/ipam_*.sql.gz 2>/dev/null | head -10
    exit 1
fi

BACKUP_FILE="$1"
DROP_EXISTING="${2:-no}"

# ============================================
# VALIDATE BACKUP FILE
# ============================================
echo "[1/4] Validating backup file..."

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [[ ! "$BACKUP_FILE" == *.sql.gz ]]; then
    echo "ERROR: Invalid backup file format (expected .sql.gz)"
    exit 1
fi

if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
    echo "ERROR: Backup file is corrupted!"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✓ Backup file valid: $(basename $BACKUP_FILE) ($BACKUP_SIZE)"

# ============================================
# CHECK DATABASE CONTAINER
# ============================================
echo "[2/4] Checking database container..."

if ! docker ps | grep -q "$DB_CONTAINER"; then
    echo "ERROR: Database container $DB_CONTAINER is not running!"
    exit 1
fi

echo "✓ Database container is running"

# ============================================
# CONFIRM RESTORE
# ============================================
echo ""
echo "⚠️  WARNING: This will restore the database from backup."
echo "   Current data may be overwritten!"
echo ""
echo "   Backup: $BACKUP_FILE"
echo "   Size: $BACKUP_SIZE"
echo "   Target: $DB_CONTAINER / $DB_NAME"
echo ""

if [ "$DROP_EXISTING" == "--drop-existing" ]; then
    echo "   Mode: DROP EXISTING TABLES (destructive)"
fi

read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# ============================================
# RESTORE DATABASE
# ============================================
echo "[3/4] Restoring database..."

if [ "$DROP_EXISTING" == "--drop-existing" ]; then
    echo "Dropping existing tables..."
    # Note: This is destructive - use with caution
    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
        DROP SCHEMA public CASCADE;
        CREATE SCHEMA public;
        GRANT ALL ON SCHEMA public TO $DB_USER;
        GRANT ALL ON SCHEMA public TO public;
    " || echo "Warning: Could not drop schema (may not exist)"
fi

echo "Restoring from backup..."
if gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"; then
    echo "✓ Database restored successfully"
else
    echo "ERROR: Restore failed!"
    exit 1
fi

# ============================================
# VERIFY RESTORE
# ============================================
echo "[4/4] Verifying restore..."

# Check if tables exist
TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
" | tr -d ' ')

echo "✓ Restored $TABLE_COUNT tables"

# Show some stats
echo ""
echo "Database statistics:"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT
        (SELECT count(*) FROM ip_blocks) as blocks,
        (SELECT count(*) FROM allocations) as allocations,
        (SELECT count(*) FROM customers) as customers,
        (SELECT count(*) FROM sites) as sites;
" 2>/dev/null || echo "Could not fetch stats"

echo ""
echo "========================================"
echo "Restore completed successfully!"
echo "========================================"

exit 0
