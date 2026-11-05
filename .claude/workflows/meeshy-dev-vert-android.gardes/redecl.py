import re, sys, pathlib, collections
root = pathlib.Path(sys.argv[1])
decl = re.compile(r'^(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:public|internal|private|protected|sealed|data|enum|annotation|abstract|open|inline|value|fun|expect|actual)\s+)*(class|interface|object|typealias)\s+(\w+)', re.M)
seen = collections.defaultdict(list)
for p in root.rglob('*.kt'):
    parts = p.parts
    if 'build' in parts: continue
    s = p.read_text(encoding='utf-8', errors='ignore')
    m = re.search(r'^package\s+([\w.]+)', s, re.M)
    pkg = m.group(1) if m else ''
    src = 'test' if '/src/test/' in str(p) or '/src/androidTest/' in str(p) else 'main'
    for d in decl.finditer(s):
        line_start = s.rfind('\n', 0, d.start()) + 1
        if s[line_start:d.start()].strip(): continue
        if re.match(r'\s', s[line_start:line_start+1] or 'x'): continue
        if 'private ' in d.group(0): continue
        seen[(src, pkg, d.group(2))].append(str(p))
dups = {k: v for k, v in seen.items() if len(set(v)) > 1 or len(v) > 1}
for (src, pkg, name), files in sorted(dups.items()):
    print(f"{src} {pkg}.{name}: " + ", ".join(sorted(set(files))) + (f" (x{len(files)})" if len(set(files)) == 1 else ""))
print("redecl clean" if not dups else f"{len(dups)} duplicates")
sys.exit(1 if dups else 0)
