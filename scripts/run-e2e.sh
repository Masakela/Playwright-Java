#!/usr/bin/env bash
# Start the reference agent, run the Java live suite against it, then stop it.
# Requires: Node (for the agent), JDK 17+ & Maven, and (first run) Playwright browsers.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8787}"
export AGENT_BASE_URL="http://localhost:${PORT}"

# Corporate-proxy guard: make the local agent bypass any HTTP(S)_PROXY (which
# otherwise intercepts localhost and answers 403). Merge, don't clobber.
LOCALS="localhost,127.0.0.1,::1"
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}$LOCALS"
export no_proxy="$NO_PROXY"

echo "Starting reference agent on ${AGENT_BASE_URL} ..."
PORT="$PORT" node agent-server/server.js &
AGENT_PID=$!
trap 'kill "$AGENT_PID" 2>/dev/null || true' EXIT

for i in $(seq 1 30); do curl -sf "${AGENT_BASE_URL}/health" >/dev/null 2>&1 && break || sleep 0.5; done

echo "== Java suite (UI + offline + live) =="
mvn -q test -Dsurefire.suiteXmlFiles=testng-ci.xml -Dagent.base.url="${AGENT_BASE_URL}"

node scripts/kpi-report.js --junit target/surefire-reports --out kpis-out || true
echo "Done. KPI dashboard: kpis-out/index.html"
