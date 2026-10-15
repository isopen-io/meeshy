#!/usr/bin/env bash
# Pilote un iPhone branché en USB depuis le Mac (#10682).
#
#   iphone-remote.sh start          compile le runner, le lance sur l'iPhone, ouvre le tunnel
#   iphone-remote.sh <commande>     tree, tap <libellé>, tapc <fragment>, xy x y, dxy x y,
#                                   press x y s, drag x1 y1 x2 y2 s, swipe x1 y1 x2 y2,
#                                   type <texte>, url <lien>, activate, sleep s, quit
#   iphone-remote.sh shot <nom>     capture l'écran dans $IPHONE_REMOTE_OUT/<nom>.png
#   iphone-remote.sh log <motif>    suit le journal de Meeshy filtré (Ctrl+C pour arrêter)
#   iphone-remote.sh stop           arrête le runner et le tunnel
#
# Les coordonnées sont en POINTS (capture en pixels ÷ échelle de l'écran, 3 sur un Pro Max).
# Prérequis : iproxy (libimobiledevice), pymobiledevice3, xcodebuild.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$HERE/../.." && pwd)"
PORT=8100
TEAM="${FASTLANE_TEAM_ID:-D72UK7R5RE}"
OUT="${IPHONE_REMOTE_OUT:-${TMPDIR:-/tmp}/iphone-remote}"
RUN_LOG="$OUT/runner.log"
mkdir -p "$OUT"

udid() {
  if [ -n "${IPHONE_UDID:-}" ]; then echo "$IPHONE_UDID"; return; fi
  local found
  found="$(idevice_id -l | head -n 1)"
  [ -n "$found" ] || { echo "Aucun iPhone en USB (idevice_id -l est vide)." >&2; exit 1; }
  echo "$found"
}

start() {
  local device
  device="$(udid)"
  # Même règle que `meeshy.sh` (ensure_project_is_current) : régénérer
  # seulement si le projet ignore la télécommande, jamais à chaque lancement.
  grep -q "DeviceRemote.swift" "$IOS_DIR/Meeshy.xcodeproj/project.pbxproj" \
    || (cd "$IOS_DIR" && xcodegen generate >/dev/null)
  echo "Compilation du runner pour ${device}…"
  xcodebuild build-for-testing -project "$IOS_DIR/Meeshy.xcodeproj" -scheme MeeshyDeviceMetrics \
    -destination "platform=iOS,id=$device" -derivedDataPath "$IOS_DIR/Build" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    -skipMacroValidation -skipPackagePluginValidation DEVELOPMENT_TEAM="$TEAM" >"$OUT/build.log" 2>&1 \
    || { grep -E "error:" "$OUT/build.log" | sort -u | head -20; exit 1; }
  nohup xcodebuild test-without-building -project "$IOS_DIR/Meeshy.xcodeproj" -scheme MeeshyDeviceMetrics \
    -destination "platform=iOS,id=$device" -derivedDataPath "$IOS_DIR/Build" DEVELOPMENT_TEAM="$TEAM" \
    -only-testing:MeeshyUIDeviceTests/DeviceRemoteTests/test_serve >"$RUN_LOG" 2>&1 &
  pgrep -f "iproxy $PORT $PORT" >/dev/null || nohup iproxy "$PORT" "$PORT" -u "$device" >/dev/null 2>&1 &
  until grep -q "Wait for me.meeshy.app to idle" "$RUN_LOG" 2>/dev/null; do
    grep -q "TEST EXECUTE FAILED" "$RUN_LOG" 2>/dev/null && { tail -30 "$RUN_LOG"; exit 1; }
    sleep 2
  done
  until python3 "$HERE/remote.py" sleep 0 >/dev/null 2>&1; do sleep 2; done
  echo "Prêt. Journal du runner : $RUN_LOG"
}

stop() {
  python3 "$HERE/remote.py" quit >/dev/null 2>&1 || true
  pkill -f "only-testing:MeeshyUIDeviceTests/DeviceRemoteTests" || true
  pkill -f "iproxy $PORT $PORT" || true
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  shot) pymobiledevice3 developer dvt screenshot --udid "$(udid)" "$OUT/${2:?nom de capture}.png" 2>/dev/null && echo "$OUT/$2.png" ;;
  log) pymobiledevice3 syslog live --udid "$(udid)" -pn Meeshy -m "${2:?motif}" ;;
  "") sed -n '2,13p' "$0" ;;
  *) python3 "$HERE/remote.py" "$@" ;;
esac
