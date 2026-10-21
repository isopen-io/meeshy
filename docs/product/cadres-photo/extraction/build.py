"""Les 28 cadres de la planche → sources du dépôt (#10936).

  python3 build.py <sortie-contours.json> <sortie-cadres.json>

Corrections validées avec la planche (#10934, points 5 et 6) :
  - haussmannien FIXE : le filet extérieur passe en fonte (#22262B), plus épais —
    le contour se détache d'un fond clair (avatar et bannière) ;
  - rituel, contour : le masque est simplifié pour rester lisible à 40 px —
    ovale agrandi bordé d'ivoire, sourcils / nez / bouche épaissis, marques de
    joue retirées ;
  - rituel : deux blancs presque identiques (#F4EBDA, #F7F3EA) n'en font qu'un —
    la palette tient en huit couleurs.
"""
import json, sys
import extract, rings, frames, geom

STYLES=[('haussmannien','haussmannien'),('arabe','arabe'),('grec','grec'),('africain-ancestral','ancestral'),
        ('africain-technologique','technologique'),('africain-rituel','rituel'),('celte','celte')]

def merge_whites(draws):
    return [{**d,'paint':'#F7F3EA'} if d['paint']=='#F4EBDA' else d for d in draws]

def haussmann_contrast_ring(draws):
    out=[]
    for d in draws:
        if d['tag']=='circle' and d['width'] is not None and d['paint']=='#A99B83' and abs(geom.bbox(d['subs'])[2]-99.3)<0.05:
            d={**d,'paint':'#22262B','width':1.0,'subs':geom.circle(50,50,49.45)}
        out.append(d)
    return out

def haussmann_contrast_frame(draws):
    out=[]
    for d in draws:
        if d['tag']=='rect' and d['width'] is not None and d['paint']=='#A99B83' and abs(geom.bbox(d['subs'])[0]-0.6)<0.01:
            d={**d,'paint':'#22262B','width':0.9}
        out.append(d)
    return out

def rituel_mask(els):
    """Le masque du contour rituel, lisible à 40 px."""
    out=[]
    for tag,a,st in els:
        a=dict(a)
        if tag=='ellipse' and a.get('cx')=='50' and a.get('cy')=='4.6':
            a.update({'rx':'4.3','ry':'5.4','stroke':'#EDE6D6','stroke-width':'.7'})
        elif tag=='path' and a.get('d','').startswith('M47.2 3.6 Q'):
            a['stroke-width']='1.1'
        elif tag=='path' and a.get('d','')=='M50 4.4 V7 M48.6 8.2 H51.4':
            a['stroke-width']='1'
        elif tag=='path' and a.get('d','').startswith('M46.8 5.6 h.9'):
            continue
        out.append((tag,a,st))
    return out

def build():
    G=extract.load()
    ring_packs=[]; frame_packs=[]
    for order,(style,short) in enumerate(STYLES):
        rs=[]; fs=[]
        for mode in ('fixe','anime'):
            key=short if mode=='fixe' else f'{short}-anime'
            gid=f'{style}-avatar-{mode}'; els=G[gid]
            if style=='africain-rituel': els=rituel_mask(els)
            simp=None
            if style=='africain-rituel': simp=merge_whites
            if style=='haussmannien' and mode=='fixe': simp=haussmann_contrast_ring
            rs.append(rings.ring(gid,els,key,simplify=simp))
            gid=f'{style}-banniere-{mode}'
            tweak=None
            if style=='africain-rituel': tweak=merge_whites
            if style=='haussmannien' and mode=='fixe': tweak=haussmann_contrast_frame
            f=frames.assemble(gid,G[gid],key,tweak); f.pop('_cut',None)
            fs.append(f)
        ring_packs.append({'slug':f'contours-{short}','order':2+order,'installedByDefault':False,'removable':True,
                           'usage':{'kind':'free','surfaces':['avatar']},'rings':rs})
        frame_packs.append({'slug':f'cadres-{short}','order':order,'installedByDefault':False,'removable':True,
                            'usage':{'kind':'free','surfaces':['banner']},'frames':fs})
    return ring_packs,frame_packs

if __name__=='__main__':
    r,f=build()
    json.dump(r,open(sys.argv[1],'w'),ensure_ascii=False,indent=1)
    json.dump(f,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
    print(len(r),len(f))
