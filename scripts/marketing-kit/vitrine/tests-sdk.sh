#!/usr/bin/env bash
# Lance des classes de MeeshySDKTests sur le simulateur « Meeshy Vitrine iPhone » (#8855).
#   scripts/marketing-kit/vitrine/tests-sdk.sh ShareLinkServiceVitrineTests
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
UDID="$(node "$RACINE/scripts/marketing-kit/vitrine/simulateurs.mjs" --iphone)"
DD="${MEESHY_DERIVED_DATA:-/Users/smpceo/Documents/Build-vitrine}-sdk"
PKG=()
for cache in "$HOME"/Library/Developer/Xcode/DerivedData/Meeshy-*/SourcePackages; do
  [ -d "$cache/checkouts/GRDB.swift" ] && PKG=(-clonedSourcePackagesDirPath "$cache")
done
ONLY=()
for classe in "$@"; do
  case "$classe" in
    */*) ONLY+=("-only-testing:$classe") ;;
    *) ONLY+=("-only-testing:MeeshySDKTests/$classe") ;;
  esac
done
cd "$RACINE/packages/MeeshySDK"
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$DD" ${PKG[@]+"${PKG[@]}"} "${ONLY[@]}" 2>&1 \
  | grep -E "Test Case|error:|TEST (SUCCEEDED|FAILED)" | tail -60
