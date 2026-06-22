#!/usr/bin/env python3
"""
Localization catalog consistency check (bidirectional).

Guards the class of bug where an identifier-style key such as `splash.tagline`
renders RAW on screen because it is referenced in code but does not resolve in
the app's development language (`en`).

Two invariants are enforced, scoped to IDENTIFIER keys (dot/underscore, no
spaces — e.g. `call.ended.missed`). Natural-text / format keys (`"%@ membres"`,
`"Annuler"`) are intentionally out of scope: they always render as themselves
(never as a raw identifier), and format keys are interpolation-normalized by
Xcode (`"\\(x) membres"` in code becomes `"%@ membres"` in the catalog), which
makes them unverifiable by static source scanning.

DIRECTION 1 — every USED identifier key resolves (code -> catalog):
  For each `String(localized: "K" …)` call WITHOUT a `defaultValue:` (a default
  value is itself a safe fallback), K must exist with an `en` entry in the
  catalog it resolves against — the SDK catalog when the call passes
  `bundle: .module`, otherwise the app catalog (`bundle: .main` / default).

DIRECTION 2 — every EXISTING app-catalog identifier key is used (catalog -> code):
  Every identifier key in the app catalog must appear as the literal `"K"`
  somewhere in the scanned sources (app targets + extensions + SDK, since SDK
  code references app-catalog keys via `bundle: .main`).

Run: python3 apps/ios/scripts/check_localization.py
Exit code 0 = consistent, 1 = violations found.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

APP_CATALOG = REPO / "apps/ios/Meeshy/Localizable.xcstrings"
SDK_CATALOG = REPO / "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"

# Every target whose String(localized:) calls resolve against the app's main
# bundle (default / bundle: .main), plus the SDK whose code references both the
# app catalog (.main) and its own catalog (.module).
SOURCE_ROOTS = [
    "apps/ios/Meeshy",
    "apps/ios/MeeshyNotificationExtension",
    "apps/ios/MeeshyWidgets",
    "apps/ios/MeeshyShareExtension",
    "apps/ios/MeeshyContextMenu",
    "apps/ios/MeeshyIntents",
    "packages/MeeshySDK/Sources",
]

# Documented exceptions. Keep empty; add a key only with a justifying comment.
ALLOWLIST_ORPHAN: set[str] = set()
ALLOWLIST_RAW: set[str] = set()

LOCALIZED_CALL = re.compile(r'String\(\s*localized:\s*"((?:[^"\\]|\\.)*)"')


def is_identifier(key: str) -> bool:
    return (" " not in key) and ("." in key or "_" in key) and bool(
        re.fullmatch(r"[A-Za-z0-9_.\-]+", key)
    )


def call_segment(text: str, start: int) -> str:
    """Return the full `String( … )` call text starting at `start`, scanning to
    the matching close paren while ignoring parens inside string literals."""
    i = start
    n = len(text)
    while i < n and text[i] != "(":
        i += 1
    depth = 0
    seg_start = i
    in_str = False
    esc = False
    while i < n:
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    break
        i += 1
    return text[seg_start : i + 1]


def has_en(catalog: dict, key: str) -> bool:
    entry = catalog.get(key)
    return bool(entry and entry.get("localizations", {}).get("en") is not None)


def main() -> int:
    for path in (APP_CATALOG, SDK_CATALOG):
        if not path.exists():
            print(f"error: catalog not found: {path}", file=sys.stderr)
            return 1

    app = json.loads(APP_CATALOG.read_text(encoding="utf-8"))["strings"]
    sdk = json.loads(SDK_CATALOG.read_text(encoding="utf-8"))["strings"]

    files = []
    for root in SOURCE_ROOTS:
        for path in (REPO / root).rglob("*.swift"):
            sp = str(path)
            if "/Build/" in sp or "/.build/" in sp:
                continue
            files.append(path)

    blob_parts = []
    raw_violations = []  # (key, file, catalog_name)
    for path in files:
        text = path.read_text(encoding="utf-8")
        blob_parts.append(text)
        for m in LOCALIZED_CALL.finditer(text):
            key = m.group(1).encode().decode("unicode_escape")
            if not is_identifier(key) or key in ALLOWLIST_RAW:
                continue
            segment = call_segment(text, m.start())
            if "defaultValue:" in segment:
                continue
            is_module = ".module" in segment
            catalog = sdk if is_module else app
            if not has_en(catalog, key):
                raw_violations.append((key, path.name, "SDK" if is_module else "APP"))
    blob = "\n".join(blob_parts)

    orphans = sorted(
        k
        for k in app
        if is_identifier(k) and k not in ALLOWLIST_ORPHAN and f'"{k}"' not in blob
    )

    ok = True
    print(f"Scanned {len(files)} Swift files | app catalog {len(app)} keys | sdk catalog {len(sdk)} keys")

    raw_violations = sorted(set(raw_violations))
    if raw_violations:
        ok = False
        print(f"\n✗ DIRECTION 1 — {len(raw_violations)} used identifier key(s) render RAW "
              f"(no defaultValue, missing `en` in their catalog):")
        for key, fname, cat in raw_violations:
            print(f"    [{cat}] {key}   (e.g. {fname})")
    else:
        print("✓ DIRECTION 1 — every used identifier key resolves in `en` (no raw render)")

    if orphans:
        ok = False
        print(f"\n✗ DIRECTION 2 — {len(orphans)} orphan app-catalog identifier key(s) "
              f"(never referenced in code):")
        for key in orphans:
            print(f"    {key}")
    else:
        print("✓ DIRECTION 2 — every app-catalog identifier key is referenced in code")

    if not ok:
        print("\nLocalization consistency check FAILED.")
        return 1
    print("\nLocalization consistency check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
