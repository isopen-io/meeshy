"""Planche → AvatarRingDesign / BannerFrameDesign (contrats #10932)."""
import json, math, sys
import geom, extract

PREC=2
SHEEN_GRADIENT={'kind':'linear','x1':0,'y1':0,'x2':1,'y2':0,'stops':[{'color':None,'at':0,'opacity':0},{'color':None,'at':0.5,'opacity':0.7},{'color':None,'at':1,'opacity':0}]}
MAX_D=3900
TOL=0.02

KIND={'spin':('rotate','frame'),'spin-self':('rotate','self'),'pulse':('pulse','self'),'tw':('twinkle',None),
      'sweep':('sweep',None),'sway':('rotate','frame'),'sway-x':('skew','top')}

def fx_key(fxs): return json.dumps(fxs,sort_keys=True)

def expand(b,w):
    if b is None: return None
    e=(w or 0)/2; return (b[0]-e,b[1]-e,b[2]+e,b[3]+e)
def overlap(a,b): return not (a[2]<b[0] or b[2]<a[0] or a[3]<b[1] or b[3]<a[1])
def union(a,b): return (min(a[0],b[0]),min(a[1],b[1]),max(a[2],b[2]),max(a[3],b[3]))

def zero_length_dots(d):
    """Un trait de longueur nulle à bout rond (un point) disparaît sans `linecap` : il devient un disque."""
    if d['width'] is None or d['cap']!='round': return [d]
    keep=[]; dots=[]
    for sp in d['subs']:
        b=geom.bbox([sp])
        if b[2]-b[0]<0.01 and b[3]-b[1]<0.01:
            dots.extend(geom.circle(b[0],b[1],d['width']/2))
        else: keep.append(sp)
    out=[]
    if keep: out.append({**d,'subs':keep})
    if dots: out.append({**d,'subs':dots,'width':None,'rule':None})
    return out

def split_long(sp, limit):
    """Un sous-chemin OUVERT trop long se coupe en morceaux qui se suivent (le trait reste continu)."""
    s=geom.serialize([sp],PREC)
    if len(s)<=limit: return [sp]
    if any(c=='Z' for c,_ in sp): sp=geom.open_closed(sp)
    if any(c=='Z' for c,_ in sp): raise ValueError('sous-chemin fermé trop long (%d)'%len(s))
    out=[]; cur=[sp[0]]; pos=None
    def end_of(cmd,p): return p[5] if cmd=='A' else p[-1]
    last=sp[0][1][0]
    for cmd,p in sp[1:]:
        cur.append((cmd,p))
        if len(geom.serialize([cur],PREC))>limit-40:
            out.append(cur); cur=[('M',[end_of(cmd,p)])]
        last=end_of(cmd,p)
    if len(cur)>1: out.append(cur)
    return out

def merge(draws, group_of):
    """Regroupe par peinture en gardant l'ordre VISIBLE : un élément ne rejoint un chemin antérieur
    que si rien de ce qui a été posé APRÈS ce chemin ne le recouvre réellement (masques raster)."""
    import raster
    paths=[]
    for d in draws:
        key=(d['paint'],d['width'],d['opacity'],d['rule'],group_of(d))
        subs=[q for sp in geom.simplify(d['subs'],TOL) for q in split_long(sp,MAX_D)]
        for sp in subs:
            s=geom.serialize([sp],PREC)
            m=raster.mask([sp],d['width'])
            target=None
            for i in range(len(paths)-1,-1,-1):
                p=paths[i]
                if p['key']==key and len(p['d'])+len(s)<=MAX_D:
                    if m is None or all(not any(mm.hits(m) for mm in q['masks']) for q in paths[i+1:]): target=p
                    break
            if target is None:
                paths.append({'key':key,'d':s,'masks':[m] if m else [],'paint':d['paint'],'width':d['width'],'opacity':d['opacity'],'rule':d['rule'],'group':group_of(d)})
            else:
                target['d']+=s
                if m: target['masks'].append(m)
    return paths

def bucket_delays(draws, buckets=3):
    """Trop de phases distinctes (> 8) : chaque cible scintille selon son RANG DANS L'ESPACE
    (rang le long de sa rangée, modulo `buckets`) — un motif périodique, donc une frise possible."""
    shapes={}
    for d in draws:
        for depth,fx in enumerate(d['fx']):
            shapes.setdefault((depth,fx['kind'],fx['duration'],fx['reverse']),set()).add(fx['delay'])
    crowded={k for k,v in shapes.items() if len(v)>8}
    if not crowded: return draws
    # les cibles = signatures de mouvement complètes ; leur centre
    centers={}
    for d in draws:
        if not d['fx']: continue
        k=fx_key(d['fx']); b=geom.bbox(d['subs'])
        u=centers.get(k); centers[k]=b if u is None else (min(u[0],b[0]),min(u[1],b[1]),max(u[2],b[2]),max(u[3],b[3]))
    def row(b):
        cy=(b[1]+b[3])/2; cx=(b[0]+b[2])/2
        return 'top' if cy<20 else ('bottom' if cy>80 else ('left' if cx<150 else 'right'))
    rank={}
    rows={}
    for k,b in centers.items(): rows.setdefault(row(b),[]).append((k,b))
    for r,lst in rows.items():
        axis=0 if r in ('top','bottom') else 1
        cs=sorted(((bb[axis]+bb[axis+2])/2,k) for k,bb in lst)
        diffs=[cs[i+1][0]-cs[i][0] for i in range(len(cs)-1) if cs[i+1][0]-cs[i][0]>0.5]
        step=min(diffs) if diffs else 1
        for c,k in cs: rank[k]=round((c-cs[0][0])/step)
    out=[]
    for d in draws:
        fxs=[]
        for depth,fx in enumerate(d['fx']):
            if (depth,fx['kind'],fx['duration'],fx['reverse']) in crowded:
                fx={**fx,'delay':round((rank[fx_key(d['fx'])]%buckets)*fx['duration']/buckets,2)}
            fxs.append(fx)
        out.append({**d,'fx':fxs})
    return out

def motions_for(draws, sweeps_targets=None):
    """Signatures de mouvement → groupes et mouvements déclarés (extérieur d'abord)."""
    sigs=[]
    for d in draws:
        k=fx_key(d['fx'])
        if d['fx'] and k not in sigs: sigs.append(k)
    groups={k:f'g{i}' for i,k in enumerate(sigs)}
    # Chaque niveau de mouvement d'une signature : (profondeur, fx) → ses cibles.
    levels={}
    for k in sigs:
        for depth,fx in enumerate(json.loads(k)):
            lk=(depth,json.dumps({kk:v for kk,v in fx.items()},sort_keys=True))
            levels.setdefault(lk,[]).append(groups[k])
    motions=[]
    # Fusionner les niveaux qui ne diffèrent que par le délai, en progression arithmétique → stagger.
    by_shape={}
    for (depth,fxj),targets in levels.items():
        fx=json.loads(fxj); shape=(depth,fx['kind'],fx['duration'],fx['reverse'])
        by_shape.setdefault(shape,[]).append((fx['delay'],targets))
    for (depth,kind,dur,rev),items in sorted(by_shape.items(),key=lambda x:x[0][0]):
        items.sort()
        chunks=[]
        if len(items)>1:
            steps=[items[i+1][0]-items[i][0] for i in range(len(items)-1)]
            if max(steps)-min(steps)<0.03 and all(len(t)==1 for _,t in items):
                chunks.append({'delay':items[0][0],'stagger':round(sum(steps)/len(steps),2),'targets':[t[0] for _,t in items]})
        if not chunks:
            for delay,targets in items: chunks.append({'delay':delay,'targets':targets})
        mk,origin=KIND[kind]
        for c in chunks:
            for i in range(0,len(c['targets']),16):
                m={'kind':mk,'targets':c['targets'][i:i+16],'duration':dur}
                delay=c['delay']+(c.get('stagger',0)*i)
                if delay: m['delay']=round(delay,2)
                if c.get('stagger'): m['stagger']=c['stagger']
                if kind=='sway': m.update({'direction':'alternate','amplitude':3})
                elif rev: m['direction']='reverse'
                if origin and kind in ('spin-self',): m['origin']=origin
                motions.append(m)
    return groups,motions

def palette_of(paths, extra=()):
    pal=[]
    for p in paths:
        if p['paint'].startswith('#') and p['paint'] not in pal: pal.append(p['paint'])
    for e in extra:
        if e not in pal: pal.append(e)
    return pal

def norm_hex(h):
    h=h.upper()
    if len(h)==4: h='#'+''.join(c*2 for c in h[1:])
    return h

def to_paths(paths,pal,gradient_index):
    out=[]
    for p in paths:
        q={'d':p['d']}
        if p['paint'].startswith('url'):
            q['color']=pal.index('#FFFFFF'); q['gradient']=gradient_index
        else: q['color']=pal.index(p['paint'])
        q['opacity']=round(p['opacity'],3)
        if p['width'] is not None: q['width']=round(p['width'],3)
        if p['rule']: q['fillRule']=p['rule']
        if p['group']: q['group']=p['group']
        out.append(q)
    return out
