#!/usr/bin/env python3
"""Generate exhaustive, file-level coverage manifests per app.

Lists EVERY source file grouped by feature/domain, with a checkbox and a best-effort
"test exists today?" flag (stem-match heuristic). The routine verifies real coverage
per-file; this manifest just guarantees nothing is forgotten.
"""
import os, re, subprocess
from collections import defaultdict

ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"]).decode().strip()
OUT = os.path.join(ROOT, "tasks", "test-coverage-routine", "manifests")
os.makedirs(OUT, exist_ok=True)

def walk(base, exts, exclude_substr):
    out = []
    for dp, dns, fns in os.walk(base):
        if any(x in dp for x in exclude_substr):
            continue
        dns[:] = [d for d in dns if d not in (".next", "node_modules", "dist", "build", ".venv", "venv", "DerivedData")]
        for fn in fns:
            if any(fn.endswith(e) for e in exts):
                out.append(os.path.join(dp, fn))
    return out

def rel(p):
    return os.path.relpath(p, ROOT)

# ---- per-language test detection -------------------------------------------------
def ts_is_test(fn):
    return any(s in fn for s in (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
def ts_src_stem(fn):
    return re.sub(r"\.(ts|tsx)$", "", os.path.basename(fn))
def ts_test_stem(fn):
    return re.sub(r"\.(test|spec)\.(ts|tsx)$", "", os.path.basename(fn))

def py_is_test(fn):
    b = os.path.basename(fn)
    return b.startswith("test_") or b.endswith("_test.py")
def py_src_stem(fn):
    return re.sub(r"\.py$", "", os.path.basename(fn))
def py_test_stems(fn):
    b = re.sub(r"\.py$", "", os.path.basename(fn))
    b = re.sub(r"_test$", "", b)
    b = re.sub(r"^test_", "", b)
    stems = {b}
    stems.add(re.sub(r"^\d+_", "", b))  # strip leading "06_" numbering
    return stems

def swift_is_test(fn):
    b = os.path.basename(fn)
    return b.endswith("Tests.swift") or b.endswith("Test.swift") or "/Tests/" in fn or "Tests/" in fn
def swift_src_stem(fn):
    return re.sub(r"\.swift$", "", os.path.basename(fn))
def swift_test_stem(fn):
    return re.sub(r"Tests?\.swift$", "", os.path.basename(fn))

def kt_is_test(fn):
    return "/test/" in fn or "/androidTest/" in fn or os.path.basename(fn).endswith("Test.kt")
def kt_src_stem(fn):
    return re.sub(r"\.kt$", "", os.path.basename(fn))
def kt_test_stem(fn):
    return re.sub(r"Test\.kt$", "", os.path.basename(fn))

def domain_of(relpath, src_root, depth=2):
    """Group key = the file's DIRECTORY under the source root, capped at `depth` segments.
    Files directly under the root collapse to '(root)'; deeper files group by their dir."""
    sub = os.path.relpath(relpath, src_root)
    dirparts = os.path.dirname(sub).split(os.sep) if os.path.dirname(sub) else []
    dirparts = [p for p in dirparts if p]
    if not dirparts:
        return "(root)"
    return os.sep.join(dirparts[:depth])

def build(app_title, slug, src_root, exts, is_test, src_stem, test_stems_fn, depth=2,
          extra_excludes=(), test_roots=None):
    base = os.path.join(ROOT, src_root)
    # Sources: scan src_root, drop test files and test dirs.
    src_files = walk(base, exts, ("__tests__", "/test/", "/androidTest/", "/Tests/") + tuple(extra_excludes))
    srcs = [f for f in src_files if not is_test(f)]
    # Tests: scan dedicated test roots (do NOT exclude test dirs here).
    tests = []
    for tr in (test_roots or [src_root]):
        trbase = os.path.join(ROOT, tr)
        if os.path.isdir(trbase):
            tests += [f for f in walk(trbase, exts, tuple(extra_excludes)) if is_test(f)]
    tested = set()
    for t in tests:
        for s in test_stems_fn(t):
            tested.add(s)
    groups = defaultdict(list)
    for s in sorted(srcs):
        groups[domain_of(s, base, depth)].append(s)

    total = len(srcs)
    have = sum(1 for s in srcs if src_stem(s) in tested)
    lines = []
    lines.append(f"# Coverage Manifest — {app_title}")
    lines.append("")
    lines.append(f"> Exhaustive list of **every** source file, grouped by feature/domain. "
                 f"`[~]` = a same-named test exists today (heuristic — may be shallow); "
                 f"`[ ]` = no obvious test. The routine must bring each to **92% line+branch** "
                 f"and flip to `[x]` once reviewer-approved.")
    lines.append("")
    lines.append(f"- Source files: **{total}**")
    lines.append(f"- With a same-named test today (heuristic): **{have}** "
                 f"({0 if total==0 else round(100*have/total)}%)")
    lines.append(f"- Needing tests / verification: **{total-have}**")
    lines.append("")
    lines.append("Heuristic note: a `[~]` only means a similarly-named test file exists — it does "
                 "NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.")
    lines.append("")
    for g in sorted(groups):
        gfiles = groups[g]
        ghave = sum(1 for s in gfiles if src_stem(s) in tested)
        lines.append(f"## {g}  ({ghave}/{len(gfiles)} have a test)")
        lines.append("")
        for s in gfiles:
            mark = "~" if src_stem(s) in tested else " "
            lines.append(f"- [{mark}] `{rel(s)}`")
        lines.append("")
    path = os.path.join(OUT, f"{slug}.md")
    with open(path, "w") as fh:
        fh.write("\n".join(lines))
    return slug, total, have

results = []
results.append(build("Gateway (Fastify)", "gateway", "services/gateway/src",
                     (".ts",), ts_is_test, ts_src_stem, lambda f: {ts_test_stem(f)}, depth=2,
                     test_roots=["services/gateway/src"]))
results.append(build("Translator (FastAPI/ML)", "translator", "services/translator/src",
                     (".py",), py_is_test, py_src_stem, py_test_stems, depth=2,
                     test_roots=["services/translator/src/tests", "services/translator/tests"]))
results.append(build("Web (Next.js)", "web", "apps/web",
                     (".ts", ".tsx"), ts_is_test, ts_src_stem, lambda f: {ts_test_stem(f)}, depth=2,
                     extra_excludes=("/.next/", "/coverage/"), test_roots=["apps/web"]))
results.append(build("iOS app (SwiftUI)", "ios", "apps/ios/Meeshy",
                     (".swift",), swift_is_test, swift_src_stem, lambda f: {swift_test_stem(f)}, depth=3,
                     test_roots=["apps/ios/MeeshyTests", "apps/ios/MeeshyUITests"]))
results.append(build("Android app (Kotlin)", "android", "apps/android",
                     (".kt",), kt_is_test, kt_src_stem, lambda f: {kt_test_stem(f)}, depth=3,
                     extra_excludes=("/build/",), test_roots=["apps/android"]))
results.append(build("Shared package (TS)", "shared", "packages/shared",
                     (".ts",), ts_is_test, lambda f: re.sub(r"\.ts$","",os.path.basename(f)),
                     lambda f: {ts_test_stem(f)}, depth=2,
                     extra_excludes=("/dist/", "/node_modules/"), test_roots=["packages/shared/__tests__"]))
results.append(build("MeeshySDK (Swift)", "sdk-swift", "packages/MeeshySDK/Sources",
                     (".swift",), swift_is_test, swift_src_stem, lambda f: {swift_test_stem(f)}, depth=3,
                     test_roots=["packages/MeeshySDK/Tests"]))

# iOS/SDK/web swift+ts tests often live in sibling Tests dirs; fold those in for accuracy
print("slug | source | has-test(heuristic)")
for slug, total, have in results:
    print(f"{slug:11} | {total:5} | {have}")
