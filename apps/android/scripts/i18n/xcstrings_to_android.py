#!/usr/bin/env python3
"""Génère les chaînes Android depuis les catalogues de traduction iOS (`.xcstrings`).

Pour chaque module déclaré dans le manifeste (apps/android/i18n/manifest), écrit
`res/values{,-fr,-es,-de,-it,-pt,-ar}/strings_generated.xml` avec les clés au statut
`adopted`. Le générateur ne modifie jamais un `strings.xml` écrit à la main : s'il
rencontre le même nom, il s'arrête.

  ./apps/android/meeshy.sh i18n            écrit les fichiers
  ./apps/android/meeshy.sh i18n --check    ne modifie rien ; sort 1 et liste les fichiers périmés

Codes de sortie : 0 propre · 1 fichiers périmés (--check) · 2 génération impossible
(manifeste invalide, clé introuvable, quantité plurielle absente, collision de nom...).

Règles : voir manifest_schema.py (manifeste), specifier_converter.py (spécificateurs),
android_xml_writer.py (échappements, <b>), plural_emitter.py (CLDR), xcstrings_reader.py
(entrées stale, repli sur la clé source, pt-BR vers values-pt).
"""
from __future__ import annotations

import argparse
import os
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from android_xml_writer import PluralsResource, Resource, StringResource, WriterError, render_document, render_value
from manifest_schema import CATALOGS, Manifest, ManifestEntry, ManifestError, ModuleManifest, load_manifest
from plural_emitter import PluralError, resolve_quantities
from specifier_converter import ConvertedText, SpecifierError, convert_specifiers
from xcstrings_reader import (
    ANDROID_LOCALES,
    DEFAULT_LOCALE,
    Catalog,
    CatalogEntry,
    CatalogError,
    Localization,
    read_catalog,
)

GENERATED_FILE = "strings_generated.xml"
_PRUNED_DIRECTORIES = {"build", ".gradle", ".git", "node_modules", ".idea"}

_ERRORS = (ManifestError, CatalogError, SpecifierError, PluralError, WriterError)


class GenerationError(ValueError):
    pass


@dataclass
class Generation:
    files: Dict[Path, str] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)


class _Catalogs:
    def __init__(self, repo_root: Path) -> None:
        self._repo_root = repo_root
        self._loaded: Dict[str, Catalog] = {}

    def get(self, catalog_id: str) -> Catalog:
        if catalog_id not in self._loaded:
            self._loaded[catalog_id] = read_catalog(self._repo_root / CATALOGS[catalog_id])
        return self._loaded[catalog_id]


def _convert(language: str, text: str, *, always_formatted: bool = False) -> ConvertedText:
    try:
        converted = convert_specifiers(text, always_formatted=always_formatted)
        render_value(converted.text)
    except (SpecifierError, WriterError) as error:
        raise type(error)(f"[{language}] {error}") from error
    return converted


def _check_signatures(entry: ManifestEntry, converted: Dict[Tuple[str, Optional[str]], ConvertedText]) -> None:
    reference_id = (DEFAULT_LOCALE.code, "other" if entry.kind == "plurals" else None)
    reference_text = converted.get(reference_id)
    if reference_text is None:
        return
    reference = {argument.position: argument.conversion for argument in reference_text.arguments}
    for (language, quantity), text in converted.items():
        for argument in text.arguments:
            expected = reference.get(argument.position)
            if expected != argument.conversion:
                label = f"{language}/{quantity}" if quantity else language
                raise SpecifierError(
                    f"[{label}] l'argument {argument.position} est %{argument.conversion} "
                    f"alors que la référence anglaise attend "
                    f"{'%' + expected if expected else 'aucun argument à cette position'}"
                )


def _localizations(entry: ManifestEntry, catalog: Catalog, catalog_entry: CatalogEntry) -> Dict[str, Localization]:
    found: Dict[str, Localization] = {}
    key_fallback = entry.kind == "string"
    for locale in ANDROID_LOCALES:
        localization = catalog.localization(catalog_entry, locale, key_fallback=key_fallback)
        if localization is None and locale is DEFAULT_LOCALE:
            localization = catalog.source_localization(catalog_entry, key_fallback=key_fallback)
        if localization is None:
            continue
        is_plural = localization.plural is not None
        if is_plural != (entry.kind == "plurals"):
            raise CatalogError(
                f"[{locale.code}] le manifeste déclare kind « {entry.kind} » mais le catalogue fournit "
                f"{'une variation plurielle' if is_plural else 'un texte simple'}"
            )
        found[locale.code] = localization
    if DEFAULT_LOCALE.code not in found:
        raise CatalogError("aucune forme pour la langue par défaut (en) ni pour la langue source")
    return found


def _resolve_entry(entry: ManifestEntry, catalogs: _Catalogs, warnings: List[str]) -> Optional[Dict[str, Resource]]:
    catalog = catalogs.get(entry.catalog)
    catalog_entry = catalog.entry(entry.ios_key)
    if catalog_entry.stale:
        warnings.append(f"clé stale ignorée : {entry.ios_key} ({entry.catalog}) → {entry.android_name}")
        return None
    localizations = _localizations(entry, catalog, catalog_entry)
    plural = entry.kind == "plurals"
    converted: Dict[Tuple[str, Optional[str]], ConvertedText] = {}
    for language, localization in localizations.items():
        if plural:
            for quantity, text in localization.plural.items():
                converted[(language, quantity)] = _convert(language, text, always_formatted=True)
        else:
            converted[(language, None)] = _convert(language, localization.text)
    _check_signatures(entry, converted)
    resources: Dict[str, Resource] = {}
    for language, localization in localizations.items():
        if plural:
            items = resolve_quantities(
                key=entry.ios_key,
                locale_code=language,
                provided={quantity: converted[(language, quantity)].text for quantity in localization.plural},
                fill_missing=entry.fill_missing_quantities,
            )
            resources[language] = PluralsResource(entry.android_name, items)
        else:
            text = converted[(language, None)]
            resources[language] = StringResource(entry.android_name, text.text, text.formatted)
    return resources


def _hand_written_names(folder: Path) -> Dict[Tuple[str, str], Path]:
    names: Dict[Tuple[str, str], Path] = {}
    if not folder.is_dir():
        return names
    for path in sorted(folder.glob("*.xml")):
        if path.name == GENERATED_FILE:
            continue
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError as error:
            raise GenerationError(f"{path} : XML illisible ({error})") from error
        if root.tag != "resources":
            continue
        for element in root:
            if element.tag in ("string", "plurals") and element.get("name"):
                names.setdefault((element.tag, element.get("name")), path)
    return names


def _check_collisions(module: ModuleManifest, folder: Path, resources: Sequence[Resource], android_root: Path) -> None:
    taken = _hand_written_names(folder)
    for resource in resources:
        tag = "plurals" if isinstance(resource, PluralsResource) else "string"
        owner = taken.get((tag, resource.name))
        if owner is not None:
            raise GenerationError(
                f"module {module.module} : le nom « {resource.name} » est déjà défini à la main dans "
                f"{owner.relative_to(android_root).as_posix()} (dossier {folder.name}) ; "
                f"retirer la clé de ce fichier ou ne pas l'adopter"
            )


def _generate_module(module: ModuleManifest, catalogs: _Catalogs, android_root: Path, generation: Generation) -> None:
    per_locale: Dict[str, List[Resource]] = {locale.code: [] for locale in ANDROID_LOCALES}
    adopted = module.adopted()
    for entry in adopted:
        try:
            resolved = _resolve_entry(entry, catalogs, generation.warnings)
        except _ERRORS as error:
            raise GenerationError(
                f"module {module.module}, « {entry.ios_key} » ({entry.catalog}) → {entry.android_name} : {error}"
            ) from error
        for language, resource in (resolved or {}).items():
            per_locale[language].append(resource)
    if not adopted:
        return
    for locale in ANDROID_LOCALES:
        folder = android_root / module.res_dir / locale.folder
        _check_collisions(module, folder, per_locale[locale.code], android_root)
        try:
            generation.files[folder / GENERATED_FILE] = render_document(per_locale[locale.code])
        except WriterError as error:
            raise GenerationError(f"module {module.module} [{locale.code}] : {error}") from error


def generate(manifest: Manifest, *, repo_root: Path, android_root: Path) -> Generation:
    generation = Generation()
    catalogs = _Catalogs(repo_root)
    for module in manifest.modules:
        _generate_module(module, catalogs, android_root, generation)
    return generation


def _existing_generated_files(android_root: Path) -> List[Path]:
    found: List[Path] = []
    for directory, subdirectories, files in os.walk(android_root):
        subdirectories[:] = [name for name in subdirectories if name not in _PRUNED_DIRECTORIES]
        if GENERATED_FILE in files and Path(directory).name.startswith("values"):
            found.append(Path(directory) / GENERATED_FILE)
    return sorted(found)


def _relative(path: Path, android_root: Path) -> str:
    return path.relative_to(android_root).as_posix()


def _differing(expected: Dict[Path, str]) -> List[Path]:
    return sorted(
        path for path, content in expected.items()
        if not path.is_file() or path.read_bytes() != content.encode("utf-8")
    )


def _parse_arguments(argv: Optional[Sequence[str]]) -> argparse.Namespace:
    android_default = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Génère les chaînes Android depuis les catalogues .xcstrings iOS.")
    parser.add_argument("--check", action="store_true", help="ne modifie rien ; sort 1 si des fichiers sont périmés")
    parser.add_argument(
        "--manifest",
        type=Path,
        help="fichier ou dossier de manifeste, ENSEMBLE des modules (défaut : i18n/manifest) : "
        "les strings_generated.xml des modules qui n'y figurent plus sont supprimés",
    )
    parser.add_argument("--android-root", type=Path, default=android_default)
    parser.add_argument("--repo-root", type=Path)
    arguments = parser.parse_args(argv)
    arguments.android_root = arguments.android_root.resolve()
    arguments.repo_root = (arguments.repo_root or arguments.android_root.parents[1]).resolve()
    return arguments


def main(argv: Optional[Sequence[str]] = None) -> int:
    arguments = _parse_arguments(argv)
    android_root = arguments.android_root
    try:
        manifest_path = arguments.manifest or android_root / "i18n" / "manifest"
        manifest = load_manifest(manifest_path, must_exist=arguments.manifest is not None)
        generation = generate(manifest, repo_root=arguments.repo_root, android_root=android_root)
    except (GenerationError, *_ERRORS) as error:
        print(f"i18n : génération impossible — {error}", file=sys.stderr)
        return 2
    for warning in generation.warnings:
        print(f"i18n : avertissement — {warning}", file=sys.stderr)
    orphans = [path for path in _existing_generated_files(android_root) if path not in generation.files]
    stale = _differing(generation.files)
    if arguments.check:
        return _report_stale(sorted(stale + orphans), android_root)
    return _write(generation, stale, orphans, android_root)


def _report_stale(stale: List[Path], android_root: Path) -> int:
    if not stale:
        print("i18n --check : les chaînes générées sont à jour.")
        return 0
    for path in stale:
        print(f"périmé : {_relative(path, android_root)}")
    print(f"i18n --check : {len(stale)} fichier(s) périmé(s) — lancer ./apps/android/meeshy.sh i18n")
    return 1


def _write(generation: Generation, stale: List[Path], orphans: List[Path], android_root: Path) -> int:
    if not generation.files and not orphans:
        print("i18n : rien à générer (aucune clé au statut adopted).")
        return 0
    for path in stale:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(generation.files[path].encode("utf-8"))
    for path in orphans:
        path.unlink()
        _remove_if_empty(path.parent)
    unchanged = len(generation.files) - len(stale)
    print(f"i18n : {len(stale)} fichier(s) écrit(s), {unchanged} inchangé(s), {len(orphans)} supprimé(s).")
    return 0


def _remove_if_empty(directory: Path) -> None:
    try:
        directory.rmdir()
    except OSError:
        pass


if __name__ == "__main__":
    sys.exit(main())
