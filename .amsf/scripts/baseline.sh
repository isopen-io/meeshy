#!/bin/bash
# Rejoue typage, build et tests des workspaces JavaScript demandés et écrit un
# relevé daté. Les projets natifs (iOS, Android, Swift, Rust) et le traducteur
# Python ne se construisent pas dans un conteneur de session : leur preuve est
# leur job CI.
#
#   bash .amsf/scripts/baseline.sh                     tous les workspaces
#   bash .amsf/scripts/baseline.sh packages/shared services/agent
#
# Prérequis (CLAUDE.md § Local Test Parity) : bun install --ignore-scripts
# --no-save, client Prisma généré, packages/shared construit.
set -u
racine=$(cd "$(dirname "$0")/../.." && pwd)
cd "$racine" || exit 1
sortie="${AMSF_OUT:-$racine/.amsf/baselines/.runs}/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$sortie"

if [ "$#" -gt 0 ]; then
  projets=("$@")
else
  mapfile -t projets < <(node .amsf/scripts/inventaire.mjs --json | jq -r '.workspaces[].chemin')
fi

echo "base $(git rev-parse --short HEAD) · bun $(bun --version) · node $(node --version)" | tee "$sortie/RESUME.txt"
rouge=0
for projet in "${projets[@]}"; do
  [ -f "$projet/package.json" ] || { echo "$projet : NOT APPLICABLE (pas de package.json)" | tee -a "$sortie/RESUME.txt"; continue; }
  for script in type-check build test; do
    if ! jq -e --arg s "$script" '.scripts[$s]' "$projet/package.json" >/dev/null; then
      echo "$projet $script : NOT APPLICABLE" | tee -a "$sortie/RESUME.txt"
      continue
    fi
    journal="$sortie/$(echo "$projet" | tr '/' '_')-$script.log"
    debut=$(date +%s)
    if (cd "$projet" && bun run "$script") >"$journal" 2>&1; then statut=PASS; else statut=FAIL; rouge=1; fi
    echo "$projet $script : $statut ($(( $(date +%s) - debut )) s) — $journal" | tee -a "$sortie/RESUME.txt"
  done
done
exit "$rouge"
