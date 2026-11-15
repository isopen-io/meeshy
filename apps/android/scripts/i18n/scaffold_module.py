#!/usr/bin/env python3
"""Prépare le manifeste d'un module Android À VENIR (jeu, composer, focal, lentille).

Toutes les clés iOS non stale dont le nom commence par l'un des préfixes sont inscrites au
statut `disabled`, avec un nom Android snake_case déterministe et sans collision. Rien n'est
émis tant qu'une entrée n'est pas `adopted` : passer une clé en adopted tient en une ligne
(`"status": "disabled"` devient `"status": "adopted"`), puis `./apps/android/meeshy.sh i18n`.

  python3 apps/android/scripts/i18n/scaffold_module.py --module game \\
      --prefix game.,game2.,progression.,achievement.

Le module est `:feature:<module>` (ou `--gradle-path`), son manifeste `i18n/manifest/<module>.json`.
Une relance conserve le statut et le nom des entrées déjà présentes et n'ajoute que les clés nouvelles.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple

from manifest_schema import CATALOGS, SCHEMA_VERSION, ManifestError, _RESERVED_NAMES, module_directory
from xcstrings_reader import CatalogError, read_catalog

_WORD_BOUNDARY = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


class ScaffoldError(ValueError):
    pass


def snake_case(key: str) -> str:
    words = re.split(r"[^A-Za-z0-9]+", _WORD_BOUNDARY.sub("_", key))
    name = "_".join(word.lower() for word in words if word)
    if not name:
        name = "string"
    if name[0].isdigit():
        name = "s_" + name
    return name + "_" if name in _RESERVED_NAMES else name


def assign_names(keys: Sequence[str], taken: Optional[Set[str]] = None) -> Dict[str, str]:
    """Nom Android de chaque clé : stable à l'exécution répétée (ordre alphabétique des clés)."""
    used: Set[str] = set(taken or ())
    names: Dict[str, str] = {}
    for key in sorted(keys):
        base = snake_case(key)
        candidate, suffix = base, 2
        while candidate in used:
            candidate, suffix = f"{base}_{suffix}", suffix + 1
        used.add(candidate)
        names[key] = candidate
    return names


def select_keys(catalog_path: Path, prefixes: Sequence[str]) -> List[Tuple[str, str]]:
    catalog = read_catalog(catalog_path)
    selected = []
    for key in catalog.keys():
        if not any(key.startswith(prefix) for prefix in prefixes):
            continue
        entry_kind = "string"
        try:
            entry = catalog.entry(key)
        except CatalogError:
            entry = None
        if entry is not None:
            if entry.stale:
                continue
            if any(localization.plural is not None for localization in entry.localizations.values()):
                entry_kind = "plurals"
        selected.append((key, entry_kind))
    return sorted(selected)


def build_entries(
    selected: Sequence[Tuple[str, str]], catalog: str, existing: Sequence[dict]
) -> List[dict]:
    kept = {(entry["catalog"], entry["iosKey"]): entry for entry in existing if "iosKey" in entry}
    taken = {entry["androidName"] for entry in existing if "androidName" in entry}
    fresh = [key for key, _ in selected if (catalog, key) not in kept]
    names = assign_names(fresh, taken)
    kinds = dict(selected)
    entries = list(existing)
    for key in sorted(fresh):
        entry = {"catalog": catalog, "iosKey": key, "androidName": names[key], "status": "disabled"}
        if kinds[key] == "plurals":
            entry["kind"] = "plurals"
        entries.append(entry)
    return sorted(entries, key=lambda entry: entry["androidName"])


def render(module: str, entries: Sequence[dict]) -> str:
    res_dir = f"{module_directory(module)}/src/main/res"
    document = {"schemaVersion": SCHEMA_VERSION, "modules": {module: {"resDir": res_dir, "entries": list(entries)}}}
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def scaffold(
    *, module: str, prefixes: Sequence[str], catalog: str, repo_root: Path, manifest_path: Path
) -> Tuple[str, int]:
    existing: List[dict] = []
    if manifest_path.is_file():
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
        existing = document.get("modules", {}).get(module, {}).get("entries", [])
    selected = select_keys(repo_root / CATALOGS[catalog], prefixes)
    entries = build_entries(selected, catalog, existing)
    return render(module, entries), len(entries)


def main(argv: Optional[Sequence[str]] = None) -> int:
    android_default = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Prépare le manifeste de chaînes d'un module à venir.")
    parser.add_argument("--module", required=True, help="nom court (game) : le module est :feature:<nom>")
    parser.add_argument("--prefix", required=True, help="préfixes de clés iOS séparés par des virgules")
    parser.add_argument("--catalog", default="app", choices=sorted(CATALOGS))
    parser.add_argument("--gradle-path", help="chemin Gradle du module (défaut :feature:<module>)")
    parser.add_argument("--android-root", type=Path, default=android_default)
    parser.add_argument("--repo-root", type=Path)
    arguments = parser.parse_args(argv)
    android_root = arguments.android_root.resolve()
    repo_root = (arguments.repo_root or android_root.parents[1]).resolve()
    module = arguments.gradle_path or f":feature:{arguments.module}"
    prefixes = [prefix for prefix in arguments.prefix.split(",") if prefix]
    manifest_path = android_root / "i18n" / "manifest" / f"{arguments.module}.json"
    try:
        content, count = scaffold(
            module=module, prefixes=prefixes, catalog=arguments.catalog, repo_root=repo_root, manifest_path=manifest_path
        )
    except (ManifestError, CatalogError, ScaffoldError, OSError, ValueError) as error:
        print(f"scaffold_module : impossible — {error}", file=sys.stderr)
        return 2
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(content, encoding="utf-8")
    print(f"scaffold_module : {count} clé(s) disabled dans {manifest_path.relative_to(android_root).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
