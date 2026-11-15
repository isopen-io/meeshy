"""Jeu doré : paires (source, référence) par direction de langue."""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from config.settings import LANGUAGE_MAPPINGS


PARAGRAPH_SENTENCES = 4
REQUIRED_FIELDS = ("id", "source_lang", "target_lang", "source", "reference", "origin")
TEXT_FIELDS = ("source", "reference")


class GoldenSetError(ValueError):
    pass


@dataclass(frozen=True)
class GoldenPair:
    id: str
    source_lang: str
    target_lang: str
    source: str
    reference: str
    origin: str


def _parse_line(number: int, line: str) -> GoldenPair:
    try:
        row = json.loads(line)
    except json.JSONDecodeError as error:
        raise GoldenSetError(f"ligne {number} : JSON illisible ({error.msg})")
    missing = [name for name in REQUIRED_FIELDS if not isinstance(row.get(name), str)]
    if missing:
        raise GoldenSetError(
            f"ligne {number} : champ manquant ou non textuel : {', '.join(missing)}"
        )
    empty = [name for name in TEXT_FIELDS if not row[name].strip()]
    if empty:
        raise GoldenSetError(f"ligne {number} : texte vide : {', '.join(empty)}")
    return GoldenPair(**{name: row[name] for name in REQUIRED_FIELDS})


def load_golden(path: Path) -> tuple[GoldenPair, ...]:
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    pairs = tuple(
        _parse_line(number, line) for number, line in enumerate(lines, start=1) if line.strip()
    )
    ids = [pair.id for pair in pairs]
    duplicated = sorted({identifier for identifier in ids if ids.count(identifier) > 1})
    if duplicated:
        raise GoldenSetError(f"identifiants en double : {', '.join(duplicated)}")
    return pairs


def _flores_code(language: str, codes: Mapping[str, str]) -> str:
    code = codes.get(language)
    if code is None:
        raise GoldenSetError(f"{language} n'a pas de code FLORES-200 : aucune référence à mesurer")
    return code


def _read_flores(root: Path, code: str, split: str) -> tuple[str, ...]:
    path = Path(root) / split / f"{code}.{split}"
    if not path.is_file():
        raise GoldenSetError(f"fichier FLORES absent : {path}")
    return tuple(path.read_text(encoding="utf-8").splitlines())


def _spread(count: int, total: int) -> tuple[int, ...]:
    return tuple(index * total // count for index in range(count)) if count else ()


def _directions(pivots: Sequence[str], languages: Sequence[str]) -> tuple[tuple[str, str], ...]:
    everyone = tuple(dict.fromkeys((*pivots, *languages)))
    return tuple(
        (source, target)
        for source in everyone
        for target in everyone
        if source != target and (source in pivots or target in pivots)
    )


def flores_pairs(
    root: Path,
    *,
    pivots: Sequence[str],
    languages: Sequence[str],
    sentences: int,
    paragraphs: int,
    split: str = "devtest",
    codes: Mapping[str, str] = LANGUAGE_MAPPINGS,
) -> tuple[GoldenPair, ...]:
    directions = _directions(pivots, languages)
    involved = tuple(dict.fromkeys(lang for direction in directions for lang in direction))
    corpus = {lang: _read_flores(root, _flores_code(lang, codes), split) for lang in involved}
    total = min(len(lines) for lines in corpus.values())
    sentence_rows = _spread(sentences, total)
    paragraph_rows = _spread(paragraphs, total - PARAGRAPH_SENTENCES + 1)
    origin = f"flores200-{split}"

    def sentence(lang: str, row: int) -> str:
        return corpus[lang][row]

    def paragraph(lang: str, row: int) -> str:
        return " ".join(corpus[lang][row : row + PARAGRAPH_SENTENCES])

    return tuple(
        GoldenPair(
            f"{origin}-{source}-{target}-{kind}{row}",
            source,
            target,
            text(source, row),
            text(target, row),
            origin,
        )
        for source, target in directions
        for kind, rows, text in (("s", sentence_rows, sentence), ("p", paragraph_rows, paragraph))
        for row in rows
    )
