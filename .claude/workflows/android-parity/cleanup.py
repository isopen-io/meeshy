#!/usr/bin/env python3
"""Supprime les clones de lots qu'aucun agent de piste en vol n'utilise.

Les identifiants des runs de piste en cours se lisent dans RUN/active.txt (un wf_… par ligne) ;
le dossier des journaux de workflow est CLAUDE_WF_DIR, sinon le premier
/root/.claude/projects/*/subagents/workflows trouvé.
"""
import json,glob,os,shutil,re
RUN=os.path.dirname(os.path.abspath(__file__))
LOTS=f'{RUN}/lots'
W=os.environ.get('CLAUDE_WF_DIR') or next(iter(sorted(glob.glob('/root/.claude/projects/*/subagents/workflows'),key=os.path.getmtime,reverse=True)),'')
ACTIVE=[l.strip() for l in open(f'{RUN}/active.txt')] if os.path.exists(f'{RUN}/active.txt') else []
inuse=set()
for j in [f'{W}/{a}/journal.jsonl' for a in ACTIVE if a and os.path.exists(f'{W}/{a}/journal.jsonl')]:
    st={}; done=set()
    for l in open(j):
        try: e=json.loads(l)
        except Exception: continue
        if e.get('type')=='started': st[e['key']]=e['label']
        elif e.get('type')=='result': done.add(e['key'])
    for k,lab in st.items():
        if k in done: continue
        m=re.match(r'(impl|review|fix):([a-z0-9-]+)',lab)
        if m: inuse.add(m.group(2))
freed=0
for d in sorted(os.listdir(LOTS)) if os.path.isdir(LOTS) else []:
    if d.split('.')[0] in inuse: continue
    p=os.path.join(LOTS,d)
    sz=sum(os.path.getsize(os.path.join(r,f)) for r,_,fs in os.walk(p) for f in fs if not os.path.islink(os.path.join(r,f)))
    shutil.rmtree(p,ignore_errors=True); freed+=sz; print('removed',d)
print(f'in use: {sorted(inuse)}'); print(f'freed {freed/1e9:.1f} GB')
