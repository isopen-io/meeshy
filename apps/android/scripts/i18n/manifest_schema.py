"""Format du manifeste des chaînes : quelles clés iOS deviennent quelles ressources Android.

Un document de manifeste (un fichier JSON, ou un fragment `<module>.d/<lot>.json`) :

  {
    "schemaVersion": 1,
    "modules": {
      ":feature:chat": {
        "resDir": "feature/chat/src/main/res",            relatif à apps/android
        "entries": [
          {"catalog": "app", "iosKey": "chat.send", "status": "adopted"},
          {"catalog": "app", "iosKey": "Annuler", "androidName": "common_cancel",
           "kind": "string", "status": "adopted"},
          {"catalog": "app", "iosKey": "unread.count", "kind": "plurals",
           "fillMissingQuantities": true, "status": "adopted"},
          {"androidName": "chat_only_on_android", "status": "android-only"}
        ]
      }
    }
  }

  catalog                 identifiant d'un catalogue iOS (voir CATALOGS)
  iosKey                  clé dans ce catalogue
  androidName             nom de la ressource ; par défaut la clé avec « . » et « - » remplacés par « _ »
  kind                    string (défaut) | plurals
  status                  adopted : émise · candidate : prévue, pas émise · disabled : retirée, pas émise ·
                          android-only : réserve un nom écrit à la main, sans équivalent iOS
  fillMissingQuantities   plurals seulement : reprendre `other` pour les quantités CLDR absentes (comme iOS)

Un chemin de manifeste peut aussi désigner un DOSSIER : tous les `*.json` qu'il contient
(récursivement) sont fusionnés par module, dans l'ordre alphabétique des chemins.
Le chargeur est strict : un champ inconnu, un statut inconnu ou un nom en double échouent.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Mapping, Optional, Tuple

SCHEMA_VERSION = 1

STATUSES = ("adopted", "candidate", "android-only", "disabled")
KINDS = ("string", "plurals")

CATALOGS: Dict[str, str] = {
    "app": "apps/ios/Meeshy/Localizable.xcstrings",
    "ui": "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings",
    "widgets": "apps/ios/MeeshyWidgets/Localizable.xcstrings",
    "nse": "apps/ios/MeeshyNotificationExtension/Localizable.xcstrings",
    "nce": "apps/ios/MeeshyNotificationContentExtension/Localizable.xcstrings",
    "infoplist": "apps/ios/Meeshy/InfoPlist.xcstrings",
}

_ENTRY_FIELDS = {"catalog", "iosKey", "androidName", "kind", "status", "fillMissingQuantities"}
_MODULE_FIELDS = {"resDir", "entries"}
_DOCUMENT_FIELDS = {"schemaVersion", "modules"}
_RESOURCE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_GRADLE_PATH = re.compile(r"^(:[A-Za-z0-9_-]+)+$")
_IDENTIFIER_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]*$")


class ManifestError(ValueError):
    pass


@dataclass(frozen=True)
class ManifestEntry:
    android_name: str
    kind: str
    status: str
    catalog: Optional[str]
    ios_key: Optional[str]
    fill_missing_quantities: bool
    origin: str


@dataclass(frozen=True)
class ModuleManifest:
    module: str
    res_dir: str
    entries: Tuple[ManifestEntry, ...]

    def adopted(self) -> Tuple[ManifestEntry, ...]:
        return tuple(sorted((entry for entry in self.entries if entry.status == "adopted"),
                            key=lambda entry: entry.android_name))


@dataclass(frozen=True)
class Manifest:
    modules: Tuple[ModuleManifest, ...]


def derive_android_name(ios_key: str) -> str:
    if not (_IDENTIFIER_KEY.match(ios_key) and ("." in ios_key or "_" in ios_key)):
        raise ManifestError(
            f"la clé iOS « {ios_key} » n'est pas un identifiant : donner un « androidName » explicite"
        )
    return re.sub(r"[.\-]", "_", ios_key)


def _expect_object(value: Any, where: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise ManifestError(f"{where} : un objet JSON est attendu")
    return value


def _reject_unknown(fields: Mapping[str, Any], allowed: set, where: str) -> None:
    unknown = sorted(set(fields) - allowed)
    if unknown:
        raise ManifestError(f"{where} : champ(s) inconnu(s) {', '.join(unknown)}")


def _parse_entry(raw: Any, where: str) -> ManifestEntry:
    fields = _expect_object(raw, where)
    _reject_unknown(fields, _ENTRY_FIELDS, where)
    status = fields.get("status")
    if status not in STATUSES:
        raise ManifestError(f"{where} : statut {status!r} inconnu (attendu : {', '.join(STATUSES)})")
    kind = fields.get("kind", "string")
    if kind not in KINDS:
        raise ManifestError(f"{where} : kind {kind!r} inconnu (attendu : {', '.join(KINDS)})")
    catalog, ios_key = fields.get("catalog"), fields.get("iosKey")
    if status == "android-only":
        if catalog is not None or ios_key is not None:
            raise ManifestError(f"{where} : une entrée android-only n'a ni catalog ni iosKey")
        if "androidName" not in fields:
            raise ManifestError(f"{where} : une entrée android-only déclare son androidName")
    else:
        if catalog not in CATALOGS:
            raise ManifestError(f"{where} : catalog {catalog!r} inconnu (attendu : {', '.join(CATALOGS)})")
        if not isinstance(ios_key, str) or not ios_key:
            raise ManifestError(f"{where} : iosKey est obligatoire pour le statut {status}")
    name = fields["androidName"] if "androidName" in fields else derive_android_name(ios_key)
    if not isinstance(name, str) or not _RESOURCE_NAME.match(name):
        raise ManifestError(f"{where} : androidName {name!r} n'est pas un identifiant de ressource Android")
    fill = fields.get("fillMissingQuantities", False)
    if not isinstance(fill, bool) or (fill and kind != "plurals"):
        raise ManifestError(f"{where} : fillMissingQuantities est un booléen réservé à kind « plurals »")
    return ManifestEntry(name, kind, status, catalog, ios_key, fill, where)


def _parse_res_dir(value: Any, where: str) -> str:
    path = PurePosixPath(value) if isinstance(value, str) else None
    if path is None or not value or path.is_absolute() or ".." in path.parts:
        raise ManifestError(f"{where} : resDir doit être un chemin relatif à apps/android, sans « .. »")
    return str(path)


def _parse_module(module: str, raw: Any, source: str) -> ModuleManifest:
    where = f"{source} [{module}]"
    if not _GRADLE_PATH.match(module):
        raise ManifestError(f"{where} : « {module} » n'est pas un chemin Gradle (ex. :feature:chat)")
    fields = _expect_object(raw, where)
    _reject_unknown(fields, _MODULE_FIELDS, where)
    entries = fields.get("entries")
    if not isinstance(entries, list):
        raise ManifestError(f"{where} : « entries » doit être une liste")
    return ModuleManifest(
        module=module,
        res_dir=_parse_res_dir(fields.get("resDir"), where),
        entries=tuple(_parse_entry(item, f"{where} #{index}") for index, item in enumerate(entries)),
    )


def _check_unique_names(module: ModuleManifest) -> None:
    seen: Dict[str, ManifestEntry] = {}
    for entry in module.entries:
        first = seen.setdefault(entry.android_name, entry)
        if first is not entry:
            raise ManifestError(
                f"module {module.module} : le nom Android « {entry.android_name} » est déclaré deux fois "
                f"({first.origin} et {entry.origin})"
            )


def parse_manifest(document: Any, source: str) -> Manifest:
    fields = _expect_object(document, source)
    _reject_unknown(fields, _DOCUMENT_FIELDS, source)
    if fields.get("schemaVersion") != SCHEMA_VERSION:
        raise ManifestError(f"{source} : schemaVersion {fields.get('schemaVersion')!r} non pris en charge")
    modules = _expect_object(fields.get("modules"), f"{source} « modules »")
    parsed = tuple(_parse_module(name, raw, source) for name, raw in sorted(modules.items()))
    for module in parsed:
        _check_unique_names(module)
    return Manifest(modules=parsed)


def _merge(manifests: List[Manifest]) -> Manifest:
    by_module: Dict[str, List[ModuleManifest]] = {}
    for manifest in manifests:
        for module in manifest.modules:
            by_module.setdefault(module.module, []).append(module)
    merged = []
    for name in sorted(by_module):
        parts = by_module[name]
        res_dirs = {part.res_dir for part in parts}
        if len(res_dirs) > 1:
            raise ManifestError(f"module {name} : resDir contradictoires entre fragments ({', '.join(sorted(res_dirs))})")
        module = ModuleManifest(name, parts[0].res_dir, tuple(entry for part in parts for entry in part.entries))
        _check_unique_names(module)
        merged.append(module)
    return Manifest(modules=tuple(merged))


def _read_document(path: Path) -> Manifest:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ManifestError(f"{path} : lecture impossible ({error})") from error
    except json.JSONDecodeError as error:
        raise ManifestError(f"{path} : JSON invalide ({error})") from error
    return parse_manifest(document, str(path))


def load_manifest(path: Path, must_exist: bool = True) -> Manifest:
    path = Path(path)
    if not path.exists():
        if must_exist:
            raise ManifestError(f"{path} : manifeste introuvable")
        return Manifest(modules=())
    files = sorted(path.rglob("*.json")) if path.is_dir() else [path]
    return _merge([_read_document(file) for file in files])
