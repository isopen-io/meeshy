#!/usr/bin/env bash
# check-file-budget.sh — plafond dur de taille des sources Kotlin d'apps/android
# (CONVENTIONS.md, règle 13 : plafond dur 1200 lignes par fichier, 1000 = découpage
# sans discussion ; ajouter à un fichier hors budget est interdit, on extrait d'abord).
#
# Périmètre : les sources de production (`*/src/main/**/*.kt`), hors `build/` — les
# deux se jugent sur le chemin RELATIF à la racine, car le répertoire temporaire d'un
# test Gradle vit lui-même sous `build/`. Les tests restent hors budget.
#
# Dette héritée : un fichier déjà au-delà du plafond figure dans la baseline
# (`scripts/file-budget-baseline.txt`, une ligne « chemin plafond »). Il peut RÉTRÉCIR,
# jamais grandir : la baseline est un cliquet, pas une autorisation. Quand un lot de
# découpage le ramène sous le plafond, sa ligne se retire de la baseline.
#
# Usage : check-file-budget.sh [--root DIR] [--max N] [--baseline FILE]
# Code de sortie : 0 = dans le budget, 1 = au moins un dépassement, 2 = usage.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MAX=1200
SOFT=1000
BASELINE="$SCRIPT_DIR/file-budget-baseline.txt"

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$(cd "$2" && pwd)"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    --baseline) BASELINE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "argument inconnu : $1" >&2; usage >&2; exit 2 ;;
  esac
done

baseline_cap() {
  [[ -f "$BASELINE" ]] || return 0
  awk -v path="$1" '$1 !~ /^#/ && $1 == path { print $2; exit }' "$BASELINE"
}

scanned=0
failures=0
stale=()
soft=()

while IFS= read -r -d '' file; do
  rel="${file#"$ROOT"/}"
  case "/$rel" in */build/*) continue ;; esac
  case "$rel" in */src/main/*) ;; *) continue ;; esac
  scanned=$((scanned + 1))
  lines="$(awk 'END { print NR }' "$file")"
  cap="$(baseline_cap "$rel")"

  if [[ -n "$cap" ]]; then
    if (( lines > cap )); then
      echo "GROSSIT : $rel fait $lines lignes, sa baseline est $cap — extraire avant d'ajouter."
      failures=$((failures + 1))
    elif (( lines <= MAX )); then
      stale+=("$rel ($lines lignes) peut quitter la baseline")
    fi
    continue
  fi

  if (( lines > MAX )); then
    echo "HORS BUDGET : $rel fait $lines lignes (plafond $MAX) — découper par responsabilité."
    failures=$((failures + 1))
  elif (( lines > SOFT )); then
    soft+=("$rel ($lines lignes)")
  fi
done < <(find "$ROOT" -type f -name '*.kt' -print0)

if (( scanned == 0 )); then
  echo "AUCUNE SOURCE trouvée sous $ROOT : le balayage ne protège rien." >&2
  exit 1
fi

if (( ${#stale[@]} > 0 )); then
  for line in "${stale[@]}"; do echo "NOTE : $line"; done
fi
if (( ${#soft[@]} > 0 )); then
  for line in "${soft[@]}"; do echo "ATTENTION : $line dépasse $SOFT lignes (seuil de découpage)."; done
fi

if (( failures > 0 )); then
  echo "$failures fichier(s) hors budget sur $scanned." >&2
  exit 1
fi
echo "Budget de taille respecté : $scanned fichier(s) <= $MAX lignes (dette héritée plafonnée par la baseline)."
