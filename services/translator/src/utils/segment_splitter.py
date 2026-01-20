"""
Segment Splitter - Divise les segments de transcription en morceaux de 1-5 mots
================================================================================

Prend les segments Whisper (phrases complètes) et les divise en sous-segments
de 1-5 mots maximum avec interpolation des timestamps.
"""

import re
import logging
from typing import List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionSegment:
    """Segment de transcription avec timestamps"""
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0


def split_segments_into_words(
    segments: List[TranscriptionSegment],
    max_words: int = 5
) -> List[TranscriptionSegment]:
    """
    Divise les segments de transcription en sous-segments de max_words mots maximum.
    Interpole les timestamps pour chaque sous-segment.

    Args:
        segments: Liste des segments originaux (phrases complètes)
        max_words: Nombre maximum de mots par segment (défaut: 5)

    Returns:
        Liste de segments divisés avec timestamps interpolés
    """
    if not segments:
        return []

    result = []

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        # Diviser le texte en mots (gère la ponctuation)
        words = re.findall(r'\S+', text)

        if len(words) <= max_words:
            # Le segment est déjà assez court
            result.append(segment)
            continue

        # Diviser en sous-segments de max_words mots
        total_duration_ms = segment.end_ms - segment.start_ms
        total_words = len(words)

        # Durée moyenne par mot (interpolation linéaire)
        ms_per_word = total_duration_ms / total_words if total_words > 0 else 0

        current_word_index = 0
        while current_word_index < total_words:
            # Prendre jusqu'à max_words mots
            chunk_words = words[current_word_index:current_word_index + max_words]
            chunk_text = " ".join(chunk_words)
            chunk_size = len(chunk_words)

            # Calculer les timestamps interpolés
            start_offset = current_word_index * ms_per_word
            end_offset = (current_word_index + chunk_size) * ms_per_word

            chunk_start_ms = int(segment.start_ms + start_offset)
            chunk_end_ms = int(segment.start_ms + end_offset)

            # Assurer que le dernier segment se termine exactement au bon moment
            if current_word_index + chunk_size >= total_words:
                chunk_end_ms = segment.end_ms

            result.append(TranscriptionSegment(
                text=chunk_text,
                start_ms=chunk_start_ms,
                end_ms=chunk_end_ms,
                confidence=segment.confidence
            ))

            current_word_index += max_words

    logger.info(
        f"[SEGMENT_SPLITTER] Divisé {len(segments)} segments en {len(result)} "
        f"sous-segments (max {max_words} mots)"
    )

    return result


def split_segment_into_words_detailed(
    segment: TranscriptionSegment,
    max_words: int = 5
) -> List[TranscriptionSegment]:
    """
    Version détaillée qui divise un seul segment.
    Utile pour le debugging ou les traitements individuels.

    Args:
        segment: Segment à diviser
        max_words: Nombre maximum de mots par sous-segment

    Returns:
        Liste de sous-segments
    """
    return split_segments_into_words([segment], max_words)
