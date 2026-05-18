#!/usr/bin/env bash
# Meeshy Android build helper — mirrors apps/ios/meeshy.sh ergonomics.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

CMD="${1:-build}"
shift || true

case "$CMD" in
  build)  ./gradlew :app:assembleDebug "$@" ;;
  test)   ./gradlew testDebugUnitTest "$@" ;;
  lint)   ./gradlew :app:lintDebug "$@" ;;
  check)  ./gradlew assembleDebug testDebugUnitTest "$@" ;;
  clean)  ./gradlew clean "$@" ;;
  *)      ./gradlew "$CMD" "$@" ;;
esac
