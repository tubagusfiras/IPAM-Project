#!/bin/bash
# IPAM Database Backup Script
# Auto-backup PostgreSQL database dengan retention policy

set -e

# ============================================
# KONFIGURASI
# ============================================
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/ipam"
RETENTION_DAYS=30
DB_CONTAINER="ipam-db"
DB_NAME="ipam"
DB_USER="ipam"
LOG_FILE="/var/log/ipam/backup.log"

# Email notification (optional - requires mailutils)
ADMIN_EMAIL="admin@sdi.net.id"

# ============================================
# SETUP LOGGING
# ============================================
mkdir -p /var/log/ipam
exec > >(tee -a "$LOG_FILE") 2>&1

echo "========================================"
echo "IPAM Backup Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# ============================================
# CHECK PREREQUISITES
# ============================================
echo "[1/5] Checking prerequisites..."

# Check if Docker container is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
    echo "ERROR: Database container $DB_CONTAINER is not running!"
    exit 1
fi

# Check backup directory
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
fi

# Check disk space (require at least 1GB free)
FREE_SPACE=$(df -BG "$BACKUP_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$FREE_SPACE" -lt 1 ]; then
    echo "ERROR: Insufficient disk space (only ${FREE_SPACE}GB free)"
    exit 1
fi
echo "✓ Disk space: ${FREE_SPACE}GB available"

# ============================================
# CREATE BACKUP
# ============================================
echo "[2/5] Creating database backup..."

BACKUP_FILE="$BACKUP_DIR/ipam_$DATE.sql.gz"

# Dump database and compress
if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✓ Backup created: $(basename $BACKUP_FILE) ($BACKUP_SIZE)"
else
    echo "ERROR: Backup failed!"
    rm -f "$BACKUP_FILE"

    # Send notification
    if command -v mail &> /dev/null; then
        echo "IPAM backup FAILED on $(hostname) at $(date)" | mail -s "IPAM Backup FAILED" "$ADMIN_EMAIL"
    fi

    exit 1
fi

# ============================================
# VERIFY BACKUP
# ============================================
echo "[3/5] Verifying backup integrity..."

# Check if file exists and not empty
if [ ! -s "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file is empty or missing!"
    exit 1
fi

# Test gzip integrity
if gzip -t "$BACKUP_FILE" 2>/dev/null; then
    echo "✓ Backup integrity verified"
else
    echo "ERROR: Backup file is corrupted!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Optional: Test restore to separate database (uncomment if needed)
# echo "Testing restore to test database..."
# gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d ipam_test
# if [ $? -eq 0 ]; then
#     echo "✓ Test restore successful"
# else
#     echo "WARNING: Test restore failed (but backup file is valid)"
# fi

# ============================================
# CLEANUP OLD BACKUPS
# ============================================
echo "[4/5] Cleaning up old backups (retention: $RETENTION_DAYS days)..."

OLD_COUNT=$(find "$BACKUP_DIR" -name "ipam_*.sql.gz" -mtime +$RETENTION_DAYS | wc -l)
if [ "$OLD_COUNT" -gt 0 ]; then
    find "$BACKUP_DIR" -name "ipam_*.sql.gz" -mtime +$RETENTION_DAYS -delete
    echo "✓ Deleted $OLD_COUNT old backup(s)"
else
    echo "✓ No old backups to delete"
fi

# Show current backups
CURRENT_COUNT=$(ls -1 "$BACKUP_DIR"/ipam_*.sql.gz 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo "Current backups: $CURRENT_COUNT file(s), Total size: $TOTAL_SIZE"

# ============================================
# OPTIONAL: UPLOAD TO CLOUD STORAGE
# ============================================
# Uncomment below to enable cloud upload
# echo "[5/5] Uploading to cloud storage..."
#
# # AWS S3
# if command -v aws &> /dev/null; then
#     aws s3 cp "$BACKUP_FILE" s3://sdi-backups/ipam/ --storage-class STANDARD_IA
#     echo "✓ Uploaded to S3"
# fi
#
# # Google Cloud Storage
# if command -v gsutil &> /dev/null; then
#     gsutil cp "$BACKUP_FILE" gs://sdi-backups/ipam/
#     echo "✓ Uploaded to GCS"
# fi

# ============================================
# COMPLETION
# ============================================
echo "[5/5] Backup completed successfully!"
echo "========================================"
echo "Backup file: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo "Duration: $(date -d @$(( $(date +%s) - $(date -d "$(head -1 $LOG_FILE | cut -d: -f2- | xargs date +%s -d)" +%s) )) -u +%H:%M:%S)"
echo "========================================"

# Optional: Send success notification
# if command -v mail &> /dev/null; then
#     echo "IPAM backup successful. Size: $BACKUP_SIZE" | mail -s "IPAM Backup Success" "$ADMIN_EMAIL"
# fi

exit 0
