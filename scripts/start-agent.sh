#!/usr/bin/env bash
# Just start the reference agent in the foreground.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}" node agent-server/server.js
