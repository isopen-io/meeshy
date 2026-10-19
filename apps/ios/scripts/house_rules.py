#!/usr/bin/env python3
"""Cliquets des règles maison sur les sources Swift écrites à la main (#11046)."""
import re
from pathlib import Path
from dataclasses import dataclass
from typing import Literal

RAW_OPEN = re.compile(r'#+"')


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
        c = src[i]
        if src.startswith("//", i):
            end = src.find("\n", i)
            i = n if end < 0 else end
        elif src.startswith("/*", i):
            end = _block_comment_end(src, i)
            out.append("\n" * src.count("\n", i, end))
            i = end
        elif c == '"' or (c == "#" and RAW_OPEN.match(src, i)):
            end = _string_span(src, i)
            out.append(src[i:end])
            i = end
        else:
            out.append(c)
            i += 1
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


def _count_unchecked(rule, src):
    stripped = strip_comments(src)
    has_lock = bool(LOCK_PRIMITIVES.search(stripped))
    raw_lines = src.split("\n")
    return sum(
        1
        for idx, line in enumerate(stripped.split("\n"))
        for _ in rule.pattern.finditer(line)
        if not _is_justified(raw_lines, idx, has_lock)
    )


def _count_floor(rule, rel, src):
    floor = floor_for(rel)
    return sum(1 for m in rule.pattern.finditer(strip_comments(src)) if _version(m) <= floor)


def count_file(rule, rel, src):
    if rel in rule.excluded:
        return 0
    if rule.kind == "unchecked":
        return _count_unchecked(rule, src)
    if rule.kind == "floor":
        return _count_floor(rule, rel, src)
    return len(rule.pattern.findall(strip_comments(src)))


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
