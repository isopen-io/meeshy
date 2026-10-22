#!/usr/bin/env python3
import json,sys,os
RUN=os.path.dirname(os.path.abspath(__file__))
t,k=sys.argv[1],sys.argv[2]
l=next(x for x in json.load(open(f'{RUN}/plan/{t}.json')) if x['key']==k)
print(json.dumps(l,ensure_ascii=False,indent=1))
