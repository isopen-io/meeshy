"""Ce qui part au modèle pour un message, et comment sa réponse se recolle (#9723).

Un message masqué (entités protégées) devient une suite de phrases. Chacune est
soit déjà résolue — interjection du lexique, ou rien à traduire (émoji, nombre) —
soit confiée au modèle, en un ou plusieurs morceaux si elle est très longue. Le
moteur traduit toutes les entrées du modèle d'un message en UN appel par lot, puis
`assemble` recolle les phrases dans l'ordre avec leurs séparateurs d'origine.
"""

from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

from utils.interjections import translate_interjection
from utils.sentence_split import SentencePiece, join_gap, split_sentences, tidy_translation
from utils.text_segmentation import has_translatable_text


@dataclass(frozen=True)
class PlannedSentence:
    piece: SentencePiece
    resolved: Optional[str]
    chunks: Tuple[str, ...]


@dataclass(frozen=True)
class SentencePlan:
    sentences: Tuple[PlannedSentence, ...]
    target_language: str

    @property
    def model_inputs(self) -> List[str]:
        return [chunk for sentence in self.sentences for chunk in sentence.chunks]

    def assemble(self, model_outputs: Sequence[str]) -> str:
        outputs = iter(model_outputs)
        last = len(self.sentences) - 1
        parts = []
        for index, sentence in enumerate(self.sentences):
            translated = sentence.resolved if sentence.resolved is not None else " ".join(
                tidy_translation(next(outputs), chunk, self.target_language) for chunk in sentence.chunks
            )
            gap = join_gap(sentence.piece.after, self.target_language, is_last=index == last)
            parts.append(sentence.piece.before + translated + gap)
        return "".join(parts)


def _planned(
    piece: SentencePiece, source_language: str, target_language: str,
    split_long: Callable[[str], List[str]],
) -> PlannedSentence:
    if not has_translatable_text(piece.core):
        return PlannedSentence(piece=piece, resolved=piece.core, chunks=())
    lexical = translate_interjection(piece.core, source_language, target_language)
    if lexical is not None:
        return PlannedSentence(piece=piece, resolved=lexical, chunks=())
    return PlannedSentence(piece=piece, resolved=None, chunks=tuple(split_long(piece.core)))


def plan_sentences(
    masked_text: str,
    source_language: str,
    target_language: str,
    split_long: Callable[[str], List[str]] = lambda sentence: [sentence],
) -> SentencePlan:
    return SentencePlan(
        sentences=tuple(
            _planned(piece, source_language, target_language, split_long)
            for piece in split_sentences(masked_text)
        ),
        target_language=target_language,
    )
