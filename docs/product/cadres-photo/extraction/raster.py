"""Masques raster grossiers pour savoir si deux dessins se recouvrent VRAIMENT (pas leurs boîtes)."""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
S=6

def arc_points(p0,rx,ry,phi,fa,fs,p1,n=None):
    # SVG F.6.5
    if rx==0 or ry==0: return [p1]
    phi=math.radians(phi); c,s=math.cos(phi),math.sin(phi)
    dx,dy=(p0[0]-p1[0])/2,(p0[1]-p1[1])/2
    x1=c*dx+s*dy; y1=-s*dx+c*dy
    rx,ry=abs(rx),abs(ry); lam=x1*x1/(rx*rx)+y1*y1/(ry*ry)
    if lam>1: rx*=math.sqrt(lam); ry*=math.sqrt(lam)
    num=rx*rx*ry*ry-rx*rx*y1*y1-ry*ry*x1*x1; den=rx*rx*y1*y1+ry*ry*x1*x1
    k=math.sqrt(max(0,num/den)) if den else 0
    if fa==fs: k=-k
    cx1=k*rx*y1/ry; cy1=-k*ry*x1/rx
    cx=c*cx1-s*cy1+(p0[0]+p1[0])/2; cy=s*cx1+c*cy1+(p0[1]+p1[1])/2
    ang=lambda ux,uy,vx,vy: math.atan2(ux*vy-uy*vx,ux*vx+uy*vy)
    t1=ang(1,0,(x1-cx1)/rx,(y1-cy1)/ry); dt=ang((x1-cx1)/rx,(y1-cy1)/ry,(-x1-cx1)/rx,(-y1-cy1)/ry)
    if not fs and dt>0: dt-=2*math.pi
    elif fs and dt<0: dt+=2*math.pi
    n=n or max(4,int(abs(dt)/(math.pi/24))+1)
    pts=[]
    for i in range(1,n+1):
        t=t1+dt*i/n; ex,ey=rx*math.cos(t),ry*math.sin(t)
        pts.append((c*ex-s*ey+cx,s*ex+c*ey+cy))
    return pts

def flatten(sp):
    pts=[]; closed=False; cur=None
    for cmd,p in sp:
        if cmd=='M': cur=p[0]; pts=[cur]
        elif cmd=='L': cur=p[0]; pts.append(cur)
        elif cmd=='C':
            a,b,c=p
            for i in range(1,9):
                t=i/8; mt=1-t
                pts.append((mt**3*cur[0]+3*mt*mt*t*a[0]+3*mt*t*t*b[0]+t**3*c[0], mt**3*cur[1]+3*mt*mt*t*a[1]+3*mt*t*t*b[1]+t**3*c[1]))
            cur=c
        elif cmd=='Q':
            a,c=p
            for i in range(1,7):
                t=i/6; mt=1-t
                pts.append((mt*mt*cur[0]+2*mt*t*a[0]+t*t*c[0], mt*mt*cur[1]+2*mt*t*a[1]+t*t*c[1]))
            cur=c
        elif cmd=='A':
            rx,ry,rot,fa,fs,p1=p; pts.extend(arc_points(cur,rx,ry,rot,fa,fs,p1)); cur=p1
        elif cmd=='Z': closed=True
    return pts,closed

class Mask:
    def __init__(s,img,x0,y0): s.img,s.x0,s.y0=img,x0,y0
    def hits(s,o):
        ax0,ay0=s.x0,s.y0; ax1,ay1=ax0+s.img.width,ay0+s.img.height
        bx0,by0=o.x0,o.y0; bx1,by1=bx0+o.img.width,by0+o.img.height
        x0,y0,x1,y1=max(ax0,bx0),max(ay0,by0),min(ax1,bx1),min(ay1,by1)
        if x0>=x1 or y0>=y1: return False
        a=s.img.crop((x0-ax0,y0-ay0,x1-ax0,y1-ay0)); b=o.img.crop((x0-bx0,y0-by0,x1-bx0,y1-by0))
        return ImageChops.logical_and(a,b).getbbox() is not None

def mask(subs,width):
    polys=[flatten(sp) for sp in subs]
    allp=[q for pts,_ in polys for q in pts]
    if not allp: return None
    e=(width or 0)/2+0.5
    x0=int(math.floor((min(q[0] for q in allp)-e)*S)); y0=int(math.floor((min(q[1] for q in allp)-e)*S))
    x1=int(math.ceil((max(q[0] for q in allp)+e)*S)); y1=int(math.ceil((max(q[1] for q in allp)+e)*S))
    img=Image.new('1',(max(1,x1-x0),max(1,y1-y0)),0); dr=ImageDraw.Draw(img)
    for pts,closed in polys:
        P=[(q[0]*S-x0,q[1]*S-y0) for q in pts]
        if width is None:
            if len(P)>=3: dr.polygon(P,fill=1)
        else:
            w=max(1,int(round(width*S)))
            if len(P)>=2: dr.line(P+([P[0]] if closed else []),fill=1,width=w)
            else: dr.point(P,fill=1)
    img=img.convert('L').filter(ImageFilter.MinFilter(3)).point(lambda v:255 if v>0 else 0).convert('1')
    return Mask(img,x0,y0)
