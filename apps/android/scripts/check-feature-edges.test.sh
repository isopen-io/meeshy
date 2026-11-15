#!/usr/bin/env bash
# Témoins de comportement de check-feature-edges.sh : chaque cas bâtit un petit arbre Android jetable.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$HERE/check-feature-edges.sh"
failures=0

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
tree() {
  local root; root="$(mktemp -d "$SCRATCH/tree.XXXXXX")"
  mkdir -p "$root/scripts" "$root/feature"
  printf '%s\n' "$root"
}
module() { # root name deps...
  local root=$1 name=$2; shift 2
  mkdir -p "$root/feature/$name"
  : > "$root/feature/$name/build.gradle.kts"
  for dep in "$@"; do echo "    implementation(project(\":feature:$dep\"))" >> "$root/feature/$name/build.gradle.kts"; done
}
allow() { local root=$1; shift; printf '%s\n' "$@" > "$root/scripts/feature-edges-allowlist.txt"; }
adr() { local root=$1; shift; printf '%s\n' "$@" > "$root/decisions.md"; }
expect() { # name expected-rc root
  "$GUARD" "$3" >/dev/null 2>&1; local rc=$?
  if [ "$rc" -ne "$2" ]; then echo "ECHEC: $1 (attendu $2, obtenu $rc)"; failures=$((failures + 1)); else echo "ok: $1"; fi
}

r=$(tree); module "$r" a; module "$r" b; allow "$r"; adr "$r" "ADR-003"
expect "aucune arête feature vers feature passe" 0 "$r"

r=$(tree); module "$r" a b; module "$r" b; allow "$r"; adr "$r" "ADR-003"
expect "une arête hors liste admise échoue" 1 "$r"

r=$(tree); module "$r" a b; module "$r" b; allow "$r" ":feature:a -> :feature:b"; adr "$r" '`:feature:a` → `:feature:b`'
expect "une arête admise et écrite dans l'ADR passe" 0 "$r"

r=$(tree); module "$r" a b; module "$r" b; allow "$r" ":feature:a -> :feature:b"; adr "$r" "ADR-003 muette"
expect "une arête admise mais absente de l'ADR échoue" 1 "$r"

r=$(tree); module "$r" a; module "$r" b; allow "$r" ":feature:a -> :feature:b"; adr "$r" '`:feature:a` → `:feature:b`'
expect "une arête admise qui n'existe plus échoue" 1 "$r"

raw() { # root name line : une ligne de dépendance écrite telle quelle
  mkdir -p "$1/feature/$2"; echo "$3" >> "$1/feature/$2/build.gradle.kts"
}

r=$(tree); module "$r" b; raw "$r" a '    // implementation(project(":feature:b"))'
allow "$r" ":feature:a -> :feature:b"; adr "$r" '`:feature:a` → `:feature:b`'
expect "une arête commentée n'est pas une arête : l'admettre échoue" 1 "$r"

r=$(tree); module "$r" b; raw "$r" a '    // implementation(project(":feature:b"))'; allow "$r"; adr "$r" "ADR-003"
expect "une arête commentée, non admise, passe" 0 "$r"

r=$(tree); module "$r" b; raw "$r" a '    implementation(project(path = ":feature:b"))'; allow "$r"; adr "$r" "ADR-003"
expect "une arête écrite project(path = ...) hors liste échoue" 1 "$r"

r=$(tree); module "$r" b; raw "$r" a '    api(projects.feature.b)'; allow "$r"; adr "$r" "ADR-003"
expect "une arête par accesseur typé projects.feature hors liste échoue" 1 "$r"

r=$(tree); module "$r" a b; module "$r" b a; allow "$r" ":feature:a -> :feature:b" ":feature:b -> :feature:a"
adr "$r" '`:feature:a` → `:feature:b`' '`:feature:b` → `:feature:a`'
expect "un cycle échoue même admis" 1 "$r"

exit "$failures"
