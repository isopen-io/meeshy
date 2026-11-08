import json, re, sys, pathlib
root = pathlib.Path(sys.argv[1])
net = root / 'apps/android/core/network'
api_dir = net / 'src/main/kotlin/me/meeshy/sdk/net/api'
routes_dir = net / 'src/main/kotlin/me/meeshy/sdk/net/routes'
verb_ann = re.compile(r'@(GET|POST|PUT|PATCH|DELETE|HEAD)\(\s*(?:"([^"]*)"|(ApiRoutes\w+\.\w+))\s*\)')
gen_obj = re.compile(r'object\s+(ApiRoutes\w+)')
gen_const = re.compile(r'const\s+val\s+(\w+)\s*:\s*String\s*=\s*"([^"]*)"')
http_ann = re.compile(r'@HTTP\(([^)]*)\)')
def code(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    return '\n'.join(re.sub(r'(^|\s)//.*$', r'\1', l) for l in s.split('\n'))
gen = {}
for f in routes_dir.iterdir():
    if f.is_file() and f.name.startswith('ApiRoutes'):
        t = f.read_text(); o = gen_obj.search(t)
        if o:
            for m in gen_const.finditer(t): gen[f"{o.group(1)}.{m.group(1)}"] = m.group(2)
declared = []
for f in sorted(api_dir.iterdir()):
    if not (f.is_file() and f.name.endswith('Api.kt')): continue
    t = code(f.read_text())
    for m in verb_ann.finditer(t):
        path = m.group(2) if not m.group(3) else gen[m.group(3)]
        declared.append((m.group(1), path))
    for m in http_ann.finditer(t):
        v = re.search(r'method\s*=\s*"([A-Za-z]+)"', m.group(1)); p = re.search(r'path\s*=\s*"([^"]*)"', m.group(1))
        if v and p: declared.append((v.group(1).upper(), p.group(1)))
def canon(p):
    return ['*' if (s.startswith('{') or s.startswith(':') or s == '*') else s for s in p.split('?')[0].strip('/').split('/')]
dc = [(v, canon('api/v1/' + p)) for v, p in declared]
def implemented(verb, path):
    seg = canon(path)
    return any(v == verb and len(w) == len(seg) and all(w[i] == '*' or w[i] == seg[i] for i in range(len(w))) for v, w in dc)
man = json.load(open(root / 'services/gateway/route-manifest.json'))['routes']
served = {f"{r['method'].upper()} {r['path']}": (r['method'].upper(), r['path']) for r in man}
ops = {f"{m.group(1).upper()} {m.group(2)}" for m in re.finditer(r"method:\s*'(\w+)',\s*path:\s*'([^']+)'", open(root / 'packages/shared/api/ops-only-routes.ts').read())}
cls = json.load(open(net / 'src/test/resources/route-classification.json'))
stale = []
for c in cls['categories']:
    for k in c['routes']:
        r = served.get(k)
        if r is None or k in ops or implemented(*r): stale.append((c['status'], k))
classified = {k for c in cls['categories'] for k in c['routes']}
unclassified = [k for k, r in served.items() if k not in ops and k not in classified and not implemented(*r)]
toport = sum(len(c['routes']) for c in cls['categories'] if c['status'] == 'a-porter')
ceiling = int(re.search(r'const val TO_PORT_CEILING = (\d+)', open(net / 'src/test/kotlin/me/meeshy/sdk/net/RouteManifestRatchetTest.kt').read()).group(1))
print('stale', len(stale)); [print('  ', s, k, '(absent du manifeste)' if k not in served else ('(ops)' if k in ops else '')) for s, k in stale]
print('unclassified', unclassified)
print('to-port', toport, 'ceiling', ceiling, 'to-port after removal', toport - sum(1 for s, _ in stale if s == 'a-porter'))
sys.exit(1 if (stale or unclassified or toport > ceiling) else 0)
