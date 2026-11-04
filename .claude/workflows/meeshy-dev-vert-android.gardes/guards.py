import glob
import json
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'apps/android'
os.chdir(ROOT)

MEMBER_IMPORTS = {'onNode', 'onAllNodes', 'assertExists', 'assertDoesNotExist', 'fetchSemanticsNode',
                  'fetchSemanticsNodes', 'waitForIdle', 'waitUntil'}


def kotlin_files():
    for r, ds, fs in os.walk('.'):
        ds[:] = [d for d in ds if d not in ('build', '.gradle', '.git')]
        for f in fs:
            if f.endswith('.kt'):
                yield os.path.relpath(os.path.join(r, f), '.')


def unclosed_comment(s):
    i, n, depth = 0, len(s), 0
    while i < n:
        if depth == 0:
            if s.startswith('//', i):
                j = s.find('\n', i)
                i = n if j < 0 else j
                continue
            if s.startswith('"""', i):
                j = s.find('"""', i + 3)
                i = n if j < 0 else j + 3
                continue
            if s[i] == '"':
                j = i + 1
                while j < n and s[j] not in '"\n':
                    j += 2 if s[j] == '\\' else 1
                i = j + 1
                continue
            if s[i] == "'":
                m = re.match(r"'(\\.|[^'\\])'", s[i:i + 4])
                if m:
                    i += len(m.group(0))
                    continue
            if s.startswith('/*', i):
                depth, i = 1, i + 2
                continue
        else:
            if s.startswith('/*', i):
                depth, i = depth + 1, i + 2
                continue
            if s.startswith('*/', i):
                depth, i = depth - 1, i + 2
                continue
        i += 1
    return depth > 0


problems = []
baseline = {l.strip() for l in open('sdk-ui/src/test/resources/icons/direct-icon-usage-baseline.txt')
            if l.strip() and not l.startswith('#')}
direct = set()
for p in kotlin_files():
    s = open(p, encoding='utf-8', errors='replace').read()
    if not p.startswith('sdk-ui/src/main/kotlin/me/meeshy/ui/icons/') and \
            re.search(r'^import androidx\.compose\.material\.icons\.', s, re.M):
        direct.add(p)
    for i, line in enumerate(s.split('\n'), 1):
        m = re.search(r'fun\s+`([^`]*)`', line)
        if m and re.search(r'[.;:/\[\]<>\\]', m.group(1)):
            problems.append(f'illegal test name {p}:{i}: {m.group(1)[:80]}')
        m = re.match(r'import androidx\.compose\.ui\.test\.(\w+)\s*$', line)
        if m and m.group(1) in MEMBER_IMPORTS:
            problems.append(f'member import {p}:{i}: {line.strip()}')
    if unclosed_comment(s):
        problems.append(f'unclosed comment {p}')
if direct - baseline:
    problems.append(f'icons new direct imports: {sorted(direct - baseline)}')
if len(direct) > len(baseline):
    problems.append(f'icons ratchet {len(direct)} > {len(baseline)}')

modules = {}
for f in glob.glob('i18n/manifest/*.json') + glob.glob('i18n/manifest/*.d/*.json'):
    doc = json.load(open(f))
    for name, mod in doc['modules'].items():
        entry = modules.setdefault(name, {'res': mod['resDir'], 'names': []})
        for e in mod['entries']:
            entry['names'].append(e.get('androidName') or re.sub(r'[.-]', '_', e['iosKey']))
for name, mod in modules.items():
    hand = set()
    for x in glob.glob(mod['res'] + '/values/*.xml'):
        if os.path.basename(x) == 'strings_generated.xml':
            continue
        hand |= set(re.findall(r'<(?:string|plurals|string-array)\s+name="([^"]+)"', open(x).read()))
    orphans = sorted(hand - set(mod['names']))
    dups = sorted({n for n in mod['names'] if mod['names'].count(n) > 1})
    if orphans:
        problems.append(f'manifest orphans {name}: {orphans}')
    if dups:
        problems.append(f'manifest dups {name}: {dups}')

print(f'icons {len(direct)}/{len(baseline)}')
print('\n'.join(problems) if problems else 'all guards clean')
sys.exit(1 if problems else 0)
