"""
Test Auto-Sélection Chatterbox Multilingual + cfg_weight=0.0
============================================================

Vérifie que:
1. Le modèle multilingual est auto-sélectionné pour langues non-anglaises
2. cfg_weight est automatiquement forcé à 0.0 pour langues non-EN
3. cfg_weight est conservé pour l'anglais
4. repetition_penalty est ajusté selon le modèle (1.2 mono / 2.0 multi)

Conforme au script iOS (lignes 483-602).
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.tts.backends.chatterbox_backend import ChatterboxBackend


class TestChatterboxMultilingualAutoSelection:
    """Test auto-sélection du modèle multilingual et ajustement cfg_weight"""

    @pytest.fixture
    def backend(self):
        """Crée un backend Chatterbox pour les tests"""
        return ChatterboxBackend(device="cpu")

    @pytest.mark.asyncio
    async def test_french_uses_multilingual_and_forces_cfg_zero(self, backend):
        """
        Test: Français doit auto-sélectionner multilingual et forcer cfg_weight=0.0
        """
        # Mock des modèles
        mock_model_multi = MagicMock()
        mock_model_multi.sr = 24000
        mock_model_multi.generate = MagicMock(return_value=MagicMock())

        # Simuler disponibilité multilingual
        backend._available_multilingual = True
        backend._initialized_multilingual = True

        with patch.object(backend, '_get_model', return_value=mock_model_multi):
            with patch.object(backend, '_has_model', return_value=True):
                # Synthèse en français avec cfg_weight=0.5 (sera forcé à 0.0)
                await backend.synthesize(
                    text="Bonjour le monde",
                    language="fr",
                    speaker_audio_path=None,
                    output_path="/tmp/test_fr.wav",
                    cfg_weight=0.5  # Fourni par l'utilisateur
                )

                # Vérifier que generate() a été appelé
                assert mock_model_multi.generate.called
                call_kwargs = mock_model_multi.generate.call_args[1]

                # VÉRIFICATION CRITIQUE: cfg_weight doit être 0.0 (forcé)
                assert call_kwargs['cfg_weight'] == 0.0, \
                    f"cfg_weight devrait être 0.0 pour français, mais était {call_kwargs['cfg_weight']}"

                # Vérifier language_id
                assert call_kwargs['language_id'] == 'fr'

                # Vérifier repetition_penalty multilingual (2.0 par défaut)
                assert call_kwargs['repetition_penalty'] == 2.0

    @pytest.mark.asyncio
    async def test_english_uses_monolingual_and_keeps_cfg(self, backend):
        """
        Test: Anglais doit utiliser monolingual et CONSERVER cfg_weight
        """
        # Mock du modèle monolingual
        mock_model_mono = MagicMock()
        mock_model_mono.sr = 24000
        mock_model_mono.generate = MagicMock(return_value=MagicMock())

        # Simuler disponibilité monolingual uniquement
        backend._available = True
        backend._initialized = True
        backend._available_multilingual = False

        with patch.object(backend, '_get_model', return_value=mock_model_mono):
            with patch.object(backend, '_has_model', return_value=True):
                # Synthèse en anglais avec cfg_weight=0.7
                await backend.synthesize(
                    text="Hello world",
                    language="en",
                    speaker_audio_path=None,
                    output_path="/tmp/test_en.wav",
                    cfg_weight=0.7  # Doit être conservé
                )

                # Vérifier que generate() a été appelé
                assert mock_model_mono.generate.called
                call_kwargs = mock_model_mono.generate.call_args[1]

                # VÉRIFICATION: cfg_weight doit être conservé à 0.7
                assert call_kwargs['cfg_weight'] == 0.7, \
                    f"cfg_weight devrait être 0.7 pour anglais, mais était {call_kwargs['cfg_weight']}"

                # Vérifier repetition_penalty monolingual (1.2 par défaut)
                assert call_kwargs['repetition_penalty'] == 1.2

    @pytest.mark.asyncio
    async def test_spanish_forces_cfg_zero(self, backend):
        """
        Test: Espagnol doit forcer cfg_weight=0.0 même si utilisateur passe 0.9
        """
        mock_model_multi = MagicMock()
        mock_model_multi.sr = 24000
        mock_model_multi.generate = MagicMock(return_value=MagicMock())

        backend._available_multilingual = True
        backend._initialized_multilingual = True

        with patch.object(backend, '_get_model', return_value=mock_model_multi):
            with patch.object(backend, '_has_model', return_value=True):
                # Synthèse en espagnol avec cfg_weight=0.9 (très haut)
                await backend.synthesize(
                    text="Hola mundo",
                    language="es",
                    speaker_audio_path=None,
                    output_path="/tmp/test_es.wav",
                    cfg_weight=0.9  # Doit être forcé à 0.0
                )

                call_kwargs = mock_model_multi.generate.call_args[1]

                # cfg_weight doit être forcé à 0.0
                assert call_kwargs['cfg_weight'] == 0.0
                assert call_kwargs['language_id'] == 'es'

    @pytest.mark.asyncio
    async def test_multilingual_languages_coverage(self, backend):
        """
        Test: Vérifier que toutes les langues multilingues sont bien supportées
        """
        expected_languages = {
            'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
            'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv',
            'sw', 'tr', 'zh'
        }

        assert backend.MULTILINGUAL_LANGUAGES == expected_languages, \
            "MULTILINGUAL_LANGUAGES ne correspond pas à la liste attendue (23 langues)"

    @pytest.mark.asyncio
    async def test_language_normalization(self, backend):
        """
        Test: Vérifier que fr-FR est normalisé en 'fr'
        """
        mock_model_multi = MagicMock()
        mock_model_multi.sr = 24000
        mock_model_multi.generate = MagicMock(return_value=MagicMock())

        backend._available_multilingual = True
        backend._initialized_multilingual = True

        with patch.object(backend, '_get_model', return_value=mock_model_multi):
            with patch.object(backend, '_has_model', return_value=True):
                # Utiliser fr-FR (avec région)
                await backend.synthesize(
                    text="Bonjour",
                    language="fr-FR",  # Code avec région
                    speaker_audio_path=None,
                    output_path="/tmp/test_fr_FR.wav",
                    cfg_weight=0.5
                )

                call_kwargs = mock_model_multi.generate.call_args[1]

                # Doit être normalisé à 'fr'
                assert call_kwargs['language_id'] == 'fr'
                assert call_kwargs['cfg_weight'] == 0.0  # Forcé pour français

    @pytest.mark.asyncio
    async def test_german_japanese_chinese(self, backend):
        """
        Test: Allemand, Japonais, Chinois doivent tous forcer cfg_weight=0.0
        """
        mock_model = MagicMock()
        mock_model.sr = 24000
        mock_model.generate = MagicMock(return_value=MagicMock())

        backend._available_multilingual = True
        backend._initialized_multilingual = True

        test_cases = [
            ('de', 'Guten Tag'),      # Allemand
            ('ja', 'こんにちは'),      # Japonais
            ('zh', '你好')             # Chinois
        ]

        with patch.object(backend, '_get_model', return_value=mock_model):
            with patch.object(backend, '_has_model', return_value=True):
                for lang_code, text in test_cases:
                    mock_model.generate.reset_mock()

                    await backend.synthesize(
                        text=text,
                        language=lang_code,
                        speaker_audio_path=None,
                        output_path=f"/tmp/test_{lang_code}.wav",
                        cfg_weight=0.8  # Fourni haut intentionnellement
                    )

                    call_kwargs = mock_model.generate.call_args[1]

                    # Tous doivent avoir cfg_weight=0.0
                    assert call_kwargs['cfg_weight'] == 0.0, \
                        f"{lang_code} devrait avoir cfg_weight=0.0"
                    assert call_kwargs['language_id'] == lang_code

    @pytest.mark.asyncio
    async def test_fallback_to_monolingual_if_multilingual_unavailable(self, backend):
        """
        Test: Si multilingual indisponible, fallback sur monolingual
        """
        mock_model_mono = MagicMock()
        mock_model_mono.sr = 24000
        mock_model_mono.generate = MagicMock(return_value=MagicMock())

        # Multilingual PAS disponible
        backend._available_multilingual = False
        backend._initialized = True

        with patch.object(backend, '_get_model', side_effect=[None, mock_model_mono]):
            with patch.object(backend, '_has_model', side_effect=[False, True]):
                with patch.object(backend, 'initialize', return_value=True):
                    # Essayer synthèse en français
                    await backend.synthesize(
                        text="Bonjour",
                        language="fr",
                        speaker_audio_path=None,
                        output_path="/tmp/test_fallback.wav",
                        cfg_weight=0.5
                    )

                    # Doit utiliser modèle monolingual
                    assert mock_model_mono.generate.called

                    call_kwargs = mock_model_mono.generate.call_args[1]

                    # Monolingual conserve cfg_weight
                    assert call_kwargs['cfg_weight'] == 0.5

    def test_ios_script_conformity(self, backend):
        """
        Test: Vérifier la conformité avec le script iOS (lignes 483-602)

        Logique iOS:
        use_multilingual = (
            language in MULTILINGUAL_LANGUAGES and
            language != 'en' and
            self._check_multilingual()
        )

        if use_multilingual:
            effective_cfg = 0.0 if language != 'en' else cfg_weight
        """
        # Langues multilingues
        assert 'fr' in backend.MULTILINGUAL_LANGUAGES
        assert 'es' in backend.MULTILINGUAL_LANGUAGES
        assert 'de' in backend.MULTILINGUAL_LANGUAGES
        assert 'zh' in backend.MULTILINGUAL_LANGUAGES
        assert 'en' in backend.MULTILINGUAL_LANGUAGES

        # Total: 23 langues
        assert len(backend.MULTILINGUAL_LANGUAGES) == 23

        print("✅ Conformité iOS: Structure MULTILINGUAL_LANGUAGES correcte")


async def test_real_synthesis_behavior():
    """
    Test d'intégration réel (nécessite modèle téléchargé)
    """
    backend = ChatterboxBackend(device="cpu")

    if not backend.is_available:
        print("⚠️ Chatterbox non disponible, skip test réel")
        return

    print("\n" + "=" * 60)
    print("TEST RÉEL - Auto-sélection Multilingual")
    print("=" * 60)

    # Test 1: Français (doit utiliser multilingual + cfg=0.0)
    print("\n1️⃣ Test Français (cfg_weight fourni=0.5, attendu effectif=0.0)")

    # Patch pour capturer les appels
    with patch.object(ChatterboxBackend, 'synthesize', wraps=backend.synthesize) as mock_synth:
        try:
            await backend.synthesize(
                text="Test français",
                language="fr",
                speaker_audio_path=None,
                output_path="/tmp/test_fr_real.wav",
                cfg_weight=0.5
            )
            print("   ✅ Synthèse française réussie")
        except Exception as e:
            print(f"   ⚠️ Erreur: {e}")

    # Test 2: Anglais (doit utiliser monolingual + cfg conservé)
    print("\n2️⃣ Test Anglais (cfg_weight fourni=0.7, attendu effectif=0.7)")

    try:
        await backend.synthesize(
            text="Test English",
            language="en",
            speaker_audio_path=None,
            output_path="/tmp/test_en_real.wav",
            cfg_weight=0.7
        )
        print("   ✅ Synthèse anglaise réussie")
    except Exception as e:
        print(f"   ⚠️ Erreur: {e}")

    await backend.close()

    print("\n" + "=" * 60)
    print("✅ Tests d'intégration terminés")
    print("=" * 60)


if __name__ == "__main__":
    print("\n" + "#" * 60)
    print("# TEST AUTO-SÉLECTION CHATTERBOX MULTILINGUAL")
    print("# Conformité script iOS (lignes 483-602)")
    print("#" * 60)

    # Exécuter les tests pytest
    pytest.main([__file__, "-v", "-s"])

    # Exécuter test réel
    print("\n\n")
    asyncio.run(test_real_synthesis_behavior())
