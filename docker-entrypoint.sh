#!/bin/sh
# On first start (no database file yet), seed the share lists from the public site.
# Set SEED_URL to another URL/file to change the source, or to an empty string to start with an empty database.
SEED_URL="${SEED_URL-https://harrynull.tech/bilibili/fetch_sharelist}"
if [ ! -f "$SQLITE_PATH" ] && [ -n "$SEED_URL" ]; then
    node scripts/migrate-to-sqlite.js --from-json "$SEED_URL" || echo "Seeding failed; starting with an empty database."
fi
exec "$@"
