#!/usr/bin/env bash
# Meeshy Android build helper — mirrors apps/ios/meeshy.sh ergonomics.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

if [[ -z "${JAVA_HOME:-}" ]]; then
  for jdk in /opt/homebrew/opt/openjdk@21 /opt/homebrew/opt/openjdk; do
    if [[ -d "$jdk/libexec/openjdk.jdk/Contents/Home" ]]; then
      export JAVA_HOME="$jdk/libexec/openjdk.jdk/Contents/Home"
      break
    fi
  done
fi

ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR_BIN="$ANDROID_HOME/emulator/emulator"
AVD="${MEESHY_AVD:-meeshy_pixel8}"
APP_ID="me.meeshy.app.debug"
LAUNCH_COMPONENT="$APP_ID/me.meeshy.app.MainActivity"

device_ready() {
  "$ADB" devices | awk 'NR>1 && $2=="device"' | grep -q .
}

boot_emulator() {
  device_ready && return 0
  "$EMULATOR_BIN" -list-avds | grep -qx "$AVD" || {
    echo "AVD '${AVD}' introuvable. Creer avec: ${CMDLINE_HINT}" >&2
    exit 1
  }
  echo "Boot de l'emulateur ${AVD}..."
  nohup "$EMULATOR_BIN" -avd "$AVD" -netdelay none -netspeed full \
    -dns-server 8.8.8.8,1.1.1.1 \
    >/tmp/meeshy-emulator.log 2>&1 &
  "$ADB" wait-for-device
  until [[ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
    sleep 2
  done
  echo "Emulateur pret."
}

CMDLINE_HINT="\$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager create avd -n $AVD -d pixel_8 -k 'system-images;android-35;google_apis;arm64-v8a'"

CMD="${1:-build}"
shift || true

case "$CMD" in
  build)    ./gradlew :app:assembleDebug "$@" ;;
  test)     ./gradlew testDebugUnitTest "$@" ;;
  lint)     ./gradlew :app:lintDebug "$@" ;;
  check)    ./gradlew assembleDebug testDebugUnitTest "$@" ;;
  clean)    ./gradlew clean "$@" ;;
  emulator) boot_emulator ;;
  devices)  "$ADB" devices -l ;;
  install)  boot_emulator; ./gradlew :app:installDebug "$@" ;;
  run)      boot_emulator
            ./gradlew :app:installDebug "$@"
            "$ADB" shell am start -n "$LAUNCH_COMPONENT"
            echo "App lancee (${APP_ID}). Logs (Ctrl-C pour quitter):"
            until PID="$("$ADB" shell pidof -s "$APP_ID" 2>/dev/null | tr -d '\r')" && [[ -n "$PID" ]]; do
              sleep 1
            done
            "$ADB" logcat --pid="$PID" ;;
  logs)     PID="$("$ADB" shell pidof -s "$APP_ID" | tr -d '\r')"
            "$ADB" logcat --pid="$PID" ;;
  *)        ./gradlew "$CMD" "$@" ;;
esac
