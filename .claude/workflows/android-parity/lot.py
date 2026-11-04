#!/usr/bin/env python3
import json,sys,os
RUN=os.path.dirname(os.path.abspath(__file__))
import glob
t,k=sys.argv[1],sys.argv[2]
files=[f'{RUN}/plan/{t}.json'] if t!='-' else sorted(glob.glob(f'{RUN}/plan/*.json'))
l=next(dict(x,plan_track=f.rsplit('/',1)[-1][:-5]) for f in files for x in json.load(open(f)) if x['key']==k)
print(json.dumps(l,ensure_ascii=False,indent=1))
