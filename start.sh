#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 LTS or newer is required. Download it from https://nodejs.org/" >&2
  exit 1
fi

if [ ! -f "frontend/dist/index.html" ]; then
  echo "Building PET Prep frontend bundle..."
  npm run build
fi

echo "Starting PET Prep on http://localhost:4000 ..."
exec npm run start
