#!/usr/bin/env python3
"""Lots prêts d'une piste : dépendances fusionnées dans dev, branche non poussée, fichiers disjoints des lots en vol."""
import json,subprocess,sys,os,re,glob,argparse,fcntl
RUN=os.path.dirname(os.path.abspath(__file__))
ap=argparse.ArgumentParser(); ap.add_argument('track'); ap.add_argument('--batch',type=int,default=4); ap.add_argument('--exclude',default=''); ap.add_argument('--gen',type=int,default=1); ap.add_argument('--max-inflight',type=int,default=0)
a=ap.parse_args()
if a.gen==1 and os.path.exists(f'{RUN}/drain/gen1'):
    print(json.dumps({'track':a.track,'ready':[],'remaining':0,'waiting_on_deps':0,'claimed_unmerged':[],'drained':True})); sys.exit(0)
def sh(cmd):
    return subprocess.run(cmd,shell=True,capture_output=True,text=True).stdout
with open(f'{RUN}/ledger.lock','w') as lk:
    fcntl.flock(lk,fcntl.LOCK_EX)
    for _ in range(4):
        if subprocess.run(f'git -C {RUN}/ledger.git fetch -q origin +refs/heads/dev:refs/heads/dev',shell=True).returncode==0: break
merged=set(re.findall(r'claude/android-([a-z0-9-]+)', sh(f'git -C {RUN}/ledger.git log dev --merges --format=%s')))
ls=sh("git ls-remote https://github.com/isopen-io/meeshy 'refs/heads/claude/android-*' 'refs/pull/*/head'")
heads={}; prshas=set()
for line in ls.splitlines():
    sha,ref=(line.split('\t')+[''])[:2]
    m=re.match(r'refs/heads/claude/android-([a-z0-9-]+)$',ref)
    if m: heads[m.group(1)]=sha
    elif ref.startswith('refs/pull/'): prshas.add(sha)
branches=set(heads)
nopr={k for k,sha in heads.items() if sha not in prshas}
blocked=set(l.strip() for l in open(f'{RUN}/blocked.txt') if l.strip())|set(x for x in a.exclude.split(',') if x)
ALL={}
for p in glob.glob(f'{RUN}/plan/*.json'):
    for l in json.load(open(p)): ALL[l['key']]=l
SHARED=re.compile(r'(strings[^/]*\.xml|settings\.gradle\.kts|libs\.versions\.toml|build\.gradle\.kts|AndroidManifest\.xml|/i18n/manifest/|Module\.kt$|NavGraph\.kt$|Destinations\.kt$)')
def files(k): return {f for f in ALL[k].get('android_files_touched',[]) if not SHARED.search(f)}
inflight=[k for k in branches if k in ALL and k not in merged]
busy=set().union(*[files(k) for k in inflight]) if inflight else set()
mine=json.load(open(f'{RUN}/plan/{a.track}.json'))
remaining=[l for l in mine if l['key'] not in merged]
ready=[]; waiting=0; picked=set()
mine_inflight=[k for k in inflight if any(l['key']==k for l in mine)]
if a.max_inflight and len(mine_inflight)>=a.max_inflight: a.batch=0
for l in sorted(remaining,key=lambda x:(0 if (x['key'] in nopr and a.gen>=2 and os.path.exists(f'{RUN}/rescue-enabled')) else 1, x['rank'])):
    k=l['key']
    if k in blocked: continue
    if k in branches and not (a.gen>=2 and k in nopr and os.path.exists(f'{RUN}/rescue-enabled')): continue
    if any(d not in merged for d in l.get('deps',[])): waiting+=1; continue
    fs=files(k)
    others=set().union(*[files(x) for x in inflight if x!=k]) if inflight else set()
    if fs & (others | picked): continue
    if len(ready)<a.batch: ready.append(k); picked|=fs
print(json.dumps({'track':a.track,'ready':ready,'remaining':len(remaining),'merged_in_track':len(mine)-len(remaining),'waiting_on_deps':waiting,
  'claimed_unmerged':sorted(k for k in inflight if any(l['key']==k for l in mine)),'claimed_without_pr':sorted(k for k in nopr if k in {l['key'] for l in mine} and k not in merged),'blocked':sorted(blocked & {l['key'] for l in mine})}))
