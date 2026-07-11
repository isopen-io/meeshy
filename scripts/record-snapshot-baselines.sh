#!/usr/bin/env bash
#
# record-snapshot-baselines.sh
#
# Generates / re-generates the visual regression PNG baselines for the
# MeeshyUI Timeline snapshot suite using `swift-snapshot-testing` v1.17.
#
# Behavior :
#   - Exports SNAPSHOT_TESTING_RECORD=all to force the library into record
#     mode for the entire run (overrides the default `.missing` policy).
#   - Runs the snapshot test classes under
#     packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Views/.
#   - On completion, lists the freshly written PNGs under each
#     `__Snapshots__/` directory so they can be reviewed and committed.
#
# Usage :
#   ./scripts/record-snapshot-baselines.sh
#
# Notes :
#   - Uses the MeeshySDK-Package scheme (the MeeshyUI scheme is library-only
#     and has no test action — see feedback_meeshysdk_test_scheme.md).
#   - First-time runs without this script will also record baselines because
#     the library's default record mode is `.missing` ; this script is the
#     intentional re-record entry point after a deliberate UI change.
#   - The xcodebuild command intentionally targets the seven snapshot test
#     classes only, so unrelated tests do not slow the recording run.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="$REPO_ROOT/packages/MeeshySDK"
SCHEME="MeeshySDK-Package"
# SNAPSHOT_SIMULATOR_ID (UDID) prime sur le nom : `name=` est ambigu quand
# plusieurs runtimes portent le même modèle et xcodebuild peut choisir un
# simulateur inattendu — cf. feedback_snapshot_record_script_silent_failure.
if [[ -n "${SNAPSHOT_SIMULATOR_ID:-}" ]]; then
  DESTINATION="platform=iOS Simulator,id=$SNAPSHOT_SIMULATOR_ID"
else
  SIMULATOR_NAME="${SNAPSHOT_SIMULATOR:-iPhone 16 Pro}"
  DESTINATION="platform=iOS Simulator,name=$SIMULATOR_NAME"
fi

# Single shared DerivedData path — per feedback_xcodebuild_shared_derivedata.md
DERIVED_DATA="${SNAPSHOT_DERIVED_DATA:-$REPO_ROOT/apps/ios/Build/DerivedData}"

echo "==> Recording Timeline UI snapshot baselines"
echo "    Scheme       : $SCHEME"
echo "    Destination  : $DESTINATION"
echo "    DerivedData  : $DERIVED_DATA"
echo "    Record mode  : all (SNAPSHOT_TESTING_RECORD=all)"
echo

# The 7 snapshot test classes — keep this list in sync with the file set
# documented in each test file's header comment.
TEST_CLASSES=(
  "MeeshyUITests/RulerViewSnapshotTests"
  "MeeshyUITests/VideoClipBarSnapshotTests"
  "MeeshyUITests/AudioClipBarSnapshotTests"
  "MeeshyUITests/TransitionBadgeSnapshotTests"
  "MeeshyUITests/ClipInspectorSnapshotTests"
  "MeeshyUITests/ProTimelineViewSnapshotTests"
  "MeeshyUITests/QuickTimelineViewSnapshotTests"
)

ONLY_TESTING_ARGS=()
for cls in "${TEST_CLASSES[@]}"; do
  ONLY_TESTING_ARGS+=("-only-testing:$cls")
done

cd "$SDK_DIR"

# Fichier témoin : seuls les PNG écrits APRÈS ce point comptent comme
# « recorded ». L'ancienne version listait tous les PNG existants — un run
# qui échouait en compile listait des baselines PÉRIMÉES comme fraîches.
RUN_STAMP="$(mktemp /tmp/snapshot-record-stamp.XXXXXX)"
RUN_LOG="$(mktemp /tmp/snapshot-record-log.XXXXXX)"
trap 'rm -f "$RUN_STAMP" "$RUN_LOG"' EXIT

# En mode record, la library rapporte chaque snapshot fraîchement écrit comme
# une "failure" : un exit non-zéro est ATTENDU. En revanche une erreur de
# compile, de destination ou de scheme est un VRAI échec — on la détecte dans
# le log au lieu d'avaler tout avec `|| true`.
set +e
SNAPSHOT_TESTING_RECORD=all \
xcodebuild test \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  "${ONLY_TESTING_ARGS[@]}" \
  2>&1 | tee "$RUN_LOG" | grep -E "Test Case|Test Suite|error:" || true
set -e

if grep -qE "^xcodebuild: error|error: .*(No such module|Compiling failed|cannot find)" "$RUN_LOG"; then
  echo
  echo "ERROR: le run a échoué AVANT d'exécuter les tests (compile/destination)." >&2
  echo "       Log complet : $RUN_LOG (trap désactivé pour inspection)" >&2
  trap - EXIT
  rm -f "$RUN_STAMP"
  exit 1
fi
if ! grep -q "Test Case" "$RUN_LOG"; then
  echo
  echo "ERROR: aucun test exécuté — scheme/destination/filtre à vérifier." >&2
  trap - EXIT
  rm -f "$RUN_STAMP"
  exit 1
fi

echo
echo "==> Recorded PNG baselines (écrits par CE run) :"
FRESH_TOTAL=0
while IFS= read -r -d '' dir; do
  count=$(find "$dir" -type f -name "*.png" -newer "$RUN_STAMP" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$count" != "0" ]]; then
    echo "    $dir  ($count PNG frais)"
    FRESH_TOTAL=$((FRESH_TOTAL + count))
  fi
done < <(find "$SDK_DIR/Tests/MeeshyUITests/Timeline" -type d -name "__Snapshots__" -print0)

if [[ "$FRESH_TOTAL" == "0" ]]; then
  echo "    (aucun PNG écrit par ce run — les baselines existantes sont déjà à jour" >&2
  echo "     OU le record n'a rien produit ; vérifier le log ci-dessus)" >&2
  exit 1
fi

echo
echo "==> Next steps :"
echo "    1. Review the recorded PNGs visually (drag into Preview or Xcode)."
echo "    2. git add the __Snapshots__/*.png files."
echo "    3. Re-run the tests WITHOUT this script to confirm they now pass :"
echo "       (cd packages/MeeshySDK && xcodebuild test \\"
echo "         -scheme $SCHEME \\"
echo "         -destination '$DESTINATION' \\"
echo "         ${ONLY_TESTING_ARGS[*]} -quiet)"
echo "    4. Commit the baselines."
