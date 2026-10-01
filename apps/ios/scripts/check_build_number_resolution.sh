#!/usr/bin/env bash
# Témoin du numéro de build local : un build local porte le numéro de la
# DERNIÈRE livraison App Store Connect (TestFlight / Xcode Cloud), et il le
# porte sans RÉÉCRIRE les fichiers suivis.
#
# Avant ce témoin, `device` écrivait le numéro dans project.yml et le pbxproj :
# chaque build local laissait deux fichiers modifiés dans un worktree partagé,
# bloquait les fast-forward et finissait par voyager dans des commits de
# feature. Les builds simulateur, eux, gardaient la valeur committée (périmée).
#
# `andp` est remplacé par un double qui rend une réponse fixée ; le cache vit
# dans un dossier temporaire.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
stub="$work/bin"; mkdir -p "$stub"
cat > "$stub/andp" <<'SH'
#!/usr/bin/env bash
echo called >> "$ANDP_CALLS"
[ -n "${ANDP_LATEST:-}" ] || exit 1
printf '{"command":"build_number","ok":true,"build_number":"%s","source":{"floor":0,"latest_asc":%s,"skipped":0}}\n' "$((ANDP_LATEST + 1))" "$ANDP_LATEST"
SH
chmod +x "$stub/andp"

committed=$(grep -m1 -o 'CURRENT_PROJECT_VERSION: "[0-9]*"' project.yml | grep -o '[0-9][0-9]*')
avant=$(cat project.yml Meeshy.xcodeproj/project.pbxproj | shasum)

echec=0
attendre() {
    local libelle="$1" attendu="$2" obtenu="$3"
    if [ "$attendu" = "$obtenu" ]; then
        echo "  ✓ $libelle"
    else
        echo "  ✗ $libelle" >&2
        echo "      attendu : $attendu" >&2
        echo "      obtenu  : $obtenu" >&2
        echec=1
    fi
}

resoudre() {
    PATH="$stub:$PATH" ANDP_CALLS="$work/calls" MEESHY_BUILD_NUMBER_CACHE="$work/cache" \
        ./meeshy.sh build-number --print 2>/dev/null | tail -n 1
}
appels() { [ -f "$work/calls" ] && wc -l < "$work/calls" | tr -d ' ' || echo 0; }

echo "Numéro de build local"

rm -f "$work/cache" "$work/calls"
attendre "App Store Connect joignable : le dernier build livré" 1875 "$(ANDP_LATEST=1875 resoudre)"

: > "$work/calls"
attendre "cache frais : aucune question à App Store Connect" "1875 0" "$(ANDP_LATEST=1900 resoudre) $(appels)"

touch -t 202001010000 "$work/cache"
attendre "cache périmé : App Store Connect est relu" 1900 "$(ANDP_LATEST=1900 resoudre)"

touch -t 202001010000 "$work/cache"
attendre "App Store Connect injoignable : le dernier numéro connu" 1900 "$(ANDP_LATEST= resoudre)"

rm -f "$work/cache"
attendre "ni App Store Connect ni cache : la valeur committée" "$committed" "$(ANDP_LATEST= resoudre)"

attendre "les fichiers suivis ne sont jamais réécrits" "$avant" "$(cat project.yml Meeshy.xcodeproj/project.pbxproj | shasum)"

exit "$echec"
