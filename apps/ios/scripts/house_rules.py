#!/usr/bin/env python3
"""Cliquets des règles maison sur les sources Swift écrites à la main (#11046)."""
import argparse
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path
from dataclasses import dataclass
from typing import Literal

ROOT = Path(__file__).resolve().parents[3]
BASELINE = Path(__file__).resolve().parent / "house-rules-baseline.json"
BASELINE_VERSION = 1
TOP_FILES = 5
REPORT_FILES = 10
TOKEN = re.compile(r'//|/\*|#*"')


@dataclass(frozen=True)
class Rule:
    id: str
    pattern: re.Pattern
    kind: Literal["pattern", "unchecked", "floor"] = "pattern"
    excluded: tuple = ()


def _pattern(rule_id, regex, excluded=()):
    return Rule(rule_id, re.compile(regex), "pattern", excluded)


RULES = (
    _pattern("uiscreen-main", r"UIScreen\.main\b"),
    _pattern("nslock", r"\bNSLock\(\)"),
    _pattern("nonisolated-unsafe", r"nonisolated\(unsafe\)"),
    _pattern("try-sleep", r"try\?\s*await\s+Task\.sleep"),
    _pattern(
        "logger-subsystem",
        r"\bLogger\(subsystem:",
        ("packages/MeeshySDK/Sources/MeeshySDK/Logging/MeeshyLog.swift",),
    ),
    _pattern("nslog", r"\bNSLog\("),
    _pattern("fixed-font", r"\.font\(\.system\(size:"),
    _pattern("anyview", r"\bAnyView\("),
    _pattern(
        "idiom",
        r"\buserInterfaceIdiom\b",
        ("apps/ios/Meeshy/Features/Main/Services/SocialEventsV2Reporter.swift",),
    ),
    _pattern("plural-s", r'\?\s*"s"\s*:\s*""'),
    Rule("unchecked-sendable", re.compile(r"@unchecked\s+Sendable"), "unchecked"),
    Rule("available-floor", re.compile(r"#available\(\s*iOS\s+(\d+)(?:\.(\d+))?"), "floor"),
)

SCOPE = (
    "apps/ios/Meeshy",
    "apps/ios/MeeshyNotificationExtension",
    "apps/ios/MeeshyWidgets",
    "apps/ios/MeeshyShareExtension",
    "apps/ios/MeeshyBroadcastExtension",
    "packages/MeeshySDK/Sources",
)
FLOORS = (("apps/ios/MeeshyWidgets/", (17, 0)),)
DEFAULT_FLOOR = (16, 0)
JUSTIFICATION = "unchecked:"
JUSTIFICATION_WINDOW = 3
LOCK_PRIMITIVES = re.compile(r"OSAllocatedUnfairLock|NSLock|os_unfair_lock|Mutex<")
HEADER_LINES = 12


def _string_end(src, i, hashes, multiline):
    closing = ('"""' if multiline else '"') + "#" * hashes
    escape = "\\" + "#" * hashes
    n = len(src)
    while i < n:
        if src.startswith(closing, i):
            return i + len(closing)
        if src.startswith(escape, i):
            i = _interpolation_end(src, i + len(escape)) if src.startswith("(", i + len(escape)) else i + len(escape) + 1
            continue
        if not multiline and src[i] == "\n":
            return i
        i += 1
    return n


def _interpolation_end(src, i):
    depth, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == '"':
            multiline = src.startswith('"""', i)
            i = _string_end(src, i + (3 if multiline else 1), 0, multiline)
            continue
        depth += (c == "(") - (c == ")")
        i += 1
        if depth == 0:
            return i
    return n


def _block_comment_end(src, i):
    depth, n = 0, len(src)
    while i < n:
        if src.startswith("/*", i):
            depth, i = depth + 1, i + 2
        elif src.startswith("*/", i):
            depth, i = depth - 1, i + 2
            if depth == 0:
                return i
        else:
            i += 1
    return n


def _string_span(src, i):
    hashes = 0
    while src[i + hashes] == "#":
        hashes += 1
    start = i + hashes
    multiline = src.startswith('"""', start)
    return _string_end(src, start + (3 if multiline else 1), hashes, multiline)


def strip_comments(src):
    out, i, n = [], 0, len(src)
    while i < n:
        found = TOKEN.search(src, i)
        if found is None:
            out.append(src[i:])
            break
        start = found.start()
        out.append(src[i:start])
        token = found.group()
        if token == "//":
            end = src.find("\n", start)
            i = n if end < 0 else end
        elif token == "/*":
            i = _block_comment_end(src, start)
            out.append("\n" * src.count("\n", start, i))
        else:
            i = _string_span(src, start)
            out.append(src[start:i])
    return "".join(out)


def floor_for(rel):
    return next((floor for prefix, floor in FLOORS if rel.startswith(prefix)), DEFAULT_FLOOR)


def _version(match):
    return (int(match.group(1)), int(match.group(2) or 0))


def _is_justified(raw_lines, idx, file_has_lock):
    if file_has_lock:
        return True
    window = raw_lines[max(0, idx - JUSTIFICATION_WINDOW) : idx + 1]
    return any(JUSTIFICATION in line for line in window)


def _count_unchecked(rule, src, stripped):
    has_lock = bool(LOCK_PRIMITIVES.search(stripped))
    raw_lines = src.split("\n")
    return sum(
        1
        for idx, line in enumerate(stripped.split("\n"))
        for _ in rule.pattern.finditer(line)
        if not _is_justified(raw_lines, idx, has_lock)
    )


def _count_floor(rule, rel, stripped):
    floor = floor_for(rel)
    return sum(1 for m in rule.pattern.finditer(stripped) if _version(m) <= floor)


def count_stripped(rule, rel, src, stripped):
    if rel in rule.excluded:
        return 0
    if rule.kind == "unchecked":
        return _count_unchecked(rule, src, stripped)
    if rule.kind == "floor":
        return _count_floor(rule, rel, stripped)
    return len(rule.pattern.findall(stripped))


def count_file(rule, rel, src):
    return count_stripped(rule, rel, src, strip_comments(src))


def in_scope(rel, head):
    if not rel.endswith(".swift") or not rel.startswith(tuple(root + "/" for root in SCOPE)):
        return False
    if any(part.endswith("Tests") for part in rel.split("/")):
        return False
    upper = head.upper()
    return "GÉNÉRÉ" not in upper and "GENERATED" not in upper


def _head(text):
    return "\n".join(text.split("\n")[:HEADER_LINES])


def collect(root):
    root = Path(root)
    found = (
        (path.relative_to(root).as_posix(), path)
        for scope in SCOPE
        for path in sorted((root / scope).rglob("*.swift"))
    )
    texts = ((rel, path.read_text(encoding="utf-8", errors="replace")) for rel, path in found)
    return tuple((rel, text) for rel, text in texts if in_scope(rel, _head(text)))


@dataclass(frozen=True)
class Verdict:
    rises: tuple
    drops: tuple
    missing: tuple
    unknown: tuple


class BaselineError(Exception):
    pass


def _file_counts(rel, src):
    stripped = strip_comments(src)
    return {r.id: count_stripped(r, rel, src, stripped) for r in RULES}


def scan(files):
    return tuple((rel, _file_counts(rel, src)) for rel, src in files)


def measure(scanned):
    return {r.id: sum(counts[r.id] for _, counts in scanned) for r in RULES}


def top_files(scanned, rule_id, n):
    ranked = sorted(((rel, c[rule_id]) for rel, c in scanned if c[rule_id] > 0), key=lambda item: (-item[1], item[0]))
    return tuple(ranked[:n])


def compare(current, baseline):
    shared = tuple(k for k in current if k in baseline)
    return Verdict(
        rises=tuple(k for k in shared if current[k] > baseline[k]),
        drops=tuple(k for k in shared if current[k] < baseline[k]),
        missing=tuple(k for k in current if k not in baseline),
        unknown=tuple(sorted(k for k in baseline if k not in current)),
    )


def load_baseline(path):
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        rules = data["rules"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise BaselineError(f"référence illisible ({path}) : {error}") from error
    if not isinstance(rules, dict) or not all(isinstance(v, int) for v in rules.values()):
        raise BaselineError(f"référence invalide ({path}) : les totaux doivent être des entiers")
    return rules


def serialise(totals):
    return json.dumps({"version": BASELINE_VERSION, "rules": totals}, indent=2, sort_keys=True) + "\n"


def write_baseline(path, current, previous):
    raised = tuple(k for k, v in current.items() if k in previous and v > previous[k])
    if raised:
        return raised
    Path(path).write_text(serialise(current), encoding="utf-8")
    return ()


def _rise_lines(scanned, current, baseline, rises):
    lines = []
    for rule_id in rises:
        lines.append(f"  {rule_id} : {baseline[rule_id]} -> {current[rule_id]}")
        lines += [f"      {c:4d}  {rel}" for rel, c in top_files(scanned, rule_id, TOP_FILES)]
    return lines


def _structure_lines(verdict):
    return [f"  règle sans référence : {k}" for k in verdict.missing] + [
        f"  clé de référence inconnue des règles : {k}" for k in verdict.unknown
    ]


def _report(scanned, current):
    for rule_id, total in current.items():
        print(f"{rule_id} : {total}")
        for rel, c in top_files(scanned, rule_id, REPORT_FILES):
            print(f"  {c:5d}  {rel}")


def _check(scanned, current, baseline_path):
    try:
        baseline = load_baseline(baseline_path)
    except BaselineError as error:
        print(f"house_rules: {error}", file=sys.stderr)
        return 1
    verdict = compare(current, baseline)
    problems = _structure_lines(verdict)
    if verdict.drops:
        drops = [f"  en baisse {k} : {baseline[k]} -> {current[k]}" for k in verdict.drops]
        print("house_rules: des totaux ont baissé — relancer `--write-baseline` dans le même commit pour verrouiller le gain :")
        print("\n".join(drops))
    if not (verdict.rises or problems):
        print(f"house_rules: {len(current)} règles tenues.")
        return 0
    print("house_rules: la règle maison RÉGRESSE —", file=sys.stderr)
    print("\n".join(problems + _rise_lines(scanned, current, baseline, verdict.rises)), file=sys.stderr)
    print("Corriger le site fautif ; ne jamais relever la référence.", file=sys.stderr)
    return 1


def _write(current, baseline_path):
    path = Path(baseline_path)
    previous = {} if not path.exists() else None
    try:
        previous = load_baseline(path) if previous is None else previous
    except BaselineError as error:
        print(f"house_rules: {error}", file=sys.stderr)
        return 1
    raised = write_baseline(path, current, previous)
    if raised:
        print("house_rules: refus de relever la référence : " + ", ".join(raised), file=sys.stderr)
        return 1
    print(f"house_rules: référence écrite ({len(current)} règles).")
    return 0


def self_test():
    path = Path(__file__).resolve().parent / "test_house_rules.py"
    spec = importlib.util.spec_from_file_location("test_house_rules", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    return 0 if unittest.TextTestRunner(verbosity=1).run(suite).wasSuccessful() else 1


def _parser():
    parser = argparse.ArgumentParser(description="Cliquets des règles maison Swift")
    parser.add_argument("--root", default=str(ROOT))
    parser.add_argument("--baseline", default=str(BASELINE))
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--write-baseline", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    return parser


def main(argv):
    args = _parser().parse_args(argv)
    if args.self_test:
        return self_test()
    scanned = scan(collect(args.root))
    current = measure(scanned)
    if args.report:
        _report(scanned, current)
    if args.write_baseline:
        return _write(current, args.baseline)
    return _check(scanned, current, args.baseline)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
