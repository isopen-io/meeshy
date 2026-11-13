#!/usr/bin/env bash
# Le français d'iOS porte ses accents (#6451) : aucune valeur `fr` des catalogues,
# aucun `defaultValue:` Swift et aucun bloc `"fr"` des textes juridiques ne sert
# « Communautes », « Reglages », « deja »… Options : --self-test.
# Aucun compilateur Swift requis : le script lit du texte, il tourne sous Linux.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 -I "$here/french_accents.py" "$@"
