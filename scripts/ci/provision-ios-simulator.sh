#!/usr/bin/env bash
# Provisionne le simulateur d'une tranche de tests iOS [#9692].
#
# Partagé par `ios.yml` et `sdk-tests.yml` : une seule bascule de runtime pour
# les deux suites.
#
#   IOS_TEST_RUNTIME           version du runtime (« 18.2 »)
#   IOS_TEST_RUNTIME_DOWNLOAD  « true » ⇒ télécharger le runtime s'il manque ;
#                              « false » ⇒ il doit être préinstallé sur l'image
#   RUNTIME_PROBE              « true » ⇒ télécharger en .dmg exporté puis
#                              l'importer, en chronométrant les deux (mesure du
#                              gain d'un cache du runtime)
#   GRANT_BUNDLE_ID            facultatif : accorde `photos-add` à cette app
#
# MeeshyTests tourne sur le 26.1 PRÉINSTALLÉ depuis #9694 (le plantage au
# démontage des runtimes 18.4+/26, Swift #85663, venait des deinit isolées,
# désormais gardées au binaire). Le SDK reste sur 18.2 téléchargé — runners
# éphémères, donc un téléchargement par tranche — tant que ses références de
# capture ne sont pas ré-enregistrées (#9701). Écrit dans GITHUB_OUTPUT :
# `sim_id`, `seconds`.
set -euo pipefail

VERSION="${IOS_TEST_RUNTIME:?IOS_TEST_RUNTIME requis}"
DOWNLOAD="${IOS_TEST_RUNTIME_DOWNLOAD:-true}"
START=$(date +%s)
RUNTIME_ID="com.apple.CoreSimulator.SimRuntime.iOS-${VERSION//./-}"
OUTPUT="${GITHUB_OUTPUT:-/dev/stdout}"

has_runtime() { xcrun simctl list runtimes | grep -q "iOS ${VERSION} "; }

if [ "$DOWNLOAD" = "true" ] && ! has_runtime; then
  if [ "${RUNTIME_PROBE:-false}" = "true" ]; then
    EXPORT_DIR="${RUNNER_TEMP:-/tmp}/runtime"
    mkdir -p "$EXPORT_DIR"
    xcodebuild -downloadPlatform iOS -buildVersion "$VERSION" -exportPath "$EXPORT_DIR"
    T1=$(date +%s)
    DMG=$(find "$EXPORT_DIR" -name '*.dmg' | head -n 1)
    SIZE=$(du -m "$DMG" | cut -f1)
    # `-exportPath` INSTALLE aussi le runtime (mesuré : un `runtime add` qui
    # suit est refusé, « Duplicate of … »). Le coût d'un import depuis un
    # cache se mesure donc sur une copie montée à part, sans l'enregistrer.
    T2=$(date +%s)
    hdiutil attach -nobrowse -readonly "$DMG" -mountpoint "$EXPORT_DIR/mnt" >/dev/null
    hdiutil detach "$EXPORT_DIR/mnt" >/dev/null
    T3=$(date +%s)
    rm -f "$DMG"
    echo "::notice title=Runtime ${VERSION} (mesure)::dmg ${SIZE} Mo — téléchargement+installation+export $((T1 - START)) s — montage du dmg $((T3 - T2)) s"
  else
    xcodebuild -downloadPlatform iOS -buildVersion "$VERSION"
  fi
fi

has_runtime || { echo "::error::runtime iOS ${VERSION} absent (IOS_TEST_RUNTIME_DOWNLOAD=${DOWNLOAD})"; exit 1; }

SIM_ID=$(xcrun simctl create "iPhone16Pro-CI" "iPhone 16 Pro" "$RUNTIME_ID")
xcrun simctl boot "$SIM_ID"
# Attendre la FIN du démarrage (`-b` : boot si besoin, puis bloque) : le
# premier démarrage d'un runtime fraîchement téléchargé migre ses données
# pendant ~10 min (mesuré, run 37805032390) et affame tout ce qui suit. Le
# compter ici le rend visible dans `seconds` au lieu de le cacher dans les tests.
xcrun simctl bootstatus "$SIM_ID" -b >/dev/null
if [ -n "${GRANT_BUNDLE_ID:-}" ]; then
  xcrun simctl privacy "$SIM_ID" grant photos-add "$GRANT_BUNDLE_ID"
fi
echo "sim_id=$SIM_ID" >> "$OUTPUT"
echo "seconds=$(( $(date +%s) - START ))" >> "$OUTPUT"
echo "simulateur ${SIM_ID} (iOS ${VERSION}) prêt en $(( $(date +%s) - START )) s"
