"""
Test simple d'auto-sélection Chatterbox Multilingual
Sans dépendance pytest - test direct
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import asyncio

sys.path.insert(0, str(Path(__file__).parent / "src"))

from services.tts.backends.chatterbox_backend import ChatterboxBackend


def test_french_forces_cfg_zero():
    """Test: Français doit forcer cfg_weight=0.0"""
    print("\n1️⃣ Test: Français force cfg_weight=0.0")
    print("=" * 60)

    backend = ChatterboxBackend(device="cpu")

    # Mock du modèle multilingual
    mock_model = MagicMock()
    mock_model.sr = 24000
    mock_generate_result = MagicMock()
    mock_model.generate = MagicMock(return_value=mock_generate_result)

    # Simuler disponibilité
    backend._available_multilingual = True
    backend._initialized_multilingual = True

    async def run_test():
        with patch.object(backend, '_get_model', return_value=mock_model):
            with patch.object(backend, '_has_model', return_value=True):
                with patch('torchaudio.save'):  # Mock torchaudio.save
                    # Synthèse en français avec cfg_weight=0.5
                    await backend.synthesize(
                        text="Bonjour le monde",
                        language="fr",
                        speaker_audio_path=None,
                        output_path="/tmp/test_fr.wav",
                        cfg_weight=0.5,  # Fourni par utilisateur
                        auto_optimize_params=False  # Désactiver auto-opt pour test pur
                    )

                    # Vérifier appel à generate()
                    assert mock_model.generate.called, "generate() devrait être appelé"

                    call_kwargs = mock_model.generate.call_args[1]

                    print(f"   Arguments passés à generate():")
                    print(f"      - text: {call_kwargs.get('text')}")
                    print(f"      - language_id: {call_kwargs.get('language_id')}")
                    print(f"      - cfg_weight: {call_kwargs.get('cfg_weight')}")
                    print(f"      - exaggeration: {call_kwargs.get('exaggeration')}")
                    print(f"      - repetition_penalty: {call_kwargs.get('repetition_penalty')}")

                    # VÉRIFICATION CRITIQUE
                    cfg_weight_actual = call_kwargs.get('cfg_weight')
                    assert cfg_weight_actual == 0.0, \
                        f"❌ cfg_weight devrait être 0.0 pour français, mais était {cfg_weight_actual}"

                    assert call_kwargs.get('language_id') == 'fr', \
                        f"❌ language_id devrait être 'fr'"

                    print("\n   ✅ cfg_weight correctement forcé à 0.0 pour français")
                    print("   ✅ language_id correct: 'fr'")

    asyncio.run(run_test())


def test_english_keeps_cfg():
    """Test: Anglais conserve cfg_weight"""
    print("\n2️⃣ Test: Anglais conserve cfg_weight")
    print("=" * 60)

    backend = ChatterboxBackend(device="cpu")

    # Mock du modèle monolingual
    mock_model = MagicMock()
    mock_model.sr = 24000
    mock_generate_result = MagicMock()
    mock_model.generate = MagicMock(return_value=mock_generate_result)

    # Simuler monolingual uniquement
    backend._available = True
    backend._initialized = True
    backend._available_multilingual = False

    async def run_test():
        with patch.object(backend, '_get_model', return_value=mock_model):
            with patch.object(backend, '_has_model', return_value=True):
                with patch('torchaudio.save'):
                    # Synthèse en anglais avec cfg_weight=0.7
                    await backend.synthesize(
                        text="Hello world",
                        language="en",
                        speaker_audio_path=None,
                        output_path="/tmp/test_en.wav",
                        cfg_weight=0.7,
                        auto_optimize_params=False
                    )

                    assert mock_model.generate.called

                    call_kwargs = mock_model.generate.call_args[1]

                    print(f"   Arguments passés à generate():")
                    print(f"      - text: {call_kwargs.get('text')}")
                    print(f"      - cfg_weight: {call_kwargs.get('cfg_weight')}")
                    print(f"      - exaggeration: {call_kwargs.get('exaggeration')}")
                    print(f"      - repetition_penalty: {call_kwargs.get('repetition_penalty')}")

                    cfg_weight_actual = call_kwargs.get('cfg_weight')
                    assert cfg_weight_actual == 0.7, \
                        f"❌ cfg_weight devrait être 0.7 pour anglais, mais était {cfg_weight_actual}"

                    print("\n   ✅ cfg_weight correctement conservé à 0.7 pour anglais")

    asyncio.run(run_test())


def test_spanish_forces_cfg_zero():
    """Test: Espagnol force cfg_weight=0.0 même si utilisateur passe valeur élevée"""
    print("\n3️⃣ Test: Espagnol force cfg_weight=0.0 (même si utilisateur passe 0.9)")
    print("=" * 60)

    backend = ChatterboxBackend(device="cpu")

    mock_model = MagicMock()
    mock_model.sr = 24000
    mock_model.generate = MagicMock(return_value=MagicMock())

    backend._available_multilingual = True
    backend._initialized_multilingual = True

    async def run_test():
        with patch.object(backend, '_get_model', return_value=mock_model):
            with patch.object(backend, '_has_model', return_value=True):
                with patch('torchaudio.save'):
                    # Espagnol avec cfg_weight=0.9 (très haut)
                    await backend.synthesize(
                        text="Hola mundo",
                        language="es",
                        speaker_audio_path=None,
                        output_path="/tmp/test_es.wav",
                        cfg_weight=0.9,  # Intentionnellement élevé
                        auto_optimize_params=False
                    )

                    call_kwargs = mock_model.generate.call_args[1]

                    print(f"   Arguments passés à generate():")
                    print(f"      - language_id: {call_kwargs.get('language_id')}")
                    print(f"      - cfg_weight fourni: 0.9")
                    print(f"      - cfg_weight effectif: {call_kwargs.get('cfg_weight')}")

                    assert call_kwargs.get('cfg_weight') == 0.0
                    assert call_kwargs.get('language_id') == 'es'

                    print("\n   ✅ cfg_weight forcé à 0.0 pour espagnol (ignoré 0.9 fourni)")

    asyncio.run(run_test())


def test_multilingual_languages_list():
    """Test: Vérifier la liste des langues multilingues (23 langues)"""
    print("\n4️⃣ Test: Liste des langues multilingues")
    print("=" * 60)

    backend = ChatterboxBackend(device="cpu")

    expected = {
        'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
        'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv',
        'sw', 'tr', 'zh'
    }

    print(f"   Langues attendues: {len(expected)}")
    print(f"   Langues implémentées: {len(backend.MULTILINGUAL_LANGUAGES)}")

    assert backend.MULTILINGUAL_LANGUAGES == expected, \
        "Liste des langues multilingues incorrecte"

    print(f"\n   ✅ Liste correcte: {', '.join(sorted(backend.MULTILINGUAL_LANGUAGES))}")


def test_language_normalization():
    """Test: fr-FR doit être normalisé en 'fr'"""
    print("\n5️⃣ Test: Normalisation fr-FR -> fr")
    print("=" * 60)

    backend = ChatterboxBackend(device="cpu")

    mock_model = MagicMock()
    mock_model.sr = 24000
    mock_model.generate = MagicMock(return_value=MagicMock())

    backend._available_multilingual = True
    backend._initialized_multilingual = True

    async def run_test():
        with patch.object(backend, '_get_model', return_value=mock_model):
            with patch.object(backend, '_has_model', return_value=True):
                with patch('torchaudio.save'):
                    # Utiliser fr-FR (avec région)
                    await backend.synthesize(
                        text="Bonjour",
                        language="fr-FR",  # Code avec région
                        speaker_audio_path=None,
                        output_path="/tmp/test.wav",
                        cfg_weight=0.5,
                        auto_optimize_params=False
                    )

                    call_kwargs = mock_model.generate.call_args[1]

                    print(f"   Code fourni: fr-FR")
                    print(f"   Code normalisé: {call_kwargs.get('language_id')}")
                    print(f"   cfg_weight effectif: {call_kwargs.get('cfg_weight')}")

                    assert call_kwargs.get('language_id') == 'fr'
                    assert call_kwargs.get('cfg_weight') == 0.0

                    print("\n   ✅ Normalisation correcte: fr-FR -> fr")
                    print("   ✅ cfg_weight forcé à 0.0")

    asyncio.run(run_test())


def main():
    """Exécuter tous les tests"""
    print("\n" + "#" * 60)
    print("# TEST AUTO-SÉLECTION CHATTERBOX MULTILINGUAL")
    print("# Conformité script iOS (lignes 483-602)")
    print("#" * 60)

    tests = [
        test_french_forces_cfg_zero,
        test_english_keeps_cfg,
        test_spanish_forces_cfg_zero,
        test_multilingual_languages_list,
        test_language_normalization
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"\n   ❌ ÉCHEC: {e}")
            failed += 1
        except Exception as e:
            print(f"\n   ❌ ERREUR: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 60)
    print("RÉSUMÉ DES TESTS")
    print("=" * 60)
    print(f"✅ Réussis: {passed}/{len(tests)}")
    print(f"❌ Échoués: {failed}/{len(tests)}")

    if failed == 0:
        print("\n🎉 Tous les tests ont réussi!")
        print("✅ Implémentation conforme au script iOS")
    else:
        print(f"\n⚠️ {failed} test(s) ont échoué")

    return failed == 0


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
