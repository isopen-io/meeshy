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

# Télécharge un artefact binaire SPM dans le cache d'artefacts SwiftPM, sous
# le nom que SwiftPM y cherche (l'URL dont chaque caractère hors [A-Za-z0-9]
# devient « _ », cf. `spm_mangledToC99ExtendedIdentifier`). Une release
# GitHub passe par `gh` (authentifié par GH_TOKEN : les téléchargements
# anonymes depuis les runners partagés sont limités), le reste par curl.
prefetch_artifact() {
  local url="$1"
  local key dest tmp
  key="$(printf '%s' "$url" | sed 's/[^A-Za-z0-9]/_/g')"
  case "$key" in [0-9]*) key="_$key" ;; esac
  dest="$ARTIFACTS_ROOT/$key"
  tmp="$dest.part"
  mkdir -p "$ARTIFACTS_ROOT"
  rm -rf "$dest" "$tmp"

  local re='^https://github\.com/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/]+)$'
  if [[ "$url" =~ $re ]] && [ -n "${GH_TOKEN:-}" ] && command -v gh >/dev/null 2>&1; then
    if gh release download "${BASH_REMATCH[3]}" -R "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}" \
         -p "${BASH_REMATCH[4]}" -O "$tmp" --clobber; then
      mv "$tmp" "$dest"
      echo "SPM artifact prefetched (gh): $url"
      return 0
    fi
    echo "::warning::gh release download failed for $url, falling back to curl"
  fi

  if curl -fsSL --retry 4 --retry-all-errors --retry-delay 5 -o "$tmp" "$url"; then
    mv "$tmp" "$dest"
    echo "SPM artifact prefetched (curl): $url"
    return 0
  fi
  rm -f "$tmp"
  echo "::warning::SPM artifact prefetch failed for $url"
  return 1
}

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
    # TOUTES les entrées nommées, pas la première seule : le run 42466274659
    # en listait trois (Lottie, SignalFfi, WebRTC) et n'en purgeait qu'une
    # par essai.
    stale_entries="$(grep -oE '/[^ ]*org\.swift\.swiftpm/artifacts/[^ ]+' "$LOG" | sed 's/already$//' | sort -u || true)"
    if [ -n "$stale_entries" ]; then
      while IFS= read -r stale; do
        echo "::warning::SPM resolve attempt $attempt failed: stale SwiftPM artifact-cache entry at $stale, purging"
        rm -rf "$stale"
      done <<<"$stale_entries"
    else
      echo "::warning::SPM resolve attempt $attempt failed: SwiftPM artifact-cache collision (entry path not captured in the log), purging $ARTIFACTS_ROOT"
      rm -rf "$ARTIFACTS_ROOT"
    fi

    # Purger ne suffit pas quand la collision vient d'un téléchargement
    # REFUSÉ : sur une réponse non-200, l'URLSession de SwiftPM déplace le
    # corps d'erreur à la place de l'entrée de cache, puis sa propre reprise
    # HTTP retombe sur ce fichier — d'où « already exists » à chaque essai,
    # entrée purgée ou non. On télécharge donc nous-mêmes chaque artefact
    # en cause, authentifié quand c'est une release GitHub, directement à
    # l'emplacement du cache : SwiftPM le copie au lieu de le retélécharger,
    # et en vérifie la somme de contrôle comme d'habitude.
    prefetch_failed=0
    urls="$(grep -oE "failed downloading '[^']+'" "$LOG" | sed -E "s/^failed downloading '//; s/'$//" | sort -u || true)"
    while IFS= read -r url; do
      [ -n "$url" ] || continue
      if ! prefetch_artifact "$url"; then
        prefetch_failed=1
      fi
    done <<<"$urls"

    if [ "$prefetch_failed" -eq 1 ]; then
      echo "::warning::SPM artifact prefetch failed (see above), retrying in $((attempt * 15))s"
      sleep $((attempt * 15))
    fi
    continue
  fi
  # --- collision-branch:end ---

  echo "::warning::SPM resolve attempt $attempt failed (transient network?), retrying in $((attempt * 15))s"
  sleep $((attempt * 15))
done

echo "::error::SPM resolve failed after 4 attempts"
exit 1
