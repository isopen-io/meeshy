"""Écriture déterministe des fichiers `strings_generated.xml`.

Un fichier ne dépend que de ses ressources : clés triées, aucun horodatage,
fins de ligne LF, UTF-8. Il commence par le bandeau « GÉNÉRÉ — ne pas modifier »
(sans déclaration XML : un commentaire ne peut précéder la déclaration, et un
document sans déclaration est lu en UTF-8).

Échappements appliqués à chaque valeur, dans cet ordre :
  \\ -> \\\\   ' -> \\'   " -> \\"   LF -> \\n   TAB -> \\t       (aapt2)
  & < >  -> entités XML
  @ ou ? en tête            -> \\@ \\?   (sinon lus comme une référence de ressource)
  blancs en tête, en queue ou doublés -> valeur entre guillemets (aapt2 les replie)
  **x**                     -> <b>x</b>
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Sequence, Tuple, Union


class WriterError(ValueError):
    pass


BANNER = (
    "<!-- GÉNÉRÉ — ne pas modifier. Produit par apps/android/scripts/i18n/xcstrings_to_android.py "
    "depuis les catalogues de traduction iOS ; régénérer avec ./apps/android/meeshy.sh i18n -->"
)

QUANTITY_ORDER = ("zero", "one", "two", "few", "many", "other")

_INVALID_XML_CHARACTER = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f￾￿\ud800-\udfff]")
_INDENT = "    "


@dataclass(frozen=True)
class StringResource:
    name: str
    text: str
    formatted: bool = True


@dataclass(frozen=True)
class PluralsResource:
    name: str
    items: Tuple[Tuple[str, str], ...]


Resource = Union[StringResource, PluralsResource]


def _escape_segment(text: str, leading: bool) -> str:
    escaped = (
        text.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\t", "\\t")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    if leading and escaped[:1] in ("@", "?"):
        return "\\" + escaped
    return escaped


def _segments(text: str) -> List[Tuple[str, bool]]:
    parts = text.split("**")
    if len(parts) % 2 == 0:
        raise WriterError(f"balisage ** non apparié : {text!r}")
    return [(part, index % 2 == 1) for index, part in enumerate(parts) if part]


def render_value(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    invalid = _INVALID_XML_CHARACTER.search(normalized)
    if invalid:
        raise WriterError(f"caractère interdit en XML (U+{ord(invalid.group()):04X}) dans {text!r}")
    rendered = ""
    for index, (segment, bold) in enumerate(_segments(normalized)):
        escaped = _escape_segment(segment, leading=index == 0)
        rendered += f"<b>{escaped}</b>" if bold else escaped
    if rendered != rendered.strip(" ") or "  " in rendered:
        return f'"{rendered}"'
    return rendered


def _render_string(resource: StringResource) -> List[str]:
    attribute = "" if resource.formatted else ' formatted="false"'
    return [f'{_INDENT}<string name="{resource.name}"{attribute}>{render_value(resource.text)}</string>']


def _render_plurals(resource: PluralsResource) -> List[str]:
    ordered = sorted(resource.items, key=lambda item: QUANTITY_ORDER.index(item[0]))
    lines = [f'{_INDENT}<plurals name="{resource.name}">']
    lines += [f'{_INDENT * 2}<item quantity="{quantity}">{render_value(text)}</item>' for quantity, text in ordered]
    lines.append(f"{_INDENT}</plurals>")
    return lines


def render_document(resources: Sequence[Resource]) -> str:
    names = [resource.name for resource in resources]
    duplicated = sorted({name for name in names if names.count(name) > 1})
    if duplicated:
        raise WriterError(f"nom de ressource écrit deux fois : {', '.join(duplicated)}")
    lines = [BANNER, "<resources>"]
    for resource in sorted(resources, key=lambda candidate: candidate.name):
        lines += _render_plurals(resource) if isinstance(resource, PluralsResource) else _render_string(resource)
    lines.append("</resources>")
    return "\n".join(lines) + "\n"
