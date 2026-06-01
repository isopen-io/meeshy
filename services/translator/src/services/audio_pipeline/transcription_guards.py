"""Gardes pour les transcriptions vides ("no speech").

Quand le VAD retire tout l'audio ou que le filtre d'hallucination strippe tous
les segments, Whisper produit un texte vide. Émettre ce résultat avec la
probabilité de détection de langue comme confidence est trompeur et déclenche
une traduction/synthèse inutile d'un contenu vide (stocké comme `undefined`).
"""

from typing import Optional


def is_blank_transcription(text: Optional[str]) -> bool:
    """True si la transcription n'a aucun contenu exploitable (None/vide/espaces)."""
    return text is None or not text.strip()


def resolve_transcription_confidence(
    text: Optional[str],
    language_probability: float,
) -> float:
    """Confidence honnête : 0.0 si aucune parole, sinon la proba de langue Whisper."""
    if is_blank_transcription(text):
        return 0.0
    return language_probability
