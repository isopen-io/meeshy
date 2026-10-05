#!/usr/bin/env bash
# Lance des classes de MeeshyTests sur le simulateur « Meeshy Vitrine iPhone » (#8855).
#   scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineSessionTests
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
UDID="$(node "$RACINE/scripts/marketing-kit/vitrine/simulateurs.mjs" --iphone)"
DD="${MEESHY_DERIVED_DATA:-/Users/smpceo/Documents/Build-vitrine}"
PKG=()
for cache in "$HOME"/Library/Developer/Xcode/DerivedData/Meeshy-*/SourcePackages; do
  [ -d "$cache/checkouts/GRDB.swift" ] && PKG=(-clonedSourcePackagesDirPath "$cache")
done
ONLY=()
for classe in "$@"; do ONLY+=("-only-testing:MeeshyTests/$classe"); done
cd "$RACINE/apps/ios"
MEESHY_DEVICE_ID="$UDID" MEESHY_DERIVED_DATA="$DD" ./meeshy.sh build > "$DD.build.log" 2>&1 || { tail -40 "$DD.build.log"; exit 1; }
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DD" \
  SYMROOT="$DD/Products" OBJROOT="$DD/Intermediates.noindex" \
  ${PKG[@]+"${PKG[@]}"} "${ONLY[@]}" 2>&1 | grep -E "Test Case|error:|TEST (SUCCEEDED|FAILED)" | tail -60
