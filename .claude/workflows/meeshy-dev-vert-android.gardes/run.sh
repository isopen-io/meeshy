#!/usr/bin/env bash
# Gardes locales d'un lot Android, à lancer depuis la racine du dépôt.
# Elles rejouent ce que android.yml rejetterait sans le SDK Android (les conteneurs n'atteignent pas dl.google.com).
# Sortie 0 = tout est propre ; sinon chaque garde fautive est nommée.
set -u
ROOT=$(git rev-parse --show-toplevel)
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT" || exit 2
fail=0
step() {
  local name=$1; shift
  local out
  out=$("$@" 2>&1); local rc=$?
  printf '== %s (rc=%s)\n%s\n' "$name" "$rc" "$(printf '%s\n' "$out" | tail -n 25)"
  [ "$rc" -eq 0 ] || fail=1
}
step manifeste-icones-noms python3 "$HERE/guards.py" apps/android
step delegues-jvm python3 "$HERE/delegates.py" apps/android
step redeclarations python3 "$HERE/redecl.py" apps/android
step apostrophes python3 "$HERE/apos.py" apps/android
step routes-cliquet python3 "$HERE/routes_ratchet.py" .
step outbox-when python3 "$HERE/outbox_when.py" apps/android
step i18n-genere python3 apps/android/scripts/i18n/xcstrings_to_android.py --check
step routes-generees bash -c 'cd packages/shared && timeout 300 npx --yes tsx@4.20.6 scripts/generate-android-endpoints.ts --check'
step room-schema bash -c 'cd apps/android && timeout 180 bash scripts/check-room-schema.sh'
[ "$fail" -eq 0 ] && echo "GARDES PROPRES" || echo "GARDES EN FAUTE"
exit "$fail"
