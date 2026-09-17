#!/usr/bin/env bash
# Témoin de l'élection de simulateur (#6838) : la FAMILLE décide, jamais le NOM.
#
# La fixture porte exactement les cas qui ont cassé le script le 2026-09-16 :
# un iPhone dont le nom ne contient pas « iPhone » (celui du projet), un modèle
# Pro non démarré, un iPad, un Apple TV, et une machine indisponible.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

fixture=$(mktemp); trap 'rm -f "$fixture"' EXIT
cat > "$fixture" <<'JSON'
{
  "devices": {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-1": [
      {"udid": "AAAA", "name": "Meeshy-iOS26", "state": "Booted", "isAvailable": true,
       "deviceTypeIdentifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"},
      {"udid": "BBBB", "name": "iPhone 17 Pro", "state": "Shutdown", "isAvailable": true,
       "deviceTypeIdentifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"},
      {"udid": "CCCC", "name": "iPad Air 13-inch", "state": "Shutdown", "isAvailable": true,
       "deviceTypeIdentifier": "com.apple.CoreSimulator.SimDeviceType.iPad-Air-13-inch"},
      {"udid": "DDDD", "name": "iPhone 16", "state": "Shutdown", "isAvailable": false,
       "deviceTypeIdentifier": "com.apple.CoreSimulator.SimDeviceType.iPhone-16"}
    ],
    "com.apple.CoreSimulator.SimRuntime.tvOS-18-0": [
      {"udid": "EEEE", "name": "Apple TV 4K", "state": "Shutdown", "isAvailable": true,
       "deviceTypeIdentifier": "com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation"}
    ]
  }
}
JSON

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

phones=$(./list_simulators.py --from-json "$fixture" iPhone)

attendre "un iPhone au nom quelconque est élu — c'est le TYPE qui décide" \
    "AAAA	Meeshy-iOS26	Booted" \
    "$(echo "$phones" | head -n 1)"

attendre "le démarré passe AVANT le Pro éteint — on ne redémarre pas ce qui tourne" \
    "AAAA
BBBB" \
    "$(echo "$phones" | cut -f1)"

attendre "un iPad n'est pas un iPhone" \
    "" "$(echo "$phones" | grep -c 'CCCC' | sed 's/^0$//')"

attendre "une machine indisponible ne s'élit pas" \
    "" "$(echo "$phones" | grep -c 'DDDD' | sed 's/^0$//')"

attendre "un Apple TV n'entre dans aucune famille demandée" \
    "" "$(echo "$phones" | grep -c 'EEEE' | sed 's/^0$//')"

attendre "la famille iPad élit l'iPad, et lui seul" \
    "CCCC	iPad Air 13-inch	Shutdown" \
    "$(./list_simulators.py --from-json "$fixture" iPad)"

[ "$echec" -eq 0 ] && echo "check_simulator_election: 6 invariants verts." || echo "check_simulator_election: ÉCHEC" >&2
exit "$echec"
