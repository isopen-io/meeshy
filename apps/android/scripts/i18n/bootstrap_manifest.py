#!/usr/bin/env python3
"""Amorce les manifestes de chaînes depuis les strings.xml Android écrits à la main.

Pour chaque module Android qui porte des chaînes (dossier `values/`, hors `strings_generated.xml`),
classe CHAQUE nom dans `i18n/manifest/<module>.json` :

  texte anglais identique à une clé iOS (spécificateurs normalisés)  →  candidate (clé iOS, catalogue)
  identique à la casse, la ponctuation et les points de suspension près  →  candidate aussi
  aucun texte iOS équivalent                                         →  android-only

Aucun strings.xml n'est modifié : aucun site d'appel ne change. Un nom ne passe à `adopted`
que dans un lot qui retire la clé de son strings.xml et lance `./apps/android/meeshy.sh i18n`.

Une relance CONSERVE le classement existant (celui d'un humain a priorité) et n'ajoute que les
noms nouveaux. Le rapport liste les clés iOS ambiguës (même texte porté par plusieurs clés) et
les non-appariées, avec les trois textes iOS les plus proches pour trier à la main
(équivalent par le sens : changer `android-only` en `candidate` et ajouter `catalog` + `iosKey`).

  python3 apps/android/scripts/i18n/bootstrap_manifest.py [--report rapport.txt]
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

from manifest_schema import CATALOGS, SCHEMA_VERSION, ManifestError, load_manifest
from xcstrings_reader import DEFAULT_LOCALE, Catalog, CatalogError, read_catalog

GENERATED_FILE = "strings_generated.xml"
MATCHED_CATALOGS = ("app", "ui", "widgets", "nse", "nce")
SUGGESTION_COUNT = 3
SUGGESTION_FLOOR = 0.6
_PLACEHOLDER_PERCENT = "\x00"
_SPECIFIER = re.compile(
    r"%(?:\d+\$)?[-+ #0]*\d*(?:\.\d+)?(?:hh|h|ll|l|q|z|t|j)?(?P<conversion>[@dDiuUxXoOfeEgGcCsSaAp])"
)
_CONVERSION_FAMILY = {
    **dict.fromkeys("@sS", "s"),
    **dict.fromkeys("dDiuU", "d"),
    **dict.fromkeys("fFeEgG", "f"),
}


@dataclass(frozen=True)
class AndroidString:
    name: str
    kind: str
    text: str


@dataclass(frozen=True)
class IosString:
    catalog: str
    key: str
    kind: str
    text: str


@dataclass
class Classification:
    entries: List[dict] = field(default_factory=list)
    ambiguous: List[Tuple[str, List[IosString]]] = field(default_factory=list)
    unmatched: List[Tuple[AndroidString, List[Tuple[float, IosString]]]] = field(default_factory=list)


def normalize(text: str) -> str:
    plain = text.replace("%%", _PLACEHOLDER_PERCENT).replace("**", "")
    unified = _SPECIFIER.sub(lambda match: "%" + _CONVERSION_FAMILY.get(match.group("conversion"), match.group("conversion")), plain)
    return unified.replace(_PLACEHOLDER_PERCENT, "%%")


def loosen(text: str) -> str:
    """Forme de comparaison indulgente : casse, ponctuation, points de suspension et blancs ignorés."""
    marked = re.sub(r"%([sdf])", r" arg\1 ", normalize(text))
    return " ".join(re.sub(r"[\W_]+", " ", marked).casefold().split())


def _tokens(identifier: str) -> set:
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", identifier)
    return {token for token in re.split(r"[^A-Za-z0-9]+", spaced.casefold()) if token}


def android_text(raw: str) -> str:
    """Applique les règles d'aapt2 à un contenu de chaîne : guillemets, échappements, blancs."""
    resolved: List[str] = []
    in_quote = False
    pending_space = False
    index = 0
    while index < len(raw):
        char = raw[index]
        literal: Optional[str] = None
        if char == "\\" and index + 1 < len(raw):
            index += 1
            escape = raw[index]
            if escape == "u" and re.fullmatch(r"[0-9a-fA-F]{4}", raw[index + 1:index + 5] or ""):
                literal = chr(int(raw[index + 1:index + 5], 16))
                index += 4
            else:
                literal = {"n": "\n", "t": "\t"}.get(escape, escape)
        elif char == '"':
            in_quote = not in_quote
        elif char in " \t\n\r" and not in_quote:
            pending_space = True
        else:
            literal = char
        if literal is not None:
            if pending_space and resolved:
                resolved.append(" ")
            pending_space = False
            resolved.append(literal)
        index += 1
    return "".join(resolved)


def read_android_strings(folder: Path) -> List[AndroidString]:
    found: List[AndroidString] = []
    for path in sorted(folder.glob("*.xml")):
        if path.name == GENERATED_FILE:
            continue
        root = ET.parse(path).getroot()
        if root.tag != "resources":
            continue
        for element in root:
            name = element.get("name")
            if not name:
                continue
            if element.tag == "string":
                found.append(AndroidString(name, "string", android_text("".join(element.itertext()))))
            elif element.tag == "plurals":
                other = next((item for item in element if item.get("quantity") == "other"), None)
                text = android_text("".join(other.itertext())) if other is not None else ""
                found.append(AndroidString(name, "plurals", text))
    return found


def english_text(catalog: Catalog, key: str) -> Optional[Tuple[str, str]]:
    entry = catalog.entry(key)
    if entry.stale:
        return None
    localization = catalog.localization(entry, DEFAULT_LOCALE, key_fallback=False)
    if localization is None and catalog.source_language == DEFAULT_LOCALE.code:
        localization = catalog.source_localization(entry)
    if localization is None:
        return None
    if localization.plural is not None:
        other = localization.plural.get("other")
        return ("plurals", other) if other is not None else None
    return ("string", localization.text) if localization.text is not None else None


def read_ios_strings(repo_root: Path) -> List[IosString]:
    found: List[IosString] = []
    for catalog_id in MATCHED_CATALOGS:
        path = repo_root / CATALOGS[catalog_id]
        if not path.is_file():
            continue
        catalog = read_catalog(path)
        for key in catalog.keys():
            try:
                resolved = english_text(catalog, key)
            except CatalogError:
                continue
            if resolved is not None:
                found.append(IosString(catalog_id, key, resolved[0], resolved[1]))
    return found


def _index(ios_strings: Sequence[IosString], form) -> Dict[Tuple[str, str], List[IosString]]:
    index: Dict[Tuple[str, str], List[IosString]] = {}
    for item in ios_strings:
        index.setdefault((item.kind, form(item.text)), []).append(item)
    for candidates in index.values():
        candidates.sort(key=lambda item: (MATCHED_CATALOGS.index(item.catalog), item.key))
    return index


def _closest_to(name: str, matches: Sequence[IosString]) -> List[IosString]:
    """Départage des clés de même texte : celle dont les mots recoupent le plus le nom Android."""
    wanted = _tokens(name)
    return sorted(matches, key=lambda item: -len(wanted & _tokens(item.key)))


def _suggestions(target: AndroidString, ios_strings: Sequence[IosString]) -> List[Tuple[float, IosString]]:
    wanted = normalize(target.text).casefold()
    scored = []
    for item in ios_strings:
        if item.kind != target.kind:
            continue
        matcher = difflib.SequenceMatcher(None, wanted, normalize(item.text).casefold())
        if matcher.real_quick_ratio() < SUGGESTION_FLOOR or matcher.quick_ratio() < SUGGESTION_FLOOR:
            continue
        ratio = matcher.ratio()
        if ratio >= SUGGESTION_FLOOR:
            scored.append((ratio, item))
    scored.sort(key=lambda pair: (-pair[0], MATCHED_CATALOGS.index(pair[1].catalog), pair[1].key))
    return scored[:SUGGESTION_COUNT]


def _entry_of(name: str, kind: str, match: Optional[IosString]) -> dict:
    if match is None:
        return {"androidName": name, "status": "android-only"}
    entry = {"catalog": match.catalog, "iosKey": match.key, "androidName": name, "status": "candidate"}
    if kind == "plurals":
        entry["kind"] = "plurals"
    return entry


def classify(
    android_strings: Sequence[AndroidString],
    ios_strings: Sequence[IosString],
    *,
    existing: Mapping[str, dict],
    triage_unmatched: bool = True,
) -> Classification:
    exact_index, loose_index = _index(ios_strings, normalize), _index(ios_strings, loosen)
    result = Classification()
    for item in sorted(android_strings, key=lambda string: string.name):
        if item.name in existing:
            result.entries.append(existing[item.name])
            continue
        matches = exact_index.get((item.kind, normalize(item.text)))
        if not matches:
            matches = loose_index.get((item.kind, loosen(item.text)), [])
        matches = _closest_to(item.name, matches)
        result.entries.append(_entry_of(item.name, item.kind, matches[0] if matches else None))
        if len(matches) > 1:
            result.ambiguous.append((item.name, matches))
        if not matches and triage_unmatched:
            result.unmatched.append((item, _suggestions(item, ios_strings)))
    return result


def discover_modules(android_root: Path) -> List[Tuple[str, str]]:
    modules = []
    for values in sorted(android_root.glob("**/src/main/res/values")):
        relative = values.relative_to(android_root).parts
        if "build" in relative or not any(p.name != GENERATED_FILE for p in values.glob("*.xml")):
            continue
        directory = "/".join(relative[: relative.index("src")])
        if directory:
            modules.append((":" + directory.replace("/", ":"), "/".join(relative[:-1])))
    return modules


def manifest_file_name(module: str) -> str:
    return module.rsplit(":", 1)[-1] + ".json"


def _existing_entries(manifest_path: Path, module: str) -> Dict[str, dict]:
    if not manifest_path.is_file():
        return {}
    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = document.get("modules", {}).get(module, {}).get("entries", [])
    return {entry["androidName"]: entry for entry in entries if "androidName" in entry}


def render(module: str, res_dir: str, entries: Sequence[dict]) -> str:
    document = {"schemaVersion": SCHEMA_VERSION, "modules": {module: {"resDir": res_dir, "entries": list(entries)}}}
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def bootstrap(android_root: Path, repo_root: Path, output: Path) -> Tuple[Dict[Path, str], Dict[str, Classification]]:
    ios_strings = read_ios_strings(repo_root)
    files: Dict[Path, str] = {}
    reports: Dict[str, Classification] = {}
    for module, res_dir in discover_modules(android_root):
        path = output / manifest_file_name(module)
        existing = _existing_entries(path, module)
        android_strings = read_android_strings(android_root / res_dir / "values")
        reports[module] = classify(android_strings, ios_strings, existing=existing)
        files[path] = render(module, res_dir, reports[module].entries)
    return files, reports


def format_report(reports: Mapping[str, Classification]) -> str:
    lines: List[str] = []
    totals = {"candidate": 0, "android-only": 0}
    for module, classification in reports.items():
        counts = {status: sum(1 for e in classification.entries if e["status"] == status) for status in totals}
        for status, count in counts.items():
            totals[status] += count
        lines.append(f"{module} : {len(classification.entries)} noms, {counts['candidate']} candidate, {counts['android-only']} android-only")
    lines.append(f"TOTAL : {sum(totals.values())} noms, {totals['candidate']} candidate, {totals['android-only']} android-only")
    for module, classification in reports.items():
        for name, matches in classification.ambiguous:
            options = ", ".join(f"{m.catalog}:{m.key}" for m in matches)
            lines.append(f"ambigu {module} {name} : {options} (retenu : {matches[0].catalog}:{matches[0].key})")
    for module, classification in reports.items():
        for item, suggestions in classification.unmatched:
            lines.append(f"non-apparié {module} {item.name} : « {item.text} »")
            lines.extend(f"    ~{ratio:.2f} {s.catalog}:{s.key} : « {s.text} »" for ratio, s in suggestions)
    return "\n".join(lines) + "\n"


def main(argv: Optional[Sequence[str]] = None) -> int:
    android_default = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Amorce les manifestes de chaînes Android depuis les strings.xml.")
    parser.add_argument("--android-root", type=Path, default=android_default)
    parser.add_argument("--repo-root", type=Path)
    parser.add_argument("--output", type=Path, help="dossier des manifestes (défaut : <android-root>/i18n/manifest)")
    parser.add_argument("--report", type=Path, help="écrit le rapport dans ce fichier (défaut : sortie standard)")
    arguments = parser.parse_args(argv)
    android_root = arguments.android_root.resolve()
    repo_root = (arguments.repo_root or android_root.parents[1]).resolve()
    output = (arguments.output or android_root / "i18n" / "manifest").resolve()
    try:
        files, reports = bootstrap(android_root, repo_root, output)
        for path in files:
            load_manifest_text = files[path]
            json.loads(load_manifest_text)
    except (ManifestError, CatalogError, ET.ParseError, OSError, ValueError) as error:
        print(f"bootstrap_manifest : impossible — {error}", file=sys.stderr)
        return 2
    for path, content in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    report = format_report(reports)
    if arguments.report:
        arguments.report.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)
    try:
        load_manifest(output)
    except ManifestError as error:
        print(f"bootstrap_manifest : manifeste produit invalide — {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
