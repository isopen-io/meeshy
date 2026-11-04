import re, sys, pathlib
root = pathlib.Path(sys.argv[1])
DELEG = re.compile(r'\b(val|var)\s+\w+(\s*:\s*[\w<>?, .]+)?\s+by\s+(remember\w*\s*[({]|mutable\w*StateOf|\w[\w.]*\.collectAs\w*\(|collectAs\w*\(|animate\w*As\w*\(|produceState|derivedStateOf|rememberUpdatedState|\w+\.observeAsState)')
issues = []
for p in root.rglob('*.kt'):
    s = p.read_text(encoding='utf-8', errors='ignore')
    imports = set(re.findall(r'^import\s+([\w.*]+)', s, re.M))
    star = 'androidx.compose.runtime.*' in imports
    for m in DELEG.finditer(s):
        line = s[:m.start()].count('\n') + 1
        kind = m.group(1)
        if not star and 'androidx.compose.runtime.getValue' not in imports:
            issues.append(f"{p}:{line}: delegate without import androidx.compose.runtime.getValue")
            break
    for m in re.finditer(r'\bvar\s+\w+(\s*:\s*[\w<>?, .]+)?\s+by\s+(remember\w*\s*[({]|mutable\w*StateOf)', s):
        if not star and 'androidx.compose.runtime.setValue' not in imports:
            line = s[:m.start()].count('\n') + 1
            issues.append(f"{p}:{line}: var delegate without import androidx.compose.runtime.setValue")
            break
    chm = set(re.findall(r'(?:val|var)\s+(\w+)\s*(?::\s*ConcurrentHashMap<[^>]*>)?\s*=\s*ConcurrentHashMap\s*[<(]', s)) | set(re.findall(r'(?:val|var)\s+(\w+)\s*:\s*ConcurrentHashMap<', s))
    for name in chm:
        for m in re.finditer(r'(!in|\bin)\s+' + re.escape(name) + r'\b(?!\.)', s):
            ctx = s[max(0, m.start()-40):m.start()]
            if re.search(r'for\s*\([^)]*$', ctx): continue
            line = s[:m.start()].count('\n') + 1
            issues.append(f"{p}:{line}: '{m.group(1)}' on ConcurrentHashMap {name} (KT-18053)")
print('\n'.join(issues) if issues else 'delegates clean')
expr_return = re.compile(r'^\s*(?:(?:private|internal|public|override|protected|inline|suspend|operator|infix)\s+)*fun [^{\n]*\)\s*(?::\s*[^={\n]+)?=[^{\n]*\breturn\b', re.M)
bad = []
for p in root.rglob('*.kt'):
    if 'build' in p.parts: continue
    s = p.read_text(encoding='utf-8', errors='ignore')
    for m in expr_return.finditer(s):
        bad.append(f"{p}:{s[:m.start()].count(chr(10))+1}: return in expression body")
print('\n'.join(bad) if bad else 'expr-return clean')
clash = []
owner_re = re.compile(r'^( *)(?:[a-z]+\s+)*(?:class|object|interface)\s+(\w+)', re.M)
def owner(src, pos, ind):
    best = None
    for m in owner_re.finditer(src, 0, pos):
        if len(m.group(1)) == ind - 4: best = (m.start(), m.group(2))
    return best
for p in root.rglob('*.kt'):
    if 'build' in p.parts: continue
    s = p.read_text(encoding='utf-8', errors='ignore')
    props = {}
    for m in re.finditer(r'^( *)((?:(?:private|internal|public|protected|override|open|lateinit)\s+)*)(va[lr])\s+(\w+)\b([^\n]*)', s, re.M):
        prev = s[max(0, s.rfind('\n', 0, max(0, m.start() - 1)) + 1):m.start()]
        if '@set:JvmName' in prev or '@get:JvmName' in prev or '@JvmName' in m.group(5): continue
        private = 'private' in m.group(2)
        delegated = re.search(r'\bby\b', m.group(5)) is not None
        if private and not delegated: continue
        ind = len(m.group(1))
        tm = re.match(r'\s*:\s*([^=]+?)\s*(?:=|by\b|$)', m.group(5))
        ptype = tm.group(1).strip() if tm else None
        props.setdefault((ind, m.group(4), owner(s, m.start(), ind)), set()).add((m.group(3), ptype))
    for m in re.finditer(r'^( *)((?:(?:private|internal|public|protected|override|open|suspend|inline)\s+)*)fun\s+(set|get)([A-Z]\w*)\s*\(([^)]*)\)', s, re.M):
        if 'suspend' in m.group(2): continue
        ind, kind, name, params = len(m.group(1)), m.group(3), m.group(4), m.group(5).strip()
        prop = name[0].lower() + name[1:]
        entries = props.get((ind, prop, owner(s, m.start(), ind)), set())
        param_type = params.split(':', 1)[1].strip() if ':' in params else None
        kinds = {k for k, t in entries if kind == 'get' or t is None or param_type is None or t == param_type}
        if kind == 'set' and 'var' in kinds and params and ',' not in params:
            clash.append(f"{p}:{s[:m.start()].count(chr(10))+1}: fun set{name} clashes with var {prop}")
        if kind == 'get' and kinds and not params:
            clash.append(f"{p}:{s[:m.start()].count(chr(10))+1}: fun get{name}() clashes with property {prop}")
print('\n'.join(clash) if clash else 'jvm-clash clean')
sys.exit(1 if (issues or bad or clash) else 0)
