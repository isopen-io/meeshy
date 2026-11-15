#!/usr/bin/env python3
"""Ajoute, met à jour ou retire des clés du catalogue de l'app, dans les sept langues.

Usage : python3 apps/ios/scripts/catalog_keys.py apply changements.json
Format : {"set": {"clé": {"fr": "…", "en": "…", "es": "…", "de": "…", "it": "…", "pt-BR": "…", "ar": "…"}},
          "delete": ["clé", …]}
Le fichier est réécrit dans la forme exacte de Xcode (indentation 2, « : », fin de ligne).
"""
import json
import sys
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[1] / "Meeshy" / "Localizable.xcstrings"
LANGS = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] != "apply":
        print(__doc__)
        return 2
    changes = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    strings = catalog["strings"]
    for key, values in changes.get("set", {}).items():
        missing = [lang for lang in LANGS if lang not in values]
        if missing:
            print(f"{key}: langues manquantes {missing}")
            return 1
        strings[key] = {
            "extractionState": "manual",
            "localizations": {
                lang: {"stringUnit": {"state": "translated", "value": values[lang]}} for lang in LANGS
            },
        }
    for key in changes.get("delete", []):
        strings.pop(key, None)
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n",
                       encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
