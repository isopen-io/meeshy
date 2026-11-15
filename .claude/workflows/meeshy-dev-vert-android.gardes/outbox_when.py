import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else 'apps/android'
enum_src = None
for r, ds, fs in os.walk(root):
    ds[:] = [d for d in ds if d not in ('build', '.gradle')]
    for f in fs:
        if f.endswith('.kt'):
            t = open(os.path.join(r, f), encoding='utf-8').read()
            m = re.search(r'enum class OutboxKind[^{]*\{(.*?)(;|\n\})', t, re.S)
            if m:
                enum_src = m.group(1)
if enum_src is None:
    print('outbox: enum OutboxKind introuvable')
    sys.exit(1)
kinds = set(re.findall(r'^\s*([A-Z][A-Z0-9_]+)\b', enum_src, re.M))
gaps = []
for r, ds, fs in os.walk(root):
    ds[:] = [d for d in ds if d not in ('build', '.gradle')]
    if '/src/test' in r:
        continue
    for f in fs:
        if not f.endswith('.kt'):
            continue
        p = os.path.join(r, f)
        t = open(p, encoding='utf-8').read()
        for wm in re.finditer(r'when\s*\(([^)]*)\)\s*\{', t):
            i, depth = wm.end(), 1
            while depth and i < len(t):
                depth += t[i] == '{'
                depth -= t[i] == '}'
                i += 1
            body = t[wm.end():i]
            used = set(re.findall(r'OutboxKind\.([A-Z][A-Z0-9_]+)', body))
            if not used or re.search(r'^\s*else\s*->', body, re.M):
                continue
            missing = sorted(kinds - used)
            if missing and len(used) * 2 > len(kinds):
                gaps.append(f'{p}:{t[:wm.start()].count(chr(10)) + 1}: when sans else oublie {missing}')
print(f'outbox kinds {len(kinds)}')
print('\n'.join(gaps) if gaps else 'outbox when clean')
sys.exit(1 if gaps else 0)
