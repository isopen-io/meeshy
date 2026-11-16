"""Reconnaître une traduction hallucinée par NLLB, et l'échelle qui tente de la corriger (#18716).

NLLB-200 a appris sur Europarl et des textes religieux : sur une source courte ou
hors de son domaine, la génération gloutonne rend volontiers « The Commission has
also adopted a proposal for a regulation… ». Chaque règle ci-dessous nomme un
motif ; une sortie qui en porte un n'est jamais servie telle quelle.

- `empty`        : rien en sortie pour une source qui a du texte ;
- `length_ratio` : sortie démesurée face à la source (longueur pondérée par écriture) ;
- `boilerplate`  : empreinte du corpus d'entraînement absente de la source, sur une
                   sortie déjà plus longue que prévu ;
- `repetition`   : un mot ou un trigramme répété bien plus qu'en source ;
- `wrong_script` : la sortie n'est pas dans l'écriture de la langue cible.

Décision : `decisions/2026-11-15-une-traduction-hallucinee-est-relancee-puis-annulee-18716.md`.
"""

import re
import unicodedata
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from config.settings import LANGUAGE_MAPPINGS


LENGTH_RATIO_HARD = 3.0
LENGTH_SLACK_HARD = 20
LENGTH_RATIO_SOFT = 1.6
LENGTH_SLACK_SOFT = 10
REPEATED_WORD_RUN = 3
REPEATED_TRIGRAM = 3
TARGET_SCRIPT_SHARE = 0.5
SCRIPT_MIN_LETTERS = 4

ESCALATION_PROFILES: tuple[dict[str, Any], ...] = (
    {"num_beams": 4, "no_repeat_ngram_size": 4, "repetition_penalty": 1.15, "budget_factor": 1.6},
    {
        "num_beams": 6,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.3,
        "length_penalty": 0.8,
        "budget_factor": 1.25,
    },
)

_PLACEHOLDER = re.compile(r"🔹EMOJI_\d+🔹")
_WORD = re.compile(r"\w+", re.UNICODE)

_BOILERPLATE_CONCEPTS: tuple[tuple[str, ...], ...] = (
    ("the commission", "la commission", "la comisión", "die kommission", "a comissão",
     "la commissione", "commission", "comisión", "kommission", "comissão", "commissione"),
    ("member states", "états membres", "estados miembros", "mitgliedstaaten", "estados-membros",
     "stati membri"),
    ("common agricultural policy", "politique agricole commune", "política agrícola común",
     "gemeinsamen agrarpolitik", "política agrícola comum", "politica agricola comune"),
    ("european parliament", "parlement européen", "parlamento europeo", "europäische parlament",
     "parlamento europeu"),
    ("mr president", "madam president", "monsieur le président", "madame la présidente",
     "señor presidente", "herr präsident", "senhor presidente", "signor presidente"),
    ("honourable members", "the rapporteur", "le rapporteur", "rapporteur"),
    ("the european union", "council regulation", "union européenne", "unión europea",
     "europäische union", "união europeia", "unione europea"),
    ("jehovah", "unto"),
)
_BOILERPLATE = tuple(
    tuple(re.compile(rf"\b{re.escape(phrase)}\b", re.IGNORECASE) for phrase in concept)
    for concept in _BOILERPLATE_CONCEPTS
)

_SCRIPT_LETTERS = {
    "Latn": ("LATIN",), "Cyrl": ("CYRILLIC",), "Arab": ("ARABIC",), "Hebr": ("HEBREW",),
    "Grek": ("GREEK",), "Hans": ("CJK",), "Hant": ("CJK",),
    "Jpan": ("CJK", "HIRAGANA", "KATAKANA"), "Hang": ("HANGUL",), "Kore": ("HANGUL",),
    "Deva": ("DEVANAGARI",), "Beng": ("BENGALI",), "Thai": ("THAI",), "Geor": ("GEORGIAN",),
    "Khmr": ("KHMER",), "Laoo": ("LAO",), "Mymr": ("MYANMAR",), "Taml": ("TAMIL",),
    "Telu": ("TELUGU",), "Knda": ("KANNADA",), "Mlym": ("MALAYALAM",), "Gujr": ("GUJARATI",),
    "Guru": ("GURMUKHI",), "Sinh": ("SINHALA",), "Orya": ("ORIYA",), "Ethi": ("ETHIOPIC",),
    "Armn": ("ARMENIAN",), "Tibt": ("TIBETAN",),
}
_WIDE_LETTERS = (("CJK", 3), ("HIRAGANA", 3), ("KATAKANA", 3), ("HANGUL", 2))


@dataclass(frozen=True)
class QualityVerdict:
    reasons: tuple[str, ...]

    @property
    def acceptable(self) -> bool:
        return not self.reasons


def _letters(text: str) -> list[str]:
    return [char for char in _PLACEHOLDER.sub(" ", text) if char.isalpha()]


def _char_name(char: str) -> str:
    return unicodedata.name(char, "")


def _weighted_length(text: str) -> int:
    def weight(char: str) -> int:
        name = _char_name(char)
        return next((w for prefix, w in _WIDE_LETTERS if name.startswith(prefix)), 1)

    return sum(weight(char) for char in _PLACEHOLDER.sub(" ", text) if not char.isspace())


def _exceeds(source: str, translation: str, ratio: float, slack: int) -> bool:
    return _weighted_length(translation) > ratio * _weighted_length(source) + slack


def _boilerplate(source: str, translation: str) -> bool:
    def unanchored(concept: Sequence[re.Pattern[str]]) -> bool:
        in_output = any(pattern.search(translation) for pattern in concept)
        return in_output and not any(pattern.search(source) for pattern in concept)

    return _exceeds(source, translation, LENGTH_RATIO_SOFT, LENGTH_SLACK_SOFT) and any(
        unanchored(concept) for concept in _BOILERPLATE
    )


def _longest_word_run(words: Sequence[str]) -> int:
    longest, run = 0, 0
    for index, word in enumerate(words):
        run = run + 1 if index and word == words[index - 1] else 1
        longest = max(longest, run)
    return longest


def _top_trigram(words: Sequence[str]) -> int:
    trigrams = Counter(zip(words, words[1:], words[2:]))
    return max(trigrams.values(), default=0)


def _repetition(source: str, translation: str) -> bool:
    source_words = _WORD.findall(source.lower())
    words = _WORD.findall(translation.lower())
    stutters = _longest_word_run(words)
    loops = _top_trigram(words)
    return (stutters >= REPEATED_WORD_RUN and stutters > _longest_word_run(source_words)) or (
        loops >= REPEATED_TRIGRAM and loops > _top_trigram(source_words) + 1
    )


def target_script(target_lang: str) -> tuple[str, ...] | None:
    nllb_code = LANGUAGE_MAPPINGS.get(target_lang, "")
    return _SCRIPT_LETTERS.get(nllb_code.rpartition("_")[2])


def _wrong_script(translation: str, target_lang: str) -> bool:
    prefixes = target_script(target_lang)
    letters = _letters(translation)
    if prefixes is None or len(letters) < SCRIPT_MIN_LETTERS:
        return False
    in_script = sum(_char_name(char).startswith(prefixes) for char in letters)
    return in_script / len(letters) < TARGET_SCRIPT_SHARE


def assess_translation(source: str, translation: str, target_lang: str) -> QualityVerdict:
    if _letters(source) and not translation.strip():
        return QualityVerdict(reasons=("empty",))
    checks = (
        ("length_ratio", _exceeds(source, translation, LENGTH_RATIO_HARD, LENGTH_SLACK_HARD)),
        ("boilerplate", _boilerplate(source, translation)),
        ("repetition", _repetition(source, translation)),
        ("wrong_script", _wrong_script(translation, target_lang)),
    )
    return QualityVerdict(reasons=tuple(reason for reason, failed in checks if failed))
