"""Gardes du clonage vocal dans le pipeline audio (#17309).

La passerelle décide si une voix peut être clonée (consentement ET 18 ans révolus)
et le dit par `generate_voice_clone`. Le chemin multi-locuteur crée un modèle de
voix pour CHAQUE locuteur : il n'est donc emprunté que si le clonage est autorisé.
Sinon, l'audio prend la chaîne mono-locuteur, en voix générique.
"""

from typing import Any, Optional, Sequence


def takes_multi_speaker_path(
    speaker_count: Optional[int],
    segments: Optional[Sequence[Any]],
    generate_voice_clone: bool,
) -> bool:
    """True si l'audio part dans le chemin multi-locuteur (un modèle de voix par locuteur)."""
    return bool(generate_voice_clone and speaker_count is not None and speaker_count > 1 and segments)
