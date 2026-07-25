#!/bin/bash
# Auto database backup - runs daily via cron
BACKUP_DIR="/var/backups/story2video"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec story2video-postgres-1 pg_dump -U story2video story2video > "$BACKUP_DIR/story2video_$TIMESTAMP.sql"
gzip "$BACKUP_DIR/story2video_$TIMESTAMP.sql"
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
