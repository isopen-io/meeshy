#!/usr/bin/env python3
"""Lots prêts d'une piste : dépendances fusionnées dans dev, branche non poussée, fichiers disjoints des lots en vol."""
import json,subprocess,sys,os,re,glob,argparse,fcntl,time
RUN=os.path.dirname(os.path.abspath(__file__))
ap=argparse.ArgumentParser(); ap.add_argument('track'); ap.add_argument('--batch',type=int,default=4); ap.add_argument('--exclude',default=''); ap.add_argument('--gen',type=int,default=1); ap.add_argument('--max-inflight',type=int,default=0); ap.add_argument('--scope',default=''); ap.add_argument('--rescue',default=''); ap.add_argument('--inflight',default=''); ap.add_argument('--stale-hours',type=float,default=0)
a=ap.parse_args()
if a.gen==1 and os.path.exists(f'{RUN}/drain/gen1'):
    print(json.dumps({'track':a.track,'ready':[],'remaining':0,'waiting_on_deps':0,'claimed_unmerged':[],'drained':True})); sys.exit(0)
def sh(cmd):
    return subprocess.run(cmd,shell=True,capture_output=True,text=True).stdout
with open(f'{RUN}/ledger.lock','w') as lk:
    fcntl.flock(lk,fcntl.LOCK_EX)
    for _ in range(4):
        if subprocess.run(f'git -C {RUN}/ledger.git fetch -q --filter=tree:0 origin +refs/heads/dev:refs/heads/dev',shell=True).returncode==0: break
merged=set(re.findall(r'claude/android-([a-z0-9-]+)', sh(f'git -C {RUN}/ledger.git log dev --merges --format=%s')))
satisfied=set(l.strip() for l in open(f'{RUN}/satisfied.txt') if l.strip()) if os.path.exists(f'{RUN}/satisfied.txt') else set()
merged|=satisfied
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
inflight=sorted(set(k for k in branches if k in ALL and k not in merged)|set(x for x in a.inflight.split(',') if x in ALL))
stale=set()
if a.stale_hours>0:
    subprocess.run(f"git -C {RUN}/ledger.git fetch -q --filter=tree:0 origin '+refs/heads/claude/android-*:refs/remotes/origin/claude/android-*'",shell=True)
    for line in sh(f"git -C {RUN}/ledger.git for-each-ref --format='%(refname) %(committerdate:unix)' refs/remotes/origin/claude/").splitlines():
        m=re.match(r'refs/remotes/origin/claude/android-([a-z0-9-]+) (\d+)$',line)
        if m and m.group(1) in nopr and time.time()-int(m.group(2))>a.stale_hours*3600: stale.add(m.group(1))
live=[k for k in inflight if k not in stale]
busy=set().union(*[files(k) for k in live]) if live else set()
def closure(keys):
    out=[]
    def walk(k,root):
        if k in out or k not in ALL or (k in merged and not root): return
        out.append(k)
        for d in ALL[k].get('deps',[]): walk(d,False)
    for k in keys: walk(k,True)
    return out
scope=[x for x in a.scope.split(',') if x]
unknown=sorted(k for k in scope if k not in ALL)
mine=[ALL[k] for k in closure(scope)] if scope else json.load(open(f'{RUN}/plan/{a.track}.json'))
remaining=[l for l in mine if l['key'] not in merged]
ready=[]; waiting=0; picked=set()
mine_inflight=[k for k in inflight if any(l['key']==k for l in mine)]
if a.max_inflight and len(mine_inflight)>=a.max_inflight: a.batch=0
rescue=set(x for x in a.rescue.split(',') if x)
def rescuable(k): return k in nopr and ((a.gen>=2 and os.path.exists(f'{RUN}/rescue-enabled')) or k in rescue)
for l in sorted(remaining,key=lambda x:(0 if rescuable(x['key']) else 1, x['rank'])):
    k=l['key']
    if k in blocked: continue
    if k in branches and not rescuable(k): continue
    if any(d not in merged for d in l.get('deps',[])): waiting+=1; continue
    fs=files(k)
    others=set().union(*[files(x) for x in live if x!=k]) if live else set()
    if fs & (others | picked): continue
    if len(ready)<a.batch: ready.append(k); picked|=fs
print(json.dumps({'track':a.track,'ready':ready,'remaining':len(remaining),'merged_in_track':len(mine)-len(remaining),'waiting_on_deps':waiting,
  'claimed_unmerged':sorted(k for k in inflight if any(l['key']==k for l in mine)),'claimed_without_pr':sorted(k for k in nopr if k in {l['key'] for l in mine} and k not in merged),'blocked':sorted(blocked & {l['key'] for l in mine}),'unknown':unknown,'scope_closure':[l['key'] for l in mine],'stale_ignored':sorted(stale)}))
