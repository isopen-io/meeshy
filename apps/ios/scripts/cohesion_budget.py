#!/usr/bin/env python3
"""Cliquet de COHÉSION des sources Swift écrites à la main (#10988).

Deux mesures, aucune ne dépend du nombre de lignes d'un FICHIER :
  (a) la longueur de chaque fonction (func, init, deinit, subscript, accesseur) ;
  (b) la taille d'un type EN UNITÉ : sa déclaration + toutes ses `extension`
      du même module. `Type+X.swift` ne décompose rien : le type reste un seul.

Le fichier de référence `cohesion-budget.json` liste les contrevenants ACTUELS
avec leur valeur. Le mode normal échoue sur un nouveau contrevenant ou sur un
contrevenant qui grossit ; il ne fait que signaler ceux qui baissent.
"""
import json
import re
import sys
from pathlib import Path

FUNCTION_LIMIT = 80
TYPE_LIMIT = 1500
ROOT = Path(__file__).resolve().parents[3]
BASELINE = Path(__file__).resolve().parent / "cohesion-budget.json"
SCOPE = ("apps/ios/Meeshy", "apps/ios/MeeshyNotificationExtension", "packages/MeeshySDK/Sources")


def strip_source(src):
    """Retire commentaires et littéraux de chaîne ; conserve le nombre de lignes."""
    out, i, n = [], 0, len(src)

    def skip_string(i, hashes, multiline):
        quote = '"""' if multiline else '"'
        end_tok = quote + "#" * hashes
        esc = "\\" + "#" * hashes
        while i < n:
            if src.startswith(end_tok, i):
                return i + len(end_tok)
            if src.startswith(esc, i):
                i += len(esc)
                if i < n and src[i] == "(":
                    i = skip_interp(i)
                else:
                    i += 1
                continue
            if not multiline and src[i] == "\n":
                return i
            i += 1
        return i

    def skip_interp(i):
        depth = 0
        while i < n:
            c = src[i]
            if c == '"':
                i = skip_string(i + 1, 0, src.startswith('"""', i))
                continue
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        return i

    raw = re.compile(r'#+"')
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            while i < n and src[i] != "\n":
                i += 1
        elif src.startswith("/*", i):
            depth = 0
            while i < n:
                if src.startswith("/*", i):
                    depth += 1
                    i += 2
                elif src.startswith("*/", i):
                    depth -= 1
                    i += 2
                    if depth == 0:
                        break
                else:
                    if src[i] == "\n":
                        out.append("\n")
                    i += 1
        elif c == '"' or (c == "#" and raw.match(src, i)):
            hashes = 0
            j = i
            while src[j] == "#":
                hashes += 1
                j += 1
            multiline = src.startswith('"""', j)
            start = j + (3 if multiline else 1)
            end = skip_string(start, hashes, multiline)
            out.append('""' + "\n" * src.count("\n", i, end))
            i = end
        else:
            out.append(c)
            i += 1
    return "".join(out)


MODS = r"(?:(?:public|private|fileprivate|internal|open|package|static|class|final|override|mutating|nonmutating|convenience|required|lazy|weak|unowned|nonisolated|indirect|dynamic|optional|distributed)(?:\([a-z]+\))?\s+)*"
ATTRS = r"(?:@[\w.]+(?:\([^)]*\))?\s+)*"
DECL = re.compile(r"^\s*" + ATTRS + MODS + r"(func|var|let|init|deinit|subscript|case|typealias|struct|class|enum|actor|extension|protocol)\b")
TYPE_DECL = re.compile(r"^\s*" + ATTRS + MODS + r"(struct|class|enum|actor|extension|protocol)\s+([A-Za-z_][\w.]*)")
FUNC_DECL = re.compile(r"^\s*" + ATTRS + MODS + r"(?:func\s+([^\s(<]+)|(init)\s*[?!]?\s*[(<]|(deinit)\b|(subscript)\s*[(<])")
VAR_DECL = re.compile(r"^\s*" + ATTRS + MODS + r"var\s+([A-Za-z_]\w*)\s*:")
OBSERVER = re.compile(r"^\s*(didSet|willSet)\b[^{]*\{")
ACCESSOR = re.compile(r"^\s*(get|set)\b[^{]*\{")
NOT_TYPE_NAMES = {"func", "var", "let", "init", "subscript", "typealias"}


def find_body(text, pos, stop_at_equal):
    """Position de l'accolade ouvrante du corps, ou None si la déclaration n'en a pas."""
    depth, i, n = 0, pos, len(text)
    while i < n:
        c = text[i]
        if c in "([":
            depth += 1
        elif c in ")]":
            depth -= 1
        elif depth <= 0:
            if c == "{":
                return i
            if c == "}" or c == ";" or (stop_at_equal and c == "="):
                return None
            if c == "\n":
                j = text.find("\n", i + 1)
                nxt = text[i + 1:j if j >= 0 else n]
                if nxt.strip() and DECL.match(nxt):
                    return None
        i += 1
    return None


def measure(src):
    """Rend (fonctions, types) : liste de (nom, nb_lignes) et de (nom_de_tête, nb_lignes)."""
    text = strip_source(src)
    lines = text.split("\n")
    offsets, total = [], 0
    for line in lines:
        offsets.append(total)
        total += len(line) + 1
    kinds = {}
    stack = []
    functions, types = [], []
    for ln, line in enumerate(lines):
        base = offsets[ln]
        enclosing = stack[-1] if stack else ("top",)
        in_protocol = any(k[0] == "type" and k[1] == "protocol" for k in stack)
        m = TYPE_DECL.match(line)
        if m and m.group(2) not in NOT_TYPE_NAMES:
            body = find_body(text, base + m.end(), False)
            if body is not None:
                kinds[body] = ("type", m.group(1), m.group(2), ln)
        elif not in_protocol:
            fm = FUNC_DECL.match(line)
            vm = VAR_DECL.match(line)
            om = OBSERVER.match(line)
            am = ACCESSOR.match(line) if enclosing[0] == "var" else None
            if fm:
                name = fm.group(1) or fm.group(2) or fm.group(3) or fm.group(4)
                body = find_body(text, base + fm.end(), False)
                if body is not None:
                    kinds[body] = ("func", name, ln)
            elif vm and enclosing[0] == "type":
                body = find_body(text, base + vm.end(), True)
                if body is not None:
                    kinds[body] = ("var", vm.group(1), ln)
            elif om or am:
                acc = (om or am).group(1)
                owner = enclosing[1] if enclosing[0] == "var" else ""
                body = base + (om or am).end() - 1
                kinds[body] = ("func", (owner + "." if owner else "") + acc, ln)
        for col, c in enumerate(line):
            if c == "{":
                stack.append(kinds.get(base + col, ("other",)) + (base + col,))
            elif c == "}" and stack:
                top = stack.pop()
                if top[0] == "func" or top[0] == "var":
                    owner = next((k[2] for k in reversed(stack) if k[0] == "type"), "")
                    functions.append(((owner + "." if owner else "") + top[1], ln - top[-2] + 1))
                elif top[0] == "type" and not stack:
                    types.append((top[2].split(".")[0], ln - top[-2] + 1))
    return functions, types


def module_of(rel):
    parts = rel.split("/")
    if rel.startswith("packages/MeeshySDK/Sources/"):
        return parts[3]
    return parts[2]


def in_scope(path, rel):
    parts = rel.split("/")
    if any(p in ("Tests", "Test") or p.endswith("Tests") or p.startswith("MeeshyTestSupport") for p in parts):
        return False
    head = "\n".join(path.read_text(encoding="utf-8", errors="replace").split("\n")[:12]).upper()
    return "GÉNÉRÉ" not in head and "GENERATED" not in head


def aggregate(files):
    """files : liste de (chemin_relatif, source). Rend (fonctions, types) en dict clé -> valeur."""
    functions, types, seen = {}, {}, {}
    for rel, src in files:
        funcs, tps = measure(src)
        for name, size in funcs:
            k = f"{rel}::{name}"
            seen[k] = seen.get(k, 0) + 1
            if seen[k] > 1:
                k = f"{k}#{seen[k]}"
            if size > FUNCTION_LIMIT:
                functions[k] = size
        for name, size in tps:
            k = f"{module_of(rel)}::{name}"
            types[k] = types.get(k, 0) + size
    return functions, {k: v for k, v in types.items() if v > TYPE_LIMIT}


def collect():
    files = []
    for scope in SCOPE:
        for path in sorted((ROOT / scope).rglob("*.swift")):
            rel = path.relative_to(ROOT).as_posix()
            if in_scope(path, rel):
                files.append((rel, path.read_text(encoding="utf-8", errors="replace")))
    return files


def compare(current, baseline, label):
    errors, infos = [], []
    for key, value in sorted(current.items()):
        old = baseline.get(key)
        if old is None:
            errors.append(f"  NOUVEAU {label} : {key} = {value}")
        elif value > old:
            errors.append(f"  EN HAUSSE {label} : {key} {old} -> {value}")
        elif value < old:
            infos.append(f"  en baisse {label} : {key} {old} -> {value}")
    infos += [f"  disparu {label} : {k} (était {v})" for k, v in sorted(baseline.items()) if k not in current]
    return errors, infos


def worst(title, data, limit, count):
    print(f"{title} : {len(data)} contrevenant(s) au-dessus de {limit}")
    for key, value in sorted(data.items(), key=lambda kv: (-kv[1], kv[0]))[:count]:
        print(f"  {value:6d}  {key}")


def self_test():
    long_fn = "func big() {\n" + "    let x = 1\n" * 90 + "}\n"
    fixture = (
        'struct A {\n  let s = "}}} {"\n  let t = """\n  { { {\n  """\n  // }}}\n'
        + "".join("  " + l + "\n" for l in long_fn.split("\n") if l)
        + "  var small: Int { 1 }\n}\n"
        "extension A {\n  func f() {}\n  var b: Int {\n    get { 1 }\n  }\n}\n"
        "protocol P { func g() }\n"
    )
    funcs, tps = measure(fixture)
    names = dict(funcs)
    assert names.get("A.big") == 92, names
    assert names.get("A.small") == 1 and names.get("A.f") == 1 and "A.b" in names, names
    assert "A.b.get" in names and "P.g" not in names, names
    assert [t for t in tps if t[0] == "A"] and sum(s for n, s in tps if n == "A") == 106, tps
    errors, infos = compare({"x::f": 91, "y::g": 81}, {"x::f": 90, "z::h": 85}, "fonction")
    assert len(errors) == 2 and len(infos) == 1, (errors, infos)
    errors, infos = compare({"x::f": 85}, {"x::f": 90}, "fonction")
    assert not errors and len(infos) == 1
    print("cohesion_budget: auto-test OK")


def main(argv):
    if "--self-test" in argv:
        self_test()
        return 0
    functions, types = aggregate(collect())
    top = int(argv[argv.index("--top") + 1]) if "--top" in argv else 0
    if "--report" in argv:
        top = top or 10
    if "--write-baseline" in argv:
        data = {"seuils": {"fonction": FUNCTION_LIMIT, "type": TYPE_LIMIT}, "fonctions": functions, "types": types}
        BASELINE.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"cohesion_budget: référence écrite ({len(functions)} fonctions, {len(types)} types).")
        return 0
    if top:
        worst("Fonctions", functions, FUNCTION_LIMIT, top)
        worst("Types (unité)", types, TYPE_LIMIT, top)
    print(f"cohesion_budget: {len(functions)} fonctions > {FUNCTION_LIMIT} lignes, {len(types)} types > {TYPE_LIMIT} lignes (unité).")
    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    fe, fi = compare(functions, base["fonctions"], "fonction")
    te, ti = compare(types, base["types"], "type")
    if fi or ti:
        print("cohesion_budget: des contrevenants ont baissé ou disparu — relancer `--write-baseline` dans le même commit pour verrouiller le gain :")
        print("\n".join(fi + ti))
    if fe or te:
        print("cohesion_budget: la cohésion RÉGRESSE —", file=sys.stderr)
        print("\n".join(fe + te), file=sys.stderr)
        print("Corriger : extraire de vrais types cohésifs / sous-fonctions (une fonction <= 80 lignes, un type <= 1 500 lignes"
              " en unité, déclaration + extensions). Ne pas relever la référence pour contourner.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
