"""Découpage d'un message en phrases avant NLLB, et réassemblage fidèle (#9723).

NLLB-200 est entraîné phrase à phrase. Mesuré sur staging (2026-10-08, 600M et
1.3B) : un message court à plusieurs phrases, traduit d'un seul tenant, perd ses
phrases courtes — « Salut ! On part en vacances à la mer en juillet. Tu veux venir
avec nous ? » ressortait en une seule phrase, sans la salutation ni la question.

`split_sentences` coupe aux frontières de phrase (ponctuation forte, point hors
abréviation, saut de ligne) en gardant chaque espace autour de chaque phrase :
recoller `before + core + after` rend le texte d'origine à l'octet près.
"""

import re
from typing import List, NamedTuple

STRONG_TERMINATORS = "!?…؟।。！？"
CJK_TERMINATORS = "。！？"
CLOSERS = "\"'»”’)]"
NO_SPACE_LANGUAGES = frozenset({"zh", "ja"})
ABBREVIATIONS = frozenset({
    "mr", "mrs", "ms", "dr", "prof", "st", "sr", "sra", "srta", "jr",
    "mme", "mlle", "mm", "vs", "cf", "ex", "env", "av", "bd", "dept", "approx", "tél", "tel",
})

_GAP = re.compile(r"\s+")
_CJK_GLUED = re.compile(f"[{CJK_TERMINATORS}]+(?=\\S)")
_WORD_BEFORE_PERIOD = re.compile(r"(\w+)\.+$")
_LEADING_DIALOGUE_DASH = re.compile(r"^[-–—]\s+")
_SPACE_BEFORE_COMMA_OR_PERIOD = re.compile(r"\s+([,.])")
_SPACE_BEFORE_EXCLAMATION = re.compile(r"\s+([!?]+)(?=\s|$|[\"'»”)\]])")
_SPLIT_ENGLISH_CONTRACTION = re.compile(r"\s+('(?:s|re|ll|ve|d|m|t)\b|n't\b)", re.IGNORECASE)


class SentencePiece(NamedTuple):
    core: str
    before: str
    after: str


def _base_language(language: str) -> str:
    return (language or "").split("-")[0].lower()


def _ends_sentence(before: str, after: str) -> bool:
    tail = before.rstrip(CLOSERS)
    if not tail:
        return False
    if tail[-1] in STRONG_TERMINATORS:
        return True
    if tail[-1] != "." or after[:1].islower():
        return False
    word = _WORD_BEFORE_PERIOD.search(tail)
    if word is None:
        return True
    previous = word.group(1)
    return not (len(previous) == 1 and previous.isalpha()) and previous.lower() not in ABBREVIATIONS


def _boundaries(text: str) -> List[tuple]:
    gaps = [
        match.span()
        for match in _GAP.finditer(text)
        if 0 < match.start() and match.end() < len(text)
        and ("\n" in match.group() or _ends_sentence(text[:match.start()], text[match.end():]))
    ]
    glued = [(match.end(), match.end()) for match in _CJK_GLUED.finditer(text)]
    return sorted(gaps + glued)


def split_sentences(text: str) -> List[SentencePiece]:
    """Les phrases du texte, chacune avec l'espace qui la précède et la suit."""
    pieces: List[SentencePiece] = []
    cursor = 0
    for start, end in [*_boundaries(text), (len(text), len(text))]:
        segment = text[cursor:start]
        core = segment.strip()
        lead = segment[:len(segment) - len(segment.lstrip())] if core else segment
        trail = segment[len(lead) + len(core):]
        pieces.append(SentencePiece(core=core, before=lead, after=trail + text[start:end]))
        cursor = end
    return pieces


def join_gap(after: str, target_language: str, is_last: bool) -> str:
    """L'espace à recoller après une phrase traduite, selon l'écriture de la cible."""
    if is_last or "\n" in after:
        return after
    if _base_language(target_language) in NO_SPACE_LANGUAGES:
        return ""
    return after or " "


def tidy_translation(translated: str, source: str, target_language: str) -> str:
    """Retire les traces de sous-titres que NLLB laisse sur une phrase courte.

    Tiret de dialogue en tête (« - Bien sûr ! ») quand la source n'en a pas,
    espace avant la virgule ou le point (« Thank you . »), avant ! et ? hors
    du français, et contractions anglaises détachées (« what 's »).
    """
    tidy = translated.strip()
    if not _LEADING_DIALOGUE_DASH.match(source.strip()):
        tidy = _LEADING_DIALOGUE_DASH.sub("", tidy)
    tidy = _SPACE_BEFORE_COMMA_OR_PERIOD.sub(r"\1", tidy)
    language = _base_language(target_language)
    if language != "fr":
        tidy = _SPACE_BEFORE_EXCLAMATION.sub(r"\1", tidy)
    if language == "en":
        tidy = _SPLIT_ENGLISH_CONTRACTION.sub(r"\1", tidy)
    return tidy
