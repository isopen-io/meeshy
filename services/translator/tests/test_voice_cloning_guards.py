"""Le chemin MULTI-LOCUTEUR crée un modèle de voix par locuteur (#17309).

Quand la passerelle refuse le clonage (mineur, consentement absent), le pipeline
transmettait bien `generate_voice_clone=False` au modèle de l'émetteur, mais un
audio à plusieurs voix partait dans `process_multi_speaker_audio`, qui clonait
chaque locuteur sous `temp_speaker_*` — l'émetteur mineur compris. Sans clonage
autorisé, l'audio prend la chaîne mono-locuteur, en voix générique.
"""

import pytest

from src.services.audio_pipeline.voice_cloning_guards import takes_multi_speaker_path

SEGMENTS = [{"speakerId": "s0", "text": "a"}, {"speakerId": "s1", "text": "b"}]


@pytest.mark.unit
class TestTakesMultiSpeakerPath:
    def test_plusieurs_locuteurs_avec_clonage_autorise(self):
        assert takes_multi_speaker_path(speaker_count=2, segments=SEGMENTS, generate_voice_clone=True)

    def test_plusieurs_locuteurs_sans_clonage_autorise_ne_clone_personne(self):
        assert not takes_multi_speaker_path(speaker_count=2, segments=SEGMENTS, generate_voice_clone=False)

    def test_un_seul_locuteur(self):
        assert not takes_multi_speaker_path(speaker_count=1, segments=SEGMENTS, generate_voice_clone=True)

    def test_sans_segments_ou_sans_compte(self):
        assert not takes_multi_speaker_path(speaker_count=2, segments=[], generate_voice_clone=True)
        assert not takes_multi_speaker_path(speaker_count=None, segments=SEGMENTS, generate_voice_clone=True)
