#!/usr/bin/env bash
# Cliquets des RÈGLES MAISON Swift (#11046) : 23 compteurs sur les sources écrites
# à la main, comparés à `house-rules-baseline.json`. Un total qui monte, une règle
# sans référence ou une référence illisible font échouer ; un total qui baisse se
# verrouille avec `bash apps/ios/scripts/check_house_rules.sh --write-baseline`
# (qui refuse lui-même de relever). Options : --report, --self-test.
# Aucun compilateur Swift requis : le script lit du texte, il tourne sous Linux.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 -I "$here/house_rules.py" "$@"
