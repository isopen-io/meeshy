#!/usr/bin/env bash
# Résout le graphe SPM avec reprise — [#6545]
#
# Distingue deux causes d'échec de `xcodebuild -resolvePackageDependencies`,
# confondues jusqu'ici sous un seul « transient network? » :
#
#   1. une VRAIE panne réseau transitoire (dl.google.com coupe en cours de
#      téléchargement d'un binary target Firebase/gRPC) — attendre puis
#      rejouer suffit, le cache d'artefacts du runner n'a alors RIEN de
#      partiel pour ce paquet ;
#   2. une COLLISION du cache d'artefacts SwiftPM du RUNNER — une entrée
#      existe déjà sous `~/Library/Caches/org.swift.swiftpm/artifacts/` et
#      SwiftPM refuse de l'écraser (« already exists in file system »). Une
#      boucle qui se contente d'attendre rejoue alors la MÊME commande sur le
#      MÊME cache déjà en collision, indéfiniment — observé sur le run
#      34856187098 (promote/main-39224d5fc9) : quatre essais, quatre fois la
#      même erreur, jamais de résolution, avant même la première compilation.
#
# Une collision se corrige en PURGEANT l'entrée en cause avant l'essai
# suivant — jamais en attendant, puisqu'attendre ne change rien à un fichier
# déjà présent sur le disque du runner. Quand le journal ne permet pas
# d'isoler l'entrée précise, on purge la racine du cache d'artefacts : plus
# large, mais toujours correct (SwiftPM re-télécharge ce qui manque).
set -euo pipefail

PROJECT="${1:?usage: resolve-spm-packages.sh <project> <scheme> <derivedDataPath> <clonedSourcePackagesDirPath>}"
SCHEME="${2:?}"
DERIVED_DATA="${3:?}"
SPM_DIR="${4:?}"

# Repli de test : `check-ios-spm-resolve-retry.mjs` pointe cette racine vers
# un répertoire jetable pour vérifier la purge sans toucher au disque réel.
ARTIFACTS_ROOT="${SWIFTPM_ARTIFACTS_ROOT:-$HOME/Library/Caches/org.swift.swiftpm/artifacts}"

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

for attempt in 1 2 3 4; do
  if xcodebuild -resolvePackageDependencies \
       -project "$PROJECT" -scheme "$SCHEME" \
       -derivedDataPath "$DERIVED_DATA" \
       -clonedSourcePackagesDirPath "$SPM_DIR" >"$LOG" 2>&1; then
    cat "$LOG"
    echo "SPM resolve OK (attempt $attempt)"
    exit 0
  fi

  cat "$LOG"

  # --- collision-branch:start ---
  if grep -q "already exists in file system" "$LOG"; then
    stale="$(grep -oE '/[^ ]*org\.swift\.swiftpm/artifacts/[^ ]+' "$LOG" | head -1 || true)"
    if [ -n "$stale" ]; then
      echo "::warning::SPM resolve attempt $attempt failed: stale SwiftPM artifact-cache entry at $stale, purging and retrying"
      rm -rf "$stale"
    else
      echo "::warning::SPM resolve attempt $attempt failed: SwiftPM artifact-cache collision (entry path not captured in the log), purging $ARTIFACTS_ROOT and retrying"
      rm -rf "$ARTIFACTS_ROOT"
    fi
    continue
  fi
  # --- collision-branch:end ---

  echo "::warning::SPM resolve attempt $attempt failed (transient network?), retrying in $((attempt * 15))s"
  sleep $((attempt * 15))
done

echo "::error::SPM resolve failed after 4 attempts"
exit 1
