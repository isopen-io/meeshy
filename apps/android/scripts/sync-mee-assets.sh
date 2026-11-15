#!/usr/bin/env bash
# Synchronise les films .lottie de Mee et Meo depuis la ressource iOS vers les assets Android.
# Aucun fichier n'est copié à la main : la source est packages/MeeshySDK/.../Resources/MeeStickers.
# --check : échoue si les assets Android ont dérivé de la source (fichier manquant, en trop ou différent).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
src="$root/packages/MeeshySDK/Sources/MeeshyUI/Resources/MeeStickers"
dst="$root/apps/android/sdk-ui/src/main/assets/mee_stickers"
[ -d "$src" ] || { echo "source introuvable : $src" >&2; exit 2; }
if [ "${1:-}" = "--check" ]; then
  [ -d "$dst" ] || { echo "assets absents : lancer apps/android/scripts/sync-mee-assets.sh" >&2; exit 1; }
  diff -rq "$src" "$dst" >&2 || { echo "dérive iOS/Android : relancer apps/android/scripts/sync-mee-assets.sh" >&2; exit 1; }
  echo "assets Mee/Meo à jour ($(ls "$dst" | wc -l) fichiers)"
  exit 0
fi
mkdir -p "$dst"
find "$dst" -maxdepth 1 -type f -name '*.lottie' -delete
cp "$src"/*.lottie "$dst"/
echo "$(ls "$dst" | wc -l) fichiers synchronisés vers $dst"
