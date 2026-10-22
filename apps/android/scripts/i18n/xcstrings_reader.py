"""Lecture des catalogues `.xcstrings` (format Xcode String Catalog, version 1.x).

Le lecteur est paresseux et strict à la fois : le JSON est chargé d'un bloc, mais
une entrée n'est interprétée que lorsqu'on la demande. Une forme que le lecteur ne
connaît pas (substitutions, variations par appareil, quantité hors CLDR) fait
échouer l'entrée demandée, en nommant la clé et la langue ; elle ne fait pas
échouer les milliers d'entrées que le manifeste n'adopte pas.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Tuple

PLURAL_QUANTITIES = ("zero", "one", "two", "few", "many", "other")


class CatalogError(ValueError):
    pass


@dataclass(frozen=True)
class AndroidLocale:
    code: str
    folder: str
    catalog_codes: Tuple[str, ...]


ANDROID_LOCALES: Tuple[AndroidLocale, ...] = (
    AndroidLocale("en", "values", ("en",)),
    AndroidLocale("fr", "values-fr", ("fr",)),
    AndroidLocale("es", "values-es", ("es",)),
    AndroidLocale("de", "values-de", ("de",)),
    AndroidLocale("it", "values-it", ("it",)),
    AndroidLocale("pt", "values-pt", ("pt-BR", "pt")),
    AndroidLocale("ar", "values-ar", ("ar",)),
)

DEFAULT_LOCALE = ANDROID_LOCALES[0]


@dataclass(frozen=True)
class Localization:
    text: Optional[str] = None
    plural: Optional[Mapping[str, str]] = None


@dataclass(frozen=True)
class CatalogEntry:
    key: str
    stale: bool
    localizations: Mapping[str, Localization]


def _string_unit(unit: Any, where: str) -> str:
    if not isinstance(unit, dict) or set(unit) - {"state", "value"} or not isinstance(unit.get("value"), str):
        raise CatalogError(f"{where} : forme de stringUnit inconnue")
    return unit["value"]


def _plural(variations: Any, where: str) -> Dict[str, str]:
    plural = variations.get("plural") if isinstance(variations, dict) else None
    if not isinstance(plural, dict) or set(variations) != {"plural"}:
        raise CatalogError(f"{where} : seules les variations « plural » sont prises en charge")
    unknown = [quantity for quantity in plural if quantity not in PLURAL_QUANTITIES]
    if unknown:
        raise CatalogError(f"{where} : quantité hors CLDR {', '.join(unknown)}")
    quantities: Dict[str, str] = {}
    for quantity, branch in plural.items():
        if not isinstance(branch, dict) or set(branch) != {"stringUnit"}:
            raise CatalogError(f"{where} : la quantité {quantity} ne porte pas un simple stringUnit")
        quantities[quantity] = _string_unit(branch["stringUnit"], f"{where} ({quantity})")
    return quantities


def _localization(raw: Any, where: str) -> Localization:
    if not isinstance(raw, dict) or len(raw) != 1:
        raise CatalogError(f"{where} : forme de localisation inconnue")
    if "stringUnit" in raw:
        return Localization(text=_string_unit(raw["stringUnit"], where))
    if "variations" in raw:
        return Localization(plural=_plural(raw["variations"], where))
    raise CatalogError(f"{where} : forme de localisation inconnue ({', '.join(raw)})")


class Catalog:
    def __init__(self, path: Path, document: Mapping[str, Any]) -> None:
        strings = document.get("strings")
        source_language = document.get("sourceLanguage")
        if not isinstance(strings, dict) or not isinstance(source_language, str):
            raise CatalogError(f"{path} : ni « strings » ni « sourceLanguage » exploitables")
        self.path = path
        self.source_language = source_language
        self._strings: Dict[str, Any] = strings

    def has(self, key: str) -> bool:
        return key in self._strings

    def entry(self, key: str) -> CatalogEntry:
        raw = self._strings.get(key)
        if raw is None:
            raise CatalogError(f"{self.path.name} : clé introuvable « {key} »")
        localizations = {
            language: _localization(value, f"{self.path.name} « {key} » [{language}]")
            for language, value in (raw.get("localizations") or {}).items()
        }
        return CatalogEntry(key=key, stale=raw.get("extractionState") == "stale", localizations=localizations)

    def source_localization(self, entry: CatalogEntry, *, key_fallback: bool = True) -> Optional[Localization]:
        present = entry.localizations.get(self.source_language)
        if present is not None or not key_fallback:
            return present
        return Localization(text=entry.key)

    def localization(
        self, entry: CatalogEntry, locale: AndroidLocale, *, key_fallback: bool = True
    ) -> Optional[Localization]:
        present = next((entry.localizations[code] for code in locale.catalog_codes if code in entry.localizations), None)
        if present is not None or not key_fallback:
            return present
        if self.source_language in locale.catalog_codes:
            return Localization(text=entry.key)
        return None


def read_catalog(path: Path) -> Catalog:
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as error:
        raise CatalogError(f"{path} : lecture impossible ({error})") from error
    except json.JSONDecodeError as error:
        raise CatalogError(f"{path} : JSON invalide ({error})") from error
    return Catalog(Path(path), document)
