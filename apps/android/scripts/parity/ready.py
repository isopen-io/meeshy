#!/usr/bin/env python3
"""Lots prêts d'une piste : dépendances fusionnées dans dev, branche non poussée, fichiers disjoints des lots en vol."""
import json,subprocess,sys,os,re,glob,argparse,fcntl
RUN=os.path.dirname(os.path.abspath(__file__))
ap=argparse.ArgumentParser(); ap.add_argument('track'); ap.add_argument('--batch',type=int,default=4); ap.add_argument('--exclude',default='')
a=ap.parse_args()
def sh(cmd):
    return subprocess.run(cmd,shell=True,capture_output=True,text=True).stdout
with open(f'{RUN}/ledger.lock','w') as lk:
    fcntl.flock(lk,fcntl.LOCK_EX)
    for _ in range(4):
        if subprocess.run(f'git -C {RUN}/ledger.git fetch -q origin +refs/heads/dev:refs/heads/dev',shell=True).returncode==0: break
merged=set(re.findall(r'claude/android-([a-z0-9-]+)', sh(f'git -C {RUN}/ledger.git log dev --merges --format=%s')))
branches=set(re.findall(r'refs/heads/claude/android-([a-z0-9-]+)', sh("git ls-remote --heads https://github.com/isopen-io/meeshy 'refs/heads/claude/android-*'")))
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
ready=[]; waiting=0
for l in sorted(remaining,key=lambda x:x['rank']):
    k=l['key']
    if k in branches or k in blocked: continue
    if any(d not in merged for d in l.get('deps',[])): waiting+=1; continue
    fs=files(k)
    if fs & busy: continue
    if len(ready)<a.batch: ready.append(k); busy|=fs
print(json.dumps({'track':a.track,'ready':ready,'remaining':len(remaining),'merged_in_track':len(mine)-len(remaining),'waiting_on_deps':waiting,
  'claimed_unmerged':sorted(k for k in inflight if ALL[k]['track']==a.track),'blocked':sorted(blocked & {l['key'] for l in mine})}))
