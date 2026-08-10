#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PARENT="$(dirname "$ROOT")"
OUT="$PARENT/campusgrid-system.zip"
cd "$PARENT"
rm -f "$OUT"
zip -r "$OUT" campusgrid-system \
  -x 'campusgrid-system/**/node_modules/*' \
  -x 'campusgrid-system/**/node_modules/**' \
  -x 'campusgrid-system/clients/android/android/**/build/*' \
  -x 'campusgrid-system/clients/android/android/**/build/**' \
  -x 'campusgrid-system/clients/android/android/.gradle/*' \
  -x 'campusgrid-system/clients/android/android/.gradle/**' \
  -x 'campusgrid-system/clients/desktop/dist/*' \
  -x 'campusgrid-system/clients/desktop/dist/**' \
  -x 'campusgrid-system/data/*.db' \
  -x 'campusgrid-system/data/*.db-*' \
  -x 'campusgrid-system/**/.DS_Store'
echo "Created: $OUT"
ls -lh "$OUT"
