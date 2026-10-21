"""Géométrie : chemins SVG absolus, transformations affines (similitudes), formes → chemins."""
import math, re

TOK = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?')
ARITY = {'m':2,'l':2,'h':1,'v':1,'c':6,'s':4,'q':4,'t':2,'a':7,'z':0}

def parse(d):
    """→ liste de sous-chemins ; chacun = liste de (cmd, [points/params]) ABSOLUS : M L C Q A Z."""
    toks = TOK.findall(d); i=0; cmd=''; x=y=sx=sy=0.0; subs=[]; cur=None
    lastc=None; lastq=None
    while i < len(toks):
        t=toks[i]
        if t.isalpha():
            cmd=t; i+=1
            if cmd in 'zZ':
                if cur is not None: cur.append(('Z',[])); 
                x,y=sx,sy; lastc=lastq=None
            continue
        lo=cmd.lower(); n=ARITY[lo]; args=[float(v) for v in toks[i:i+n]]; i+=n
        rel = cmd.islower()
        if lo=='m':
            nx,ny=(x+args[0],y+args[1]) if rel else (args[0],args[1])
            cur=[('M',[(nx,ny)])]; subs.append(cur); x,y=sx,sy=nx,ny
            cmd = 'l' if rel else 'L'; lastc=lastq=None; continue
        if cur is None or (cur and cur[-1][0]=='Z'):
            cur=[('M',[(x,y)])]; subs.append(cur)
        if lo=='l':
            nx,ny=(x+args[0],y+args[1]) if rel else (args[0],args[1]); cur.append(('L',[(nx,ny)])); x,y=nx,ny; lastc=lastq=None
        elif lo=='h':
            nx = x+args[0] if rel else args[0]; cur.append(('L',[(nx,y)])); x=nx; lastc=lastq=None
        elif lo=='v':
            ny = y+args[0] if rel else args[0]; cur.append(('L',[(x,ny)])); y=ny; lastc=lastq=None
        elif lo=='c':
            p=[(x+args[k],y+args[k+1]) if rel else (args[k],args[k+1]) for k in (0,2,4)]
            cur.append(('C',p)); lastc=p[1]; x,y=p[2]; lastq=None
        elif lo=='s':
            c1 = (2*x-lastc[0],2*y-lastc[1]) if lastc else (x,y)
            p=[(x+args[k],y+args[k+1]) if rel else (args[k],args[k+1]) for k in (0,2)]
            cur.append(('C',[c1,p[0],p[1]])); lastc=p[0]; x,y=p[1]; lastq=None
        elif lo=='q':
            p=[(x+args[k],y+args[k+1]) if rel else (args[k],args[k+1]) for k in (0,2)]
            cur.append(('Q',p)); lastq=p[0]; x,y=p[1]; lastc=None
        elif lo=='t':
            c1 = (2*x-lastq[0],2*y-lastq[1]) if lastq else (x,y)
            p=(x+args[0],y+args[1]) if rel else (args[0],args[1])
            cur.append(('Q',[c1,p])); lastq=c1; x,y=p; lastc=None
        elif lo=='a':
            rx,ry,rot,laf,sw=args[:5]; p=(x+args[5],y+args[6]) if rel else (args[5],args[6])
            cur.append(('A',[rx,ry,rot,int(laf),int(sw),p])); x,y=p; lastc=lastq=None
    return subs

# Affine : (a,b,c,d,e,f) — x' = a x + c y + e ; y' = b x + d y + f
I=(1,0,0,1,0,0)
def mul(m,n):
    a,b,c,d,e,f=m; A,B,C,D,E,F=n
    return (a*A+c*B, b*A+d*B, a*C+c*D, b*C+d*D, a*E+c*F+e, b*E+d*F+f)
def parse_transform(s):
    m=I
    for name,args in re.findall(r'(\w+)\(([^)]*)\)', s or ''):
        v=[float(x) for x in re.split(r'[\s,]+',args.strip()) if x]
        if name=='translate': t=(1,0,0,1,v[0],v[1] if len(v)>1 else 0)
        elif name=='scale': t=(v[0],0,0,v[1] if len(v)>1 else v[0],0,0)
        elif name=='rotate':
            r=math.radians(v[0]); co,si=math.cos(r),math.sin(r)
            t=(co,si,-si,co,0,0)
            if len(v)==3: t=mul(mul((1,0,0,1,v[1],v[2]),t),(1,0,0,1,-v[1],-v[2]))
        elif name=='skewX': t=(1,0,math.tan(math.radians(v[0])),1,0,0)
        else: raise ValueError(name)
        m=mul(m,t)
    return m
def ap(m,p):
    a,b,c,d,e,f=m; return (a*p[0]+c*p[1]+e, b*p[0]+d*p[1]+f)
def similarity(m):
    a,b,c,d,_,_=m; s1=math.hypot(a,b); s2=math.hypot(c,d)
    return abs(s1-s2)<1e-6 and abs(a*c+b*d)<1e-6, s1, (a*d-b*c)<0, math.degrees(math.atan2(b,a))

def transform(subs,m):
    if m==I: return subs
    ok,s,flip,ang=similarity(m)
    if not ok: raise ValueError('non-similarity transform')
    out=[]
    for sp in subs:
        n=[]
        for cmd,p in sp:
            if cmd=='A':
                rx,ry,rot,laf,sw,pt=p
                n.append(('A',[rx*s,ry*s,(-rot if flip else rot)+ang,laf,(1-sw) if flip else sw,ap(m,pt)]))
            elif cmd=='Z': n.append(('Z',[]))
            else: n.append((cmd,[ap(m,q) for q in p]))
        out.append(n)
    return out

def circle(cx,cy,r): return ellipse(cx,cy,r,r)
def ellipse(cx,cy,rx,ry):
    return [[('M',[(cx-rx,cy)]),('A',[rx,ry,0,1,0,(cx+rx,cy)]),('A',[rx,ry,0,1,0,(cx-rx,cy)]),('Z',[])]]
def rect(x,y,w,h,rx=0):
    if rx<=0: return [[('M',[(x,y)]),('L',[(x+w,y)]),('L',[(x+w,y+h)]),('L',[(x,y+h)]),('Z',[])]]
    r=min(rx,w/2,h/2)
    return [[('M',[(x+r,y)]),('L',[(x+w-r,y)]),('A',[r,r,0,0,1,(x+w,y+r)]),('L',[(x+w,y+h-r)]),('A',[r,r,0,0,1,(x+w-r,y+h)]),
             ('L',[(x+r,y+h)]),('A',[r,r,0,0,1,(x,y+h-r)]),('L',[(x,y+r)]),('A',[r,r,0,0,1,(x+r,y)]),('Z',[])]]

def bbox(subs):
    pts=[]
    for sp in subs:
        for cmd,p in sp:
            if cmd=='A': pts.append(p[5])
            elif cmd!='Z': pts.extend(p)
    xs=[q[0] for q in pts]; ys=[q[1] for q in pts]
    return (min(xs),min(ys),max(xs),max(ys))

def translate(subs,dx,dy=0.0):
    return transform(subs,(1,0,0,1,dx,dy)) if (dx or dy) else subs

def fmt_num(v,prec):
    r=round(v,prec)
    if r==0: r=0.0
    s=('%.*f'%(prec,r)).rstrip('0').rstrip('.')
    if s.startswith('0.'): s=s[1:]
    elif s.startswith('-0.'): s='-'+s[2:]
    return s or '0'

def serialize(subs,prec=2):
    out=[]
    def nums(vals):
        res=''
        for v in vals:
            s=fmt_num(v,prec)
            if res and not s.startswith('-') and not (s.startswith('.') and '.' in res.split(' ')[-1].split('-')[-1]):
                res+=' '
            elif res and s.startswith('.') and '.' in re.split(r'[ -]',res)[-1]:
                pass
            res+=s
        return res
    for sp in subs:
        prev=None; cur=None; start=None
        for cmd,p in sp:
            if cmd=='Z': out.append('Z'); prev='Z'; cur=start; continue
            nxt = p[5] if cmd=='A' else p[-1]
            if cmd=='M': start=nxt
            if cmd=='A':
                rx,ry,rot,laf,sw,pt=p
                body=nums([rx,ry,rot])+' '+str(laf)+' '+str(sw)+' '+nums([pt[0],pt[1]])
            elif cmd=='L' and cur is not None and abs(p[0][1]-cur[1])<1e-9:
                body=nums([p[0][0]]); cmd='H'
            elif cmd=='L' and cur is not None and abs(p[0][0]-cur[0])<1e-9:
                body=nums([p[0][1]]); cmd='V'
            else:
                body=nums([c for q in p for c in q])
            letter=cmd
            if prev==cmd and cmd in 'LCQAHV' : out.append(' '+body if not body.startswith('-') else body)
            else: out.append(letter+body)
            prev=cmd; cur=nxt
    return ''.join(out)

def _rdp(pts,tol):
    if len(pts)<3: return pts
    a,b=pts[0],pts[-1]; dx,dy=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dy)
    best=-1; bi=0
    for i in range(1,len(pts)-1):
        p=pts[i]
        d=abs(dy*(p[0]-a[0])-dx*(p[1]-a[1]))/L if L>1e-9 else math.hypot(p[0]-a[0],p[1]-a[1])
        if d>best: best,bi=d,i
    if best<=tol: return [a,b]
    return _rdp(pts[:bi+1],tol)[:-1]+_rdp(pts[bi:],tol)

def simplify(subs,tol):
    """Douglas-Peucker sur les suites de L (les arcs et courbes restent)."""
    out=[]
    for sp in subs:
        n=[]; run=[]
        def flush():
            if len(run)>=2:
                pts=_rdp(run,tol)
                n.extend(('L',[q]) for q in pts[1:])
            run.clear()
        cur=None
        for cmd,p in sp:
            if cmd=='L':
                if not run: run.append(cur)
                run.append(p[0]); cur=p[0]; continue
            flush()
            n.append((cmd,p))
            if cmd=='M': cur=p[0]
            elif cmd=='A': cur=p[5]
            elif cmd in 'CQ': cur=p[-1]
        flush()
        out.append(n)
    return out

def open_closed(sp):
    """Un trait fermé → ouvert (retour explicite au départ) : il peut alors se couper."""
    if sp and sp[-1][0]=='Z':
        start=sp[0][1][0]
        return sp[:-1]+[('L',[start])]
    return sp
