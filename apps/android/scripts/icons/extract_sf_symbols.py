#!/usr/bin/env python3
"""Extrait les SF Symbols LITTÉRAUX d'iOS (systemName: "x", systemImage: "x").

Sortie déterministe : un nom par ligne, triés, sans doublon. La liste sert de
candidats à `i18n/icons/sf-symbols-map.json`, qui classe chaque symbole en
mapped, custom ou not-applicable (voir SfSymbolMapGuardTest).

Usage :
  extract_sf_symbols.py                 imprime les candidats
  extract_sf_symbols.py --write         réécrit i18n/icons/sf-symbols-candidates.txt
  extract_sf_symbols.py --check         échoue si le fichier committé diverge
"""
import argparse
import re
import sys
from pathlib import Path

LITERAL = re.compile(r'\b(?:systemName|systemImage)\s*:\s*"([A-Za-z0-9._]+)"')
DEFAULT_ROOTS = ("apps/ios", "packages/MeeshySDK/Sources")
ANDROID_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = ANDROID_DIR.parents[1]
CANDIDATES = ANDROID_DIR / "i18n" / "icons" / "sf-symbols-candidates.txt"


def extract_symbols(source):
    return set(LITERAL.findall(source))


def collect(roots):
    found = set()
    for root in roots:
        for path in sorted(Path(root).rglob("*.swift")):
            found |= extract_symbols(path.read_text(encoding="utf-8", errors="replace"))
    return found


def render(symbols):
    return "".join(f"{name}\n" for name in sorted(symbols))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", action="append", help="racine Swift à balayer (répétable)")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    roots = args.root or [str(REPO_ROOT / r) for r in DEFAULT_ROOTS]
    text = render(collect(roots))
    if args.write:
        CANDIDATES.write_text(text, encoding="utf-8")
        return 0
    if args.check:
        if CANDIDATES.read_text(encoding="utf-8") != text:
            sys.stderr.write("sf-symbols-candidates.txt diverge d'iOS : relancer avec --write\n")
            return 1
        return 0
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
