#!/bin/bash
# Static build for the iOS shell. API routes and the sign-in proxy need a
# server and cannot be part of a static export, so they are set aside
# for the duration of the build.
set -euo pipefail
cd "$(dirname "$0")/.."
HOLD="$(mktemp -d)"
restore() { [ -d "$HOLD/api" ] && mv "$HOLD/api" src/app/api; [ -f "$HOLD/proxy.ts" ] && mv "$HOLD/proxy.ts" src/proxy.ts; [ -d "$HOLD/study-pages" ] && mv "$HOLD/study-pages" src/app/studies; [ -d "$HOLD/study-downloads" ] && mv "$HOLD/study-downloads" public/studies; [ -d "$HOLD/book-pages" ] && mv "$HOLD/book-pages" src/app/books; [ -d "$HOLD/private-import" ] && mv "$HOLD/private-import" public/private-import; [ -d "$HOLD/pdf" ] && mv "$HOLD/pdf" public/pdf; rmdir "$HOLD" 2>/dev/null || true; }
trap restore EXIT
mv src/app/api "$HOLD/api"
# sign-in and sync run on the hosted server, not inside the static app
[ -f src/proxy.ts ] && mv src/proxy.ts "$HOLD/proxy.ts"
# Personal tournament scouting belongs to the web app, not the public iOS app.
[ -d src/app/studies ] && mv src/app/studies "$HOLD/study-pages"
[ -d public/studies ] && mv public/studies "$HOLD/study-downloads"
# Private full-book delivery is a web library feature, not public app content.
[ -d src/app/books ] && mv src/app/books "$HOLD/book-pages"
[ -d public/private-import ] && mv public/private-import "$HOLD/private-import"
[ -d public/pdf ] && mv public/pdf "$HOLD/pdf"
rm -rf out .next
# the public iOS build never carries private profile data, whatever .env.local says
NEXT_PUBLIC_PERSONAL='{}' BUILD_TARGET=ios NEXT_PUBLIC_TARGET=ios npx next build
npx cap sync ios
