#!/bin/bash
# Xcode Cloud runs this before resolving packages or invoking xcodebuild.
set -euo pipefail

# Resolve from this file: callers need not start in the web project directory.
HOTEL_APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$HOTEL_APP_ROOT"

# Match GitHub CI. Homebrew is provided by Xcode Cloud; no sudo is needed.
if ! command -v node >/dev/null 2>&1 || \
   [[ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    echo "Node 22 or Homebrew is required to prepare the iOS build." >&2
    exit 1
  fi
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi

echo "Preparing Hotel City with Node $(node --version) and npm $(npm --version)"
# Include build tools even if a host sets NODE_ENV=production.
npm ci --include=dev --no-audit --no-fund
npm run mobile:build
npx --no-install cap sync ios
