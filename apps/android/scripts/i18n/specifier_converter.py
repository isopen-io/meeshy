"""Conversion des spécificateurs de format iOS (printf/NSString) vers java.util.Formatter.

Règles (miroir de ce que `String(format:)` accepte côté iOS, restreint à ce que
Android sait afficher) :

  %@                            -> %s
  %d %i %u %ld %lld %lu ...     -> %d
  %f %lf %.2f %e %g %a          -> conservés, sans modificateur de longueur
  %x %X %o %c                   -> conservés
  %%                            -> %%
  %1$@ %2$lld                   -> %1$s %2$d (déjà positionnels : numéros conservés)

Dès qu'une chaîne compte deux spécificateurs ou plus, tous sont écrits en forme
positionnelle (%1$s, %2$d) : Android l'exige pour qu'une traduction puisse
réordonner ses arguments, et aapt2 refuse deux substitutions non positionnelles.

Un `%` suivi d'un espace (« 30 % de plus ») est de la prose, pas un format : le
drapeau « espace » du printf n'est volontairement pas reconnu, parce que les
catalogues l'emploient quarante fois comme du texte et jamais comme un format.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Tuple


class SpecifierError(ValueError):
    pass


@dataclass(frozen=True)
class Argument:
    position: int
    conversion: str


@dataclass(frozen=True)
class ConvertedText:
    text: str
    arguments: Tuple[Argument, ...]
    formatted: bool


_TOKEN = re.compile(
    r"%%"
    r"|%(?:(?P<position>\d+)\$)?"
    r"(?P<flags>[-+#0]*)"
    r"(?P<width>\d+|\*)?"
    r"(?:\.(?P<precision>\d+|\*))?"
    r"(?P<length>hh|h|ll|l|q|L|z|t|j)?"
    r"(?P<conversion>[@diuoxXfFeEgGaAcCsSp])"
)

_CONVERSIONS = {
    "@": "s", "s": "s",
    "d": "d", "i": "d", "u": "d",
    "o": "o", "x": "x", "X": "X",
    "f": "f", "F": "f", "e": "e", "E": "E", "g": "g", "G": "G", "a": "a", "A": "A",
    "c": "c",
}


@dataclass(frozen=True)
class _Specifier:
    position: Optional[int]
    flags: str
    width: str
    precision: str
    conversion: str


def _parse_specifier(match: "re.Match[str]") -> _Specifier:
    raw = match.group(0)
    conversion = match.group("conversion")
    if match.group("width") == "*" or match.group("precision") == "*":
        raise SpecifierError(f"largeur ou précision « * » non prise en charge : {raw}")
    if conversion not in _CONVERSIONS:
        raise SpecifierError(f"spécificateur non pris en charge sur Android : {raw}")
    position = match.group("position")
    if position is not None and int(position) < 1:
        raise SpecifierError(f"position d'argument invalide (les positions commencent à 1) : {raw}")
    precision = match.group("precision")
    return _Specifier(
        position=int(position) if position is not None else None,
        flags=match.group("flags") or "",
        width=match.group("width") or "",
        precision=f".{precision}" if precision else "",
        conversion=_CONVERSIONS[conversion],
    )


def _render(specifier: _Specifier, position: int, positional: bool) -> str:
    index = f"{position}$" if positional else ""
    return f"%{index}{specifier.flags}{specifier.width}{specifier.precision}{specifier.conversion}"


def _arguments(specifiers: List[Tuple[_Specifier, int]]) -> Tuple[Argument, ...]:
    conversions = {}
    for specifier, position in specifiers:
        known = conversions.setdefault(position, specifier.conversion)
        if known != specifier.conversion:
            raise SpecifierError(
                f"l'argument {position} est employé comme %{known} puis comme %{specifier.conversion}"
            )
    return tuple(Argument(position, conversions[position]) for position in sorted(conversions))


def convert_specifiers(text: str) -> ConvertedText:
    matches = list(_TOKEN.finditer(text))
    specifiers = [(_parse_specifier(m), m) for m in matches if m.group(0) != "%%"]
    positional_count = sum(1 for specifier, _ in specifiers if specifier.position is not None)
    if 0 < positional_count < len(specifiers):
        raise SpecifierError("formats positionnels et séquentiels mélangés dans la même chaîne")

    positional = positional_count > 0 or len(specifiers) >= 2
    numbered = [
        (specifier, specifier.position if specifier.position is not None else index)
        for index, (specifier, _) in enumerate(specifiers, start=1)
    ]
    arguments = _arguments(numbered)

    rendered = {match.start(): _render(specifier, position, positional)
                for (specifier, match), (_, position) in zip(specifiers, numbered)}
    has_arguments = bool(arguments)
    pieces: List[str] = []
    has_prose_percent = False
    cursor = 0
    for match in matches:
        prose = text[cursor:match.start()]
        has_prose_percent = has_prose_percent or "%" in prose
        pieces.append(prose.replace("%", "%%") if has_arguments else prose)
        pieces.append("%%" if match.group(0) == "%%" else rendered[match.start()])
        cursor = match.end()
    tail = text[cursor:]
    has_prose_percent = has_prose_percent or "%" in tail
    pieces.append(tail.replace("%", "%%") if has_arguments else tail)

    return ConvertedText(
        text="".join(pieces),
        arguments=arguments,
        formatted=has_arguments or not has_prose_percent,
    )
