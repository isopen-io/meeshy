#!/usr/bin/env bash
# Amorce le dossier de travail des pistes de parité Android dans une session neuve.
# Usage : setup.sh <dossier-de-travail> <url-de-la-session>
#   ex.  setup.sh "$SCRATCH/run" https://claude.ai/code/session_XXXX
# Copie le kit (planificateur, plans, scripts), crée lots/ et le registre ledger.git
# (clone nu de dev, lu par ready_core.py), et remplace l'URL de session dans les pieds de commit/PR.
set -euo pipefail
RUN=${1:?dossier de travail}
SESSION=${2:?url de la session (https://claude.ai/code/session_...)}
KIT=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$RUN/lots" "$RUN/drain" "$RUN/plan"
cp "$KIT"/track-v2.js "$KIT"/merge-backlog.js "$KIT"/dev-green.js "$KIT"/ready_core.py "$KIT"/lot.py \
   "$KIT"/pr_body.py "$KIT"/issue_body.py "$KIT"/cleanup.py "$KIT"/CONVENTIONS.md "$KIT"/blocked.txt "$RUN"/
cp "$KIT"/plan/*.json "$RUN"/plan/
touch "$RUN/drain/gen1" "$RUN/rescue-enabled" "$RUN/active.txt"
echo 8 > "$RUN/max-inflight"
sed -i "s#https://claude.ai/code/session_01EP6Bfac7sFfP8RkuHTATHN#${SESSION}#g" "$RUN"/*.js "$RUN"/*.py
if [ ! -d "$RUN/ledger.git" ]; then
  git init -q --bare "$RUN/ledger.git"
  git -C "$RUN/ledger.git" remote add origin https://github.com/isopen-io/meeshy
fi
for i in 1 2 3 4; do git -C "$RUN/ledger.git" fetch -q origin +refs/heads/dev:refs/heads/dev && break; done
for T in A B C D E; do python3 "$RUN/ready_core.py" $T --gen 2 --max-inflight 8 --batch 4; done
