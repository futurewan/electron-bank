#!/bin/bash
DB_PATH="$HOME/Library/Application Support/electron-bank-temp---template-react-ts/database/app.db"

if [ ! -f "$DB_PATH" ]; then
  # Try alternative paths if the first one doesn't exist (e.g. dev vs prod)
  DB_PATH="$HOME/Library/Application Support/electron-bank/database/app.db"
fi

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database file not found at default locations."
  exit 1
fi

if [ -z "$1" ]; then
  echo "========================================================"
  echo "Database Inspector (via sqlite3)"
  echo "Database Path: $DB_PATH"
  echo "========================================================"
  echo ""
  echo "Usage:"
  echo "  ./scripts/db.sh                   # Enter interactive mode"
  echo "  ./scripts/db.sh \"SQL_QUERY\"       # Execute a single SQL query"
  echo ""
  echo "Tables:"
  sqlite3 "$DB_PATH" ".tables"
  echo ""
  echo "Entering interactive mode. Type '.quit' to exit."
  sqlite3 -header -column "$DB_PATH"
else
  sqlite3 -header -column "$DB_PATH" "$1"
fi
