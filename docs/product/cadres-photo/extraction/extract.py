"""Lecture des 28 groupes de la planche → « draws » (chemins absolus + peinture + mouvement)."""
import json, re, math
from html.parser import HTMLParser
import geom

import os
PLANCHE=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','planche-cadres-photo.html')

class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.groups={}; s.cur=None; s.stack=[]
    def handle_starttag(s,tag,attrs):
        a=dict(attrs)
        if s.cur is None:
            if tag=='g' and a.get('id','').endswith(('-fixe','-anime')) and 'data-frame' in a:
                s.cur=a['id']; s.groups[s.cur]=[]; s.stack=[]
            return
        if tag=='g': s.stack.append(a); return
        s.groups[s.cur].append((tag,a,list(s.stack)))
    def handle_startendtag(s,tag,attrs):
        if s.cur is not None: s.groups[s.cur].append((tag,dict(attrs),list(s.stack)))
    def handle_endtag(s,tag):
        if s.cur is not None and tag=='g':
            if not s.stack: s.cur=None
            else: s.stack.pop()

def load():
    p=P(); p.feed(open(PLANCHE).read()); return p.groups

def style_vars(style):
    out={}
    for part in (style or '').split(';'):
        if ':' in part:
            k,v=part.split(':',1); out[k.strip()]=v.strip()
    return out

def fx_of(a):
    cls=(a.get('class') or '').split()
    if 'fx' not in cls: return None
    kind=[c for c in cls if c!='fx'][0]
    v=style_vars(a.get('style'))
    dur=float(v.get('--d','6s').rstrip('s'))
    delay=float(v.get('animation-delay','0s').rstrip('s'))
    rev=v.get('animation-direction')=='reverse'
    return {'kind':kind,'duration':round(dur,3),'delay':round(delay,3),'reverse':rev}

def shape(tag,a):
    f=lambda k,d=0.0: float(a.get(k,d))
    if tag=='path':
        d=a['d'].strip()
        return geom.parse(d)
    if tag=='circle': return geom.circle(f('cx'),f('cy'),f('r'))
    if tag=='ellipse': return geom.ellipse(f('cx'),f('cy'),f('rx'),f('ry'))
    if tag=='rect': return geom.rect(f('x'),f('y'),f('width'),f('height'),f('rx'))
    raise ValueError(tag)

def dashed_circle(a):
    """Un cercle pointillé (stroke-dasharray) → ses arcs, explicites."""
    cx,cy,r=float(a['cx']),float(a['cy']),float(a['r'])
    pattern=[float(x) for x in re.split(r'[\s,]+',a['stroke-dasharray'].strip())]
    if len(pattern)%2: pattern=pattern*2
    circ=2*math.pi*r; subs=[]; pos=0.0; i=0
    # SVG : le tracé d'un cercle part de (cx+r, cy) dans le sens horaire.
    while pos < circ-1e-6:
        L=pattern[i%len(pattern)]; end=min(pos+L,circ)
        if i%2==0 and end>pos:
            a0,a1=pos/r,end/r
            p0=(cx+r*math.cos(a0),cy+r*math.sin(a0)); p1=(cx+r*math.cos(a1),cy+r*math.sin(a1))
            if L<0.05:  # point
                subs.append([('M',[p0]),('L',[p1])])
            else:
                subs.append([('M',[p0]),('A',[r,r,0,1 if a1-a0>math.pi else 0,1,p1])])
        pos=end; i+=1
    return subs

def draws_of(gid,els):
    """Chaque élément → 0, 1 ou 2 draws (remplissage puis trait), mouvements hérités."""
    out=[]; sweeps=[]
    for idx,(tag,a,stack) in enumerate(els):
        m=geom.I
        fxs=[]; masks=[]
        for g in stack:
            if 'transform' in g: m=geom.mul(m,geom.parse_transform(g['transform']))
            fx=fx_of(g)
            if fx: fxs.append(fx)
            if 'mask' in g: masks.append(g['mask'])
        own=fx_of(a)
        if own: fxs.append(own)
        if 'transform' in a: m=geom.mul(m,geom.parse_transform(a['transform']))
        stroke=a.get('stroke'); fill=a.get('fill','none' if stroke not in (None,'none') else '#000')
        # Le reflet de la planche : un rectangle à dégradé blanc qui glisse, sous un masque.
        if fill=='url(#sheen)':
            sw=[f for f in fxs if f['kind']=='sweep']
            sweeps.append({'mask':masks[-1] if masks else None,'fx':sw[0] if sw else None})
            continue
        try:
            subs=shape(tag,a)
            if 'stroke-dasharray' in a and tag=='circle': subs=dashed_circle(a)
            subs=geom.transform(subs,m)
        except ValueError as e:
            raise ValueError(f'{gid} #{idx} {tag}: {e}')
        op=float(a.get('opacity',1))
        common={'idx':idx,'opacity':op,'fx':fxs,'cap':a.get('stroke-linecap'),'tag':tag}
        if fill not in ('none',None):
            out.append({**common,'subs':subs,'paint':fill.upper() if fill.startswith('#') else fill,'width':None,'rule':a.get('fill-rule')})
        if stroke not in (None,'none'):
            subs2=subs
            if 'stroke-dasharray' in a and tag!='circle': raise ValueError('dash '+tag)
            out.append({**common,'subs':subs2,'paint':stroke.upper() if stroke.startswith('#') else stroke,'width':float(a.get('stroke-width',1))*geom.similarity(m)[1],'rule':None})
    return out,sweeps

if __name__=='__main__':
    G=load()
    for gid,els in G.items():
        d,sw=draws_of(gid,els)
        n=sum(len(x['subs']) for x in d)
        paints=sorted({x['paint'] for x in d})
        print(gid,'draws',len(d),'subpaths',n,'paints',len(paints),paints,'sweeps',sw[:2])


def raw_group(gid):
    """Le balisage original d'un groupe (pour comparer)."""
    s=open(PLANCHE).read()
    i=s.find('<g id="%s"'%gid); j=i; depth=0
    while True:
        o=s.find('<g',j+1); c=s.find('</g>',j+1)
        if o!=-1 and o<c: depth+=1; j=o
        else:
            if depth==0: return s[i:c+4]
            depth-=1; j=c

def defs():
    s=open(PLANCHE).read(); i=s.find('<defs'); return s[i:s.find('</defs>',i)+7]
