#!/usr/bin/env bash
# Vérifie les limites App Store des fichiers fastlane/metadata AVANT soumission.
# Usage: ./check_metadata.sh   (depuis apps/ios/fastlane/)
# Échoue (exit 1) si un champ dépasse sa limite — la lane release doit l'appeler
# avant upload_to_app_store pour que le rejet arrive ici, pas chez Apple.
set -euo pipefail

# wc -m ne compte les caractères multi-octets que sous une locale UTF-8 ;
# sous LC_ALL=C il compte des octets et surcompte accents et tirets.
export LC_ALL=C.UTF-8 2>/dev/null || export LC_ALL=en_US.UTF-8

cd "$(dirname "$0")"
META_DIR="metadata"
[ -d "$META_DIR" ] || { echo "Aucun dossier $META_DIR — rien à vérifier."; exit 1; }

# Limites App Store Connect (caractères, pas octets)
limit_for() {
  case "$1" in
    name.txt) echo 30 ;;
    subtitle.txt) echo 30 ;;
    promotional_text.txt) echo 170 ;;
    keywords.txt) echo 100 ;;
    description.txt) echo 4000 ;;
    release_notes.txt) echo 4000 ;;
    *) echo 0 ;;
  esac
}

fail=0
for locale_dir in "$META_DIR"/*/; do
  locale=$(basename "$locale_dir")
  for file in name.txt subtitle.txt promotional_text.txt keywords.txt description.txt release_notes.txt; do
    path="$locale_dir$file"
    [ -f "$path" ] || continue
    limit=$(limit_for "$file")
    # wc -m compte les caractères multi-octets ; on retire le \n final s'il existe
    chars=$(printf '%s' "$(cat "$path")" | wc -m | tr -d ' ')
    if [ "$chars" -gt "$limit" ]; then
      echo "✗ $locale/$file : $chars caractères (limite $limit)"
      fail=1
    else
      echo "✓ $locale/$file : $chars/$limit"
    fi
  done
done

exit $fail
