#!/bin/bash
# Static build for the iOS shell. API routes and the sign-in proxy need a
# server and cannot be part of a static export, so they are set aside
# for the duration of the build.
set -euo pipefail
cd "$(dirname "$0")/.."
HOLD="$(mktemp -d)"
restore() { [ -d "$HOLD/api" ] && mv "$HOLD/api" src/app/api; [ -f "$HOLD/proxy.ts" ] && mv "$HOLD/proxy.ts" src/proxy.ts; rmdir "$HOLD" 2>/dev/null || true; }
trap restore EXIT
mv src/app/api "$HOLD/api"
# sign-in and sync run on the hosted server, not inside the static app
[ -f src/proxy.ts ] && mv src/proxy.ts "$HOLD/proxy.ts"
rm -rf out .next
# the public iOS build never carries private profile data, whatever .env.local says
NEXT_PUBLIC_PERSONAL='{}' BUILD_TARGET=ios NEXT_PUBLIC_TARGET=ios npx next build
npx cap sync ios
