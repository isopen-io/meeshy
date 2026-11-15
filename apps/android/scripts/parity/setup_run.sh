#!/usr/bin/env bash
# Prépare un répertoire d'exécution des pistes de parité à partir du plan versionné.
# Usage : apps/android/scripts/parity/setup_run.sh <run-dir>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="${1:?run-dir}"
mkdir -p "$RUN/plan" "$RUN/lots"
cp "$HERE"/ready.py "$HERE"/lot.py "$HERE"/issue_body.py "$HERE"/pr_body.py "$RUN"/
cp "$HERE/../../docs/parite-ios/CONVENTIONS.md" "$RUN"/
touch "$RUN/blocked.txt"
[ -d "$RUN/ledger.git" ] || { git init -q --bare "$RUN/ledger.git"; git -C "$RUN/ledger.git" remote add origin https://github.com/isopen-io/meeshy; }
python3 - "$HERE/../../docs/parite-ios/plan" "$RUN/plan" <<'PY'
import json,sys,shutil,glob,os
src,dst=sys.argv[1],sys.argv[2]
for p in glob.glob(f'{src}/*.json'):
    if not p.endswith('/F0.json'): shutil.copy(p,dst)
L=json.load(open(f'{src}/F0.json')); keys={l['key']:l for l in L}; depth={}
def d(k):
    if k in depth: return depth[k]
    depth[k]=1+max([d(x) for x in keys[k].get('deps',[]) if x in keys]+[-1]); return depth[k]
for k in keys: d(k)
a,b=[],[]
for i,l in enumerate(sorted(L,key=lambda x:(depth[x['key']],x['rank']))): (a if i%2==0 else b).append(l)
json.dump(a,open(f'{dst}/F0a.json','w'),ensure_ascii=False,indent=1); json.dump(b,open(f'{dst}/F0b.json','w'),ensure_ascii=False,indent=1)
PY
echo "run dir prêt : $RUN"
