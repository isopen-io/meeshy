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


@pytest.mark.unit
class TestProcessMultiSpeakerAudioRefusesWithoutAuthorization:
    """Le témoin de CÂBLAGE : quel que soit le site appelant, le processeur multi-locuteur
    ne modélise aucune voix sans autorisation explicite de la passerelle."""

    @staticmethod
    def _run(**kwargs):
        import asyncio
        from unittest.mock import AsyncMock, MagicMock
        from src.services.audio_pipeline.multi_speaker_processor import process_multi_speaker_audio

        voice_clone_service = MagicMock()
        voice_clone_service.get_or_create_voice_model = AsyncMock()
        result = asyncio.run(process_multi_speaker_audio(
            translation_stage=MagicMock(),
            voice_clone_service=voice_clone_service,
            segments=SEGMENTS,
            source_audio_path="/tmp/absent.wav",
            target_languages=["fr"],
            source_language="en",
            message_id="m",
            attachment_id="a",
            **kwargs,
        ))
        return result, voice_clone_service.get_or_create_voice_model

    def test_drapeau_faux_ne_modelise_personne(self):
        result, create = self._run(generate_voice_clone=False)
        assert result == {}
        create.assert_not_called()

    def test_drapeau_absent_vaut_refus(self):
        result, create = self._run()
        assert result == {}
        create.assert_not_called()
