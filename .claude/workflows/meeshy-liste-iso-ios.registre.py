#!/usr/bin/env python3
"""Registre du chantier #15537 « liste iso iOS » : lots du plan de parité Android et lots de la cartographie
(iOS, Android, partagés, serveur), leur issue, leur PR, et leur état calculé depuis dev.

Sous-commandes (RUN = répertoire d'exécution, qui contient plan/ et ledger.git posés par setup_run.sh) :
  init RUN SEED              registre.json depuis la graine (features, lots cibles du plan et leur fermeture)
  add RUN FICHIER            ajoute ou remplace des lots de cartographie (objet ou liste JSON)
  exclude RUN CLE MOTIF      retire un lot du périmètre, avec son motif
  set RUN CLE CHAMP VALEUR   pose issue | pr | note (entier pour issue et pr)
  mark RUN CLE ETAT          satisfait | bloque | debloque | reprendre
  sans-fichiers RUN CLE F…   fichiers que le lot s'interdit de toucher (critère écrit) : ils ne comptent plus dans les chevauchements
  depend RUN CLE DEP         ajoute une dépendance à un lot (du plan ou de la cartographie), refusée si elle crée un cycle
  criteres RUN CLE FICHIER   critères ajoutés à un lot du plan (liste JSON) : la demande du porteur que le plan ne disait pas
  plan-cible RUN CLE FEATURE ajoute un lot du plan (et la fermeture de ses dépendances) comme cible d'une feature
  spec RUN CLE               la spécification complète d'un lot (plan : plan/*.json ; cartographie : registre)
  status RUN [--inflight a,b] [--trailer 'Claude-Session: …|Claude-Session: …'] [--stale-hours 6] [--pr-stale-hours 3]
                             --trailer accepte plusieurs signatures séparées par « | » : celles des sessions qui ont déjà travaillé au chantier
  export RUN / import RUN FICHIER   les lots de cartographie, pour les garder dans un commentaire de #15537
  self-test
"""
import argparse, fcntl, glob, json, os, re, subprocess, sys, tempfile, time

GH = 'https://github.com/isopen-io/meeshy'
PLATEFORMES = ('android', 'ios', 'partage', 'serveur')
CLE_RE = re.compile(r'^[a-z0-9][a-z0-9-]{2,56}$')
SHARED = re.compile(r'(strings[^/]*\.xml|settings\.gradle\.kts|libs\.versions\.toml|build\.gradle\.kts|AndroidManifest\.xml|/i18n/manifest/|Module\.kt$|NavGraph\.kt$|Destinations\.kt$|project\.pbxproj$|Localizable\.xcstrings$)')
CHAMPS_LOT = ('key', 'platform', 'title', 'goal', 'acceptance', 'tests', 'files', 'ios_reference_files', 'deps', 'sensible', 'lourd', 'features')


def branche(plateforme, cle):
    return f'claude/{plateforme}-{cle}'


def charger(run):
    p = f'{run}/registre.json'
    return json.load(open(p)) if os.path.exists(p) else {'version': 1, 'features': {}, 'lots': {}}


def ecrire(run, reg):
    fd, tmp = tempfile.mkstemp(dir=run, suffix='.json')
    with os.fdopen(fd, 'w') as f:
        json.dump(reg, f, ensure_ascii=False, indent=1)
    os.replace(tmp, f'{run}/registre.json')


def plan(run):
    tout = {}
    for p in glob.glob(f'{run}/plan/*.json'):
        piste = os.path.basename(p)[:-5]
        for l in json.load(open(p)):
            tout[l['key']] = dict(l, plan_track=piste)
    return tout


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout


def depot_nu(gitdir, url=GH):
    if not os.path.isdir(gitdir):
        subprocess.run(f'git init -q --bare {gitdir} && git -C {gitdir} remote add origin {url}', shell=True)


def fusionnees(run):
    """Le registre des fusions : git log --merges de dev, dans un dépôt nu COMPLET.

    Il ne doit JAMAIS devenir superficiel : un seul fetch --depth y greffe des bornes, et git log dev s'arrête à la première
    (mesuré le 2026-11-04 : 16 fusions Android visibles sur plus de 620, tout le plan paraissait à faire). Il se répare s'il l'est."""
    depot_nu(f'{run}/ledger.git')
    with open(f'{run}/ledger.lock', 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)
        if os.path.exists(f'{run}/ledger.git/shallow'):
            subprocess.run(f'git -C {run}/ledger.git fetch -q --unshallow --filter=tree:0 origin +refs/heads/dev:refs/heads/dev', shell=True)
            if os.path.exists(f'{run}/ledger.git/shallow'):
                subprocess.run(f'rm -rf {run}/ledger.git', shell=True)
                depot_nu(f'{run}/ledger.git')
        for _ in range(4):
            if subprocess.run(f'git -C {run}/ledger.git fetch -q --filter=tree:0 origin +refs/heads/dev:refs/heads/dev', shell=True).returncode == 0:
                break
            time.sleep(3)
    sujets = sh(f'git -C {run}/ledger.git log dev --merges --format=%s')
    tete = sh(f'git -C {run}/ledger.git rev-parse --short=10 dev').strip()
    return set(re.findall(r'isopen-io/(claude/[a-z0-9][a-z0-9/._-]*)', sujets)), tete


def fermeture(cles, pl, fusion):
    out = []

    def marche(k, racine):
        if k in out or k not in pl or (branche('android', k) in fusion and not racine):
            return
        out.append(k)
        for d in pl[k].get('deps', []):
            marche(d, False)
    for k in cles:
        marche(k, True)
    return out


def cmd_init(run, graine):
    seed = json.load(open(graine))
    reg = charger(run)
    pl = plan(run)
    fusion, _ = fusionnees(run)
    reg['features'] = seed['features']
    inconnues = []
    for fid, f in seed['features'].items():
        cibles = [k for k in f.get('plan_targets', []) if k not in seed.get('exclusions', {})]
        inconnues += [k for k in cibles if k not in pl]
        for k in fermeture(cibles, pl, fusion):
            if k in seed.get('exclusions', {}):
                continue
            lot = reg['lots'].get(k) or {'key': k, 'platform': 'android', 'source': 'plan', 'features': []}
            if k in cibles and fid not in lot['features']:
                lot['features'] = lot['features'] + [fid]
            lot.setdefault('role', 'cible' if k in cibles else 'dependance')
            if k in cibles:
                lot['role'] = 'cible'
            reg['lots'][k] = lot
    for k, motif in seed.get('exclusions', {}).items():
        if k in reg['lots'] and reg['lots'][k].get('source') == 'plan':
            reg['lots'][k]['excluded'] = motif
    for drapeau, cles in (('sensible', seed.get('sensibles', [])), ('lourd', seed.get('lourds', []))):
        for k in cles:
            if k in reg['lots'] and reg['lots'][k].get('source') == 'plan':
                reg['lots'][k][drapeau] = True
    ecrire(run, reg)
    print(json.dumps({'lots': len(reg['lots']), 'inconnues': inconnues, 'plan': sorted(k for k, l in reg['lots'].items() if l['source'] == 'plan')}))


def valider(l, existants):
    err = [c for c in ('key', 'platform', 'title', 'goal', 'acceptance', 'tests', 'files') if not l.get(c)]
    if err:
        return f'champs manquants : {err}'
    if not CLE_RE.match(l['key']):
        return f'clé invalide : {l["key"]}'
    if l['platform'] not in PLATEFORMES:
        return f'plateforme invalide : {l["platform"]}'
    if l['key'] in existants and existants[l['key']].get('source') == 'plan':
        return f'{l["key"]} est un lot du plan : on ne le remplace pas'
    for c in ('acceptance', 'tests', 'files', 'ios_reference_files', 'deps', 'features'):
        if c in l and not isinstance(l[c], list):
            return f'{c} doit être une liste'
    return None


def deps_de(k, lots, pl):
    l = lots.get(k, {})
    base = l.get('deps', []) if l.get('source') != 'plan' else pl.get(k, {}).get('deps', [])
    return base + [d for d in l.get('deps_extra', []) if d not in base]


def cycle(lots, pl):
    etat = {}

    def deps(k):
        return deps_de(k, lots, pl) if k in lots else []

    def visite(k, pile):
        if etat.get(k) == 2:
            return None
        if etat.get(k) == 1:
            return pile + [k]
        etat[k] = 1
        for d in deps(k):
            c = visite(d, pile + [k])
            if c:
                return c
        etat[k] = 2
        return None
    for k in lots:
        c = visite(k, [])
        if c:
            return c
    return None


def cmd_add(run, fichier):
    reg = charger(run)
    data = json.load(open(fichier))
    data = data if isinstance(data, list) else [data]
    ajout, refus = [], []
    for l in data:
        e = valider(l, reg['lots'])
        if e:
            refus.append(e)
            continue
        lot = {c: l[c] for c in CHAMPS_LOT if c in l}
        lot.update({'source': 'cartographie', 'role': 'cible', 'sensible': bool(l.get('sensible')), 'lourd': bool(l.get('lourd')),
                    'deps': l.get('deps', []), 'features': l.get('features', []), 'ios_reference_files': l.get('ios_reference_files', [])})
        ancien = reg['lots'].get(l['key'], {})
        for c in ('issue', 'pr', 'statut_manuel', 'note', 'deps_extra'):
            if c in ancien:
                lot[c] = ancien[c]
        reg['lots'][l['key']] = lot
        ajout.append(l['key'])
    c = cycle(reg['lots'], plan(run))
    if c:
        print(json.dumps({'ajoutes': [], 'refus': refus + [f'cycle de dépendances : {" -> ".join(c)}']}))
        sys.exit(1)
    inconnues = sorted({d for k in ajout for d in reg['lots'][k]['deps'] if d not in reg['lots']})
    if inconnues:
        print(json.dumps({'ajoutes': [], 'refus': refus + [f'dépendances hors registre : {inconnues}']}))
        sys.exit(1)
    ecrire(run, reg)
    print(json.dumps({'ajoutes': ajout, 'refus': refus}))


def cmd_exclude(run, cle, motif):
    reg = charger(run)
    if cle not in reg['lots']:
        sys.exit(f'lot inconnu : {cle}')
    reg['lots'][cle]['excluded'] = motif
    ecrire(run, reg)
    print(json.dumps({'exclu': cle}))


def cmd_depend(run, cle, dep):
    reg = charger(run)
    if cle not in reg['lots'] or dep not in reg['lots']:
        sys.exit(f'lot inconnu : {cle} ou {dep}')
    lot = reg['lots'][cle]
    if dep not in lot.get('deps_extra', []):
        lot['deps_extra'] = lot.get('deps_extra', []) + [dep]
    c = cycle(reg['lots'], plan(run))
    if c:
        sys.exit(f'cycle de dépendances : {" -> ".join(c)}')
    ecrire(run, reg)
    print(json.dumps({cle: {'deps_extra': lot['deps_extra']}}))


def cmd_sans_fichiers(run, cle, fichiers):
    reg = charger(run)
    if cle not in reg['lots'] or not fichiers:
        sys.exit(f'lot inconnu ou aucun fichier : {cle}')
    reg['lots'][cle]['sans_fichiers'] = sorted(set(reg['lots'][cle].get('sans_fichiers', []) + fichiers))
    ecrire(run, reg)
    print(json.dumps({cle: {'sans_fichiers': reg['lots'][cle]['sans_fichiers']}}))


def cmd_criteres(run, cle, fichier):
    reg = charger(run)
    crit = json.load(open(fichier))
    if cle not in reg['lots'] or not isinstance(crit, list) or not all(isinstance(c, str) and c for c in crit):
        sys.exit(f'lot inconnu ou critères invalides : {cle}')
    reg['lots'][cle]['criteres_ajoutes'] = crit
    ecrire(run, reg)
    print(json.dumps({cle: {'criteres_ajoutes': len(crit)}}))


def cmd_plan_cible(run, cle, feature):
    reg = charger(run)
    pl = plan(run)
    if cle not in pl:
        sys.exit(f'lot absent du plan : {cle}')
    fusion, _ = fusionnees(run)
    for k in fermeture([cle], pl, fusion):
        lot = reg['lots'].get(k) or {'key': k, 'platform': 'android', 'source': 'plan', 'features': [], 'role': 'dependance'}
        if k == cle:
            lot['role'] = 'cible'
            lot['features'] = sorted(set(lot.get('features', []) + [feature]))
            lot.pop('excluded', None)
        reg['lots'][k] = lot
    ecrire(run, reg)
    print(json.dumps({'cible': cle, 'lots': len(reg['lots'])}))


def cmd_set(run, cle, champ, valeur):
    reg = charger(run)
    if cle not in reg['lots'] or champ not in ('issue', 'pr', 'note'):
        sys.exit(f'lot ou champ inconnu : {cle} {champ}')
    reg['lots'][cle][champ] = int(valeur) if champ in ('issue', 'pr') else valeur
    ecrire(run, reg)
    print(json.dumps({cle: {champ: reg['lots'][cle][champ]}}))


def cmd_mark(run, cle, etat):
    reg = charger(run)
    if cle not in reg['lots'] or etat not in ('satisfait', 'bloque', 'debloque', 'reprendre'):
        sys.exit(f'lot ou état inconnu : {cle} {etat}')
    if etat == 'debloque':
        reg['lots'][cle].pop('statut_manuel', None)
    else:
        reg['lots'][cle]['statut_manuel'] = etat
    ecrire(run, reg)
    if etat == 'satisfait':
        with open(f'{run}/satisfied.txt', 'a') as f:
            f.write(cle + '\n')
    print(json.dumps({cle: etat}))


def spec(run, cle, reg=None, pl=None):
    reg = reg or charger(run)
    pl = pl or plan(run)
    lot = reg['lots'].get(cle)
    if not lot:
        sys.exit(f'lot inconnu : {cle}')
    if lot['source'] == 'plan':
        p = pl[cle]
        s = {'key': cle, 'platform': 'android', 'source': 'plan', 'plan_track': p['plan_track'], 'title': p['title'], 'goal': p.get('goal', ''),
             'acceptance': p.get('acceptance', []), 'tests': p.get('tests', []), 'files': p.get('android_files_touched', []),
             'ios_reference_files': p.get('ios_reference_files', []), 'deps': p.get('deps', []), 'modules': p.get('android_modules', []),
             'effort': p.get('effort'), 'est_lines': p.get('est_kotlin_lines')}
    else:
        s = dict(lot)
    s.update({k: lot[k] for k in ('features', 'role', 'issue', 'pr', 'excluded', 'statut_manuel', 'note', 'sensible', 'lourd', 'deps_extra', 'criteres_ajoutes', 'sans_fichiers') if k in lot})
    s['deps'] = deps_de(cle, reg['lots'], pl)
    s['branch'] = branche(s['platform'], cle)
    return s


def heads_et_prs():
    ls = sh(f"git ls-remote {GH} 'refs/heads/claude/*' 'refs/pull/*/head'")
    heads, prs = {}, set()
    for line in ls.splitlines():
        sha, ref = (line.split('\t') + [''])[:2]
        if ref.startswith('refs/heads/'):
            heads[ref[len('refs/heads/'):]] = sha
        elif ref.startswith('refs/pull/'):
            prs.add(sha)
    return heads, prs


def lignee(gitdir, ref, n=5):
    """Âge du commit de tête, et messages des n derniers commits de la lignée PRINCIPALE (premier parent).

    Une branche resynchronisée porte en tête un commit de fusion de dev, dont le message n'a pas la signature de la session ;
    le second parent amène les commits d'autres sessions. Seule la lignée du premier parent dit qui écrit la branche."""
    ts = sh(f'git -C {gitdir} log -1 --format=%ct {ref}').strip()
    corps = sh(f'git -C {gitdir} log --first-parent -n {n} --format=%B%x01 {ref}')
    return (int(ts or 0), corps) if ts else None


def ages(run, branches):
    """Âge et lignée des branches, lus dans ages.git — un dépôt À PART : le fetch y est superficiel (--depth), ce que le
    registre des fusions ne doit jamais devenir."""
    if not branches:
        return {}
    url = sh(f'git -C {run}/ledger.git remote get-url origin').strip() or GH
    depot_nu(f'{run}/ages.git', url)
    specs = ' '.join(f'+refs/heads/{b}:refs/remotes/origin/{b}' for b in branches)
    subprocess.run(f'git -C {run}/ages.git fetch -q --filter=tree:0 --depth=6 origin {specs}', shell=True)
    out = {}
    for b in branches:
        l = lignee(f'{run}/ages.git', f'refs/remotes/origin/{b}')
        if l:
            out[b] = l
    return out


def evaluer(reg, pl, fusion, heads, prs, ages_, maintenant, inflight, trailer, stale_h, pr_stale_h, bloques):
    signatures = [t for t in (trailer or '').split('|') if t.strip()]
    est_nous = lambda corps: any(t in corps for t in signatures)
    lots = {k: l for k, l in reg['lots'].items() if not l.get('excluded')}
    fait = {k for k, l in lots.items() if branche(l['platform'], k) in fusion or l.get('statut_manuel') == 'satisfait'}
    fait |= {k for k in pl if branche('android', k) in fusion}

    def fichiers(k):
        exclus = set(lots.get(k, {}).get('sans_fichiers', []))
        if k in lots and lots[k]['source'] != 'plan':
            return {f for f in lots[k].get('files', []) if not SHARED.search(f) and f not in exclus}
        return {f for f in pl.get(k, {}).get('android_files_touched', []) if not SHARED.search(f) and f not in exclus}

    def vivant(b):
        if b not in heads:
            return False
        if heads[b] in prs:
            return True
        ts, corps = ages_.get(b, (0, ''))
        return (maintenant - ts) < stale_h * 3600 or est_nous(corps)

    autres_en_vol = [k for k in pl if k not in lots and branche('android', k) in heads and k not in fait and vivant(branche('android', k))]
    res = {}
    for k, l in lots.items():
        b = branche(l['platform'], k)
        ts, corps = ages_.get(b, (0, ''))
        age_h = round((maintenant - ts) / 3600, 1) if ts else None
        nous = est_nous(corps)
        deps = deps_de(k, lots, pl)
        manquantes = [d for d in deps if d not in fait]
        info = {'branch': b, 'platform': l['platform'], 'issue': l.get('issue'), 'pr': l.get('pr'), 'age_h': age_h, 'nous': nous, 'deps_manquantes': manquantes,
                'sensible': bool(l.get('sensible')), 'lourd': bool(l.get('lourd'))}
        if k in fait:
            etat = 'fusionne'
        elif l.get('statut_manuel') == 'bloque' or k in bloques:
            etat = 'bloque'
        elif k in inflight:
            etat = 'en-vol'
        elif b in heads and heads[b] in prs:
            etat = 'pr-nous' if nous else ('pr-a-reprendre' if age_h is not None and age_h >= pr_stale_h else 'tenu-ailleurs')
        elif b in heads and not nous and age_h is not None and age_h < stale_h:
            etat = 'tenu-ailleurs'
        elif manquantes:
            etat = 'attente'
        else:
            mes = fichiers(k)
            conflits = {x: sorted(mes & fichiers(x))[:3] for x in autres_en_vol if mes & fichiers(x)}
            conflits.update({x: sorted(mes & fichiers(x))[:3] for x in inflight if x != k and x in lots and mes & fichiers(x)})
            if conflits:
                etat, info['chevauchement'] = 'chevauchement', conflits
            else:
                etat = 'pret'
                info['reprise'] = b in heads
        info['etat'] = etat
        res[k] = info
    return res, fait


def cmd_status(run, a):
    reg = charger(run)
    pl = plan(run)
    fusion, tete = fusionnees(run)
    heads, prs = heads_et_prs()
    bloques = set(l.strip() for l in open(f'{run}/blocked.txt') if l.strip()) if os.path.exists(f'{run}/blocked.txt') else set()
    a_lire = sorted({branche(l['platform'], k) for k, l in reg['lots'].items() if branche(l['platform'], k) in heads}
                    | {branche('android', k) for k in pl if branche('android', k) in heads and branche('android', k) not in fusion})
    inflight = set(x for x in a.inflight.split(',') if x)
    res, _ = evaluer(reg, pl, fusion, heads, prs, ages(run, a_lire), int(time.time()), inflight, a.trailer, a.stale_hours, a.pr_stale_hours, bloques)
    ordre = sorted(res, key=lambda k: (0 if reg['lots'][k]['source'] == 'cartographie' and reg['lots'][k]['platform'] in ('partage', 'serveur') else 1,
                                       pl.get(k, {}).get('rank', 50)))
    par = lambda e: [k for k in ordre if res[k]['etat'] == e]
    print(json.dumps({'dev': tete, 'pret': par('pret'), 'attente': par('attente'), 'chevauchement': par('chevauchement'), 'tenu_ailleurs': par('tenu-ailleurs'),
                      'pr_nous': par('pr-nous'), 'pr_a_reprendre': par('pr-a-reprendre'), 'en_vol': par('en-vol'), 'bloque': par('bloque'),
                      'fusionne': par('fusionne'), 'exclus': sorted(k for k, l in reg['lots'].items() if l.get('excluded')),
                      'restants': len([k for k in res if res[k]['etat'] != 'fusionne']), 'lots': res}, ensure_ascii=False))


def cmd_export(run):
    reg = charger(run)
    out = {'features': reg.get('features', {}), 'lots': [l for l in reg['lots'].values() if l['source'] == 'cartographie'],
           'exclusions': {k: l['excluded'] for k, l in reg['lots'].items() if l.get('excluded')},
           'issues': {k: l['issue'] for k, l in reg['lots'].items() if l.get('issue')},
           'deps_extra': {k: l['deps_extra'] for k, l in reg['lots'].items() if l.get('deps_extra')},
           'criteres_ajoutes': {k: l['criteres_ajoutes'] for k, l in reg['lots'].items() if l.get('criteres_ajoutes')},
           'sans_fichiers': {k: l['sans_fichiers'] for k, l in reg['lots'].items() if l.get('sans_fichiers')},
           'drapeaux': {k: {d: True for d in ('sensible', 'lourd') if l.get(d)} for k, l in reg['lots'].items() if l['source'] == 'plan' and (l.get('sensible') or l.get('lourd'))},
           'plan_cibles': {k: l.get('features', []) for k, l in reg['lots'].items() if l['source'] == 'plan' and l.get('role') == 'cible'}}
    print(json.dumps(out, ensure_ascii=False, separators=(',', ':')))


def cmd_import(run, fichier):
    data = json.load(open(fichier))
    for k, fs in data.get('plan_cibles', {}).items():
        for f in fs or ['F0']:
            cmd_plan_cible(run, k, f)
    reg = charger(run)
    for l in data.get('lots', []):
        if valider(l, reg['lots']) is None:
            ancien = reg['lots'].get(l['key'], {})
            reg['lots'][l['key']] = dict(l, source='cartographie', **{c: ancien[c] for c in ('issue', 'pr', 'statut_manuel', 'note') if c in ancien and c not in l})
    for k, motif in data.get('exclusions', {}).items():
        if k in reg['lots']:
            reg['lots'][k]['excluded'] = motif
    for k, n in data.get('issues', {}).items():
        if k in reg['lots'] and not reg['lots'][k].get('issue'):
            reg['lots'][k]['issue'] = n
    for champ in ('deps_extra', 'criteres_ajoutes', 'sans_fichiers'):
        for k, v in data.get(champ, {}).items():
            if k in reg['lots']:
                reg['lots'][k][champ] = v
    for k, v in data.get('drapeaux', {}).items():
        if k in reg['lots']:
            reg['lots'][k].update(v)
    if cycle(reg['lots'], plan(run)):
        sys.exit('cycle de dépendances dans l import')
    ecrire(run, reg)
    print(json.dumps({'lots': len(reg['lots'])}))


def self_test():
    pl = {'a': {'key': 'a', 'deps': [], 'android_files_touched': ['x/A.kt'], 'rank': 1, 'plan_track': 'B'},
          'b': {'key': 'b', 'deps': ['a'], 'android_files_touched': ['x/B.kt'], 'rank': 2, 'plan_track': 'B'},
          'c': {'key': 'c', 'deps': [], 'android_files_touched': ['x/C.kt', 'x/strings.xml'], 'rank': 3, 'plan_track': 'B'},
          'z': {'key': 'z', 'deps': [], 'android_files_touched': ['x/C.kt'], 'rank': 9, 'plan_track': 'A'},
          'y': {'key': 'y', 'deps': [], 'android_files_touched': ['x/strings.xml'], 'rank': 9, 'plan_track': 'A'}}
    reg = {'lots': {
        'a': {'key': 'a', 'platform': 'android', 'source': 'plan'},
        'b': {'key': 'b', 'platform': 'android', 'source': 'plan'},
        'c': {'key': 'c', 'platform': 'android', 'source': 'plan'},
        'ios-x': {'key': 'ios-x', 'platform': 'ios', 'source': 'cartographie', 'deps': ['loi-x'], 'files': ['apps/ios/X.swift']},
        'loi-x': {'key': 'loi-x', 'platform': 'partage', 'source': 'cartographie', 'deps': [], 'files': ['packages/shared/x.ts']},
        'ios-y': {'key': 'ios-y', 'platform': 'ios', 'source': 'cartographie', 'deps': [], 'files': ['apps/ios/Y.swift']},
        'ios-w': {'key': 'ios-w', 'platform': 'ios', 'source': 'cartographie', 'deps': [], 'files': ['apps/ios/W.swift']},
        'old': {'key': 'old', 'platform': 'android', 'source': 'plan', 'excluded': 'hors demande'}}}
    pl['old'] = {'key': 'old', 'deps': [], 'android_files_touched': [], 'rank': 9, 'plan_track': 'B'}
    now = 1_000_000
    T = 'Claude-Session: https://claude.ai/code/session_X'
    heads = {'claude/android-z': 's1', 'claude/android-y': 's2', 'claude/ios-ios-y': 's3', 'claude/ios-ios-w': 's4'}
    ages_ = {'claude/android-z': (now - 600, 'feat'), 'claude/android-y': (now - 600, 'feat'), 'claude/ios-ios-y': (now - 20 * 3600, 'x\n' + T),
             'claude/ios-ios-w': (now - 600, 'autre session')}
    res, fait = evaluer(reg, pl, {'claude/android-a'}, heads, set(), ages_, now, set(), T, 6, 3, set())
    attendu = {'a': 'fusionne', 'b': 'pret', 'c': 'chevauchement', 'ios-x': 'attente', 'loi-x': 'pret', 'ios-y': 'pret', 'ios-w': 'tenu-ailleurs'}
    obtenu = {k: v['etat'] for k, v in res.items()}
    assert obtenu == attendu, obtenu
    assert 'old' not in res
    assert res['c']['chevauchement'] == {'z': ['x/C.kt']}, res['c']
    assert res['ios-y']['reprise'] is True and res['ios-y']['nous'] is True
    assert res['ios-x']['deps_manquantes'] == ['loi-x']
    assert res['b']['sensible'] is False and res['b']['lourd'] is False
    res2, _ = evaluer(reg, pl, {'claude/android-a', 'claude/partage-loi-x'}, heads, {'s4'}, ages_, now, {'b'}, T, 6, 3, set())
    assert res2['ios-x']['etat'] == 'pret' and res2['b']['etat'] == 'en-vol' and res2['ios-w']['etat'] == 'tenu-ailleurs', res2
    ages_['claude/ios-ios-w'] = (now - 5 * 3600, 'autre session')
    res3, _ = evaluer(reg, pl, {'claude/android-a'}, heads, {'s4'}, ages_, now, set(), T, 6, 3, set())
    assert res3['ios-w']['etat'] == 'pr-a-reprendre', res3['ios-w']
    ages_['claude/ios-ios-w'] = (now - 7 * 3600, 'autre session')
    res4, _ = evaluer(reg, pl, {'claude/android-a'}, heads, set(), ages_, now, set(), T, 6, 3, {'loi-x'})
    assert res4['ios-w']['etat'] == 'pret' and res4['ios-w']['reprise'] is True and res4['loi-x']['etat'] == 'bloque', res4
    assert cycle({'p': {'source': 'cartographie', 'deps': ['q']}, 'q': {'source': 'cartographie', 'deps': ['p']}}, {}) is not None
    assert cycle(reg['lots'], pl) is None
    assert valider({'key': 'Mauvaise Cle', 'platform': 'ios', 'title': 't', 'goal': 'g', 'acceptance': ['a'], 'tests': ['t'], 'files': ['f']}, {}) is not None
    assert valider({'key': 'bonne-cle', 'platform': 'ios', 'title': 't', 'goal': 'g', 'acceptance': ['a'], 'tests': ['t'], 'files': ['f']}, {}) is None
    assert valider({'key': 'a', 'platform': 'android', 'title': 't', 'goal': 'g', 'acceptance': ['a'], 'tests': ['t'], 'files': ['f']}, reg['lots']) is not None
    assert fermeture(['b'], pl, set()) == ['b', 'a'] and fermeture(['b'], pl, {'claude/android-a'}) == ['b']
    reg['lots']['c']['sans_fichiers'] = ['x/C.kt']
    res_sf, _ = evaluer(reg, pl, {'claude/android-a'}, heads, set(), ages_, now, set(), T, 6, 3, set())
    assert res_sf['c']['etat'] == 'pret', res_sf['c']
    del reg['lots']['c']['sans_fichiers']
    T2 = 'Claude-Session: https://claude.ai/code/session_NOUVELLE'
    res_t2, _ = evaluer(reg, pl, {'claude/android-a'}, heads, set(), ages_, now, set(), f'{T2}|{T}', 6, 3, set())
    assert res_t2['ios-y']['nous'] is True and res_t2['ios-w']['nous'] is False, res_t2
    reg['lots']['c']['deps_extra'] = ['loi-x']
    assert deps_de('c', reg['lots'], pl) == ['loi-x']
    res5, _ = evaluer(reg, pl, {'claude/android-a'}, heads, set(), ages_, now, set(), T, 6, 3, set())
    assert res5['c']['etat'] == 'attente' and res5['c']['deps_manquantes'] == ['loi-x'], res5['c']
    reg['lots']['loi-x']['deps_extra'] = ['c']
    assert cycle(reg['lots'], pl) is not None
    with tempfile.TemporaryDirectory() as g:
        env = 'GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t'
        sh(f'cd {g} && git init -q -b dev . && {env} git commit -q --allow-empty -m base && git checkout -q -b lot'
           f' && {env} git commit -q --allow-empty -m "feat: lot" -m "{T}" && git checkout -q dev'
           f' && {env} git commit -q --allow-empty -m "autre" -m "Claude-Session: https://claude.ai/code/session_AUTRE"'
           f' && git checkout -q lot && {env} git merge -q --no-edit dev')
        ts, corps = lignee(g, 'lot')
        assert ts > 0 and T in corps and 'session_AUTRE' not in corps, corps
        assert T not in sh(f'git -C {g} log -1 --format=%B lot'), 'la tête doit être le commit de fusion sans signature'
        for i in range(8):
            sh(f'cd {g} && git checkout -q dev && {env} git commit -q --allow-empty -m "dev {i}"')
        sh(f'cd {g} && git checkout -q dev && git branch -q -f claude/android-longue dev && git checkout -q lot && {env} git merge -q --no-edit dev'
           f' && git checkout -q dev && {env} git merge -q --no-ff --no-edit -m "Merge pull request #1 from isopen-io/claude/android-lot" lot')
        run = f'{g}/run'
        os.makedirs(run)
        sh(f'git init -q --bare {run}/ledger.git && git -C {run}/ledger.git remote add origin {g}')
        fusion, _ = fusionnees(run)
        assert 'claude/android-lot' in fusion, fusion
        a = ages(run, ['claude/android-longue', 'lot'])
        assert set(a) == {'claude/android-longue', 'lot'}, a
        assert not os.path.exists(f'{run}/ledger.git/shallow'), 'le registre des fusions est devenu superficiel'
        fusion2, _ = fusionnees(run)
        assert fusion2 == fusion
        sh(f'git -C {run}/ledger.git fetch -q --depth=2 origin +refs/heads/lot:refs/remotes/origin/lot')
        assert os.path.exists(f'{run}/ledger.git/shallow')
        fusion3, _ = fusionnees(run)
        assert 'claude/android-lot' in fusion3 and not os.path.exists(f'{run}/ledger.git/shallow'), 'le registre superficiel ne s est pas réparé'
    print('self-test vert')


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'self-test':
        return self_test()
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd')
    ap.add_argument('run')
    ap.add_argument('rest', nargs='*')
    ap.add_argument('--inflight', default='')
    ap.add_argument('--trailer', default='')
    ap.add_argument('--stale-hours', type=float, default=6)
    ap.add_argument('--pr-stale-hours', type=float, default=3)
    a = ap.parse_args()
    r = a.run.rstrip('/')
    {'init': lambda: cmd_init(r, a.rest[0]), 'add': lambda: cmd_add(r, a.rest[0]), 'exclude': lambda: cmd_exclude(r, a.rest[0], ' '.join(a.rest[1:])),
     'set': lambda: cmd_set(r, a.rest[0], a.rest[1], ' '.join(a.rest[2:])), 'mark': lambda: cmd_mark(r, a.rest[0], a.rest[1]),
     'depend': lambda: cmd_depend(r, a.rest[0], a.rest[1]), 'sans-fichiers': lambda: cmd_sans_fichiers(r, a.rest[0], a.rest[1:]), 'criteres': lambda: cmd_criteres(r, a.rest[0], a.rest[1]),
     'plan-cible': lambda: cmd_plan_cible(r, a.rest[0], a.rest[1]),
     'spec': lambda: print(json.dumps(spec(r, a.rest[0]), ensure_ascii=False)), 'status': lambda: cmd_status(r, a),
     'export': lambda: cmd_export(r), 'import': lambda: cmd_import(r, a.rest[0])}[a.cmd]()


if __name__ == '__main__':
    main()
