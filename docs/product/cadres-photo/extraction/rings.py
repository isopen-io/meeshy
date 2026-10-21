import json, math
import geom, extract
from convert import *

def ring_stroke(draws, pal):
    """Le trait de base : la plus large bande centrée, étendue jusqu'au bord (50)."""
    best=None
    for d in draws:
        if d['tag']!='circle' or d['width'] is None or d['fx']: continue
        b=geom.bbox(d['subs']); cx=(b[0]+b[2])/2; cy=(b[1]+b[3])/2; r=(b[2]-b[0])/2
        if abs(cx-50)>0.01 or abs(cy-50)>0.01 or len(d['subs'])!=1: continue
        outer=r+d['width']/2
        cand=(d['width'],outer,r,d)
        if best is None or d['width']>best[0]: best=cand
    w,outer,r,d=best
    inner=r-w/2
    width=min(0.12,max(0.02,(50-inner)/100))
    return {'style':'solid','width':round(width,4),'colors':None,'paint':d['paint']}, d

def ring(gid, els, key, simplify=None):
    draws,sweeps=extract.draws_of(gid,els)
    assert not sweeps, gid
    draws=[x for d in draws for x in zero_length_dots(d)]
    if simplify: draws=simplify(draws)
    groups,motions=motions_for(draws)
    gof=lambda d: groups.get(fx_key(d['fx'])) if d['fx'] else None
    paths=merge(draws,gof)
    uses_sheen=any(p['paint'].startswith('url') for p in paths)
    stroke,base=ring_stroke(draws,None)
    if len(set(p['paint'] for p in paths))>8 or True:
        pass
    pal=palette_of([{'paint':stroke['paint']}]+paths, ['#FFFFFF'] if uses_sheen else [])
    ring={'key':key,'stroke':{'style':'none','width':0.02,'colors':pal}}
    gradients=[]
    gi=None
    if uses_sheen:
        g=json.loads(json.dumps(SHEEN_GRADIENT)); w=pal.index('#FFFFFF')
        for s in g['stops']: s['color']=w
        gradients.append(g); gi=0
    ring['ornament']={'paths':to_paths(paths,pal,gi)}
    if gradients: ring['gradients']=gradients
    if motions: ring['motion']=motions
    return ring

if __name__=='__main__':
    G=extract.load()
    for gid in [g for g in G if '-avatar-' in g]:
        r=ring(gid,G[gid],gid.replace('-avatar',''))
        paths=r['ornament']['paths']
        tot=sum(len(p['d']) for p in paths)
        print(f"{gid:40s} colors={len(r['stroke']['colors'])} paths={len(paths)} total_d={tot} maxd={max(len(p['d']) for p in paths)} motions={len(r.get('motion',[]))} stroke={r['stroke']['width']}")
