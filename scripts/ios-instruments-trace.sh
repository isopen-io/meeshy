#!/usr/bin/env bash
# scripts/ios-instruments-trace.sh
#
# Enregistre une trace Time Profiler de l'app Meeshy pendant que tu SCROLLES une
# conversation, puis exporte un résumé exploitable + laisse le .trace pour
# Instruments. Device réel préféré (le simulateur n'est PAS représentatif et
# n'a pas le scrollHitchTimeRatio).
#
# Usage :
#   ./scripts/ios-instruments-trace.sh [secondes] [nom-process]
#   ex : ./scripts/ios-instruments-trace.sh 20 "Meeshy Dev"
#
# Les signposts posés dans le code (PerfSignpost : intervalles `applySnapshot` et
# `cellConfig`, subsystem me.meeshy.app, category PointsOfInterest) apparaissent
# dans Instruments → track « Points of Interest » : tu vois EXACTEMENT la durée de
# chaque segment du rendu, en plus du Time Profiler.

set -euo pipefail

SECONDS_LIMIT="${1:-20}"
PROCESS_NAME="${2:-Meeshy Dev}"   # Debug = "Meeshy Dev" ; Release = "Meeshy"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/apps/ios/test-results/instruments"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
TRACE="$OUT_DIR/timeprofile-$TS.trace"

# Device physique connecté (meilleur signal) ; sinon simulateur démarré.
DEVICE_UDID="$(xcrun xctrace list devices 2>/dev/null \
  | awk '/^== Devices ==/{f=1;next} /^== Devices Offline|^== Simulators/{f=0} f' \
  | grep -Eo '\([0-9A-Fa-f-]{25,}\)' | head -1 | tr -d '()' || true)"

if [ -n "$DEVICE_UDID" ]; then
  echo "→ Enregistrement sur DEVICE $DEVICE_UDID (signal représentatif)"
  TARGET=(--device "$DEVICE_UDID")
else
  BOOTED="$(xcrun simctl list devices booted 2>/dev/null | grep -Eo '\([0-9A-F-]{36}\)' | head -1 | tr -d '()' || true)"
  if [ -z "$BOOTED" ]; then echo "Aucun device ni simulateur démarré."; exit 1; fi
  echo "⚠️  Aucun device physique — SIMULATEUR $BOOTED. Timings NON représentatifs, pas de hitch GPU."
  TARGET=(--device "$BOOTED")
fi

echo "→ Ouvre une conversation chargée et SCROLLE pendant ${SECONDS_LIMIT}s. Enregistrement…"
if ! xcrun xctrace record --template "Time Profiler" "${TARGET[@]}" \
      --attach "$PROCESS_NAME" --time-limit "${SECONDS_LIMIT}s" --output "$TRACE"; then
  echo "record a échoué. Vérifie que l'app '$PROCESS_NAME' tourne au premier plan, ou passe le bon nom de process en 2e argument."
  exit 1
fi

echo "→ Export best-effort (le schéma xctrace varie selon la version d'Xcode)…"
xcrun xctrace export --input "$TRACE" --toc > "$OUT_DIR/toc-$TS.xml" 2>/dev/null || true
xcrun xctrace export --input "$TRACE" \
  --xpath '/trace-toc/run[@number="1"]/data/table[@schema="time-profile"]' \
  > "$OUT_DIR/timeprofile-$TS.xml" 2>/dev/null || true

echo ""
echo "=== Terminé ==="
echo "  Trace      : $TRACE"
echo "               → ouvre-la dans Instruments, inverse l'arbre + « Hide system libraries »,"
echo "                 puis Edit → Deep Copy (⌥⌘C) et colle le texte à Claude."
echo "  Exports XML: $OUT_DIR/{toc,timeprofile}-$TS.xml  (partage-les, Claude les parse)"
echo "  Signposts  : dans Instruments, track « Points of Interest » → durées applySnapshot / cellConfig"
