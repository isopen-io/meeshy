import json, math
import geom, extract, raster
from convert import *

R=lambda v: round(v,2)
R1=lambda v: round(v,1)

def start_pt(sp): return sp[0][1][0]
def end_pt(cmd,p): return p[5] if cmd=='A' else (p[-1] if p else None)

TOLSIG=0.06

def vec_sub(sp):
    """Un sous-chemin à translation horizontale près : (structure, nombres)."""
    x0=start_pt(sp)[0]; cmds=[]; nums=[]
    for cmd,p in sp:
        cmds.append(cmd)
        if cmd=='A':
            rx,ry,rot,fa,fs,q=p; cmds.append(f'{fa}{fs}'); nums+= [rx,ry,rot,q[0]-x0,q[1]]
        else:
            for q in p: nums+=[q[0]-x0,q[1]]
    return (''.join(cmds),nums)

def close(u,v):
    return u[0]==v[0] and len(u[1])==len(v[1]) and all(abs(a-b)<=TOLSIG for a,b in zip(u[1],v[1]))

def seg_vecs(sp):
    """Les segments d'un sous-chemin, relatifs au point courant (y absolu gardé)."""
    out=[]; cur=start_pt(sp)
    for cmd,p in sp[1:]:
        if cmd=='Z': out.append(('Z',[])); continue
        if cmd=='A':
            rx,ry,rot,fa,fs,q=p; out.append((f'A{fa}{fs}',[rx,ry,rot,q[0]-cur[0],q[1]-cur[1],cur[1]])); cur=q
        else:
            out.append((cmd,[v for q in p for v in (q[0]-cur[0],q[1]-cur[1])]+[cur[1]])); cur=p[-1]
    return out

def best_run(n, same, step, gaps=True):
    """Plus longue suite périodique : same(i,j) compare deux éléments, step(i,j) leur écart en x.
    Une LACUNE (k modules manquants, sous un cartouche) n'interrompt pas la suite."""
    best=None
    for p in range(1,25):
        i=0
        while i+p<n:
            if not same(i,i+p): i+=1; continue
            dx=step(i,i+p)
            if dx<=0.5 or dx>60: i+=1; continue
            j=i
            def fits(j):
                st=step(j,j+p); k=round(st/dx)
                return k>=1 and (k==1 or gaps) and k<=8 and abs(st-k*dx)<0.03*k
            while j+p<n and same(j,j+p) and fits(j): j+=1
            count=(j+p-i)//p
            if count>=3:
                cov=count*p
                periods=round(step(i,i+(count-1)*p)/dx)+1
                if best is None or cov>best[3]: best=(i,p,dx,cov,periods)
            i=j+1
    return best

def border_of(draws):
    for k,d in enumerate(draws):
        if d['rule']=='evenodd' and d['width'] is None and len(d['subs'])==2:
            b0=geom.bbox([d['subs'][0]]); b1=geom.bbox([d['subs'][1]])
            if b0==(0,0,300,100) and abs(b1[0]-b1[1])<1e-6 and abs(b1[0]-(300-b1[2]))<1e-6:
                return k,{'width':R(b1[0]),'paint':d['paint'],'opacity':d['opacity']}
    raise ValueError('pas de bordure')

def filet_of(d,border_w):
    if d['tag']!='rect' or d['width'] is None or d['fx']: return None
    b=geom.bbox(d['subs']); x=b[0]
    if abs(b[1]-x)>1e-6 or abs(b[2]-(300-x))>1e-6 or abs(b[3]-(100-x))>1e-6: return None
    if x>border_w or d['width']>2: return None
    return {'inset':R(x),'width':R(d['width']),'paint':d['paint'],'opacity':d['opacity']}

def anchor_of(sp):
    b=geom.bbox([sp]); c=(b[0]+b[2])/2
    if b[0]>=105 and b[2]<=195: return 'center'
    return 'start' if c<150 else 'end'

def frame(gid, els, key, tweak=None):
    draws,sweeps=extract.draws_of(gid,els)
    draws=[x for d in draws for x in zero_length_dots(d)]
    if tweak: draws=tweak(draws)
    draws=bucket_delays(draws)
    bi,border=border_of(draws)
    rest=[d for k,d in enumerate(draws) if k!=bi]
    filets=[]; others=[]
    for d in rest:
        f=filet_of(d,border['width'])
        if f: filets.append(f)
        else: others.append(d)
    groups,motions=motions_for(others)
    gof=lambda d: groups.get(fx_key(d['fx'])) if d['fx'] else None
    items=[]   # (draw, subpath, key, order)
    for d in others:
        k=(d['paint'],d['width'],d['opacity'],d['rule'],gof(d))
        for sp in d['subs']: items.append({'d':d,'sp':sp,'k':k,'used':False})
    for n,it in enumerate(items): it['n']=n
    frieze_parts=[]  # (from,to,module,item-order,draw,[subpaths],periods)
    piece_items=[]
    def detect(seq):
        """Une passe : la plus longue suite périodique de `seq` (liste d'items) → frise."""
        if len(seq)<3: return False
        vs=[(it['k'],vec_sub(it['sp'])) for it in seq]
        xs=[start_pt(it['sp'])[0] for it in seq]
        run=best_run(len(seq),lambda a,b: vs[a][0]==vs[b][0] and close(vs[a][1],vs[b][1]),lambda a,b: xs[b]-xs[a])
        if run is None: return False
        i,p,dx,cov,periods=run
        members=seq[i:i+cov]; module=members[:p]
        bb=geom.bbox([it['sp'] for it in module]); w=bb[2]-bb[0]
        fr=bb[0]-(dx-w)/2 if w<dx else bb[0]
        to=300-fr-periods*dx
        while (fr<0 or to<-1e-6) and periods>3:
            # une suite qui court jusqu'aux bords : on rend les modules extrêmes (sous les coins)
            if fr<0: fr+=dx; periods-=1; module=members[p:2*p]; members=members[p:]
            else: periods-=1; members=members[:-p]
            to=300-fr-periods*dx
        if fr<0 or to<-1e-6 or fr>150 or to>150: return False
        to=max(0,to)
        for it in module: frieze_parts.append((R(fr),R(to),R(dx),it['n'],it['d'],[it['sp']],periods))
        for it in seq[i:i+cov]: it['used']=True
        for it in seq[i:i+cov]:
            if it not in members: it['used']=False
        return True
    # 1) suites sur toute la séquence (peintures alternées comprises)
    while detect([it for it in items if not it['used']]): pass
    # 2) suites par peinture
    keys=[]
    for it in items:
        if it['k'] not in keys: keys.append(it['k'])
    for k in keys:
        while detect([it for it in items if not it['used'] and it['k']==k]): pass
    # 3) suites de segments dans un sous-chemin long, et traits droits
    for it in items:
        if it['used']: continue
        sp=it['sp']; d0=it['d']
        b=geom.bbox([sp])
        if b[2]-b[0]<=60: continue
        segs=seg_vecs(sp)
        pts=[start_pt(sp)]
        for cmd,p in sp[1:]: pts.append(end_pt(cmd,p) or pts[-1])
        run=best_run(len(segs),lambda a,c: close(segs[a],segs[c]), lambda a,c: pts[c][0]-pts[a][0], gaps=False)
        if run is None:
            if len(sp)==2 and sp[1][0]=='L' and abs(sp[0][1][0][1]-sp[1][1][0][1])<1e-6:
                x0,x1=sorted([sp[0][1][0][0],sp[1][1][0][0]]); y=sp[0][1][0][1]
                k2=math.ceil((x1-x0)/60); dx=(x1-x0)/k2
                frieze_parts.append((R(x0),R(300-x1),R(dx),it['n'],d0,[[('M',[(x0,y)]),('L',[(x0+dx,y)])]],k2)); it['used']=True
            continue
        a,p,dx,cov,periods=run
        mod=[('M',[pts[a]])]+sp[1+a:1+a+p]
        head=sp[:1+a]; tail=[('M',[pts[a+cov]])]+sp[1+a+cov:]
        fr=pts[a][0]; to=300-fr-periods*dx
        if fr<0 or to<0 or fr>150 or to>150: continue
        frieze_parts.append((R(fr),R(to),R(dx),it['n'],d0,[mod],periods))
        it['used']=True
        if len(head)>1: piece_items.append((it['n'],d0,head))
        if len(tail)>1: piece_items.append((it['n'],d0,tail))
    for it in items:
        if not it['used']: piece_items.append((it['n'],it['d'],it['sp']))
    piece_items.sort(key=lambda x:x[0])
    frieze_parts.sort(key=lambda x:x[3])
    return {'border':border,'filets':filets,'friezes':frieze_parts,'pieces':piece_items,'motions':motions,'groups':groups,'sweeps':sweeps,'draws':others}

if __name__=='__main__':
    G=extract.load()
    for gid in [g for g in G if '-banniere-' in g]:
        f=frame(gid,G[gid],gid)
        fz={}
        for fr,to,dx,o,d,mod,n in f['friezes']: fz.setdefault((fr,to,dx),[]).append((d['paint'],n,len(geom.serialize(mod))))
        pcs=sum(len(geom.serialize([sp])) for _,_,sp in f['pieces'])
        print(f"{gid:42s} border={f['border']['width']} filets={len(f['filets'])} friezes={len(fz)} fparts={len(f['friezes'])} pieces_sub={len(f['pieces'])} pieces_d={pcs}")
        for k,v in fz.items(): print('    ',k,v)

BAND_GROUP='bande'

def mask_paths(mask_id):
    s=open(extract.PLANCHE).read(); i=s.find('<mask id="%s"'%mask_id[5:-1]); j=s.find('</mask>',i)
    import re
    return re.search(r'<path d="([^"]*)"',s[i:j]).group(1)

def assemble(gid, els, key, tweak=None):
    f=frame(gid,els,key,tweak)
    # Les reflets : un masque « m-band » → un reflet sur la bande ; un masque de tracés → sur ces tracés.
    sweep_motions=[]; extra_pieces=[]; extra_friezes=[]
    trace_group=None
    for sw in f['sweeps']:
        fx=sw['fx']
        if fx is None: continue
        if sw['mask']=='url(#m-band)':
            target=BAND_GROUP
            b=f['border']['width']
            extra_pieces+=[('start',{'subs':geom.rect(0,0,b,100),'group':target}),('end',{'subs':geom.rect(300-b,0,b,100),'group':target})]
            extra_friezes.append((0.0,0.0,60.0,{'subs':geom.rect(0,0,60,b)+geom.rect(0,100-b,60,b),'group':target}))
        else:
            target='traces'; trace_group=mask_paths(sw['mask'])
        m={'kind':'sweep','targets':[target],'duration':fx['duration']}
        if fx['delay']: m['delay']=fx['delay']
        sweep_motions.append(m)
    groups=f['groups']
    gof=lambda d: groups.get(fx_key(d['fx'])) if d['fx'] else None
    def group_with_trace(d):
        if trace_group is not None and d['width'] is not None and geom.serialize(d['subs'],2)==geom.serialize(geom.parse(trace_group),2):
            return 'traces'
        return gof(d)
    # Pièces par ancrage, regroupées par peinture sans changer l'ordre visible.
    by_anchor={'start':[],'center':[],'end':[]}
    for n,d,sp in f['pieces']:
        by_anchor[anchor_of(sp)].append({**d,'subs':[sp],'grp':group_with_trace(d)})
    pieces=[]
    for anchor in ('start','center','end'):
        ds=by_anchor[anchor]
        extra=[e for a,e in extra_pieces if a==anchor]
        paths=merge(ds,lambda d:d['grp']) if ds else []
        for e in extra:
            paths.append({'key':None,'d':geom.serialize(e['subs'],PREC),'paint':'#000000','width':None,'opacity':0,'rule':None,'group':e['group'],'masks':[]})
        if paths: pieces.append((anchor,paths))
    # Frises : une par (from, to, module), chemins dans l'ordre du document.
    fz={}
    for fr,to,dx,n,d,mod,periods in f['friezes']:
        sim=geom.simplify(mod,TOL)
        fz.setdefault((fr,to,dx),[]).append({**d,'subs':sim,'grp':group_with_trace(d)})
    friezes=[]
    for (fr,to,dx),ds in fz.items():
        friezes.append((fr,to,dx,merge(ds,lambda d:d['grp'])))
    for fr,to,dx,e in extra_friezes:
        friezes.append((fr,to,dx,[{'key':None,'d':geom.serialize(e['subs'],PREC),'paint':'#000000','width':None,'opacity':0,'rule':None,'group':e['group'],'masks':[]}]))
    # Palette
    allp=[p for _,ps in pieces for p in ps]+[p for *_,ps in friezes for p in ps]
    pal=[]
    def add(c):
        if c not in pal: pal.append(c)
    add(f['border']['paint'])
    for fl in f['filets']: add(fl['paint'])
    for p in allp:
        if p['opacity']>0 and p['paint'].startswith('#'): add(p['paint'])
    for p in allp:
        if p['opacity']==0: p['paint']=pal[0]
    design={'key':key,'viewBox':[0,0,300,100],'palette':pal,
            'border':{'width':f['border']['width'],'color':0,'opacity':f['border']['opacity']}}
    if f['filets']:
        design['border']['filets']=[{'inset':fl['inset'],'width':fl['width'],'color':pal.index(fl['paint']),'opacity':fl['opacity']} for fl in f['filets']]
    reach,cut=reach_of(pieces,f['border']['width'])
    design['reach']=reach
    design['_cut']=cut
    if pieces: design['pieces']=[{'anchor':a,'paths':to_paths(ps,pal,None)} for a,ps in pieces]
    if friezes: design['friezes']=[{'module':dx,'from':fr,'to':to,'fit':'justify','paths':to_paths(ps,pal,None)} for fr,to,dx,ps in friezes]
    motions=f['motions']+sweep_motions
    if motions: design['motion']=motions
    return design

def reach_of(pieces, border_w):
    """Ce que les coins et le cartouche mordent dans le trou (au plus 20) ; le reste est découpé."""
    corner=0.0; cart=None; cut=[]
    for anchor,ps in pieces:
        for p in ps:
            if p['opacity']==0: continue
            for sp in geom.parse(p['d']):
                b=geom.bbox([sp]); e=(p['width'] or 0)/2
                b=(b[0]-e,b[1]-e,b[2]+e,b[3]+e)
                if b[2]<=border_w or b[0]>=300-border_w or b[3]<=border_w or b[1]>=100-border_w: continue
                top=b[1]<50
                depth=b[3] if top else 100-b[1]
                if b[0]<30 or b[2]>270:
                    side=b[2] if b[0]<30 else 300-b[0]
                    if depth>20 and side>20: cut.append(('coin',b)); continue
                    corner=max(corner,min(depth,side) if depth<=20 and side<=20 else (side if depth>20 else depth))
                elif b[0]>=110 and b[2]<=190:
                    cart=cart or {'width':0,'depth':0,'edges':set()}
                    cart['width']=max(cart['width'],2*max(150-b[0],b[2]-150)); cart['depth']=max(cart['depth'],depth); cart['edges'].add('top' if top else 'bottom')
                else: cut.append(('ailleurs',b))
    r={'corner':round(min(20,corner),2)}
    if cart:
        edge='both' if len(cart['edges'])==2 else next(iter(cart['edges']))
        r['cartouche']={'width':round(min(80,cart['width']),2),'depth':round(min(20,cart['depth']),2),'edge':edge}
    return r,cut
