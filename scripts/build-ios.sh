#!/bin/bash
# Static build for the iOS shell. The PDF-extraction API route only exists for
# local desktop use and cannot be part of a static export, so it is set aside
# for the duration of the build.
set -euo pipefail
cd "$(dirname "$0")/.."
HOLD="$(mktemp -d)"
restore() { [ -d "$HOLD/api" ] && mv "$HOLD/api" src/app/api; rmdir "$HOLD" 2>/dev/null || true; }
trap restore EXIT
mv src/app/api "$HOLD/api"
rm -rf out .next
# the public iOS build never carries private profile data, whatever .env.local says
NEXT_PUBLIC_PERSONAL='{}' BUILD_TARGET=ios NEXT_PUBLIC_TARGET=ios npx next build
npx cap sync ios
