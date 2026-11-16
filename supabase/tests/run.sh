#!/usr/bin/env bash
# Migratsiyalar va ombor mantiqini mahalliy Postgres'da sinash.
# Foydalanish: PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-tishduxtir_test}
P="psql -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists $DB" -c "create database $DB"
$P -d "$DB" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do $P -d "$DB" -f "$f"; done
$P -d "$DB" -f supabase/tests/warehouse_test.sql 2>&1 | grep -E 'OK:|ERROR'
