"""
Smart Segment Merger - Fusion intelligente des segments de mots (2 passes)
===========================================================================

Fusionne les mots courts en deux étapes pour créer des segments naturels.

PASSE 1 - Regroupement de mots :
  - Si pause entre mots < 90ms
  - ET somme des caractères < 8
  - → Créer un segment

PASSE 2 - Regroupement de segments :
  - Si somme des segments < 15 caractères
  - ET pause entre segments < 10ms
  - → Regrouper les segments

Préserve les timestamps exacts de Whisper (pas d'interpolation)

Exemples :
  Passe 1: "le chat" → Segment (6 chars, pause < 90ms)
  Passe 1: "mange bien" → Segment (10 chars, pause < 90ms)
  Passe 2: "le chat" + "mange" → "le chat mange" (15 chars < 15, pause < 10ms)
"""

from typing import List, Optional
from dataclasses import dataclass


@dataclass
class TranscriptionSegment:
    """Segment de transcription (compatible avec transcription_service.py)"""
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0
    speaker_id: Optional[str] = None
    voice_similarity_score: Optional[float] = None


def merge_short_segments(
    segments: List[TranscriptionSegment],
    word_max_pause_ms: int = 90,
    word_max_chars: int = 8,
    segment_max_pause_ms: int = 10,
    segment_max_chars: int = 15
) -> List[TranscriptionSegment]:
    """
    Fusionne intelligemment les segments en 2 passes.

    PASSE 1: Regroupe les mots rapprochés
    PASSE 2: Regroupe les segments résultants

    Args:
        segments: Liste des segments mot-par-mot de Whisper
        word_max_pause_ms: Pause max pour regrouper des mots (défaut: 90ms)
        word_max_chars: Longueur max d'un groupe de mots (défaut: 8 caractères)
        segment_max_pause_ms: Pause max pour regrouper des segments (défaut: 10ms)
        segment_max_chars: Longueur max d'un groupe de segments (défaut: 15 caractères)

    Returns:
        Liste des segments fusionnés après les 2 passes

    Exemple:
        Input: [
            {"text": "le", "start_ms": 0, "end_ms": 200},
            {"text": "chat", "start_ms": 210, "end_ms": 500},    # pause 10ms
            {"text": "mange", "start_ms": 505, "end_ms": 900}    # pause 5ms
        ]
        Après passe 1: [
            {"text": "le chat", "start_ms": 0, "end_ms": 500},   # 6 chars, pause 10ms
            {"text": "mange", "start_ms": 505, "end_ms": 900}    # Séparé
        ]
        Après passe 2: [
            {"text": "le chat mange", "start_ms": 0, "end_ms": 900}  # 15 chars, pause 5ms
        ]
    """
    if not segments:
        return []

    # PASSE 1: Regrouper les mots (pause < 90ms, total < 8 chars)
    pass1_segments = _merge_by_criteria(
        segments,
        max_pause_ms=word_max_pause_ms,
        max_total_chars=word_max_chars
    )

    # PASSE 2: Regrouper les segments (pause < 10ms, total < 15 chars)
    pass2_segments = _merge_by_criteria(
        pass1_segments,
        max_pause_ms=segment_max_pause_ms,
        max_total_chars=segment_max_chars
    )

    return pass2_segments


def _merge_by_criteria(
    segments: List[TranscriptionSegment],
    max_pause_ms: int,
    max_total_chars: int
) -> List[TranscriptionSegment]:
    """
    Fonction générique de fusion basée sur des critères.

    Args:
        segments: Liste des segments à fusionner
        max_pause_ms: Pause maximale pour fusionner
        max_total_chars: Longueur maximale du texte fusionné

    Returns:
        Liste des segments fusionnés selon les critères
    """
    if not segments:
        return []

    merged: List[TranscriptionSegment] = []
    current_group: List[TranscriptionSegment] = [segments[0]]

    for i in range(1, len(segments)):
        current_seg = segments[i]
        previous_seg = current_group[-1]

        # Calculer la pause entre les segments
        pause_ms = current_seg.start_ms - previous_seg.end_ms

        # Calculer la longueur totale si on fusionne
        total_text = " ".join([s.text for s in current_group] + [current_seg.text])
        total_chars = len(total_text)

        # Vérifier si on doit fusionner
        should_merge = (
            pause_ms < max_pause_ms and
            total_chars <= max_total_chars and
            # Même locuteur (si disponible)
            (current_seg.speaker_id == previous_seg.speaker_id or
             current_seg.speaker_id is None or
             previous_seg.speaker_id is None)
        )

        if should_merge:
            # Ajouter au groupe courant
            current_group.append(current_seg)
        else:
            # Finaliser le groupe courant et démarrer un nouveau
            merged.append(_merge_group(current_group))
            current_group = [current_seg]

    # Finaliser le dernier groupe
    if current_group:
        merged.append(_merge_group(current_group))

    return merged


def _merge_group(group: List[TranscriptionSegment]) -> TranscriptionSegment:
    """
    Fusionne un groupe de segments en un seul.

    Préserve :
    - Le timestamp de début du premier segment
    - Le timestamp de fin du dernier segment
    - La confiance moyenne
    - Le speaker_id (si tous identiques)
    """
    if len(group) == 1:
        return group[0]

    # Fusionner le texte
    merged_text = " ".join([s.text for s in group])

    # Timestamps exacts (pas d'interpolation !)
    start_ms = group[0].start_ms
    end_ms = group[-1].end_ms

    # Confiance moyenne pondérée par la durée
    total_duration = sum(s.end_ms - s.start_ms for s in group)
    if total_duration > 0:
        confidence = sum(
            s.confidence * (s.end_ms - s.start_ms) / total_duration
            for s in group
        )
    else:
        confidence = sum(s.confidence for s in group) / len(group)

    # Speaker ID (prendre le premier, ou None si divergent)
    speaker_ids = [s.speaker_id for s in group if s.speaker_id is not None]
    if speaker_ids and all(sid == speaker_ids[0] for sid in speaker_ids):
        speaker_id = speaker_ids[0]
    else:
        speaker_id = group[0].speaker_id

    # is_current_user (True si tous True)
    is_current_user = all(s.voice_similarity_score for s in group)

    return TranscriptionSegment(
        text=merged_text,
        start_ms=start_ms,
        end_ms=end_ms,
        confidence=confidence,
        speaker_id=speaker_id,
        voice_similarity_score=is_current_user
    )


def get_merge_statistics(
    original: List[TranscriptionSegment],
    merged: List[TranscriptionSegment]
) -> dict:
    """
    Calcule des statistiques sur la fusion.

    Returns:
        {
            'original_count': int,
            'merged_count': int,
            'reduction_ratio': float,
            'avg_segment_length_chars': float,
            'avg_segment_duration_ms': float
        }
    """
    if not merged:
        return {
            'original_count': len(original),
            'merged_count': 0,
            'reduction_ratio': 0.0,
            'avg_segment_length_chars': 0.0,
            'avg_segment_duration_ms': 0.0
        }

    reduction_ratio = (len(original) - len(merged)) / len(original) if original else 0.0

    avg_length = sum(len(s.text) for s in merged) / len(merged)
    avg_duration = sum(s.end_ms - s.start_ms for s in merged) / len(merged)

    return {
        'original_count': len(original),
        'merged_count': len(merged),
        'reduction_ratio': reduction_ratio,
        'avg_segment_length_chars': avg_length,
        'avg_segment_duration_ms': avg_duration
    }


# ====================================================================
# EXEMPLES D'UTILISATION
# ====================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("ALGORITHME DE FUSION EN 2 PASSES")
    print("=" * 70)
    print()

    # Exemple 1 : Démonstration des deux passes
    print("Exemple 1 : Fusion en 2 passes")
    print("-" * 70)
    segments_example1 = [
        TranscriptionSegment(text="le", start_ms=0, end_ms=200, confidence=0.95),
        TranscriptionSegment(text="chat", start_ms=210, end_ms=500, confidence=0.96),   # pause 10ms
        TranscriptionSegment(text="mange", start_ms=505, end_ms=900, confidence=0.94),  # pause 5ms
        TranscriptionSegment(text="bien", start_ms=910, end_ms=1200, confidence=0.93),  # pause 10ms
    ]

    print("Input (mots individuels):")
    for seg in segments_example1:
        print(f"  [{seg.start_ms}-{seg.end_ms}ms] '{seg.text}'")
    print()

    # Appliquer l'algorithme complet
    merged1 = merge_short_segments(segments_example1)
    print("Output après 2 passes:")
    for seg in merged1:
        print(f"  [{seg.start_ms}-{seg.end_ms}ms] '{seg.text}' ({len(seg.text)} chars)")
    print()
    print("Explication:")
    print("  PASSE 1: 'le'+'chat' → 'le chat' (6 chars, pause 10ms < 90ms)")
    print("  PASSE 1: 'mange'+'bien' → 'mange bien' (10 chars, pause 10ms < 90ms)")
    print("  PASSE 2: 'le chat'+'mange bien' → PAS DE FUSION (18 chars > 15, pause 5ms < 10ms)")
    print()

    # Exemple 2 : Passe 1 uniquement (pause trop longue pour passe 2)
    print("Exemple 2 : Seule la passe 1 s'applique")
    print("-" * 70)
    segments_example2 = [
        TranscriptionSegment(text="le", start_ms=0, end_ms=200, confidence=0.95),
        TranscriptionSegment(text="chat", start_ms=210, end_ms=500, confidence=0.96),   # pause 10ms
        TranscriptionSegment(text="mange", start_ms=600, end_ms=900, confidence=0.94),  # pause 100ms (trop longue)
    ]

    print("Input:")
    for seg in segments_example2:
        print(f"  [{seg.start_ms}-{seg.end_ms}ms] '{seg.text}'")
    print()

    merged2 = merge_short_segments(segments_example2)
    print("Output:")
    for seg in merged2:
        print(f"  [{seg.start_ms}-{seg.end_ms}ms] '{seg.text}'")
    print()
    print("Explication:")
    print("  PASSE 1: 'le'+'chat' → 'le chat' (6 chars, pause 10ms < 90ms)")
    print("  PASSE 2: Pas de fusion (pause 100ms > 10ms)")
    print()

    # Exemple 3 : Aucune fusion (mots longs)
    print("Exemple 3 : Aucune fusion (mots longs)")
    print("-" * 70)
    segments_example3 = [
        TranscriptionSegment(text="Bonjour", start_ms=0, end_ms=480, confidence=0.96),
        TranscriptionSegment(text="comment", start_ms=500, end_ms=920, confidence=0.94),
    ]

    print("Input:")
    for seg in segments_example3:
        print(f"  [{seg.start_ms}-{seg.end_ms}ms] '{seg.text}'")
    print()

    merged3 = merge_short_segments(segments_example3)
    print("Output:")
    for seg in merged3:
        print(f"  [{seg.start_ms}-{seg.end_ms}ms] '{seg.text}'")
    print()
    print("Explication:")
    print("  PASSE 1: Pas de fusion ('Bonjour' = 7 chars, + 'comment' = 15 chars > 8)")
    print("  PASSE 2: Pas de fusion (total 15 chars + 'comment' = 23 chars > 15)")
    print()

    # Statistiques
    stats = get_merge_statistics(segments_example1, merged1)
    print("Statistiques (Exemple 1):")
    print("-" * 70)
    print(f"  Segments originaux: {stats['original_count']}")
    print(f"  Segments fusionnés: {stats['merged_count']}")
    print(f"  Réduction: {stats['reduction_ratio']:.1%}")
    print(f"  Longueur moyenne: {stats['avg_segment_length_chars']:.1f} caractères")
    print(f"  Durée moyenne: {stats['avg_segment_duration_ms']:.0f}ms")
