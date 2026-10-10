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

# Toutes les expressions restent LINÉAIRES sur un texte hostile (témoin :
# test_sentence_split_linear_time.py) : un quantificateur ne démarre qu'au DÉBUT
# d'une suite (`(?<!\s)`, `(?<![…])`), jamais à chacune de ses positions — sans
# quoi « 5 000 espaces puis une lettre » coûte n² retours arrière. Python 3.10
# (CI) n'a ni quantificateur possessif ni groupe atomique.
_GAP = re.compile(r"\s+")
_CJK_GLUED = re.compile(f"(?<![{CJK_TERMINATORS}])[{CJK_TERMINATORS}]+(?=[^\\s{CJK_TERMINATORS}])")
_LEADING_DIALOGUE_DASH = re.compile(r"^[-–—]\s+")
_SPACE_BEFORE_COMMA_OR_PERIOD = re.compile(r"(?<!\s)\s+([,.])")
_SPACE_BEFORE_EXCLAMATION = re.compile(r"(?<!\s)\s+((?<![!?])[!?]+)(?=\s|$|[\"'»”)\]])")
_SPLIT_ENGLISH_CONTRACTION = re.compile(r"(?<!\s)\s+('(?:s|re|ll|ve|d|m|t)\b|n't\b)", re.IGNORECASE)


class SentencePiece(NamedTuple):
    core: str
    before: str
    after: str


def _base_language(language: str) -> str:
    return (language or "").split("-")[0].lower()


def _skip_back(text: str, index: int, floor: int, belongs) -> int:
    while index > floor and belongs(text[index - 1]):
        index -= 1
    return index


def _is_word_char(char: str) -> bool:
    return char.isalnum() or char == "_"


def _ends_sentence(text: str, gap_start: int, gap_end: int, floor: int) -> bool:
    """La suite d'espaces `text[gap_start:gap_end]` clôt-elle une phrase ?

    Lecture en arrière bornée par `floor` (la frontière précédente) : chaque
    caractère du texte n'est relu qu'une fois sur tout le découpage."""
    end = _skip_back(text, gap_start, floor, lambda char: char in CLOSERS)
    if end == floor:
        return False
    last = text[end - 1]
    if last in STRONG_TERMINATORS:
        return True
    if last != "." or text[gap_end].islower():
        return False
    word_end = _skip_back(text, end, floor, lambda char: char == ".")
    word_start = _skip_back(text, word_end, floor, _is_word_char)
    previous = text[word_start:word_end]
    if not previous:
        return True
    return not (len(previous) == 1 and previous.isalpha()) and previous.lower() not in ABBREVIATIONS


def _boundaries(text: str) -> List[tuple]:
    gaps = []
    floor = 0
    for match in _GAP.finditer(text):
        start, end = match.span()
        if 0 < start and end < len(text) and (
            "\n" in match.group() or _ends_sentence(text, start, end, floor)
        ):
            gaps.append((start, end))
        floor = end
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
