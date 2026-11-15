#!/usr/bin/env bash
# Garde des arêtes feature -> feature (ADR-003, amendée par ADR-033).
#   check-feature-edges.sh [racine apps/android]
# Le graphe réel (feature/*/build.gradle.kts), la liste admise (scripts/feature-edges-allowlist.txt)
# et l'ADR (decisions.md) doivent dire la même chose ; le graphe reste acyclique.
# Une arête se lit hors commentaires, écrite project(":feature:x"), project(path = ":feature:x") ou projects.feature.x.
set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ALLOWLIST="$ROOT/scripts/feature-edges-allowlist.txt"
ADR="$ROOT/decisions.md"
status=0
fail() { echo "::error::check-feature-edges: $*" >&2; status=1; }

actual="$(
  for gradle in "$ROOT"/feature/*/build.gradle.kts; do
    [ -f "$gradle" ] || continue
    from="$(basename "$(dirname "$gradle")")"
    perl -0pe 's{/\*.*?\*/}{}gs; s{//[^\n]*}{}g' "$gradle" \
      | perl -ne 'print "$1\n" while /project\(\s*(?:path\s*=\s*)?":feature:([A-Za-z0-9_-]+)"/g;
                  while (/\bprojects\.feature\.([A-Za-z0-9_]+)/g) { (my $m = $1) =~ s/([A-Z])/-\l$1/g; print "$m\n" }' \
      | sort -u | while read -r to; do echo ":feature:$from -> :feature:$to"; done
  done | sort -u
)"
allowed="$( { [ -f "$ALLOWLIST" ] && grep -vE '^\s*(#|$)' "$ALLOWLIST" || true; } | sort -u)"

while IFS= read -r edge; do
  [ -n "$edge" ] || continue
  grep -qxF "$edge" <<<"$allowed" || fail "arête non admise : $edge (la retirer, ou l'admettre dans l'ADR et dans $ALLOWLIST)"
done <<<"$actual"

while IFS= read -r edge; do
  [ -n "$edge" ] || continue
  grep -qxF "$edge" <<<"$actual" || fail "arête admise mais absente du graphe : $edge (la retirer de la liste et de l'ADR)"
  from="${edge%% -> *}"; to="${edge##* -> }"
  grep -qF "\`$from\` → \`$to\`" "$ADR" || fail "arête admise mais absente de l'ADR : $edge"
done <<<"$allowed"

if [ -n "$actual" ]; then
  tsort_in="$(sed -E 's/ -> / /' <<<"$actual")"
  tsort <<<"$tsort_in" >/dev/null 2>&1 || fail "cycle dans le graphe des features"
fi

exit "$status"
