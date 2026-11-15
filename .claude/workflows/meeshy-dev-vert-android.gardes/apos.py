import re, sys, pathlib
root = pathlib.Path(sys.argv[1]); bad = []
for p in root.rglob('src/main/res/values*/*.xml'):
    if 'build' in p.parts: continue
    s = p.read_text(encoding='utf-8', errors='ignore')
    for m in re.finditer(r'<(string|item)\b([^>]*)>(.*?)</\1>', s, re.S):
        attrs, body = m.group(2), m.group(3)
        if body.startswith('"') and body.endswith('"'): continue
        if '<![CDATA[' in body: continue
        txt = re.sub(r'<[^>]+>', '', body)
        if re.search(r"(?<!\\)'", txt):
            bad.append(f"{p}:{s[:m.start()].count(chr(10))+1}: unescaped apostrophe: {txt[:60]}")
print('\n'.join(bad) if bad else 'apostrophes clean')
sys.exit(1 if bad else 0)
