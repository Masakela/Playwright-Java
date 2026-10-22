#!/usr/bin/env bash
# Preview (dry-run) what would be pushed to Jira/Xray — no credentials needed.
# Run `mvn test` first so there are JUnit reports to read.
set -euo pipefail
cd "$(dirname "$0")/.."
REPORTS="target/surefire-reports"
if [ ! -d "$REPORTS" ]; then
  echo "No JUnit reports at $REPORTS — run 'mvn test' first." >&2
  exit 1
fi
node scripts/import-results.js xray --junit "$REPORTS" --dry-run
