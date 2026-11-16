#!/bin/sh
# Bazaning nusxasi (pg_dump, siqilgan) va bemor fayllari arxivi.
set -eu
TS=$(date +%Y-%m-%d_%H%M)
pg_dump -Fc -f "/backups/db_$TS.dump"
tar -czf "/backups/files_$TS.tar.gz" -C /data files
find /backups -name 'db_*.dump' -mtime +"$KEEP_DAYS" -delete
find /backups -name 'files_*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "$TS: nusxa olindi"
