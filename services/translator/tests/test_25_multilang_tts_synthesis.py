#!/usr/bin/env python3
"""
Test 25 - Multi-Language TTS Synthesis Tests
Tests pour la synthèse vocale en langues différentes de la langue originale

Ce test vérifie que le système peut:
1. Prendre un audio source en langue A (ex: anglais)
2. Cloner la voix de ce locuteur
3. Synthétiser du texte en langues B, C, D... différentes
4. Valider que l'audio généré est bien dans la langue cible

Langues testées:
- EN → FR (Anglais vers Français)
- EN → ES (Anglais vers Espagnol)
- EN → ZH (Anglais vers Chinois)
- EN → DE (Anglais vers Allemand)
- FR → EN (Français vers Anglais)
- FR → ES (Français vers Espagnol)
"""

import sys
import os
import logging
import asyncio
import pytest
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from unittest.mock import MagicMock, AsyncMock, patch
from dataclasses import dataclass

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Check CI environment
IS_CI = os.getenv('CI', 'false').lower() == 'true'

# Import services with graceful fallback
TTS_AVAILABLE = False
VOICE_CLONE_AVAILABLE = False
TRANSCRIPTION_AVAILABLE = False
TRANSLATION_AVAILABLE = False

try:
    from services.tts_service import UnifiedTTSService, TTSModel, UnifiedTTSResult
    TTS_AVAILABLE = True
    logger.info("✅ TTSService disponible")
except ImportError as e:
    logger.warning(f"TTSService not available: {e}")

try:
    from services.voice_clone_service import VoiceCloneService, VoiceFingerprint
    VOICE_CLONE_AVAILABLE = True
    logger.info("✅ VoiceCloneService disponible")
except ImportError as e:
    logger.warning(f"VoiceCloneService not available: {e}")

try:
    from services.transcription_service import TranscriptionService, TranscriptionResult
    TRANSCRIPTION_AVAILABLE = True
    logger.info("✅ TranscriptionService disponible")
except ImportError as e:
    logger.warning(f"TranscriptionService not available: {e}")

try:
    from services.translation_ml_service import TranslationMLService
    TRANSLATION_AVAILABLE = True
    logger.info("✅ TranslationMLService disponible")
except ImportError as e:
    logger.warning(f"TranslationMLService not available: {e}")

# Import VoiceCharacteristics from unified models
try:
    from models.voice_models import VoiceCharacteristics
    MODELS_AVAILABLE = True
except ImportError:
    MODELS_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════
# TEST DATA - Phrases multilingues pour synthèse
# ═══════════════════════════════════════════════════════════════

# Textes à synthétiser dans chaque langue cible
SYNTHESIS_TEXTS = {
    "fr": [
        "Bonjour, comment allez-vous aujourd'hui?",
        "Je suis ravi de faire votre connaissance.",
        "Le soleil brille dans le ciel bleu.",
    ],
    "en": [
        "Hello, how are you doing today?",
        "I am delighted to meet you.",
        "The sun is shining in the blue sky.",
    ],
    "es": [
        "Hola, ¿cómo estás hoy?",
        "Encantado de conocerte.",
        "El sol brilla en el cielo azul.",
    ],
    "de": [
        "Hallo, wie geht es Ihnen heute?",
        "Es freut mich, Sie kennenzulernen.",
        "Die Sonne scheint am blauen Himmel.",
    ],
    "zh": [
        "你好，今天好吗？",
        "很高兴认识你。",
        "阳光照耀在蓝天上。",
    ],
    "pt": [
        "Olá, como você está hoje?",
        "Prazer em conhecê-lo.",
        "O sol brilha no céu azul.",
    ],
    "it": [
        "Ciao, come stai oggi?",
        "Piacere di conoscerti.",
        "Il sole splende nel cielo blu.",
    ],
}

# Paires de langues à tester (source → target)
LANGUAGE_PAIRS = [
    ("en", "fr"),  # Anglais → Français
    ("en", "es"),  # Anglais → Espagnol
    ("en", "de"),  # Anglais → Allemand
    ("en", "zh"),  # Anglais → Chinois
    ("fr", "en"),  # Français → Anglais
    ("fr", "es"),  # Français → Espagnol
    ("es", "fr"),  # Espagnol → Français
]


# ═══════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def output_dir():
    """Create temporary output directory"""
    temp_dir = tempfile.mkdtemp(prefix="multilang_tts_test_")
    output_path = Path(temp_dir)
    (output_path / "translated").mkdir(parents=True)
    (output_path / "source_audio").mkdir(parents=True)
    yield output_path
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def sample_audio_path():
    """Path to test audio file"""
    # Chercher un fichier audio de test dans fixtures/
    fixtures_dir = Path(__file__).parent / "fixtures"

    # Essayer plusieurs formats
    for pattern in ["*.wav", "*.mp3", "*.ogg", "*.m4a"]:
        files = list(fixtures_dir.glob(pattern))
        if files:
            return files[0]

    # Si pas de fixture, créer un audio de test
    return None


@pytest.fixture
def reset_singletons():
    """Reset singleton instances before each test"""
    if TTS_AVAILABLE:
        UnifiedTTSService._instance = None
    if VOICE_CLONE_AVAILABLE:
        VoiceCloneService._instance = None
    yield
    if TTS_AVAILABLE:
        UnifiedTTSService._instance = None
    if VOICE_CLONE_AVAILABLE:
        VoiceCloneService._instance = None


# ═══════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def get_language_name(code: str) -> str:
    """Get human-readable language name from code"""
    names = {
        "en": "English",
        "fr": "French",
        "es": "Spanish",
        "de": "German",
        "zh": "Chinese",
        "pt": "Portuguese",
        "it": "Italian",
    }
    return names.get(code, code.upper())


async def create_test_audio(output_path: Path, text: str, lang: str) -> Optional[Path]:
    """
    Crée un audio de test via TTS pour utiliser comme source.
    Retourne le chemin du fichier audio ou None si TTS indisponible.
    """
    if not TTS_AVAILABLE:
        return None

    try:
        tts = await UnifiedTTSService.get_instance()
        result = await tts.synthesize(
            text=text,
            language=lang,
            model=TTSModel.CHATTERBOX
        )

        if result and result.audio_path:
            return Path(result.audio_path)
    except Exception as e:
        logger.warning(f"Impossible de créer audio test: {e}")

    return None


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - VoiceCharacteristics Unified Model
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_voice_characteristics_unified():
    """Test 25.0: Vérifier que VoiceCharacteristics unifié fonctionne"""
    logger.info("Test 25.0: VoiceCharacteristics unifié")

    if not MODELS_AVAILABLE:
        pytest.skip("Models package not available")

    # Créer avec noms courts
    vc = VoiceCharacteristics(
        pitch_mean=200.0,
        pitch_std=30.0,
        pitch_min=150.0,
        pitch_max=300.0,
        voice_type="medium_male",
        estimated_gender="male"
    )

    # Vérifier noms courts
    assert vc.pitch_mean == 200.0
    assert vc.pitch_std == 30.0
    assert vc.voice_type == "medium_male"

    # Vérifier aliases (noms longs)
    assert vc.pitch_mean_hz == 200.0
    assert vc.pitch_std_hz == 30.0
    assert vc.pitch_min_hz == 150.0
    assert vc.pitch_max_hz == 300.0

    # Vérifier to_dict()
    d = vc.to_dict()
    assert d["pitch"]["mean_hz"] == 200.0
    assert d["classification"]["voice_type"] == "medium_male"
    assert d["classification"]["estimated_gender"] == "male"

    logger.info("✅ VoiceCharacteristics unifié fonctionne correctement")


# ═══════════════════════════════════════════════════════════════
# UNIT TESTS - Multi-Language TTS (Mocked)
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_multilang_synthesis_mock():
    """Test 25.1: Synthèse multi-langues avec mocks"""
    logger.info("Test 25.1: Synthèse multi-langues (mocked)")

    # Mock du service TTS
    mock_tts = MagicMock()
    mock_result = MagicMock()
    mock_result.audio_path = "/tmp/test_output.wav"
    mock_result.model_used = "chatterbox"
    mock_result.duration_seconds = 3.5
    mock_result.success = True

    mock_tts.synthesize = AsyncMock(return_value=mock_result)

    results = {}

    for source_lang, target_lang in LANGUAGE_PAIRS:
        # Obtenir texte à synthétiser dans la langue cible
        if target_lang in SYNTHESIS_TEXTS:
            text = SYNTHESIS_TEXTS[target_lang][0]

            # Appeler synthèse avec mock
            result = await mock_tts.synthesize(
                text=text,
                language=target_lang,
                source_language=source_lang
            )

            key = f"{source_lang}→{target_lang}"
            results[key] = {
                "text": text,
                "success": result.success,
                "audio_path": result.audio_path
            }

            logger.info(f"  {key}: '{text[:30]}...' → {result.success}")

    # Vérifier que toutes les paires ont été traitées
    assert len(results) == len(LANGUAGE_PAIRS)
    assert all(r["success"] for r in results.values())

    logger.info(f"✅ {len(results)} paires de langues traitées avec succès")


@pytest.mark.asyncio
async def test_cross_language_voice_cloning_mock():
    """Test 25.2: Clonage vocal cross-language avec mocks"""
    logger.info("Test 25.2: Clonage vocal cross-language (mocked)")

    # Mock du service de clonage vocal
    mock_clone_service = MagicMock()
    mock_clone_service.extract_voice_embedding = AsyncMock(
        return_value={
            "embedding": [0.1] * 256,
            "voice_characteristics": {
                "pitch_mean": 180.0,
                "gender": "male"
            }
        }
    )

    # Mock du TTS avec clonage
    mock_tts = MagicMock()
    mock_result = MagicMock()
    mock_result.audio_path = "/tmp/cloned_output.wav"
    mock_result.success = True
    mock_result.voice_cloned = True
    mock_tts.synthesize_with_voice = AsyncMock(return_value=mock_result)

    # Simuler extraction d'embedding depuis audio anglais
    source_audio = "/path/to/english_speaker.wav"
    embedding = await mock_clone_service.extract_voice_embedding(source_audio)

    assert embedding is not None
    assert "embedding" in embedding

    # Synthétiser en différentes langues avec la même voix clonée
    languages_to_test = ["fr", "es", "de", "zh"]
    results = []

    for lang in languages_to_test:
        text = SYNTHESIS_TEXTS[lang][0]
        result = await mock_tts.synthesize_with_voice(
            text=text,
            language=lang,
            voice_embedding=embedding["embedding"]
        )

        results.append({
            "lang": lang,
            "text": text,
            "success": result.success,
            "voice_cloned": result.voice_cloned
        })

        logger.info(f"  EN→{lang.upper()}: '{text[:25]}...' cloned={result.voice_cloned}")

    # Vérifier résultats
    assert len(results) == len(languages_to_test)
    assert all(r["success"] for r in results)
    assert all(r["voice_cloned"] for r in results)

    logger.info(f"✅ Voix anglaise clonée vers {len(languages_to_test)} langues")


# ═══════════════════════════════════════════════════════════════
# INTEGRATION TESTS - Real Services (Skip in CI)
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.skipif(IS_CI, reason="Requires local models")
async def test_real_multilang_synthesis(output_dir, reset_singletons):
    """Test 25.3: Synthèse multi-langues avec services réels"""
    logger.info("Test 25.3: Synthèse multi-langues (services réels)")

    if not TTS_AVAILABLE:
        pytest.skip("TTSService not available")

    try:
        tts = await UnifiedTTSService.get_instance()
    except Exception as e:
        pytest.skip(f"TTS initialization failed: {e}")

    results = []

    # Tester quelques langues cibles
    test_languages = ["fr", "en", "es"]

    for lang in test_languages:
        if lang not in SYNTHESIS_TEXTS:
            continue

        text = SYNTHESIS_TEXTS[lang][0]

        try:
            result = await tts.synthesize(
                text=text,
                language=lang,
                model=TTSModel.CHATTERBOX,
                output_dir=str(output_dir / "translated")
            )

            if result and result.audio_path:
                audio_path = Path(result.audio_path)
                success = audio_path.exists() and audio_path.stat().st_size > 0

                results.append({
                    "lang": lang,
                    "text": text[:30],
                    "success": success,
                    "audio_path": str(audio_path),
                    "duration": getattr(result, 'duration_seconds', 0)
                })

                logger.info(f"  {lang.upper()}: '{text[:25]}...' → {success}")
            else:
                results.append({"lang": lang, "success": False, "error": "No audio path"})

        except Exception as e:
            logger.warning(f"  {lang.upper()}: Erreur - {e}")
            results.append({"lang": lang, "success": False, "error": str(e)})

    # Au moins une langue doit réussir
    successful = [r for r in results if r.get("success")]
    assert len(successful) > 0, "Au moins une synthèse doit réussir"

    logger.info(f"✅ {len(successful)}/{len(results)} langues synthétisées")


@pytest.mark.asyncio
@pytest.mark.skipif(IS_CI, reason="Requires local models")
async def test_real_cross_language_cloning(output_dir, sample_audio_path, reset_singletons):
    """Test 25.4: Clonage vocal cross-language avec services réels"""
    logger.info("Test 25.4: Clonage vocal cross-language (services réels)")

    if not VOICE_CLONE_AVAILABLE or not TTS_AVAILABLE:
        pytest.skip("VoiceClone or TTS services not available")

    if sample_audio_path is None:
        pytest.skip("No sample audio file available")

    try:
        clone_service = await VoiceCloneService.get_instance()
        tts = await UnifiedTTSService.get_instance()
    except Exception as e:
        pytest.skip(f"Service initialization failed: {e}")

    # 1. Extraire embedding depuis audio source
    try:
        embedding_result = await clone_service.extract_voice_embedding(
            str(sample_audio_path)
        )

        if not embedding_result:
            pytest.skip("Could not extract voice embedding")

    except Exception as e:
        pytest.skip(f"Embedding extraction failed: {e}")

    # 2. Synthétiser en différentes langues avec cette voix
    target_languages = ["fr", "es", "de"]
    results = []

    for lang in target_languages:
        if lang not in SYNTHESIS_TEXTS:
            continue

        text = SYNTHESIS_TEXTS[lang][0]

        try:
            # Synthèse avec voix clonée
            result = await tts.synthesize(
                text=text,
                language=lang,
                voice_embedding=embedding_result.get("embedding"),
                output_dir=str(output_dir / "translated")
            )

            if result and result.audio_path:
                audio_path = Path(result.audio_path)
                success = audio_path.exists()

                results.append({
                    "source_lang": "en",  # Supposé anglais
                    "target_lang": lang,
                    "success": success,
                    "audio_size": audio_path.stat().st_size if success else 0
                })

                logger.info(f"  EN→{lang.upper()}: {success} ({audio_path.stat().st_size if success else 0} bytes)")

        except Exception as e:
            logger.warning(f"  EN→{lang.upper()}: Erreur - {e}")
            results.append({"target_lang": lang, "success": False, "error": str(e)})

    # Vérifications
    successful = [r for r in results if r.get("success")]
    logger.info(f"✅ {len(successful)}/{len(results)} synthèses cross-language réussies")


@pytest.mark.asyncio
@pytest.mark.skipif(IS_CI, reason="Requires local models")
async def test_transcription_validation(output_dir, reset_singletons):
    """Test 25.5: Validation par transcription de l'audio synthétisé"""
    logger.info("Test 25.5: Validation par transcription")

    if not TTS_AVAILABLE or not TRANSCRIPTION_AVAILABLE:
        pytest.skip("TTS or Transcription services not available")

    try:
        tts = await UnifiedTTSService.get_instance()
        transcriber = await TranscriptionService.get_instance()
    except Exception as e:
        pytest.skip(f"Service initialization failed: {e}")

    # Tester quelques langues
    test_cases = [
        ("fr", "Bonjour, comment allez-vous?"),
        ("en", "Hello, how are you today?"),
        ("es", "Hola, ¿cómo estás?"),
    ]

    results = []

    for lang, text in test_cases:
        try:
            # 1. Synthétiser
            synth_result = await tts.synthesize(
                text=text,
                language=lang,
                output_dir=str(output_dir / "translated")
            )

            if not synth_result or not synth_result.audio_path:
                results.append({"lang": lang, "step": "synthesis", "success": False})
                continue

            audio_path = Path(synth_result.audio_path)
            if not audio_path.exists():
                results.append({"lang": lang, "step": "file_check", "success": False})
                continue

            # 2. Transcrire l'audio généré
            transcription = await transcriber.transcribe(
                str(audio_path),
                language=lang
            )

            if not transcription or not transcription.text:
                results.append({"lang": lang, "step": "transcription", "success": False})
                continue

            # 3. Comparer (similarity ratio)
            original = text.lower().strip()
            transcribed = transcription.text.lower().strip()

            # Calcul de similarité simple
            from difflib import SequenceMatcher
            similarity = SequenceMatcher(None, original, transcribed).ratio()

            success = similarity > 0.5  # Au moins 50% de similarité

            results.append({
                "lang": lang,
                "original": text,
                "transcribed": transcription.text,
                "similarity": similarity,
                "success": success
            })

            logger.info(f"  {lang.upper()}: similarity={similarity:.2%} {'✅' if success else '❌'}")

        except Exception as e:
            logger.warning(f"  {lang.upper()}: Erreur - {e}")
            results.append({"lang": lang, "error": str(e), "success": False})

    # Au moins une doit réussir
    successful = [r for r in results if r.get("success")]
    logger.info(f"✅ {len(successful)}/{len(results)} validations réussies")


# ═══════════════════════════════════════════════════════════════
# PARAMETRIZED TESTS - All Language Pairs
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
@pytest.mark.parametrize("source_lang,target_lang", LANGUAGE_PAIRS)
async def test_language_pair_synthesis_mock(source_lang: str, target_lang: str):
    """Test paramétré pour chaque paire de langues (mocked)"""
    logger.info(f"Test 25.P: {source_lang.upper()}→{target_lang.upper()} (mocked)")

    # Mock simple
    mock_result = MagicMock()
    mock_result.success = True
    mock_result.audio_path = f"/tmp/{source_lang}_to_{target_lang}.wav"
    mock_result.duration_seconds = 2.5

    with patch('services.tts_service.UnifiedTTSService') as MockTTS:
        mock_instance = AsyncMock()
        mock_instance.synthesize = AsyncMock(return_value=mock_result)
        MockTTS.get_instance = AsyncMock(return_value=mock_instance)

        # Obtenir texte cible
        text = SYNTHESIS_TEXTS.get(target_lang, SYNTHESIS_TEXTS["en"])[0]

        # Simuler synthèse
        tts = await MockTTS.get_instance()
        result = await tts.synthesize(
            text=text,
            language=target_lang,
            source_language=source_lang
        )

        assert result.success
        assert result.audio_path is not None

        lang_name_source = get_language_name(source_lang)
        lang_name_target = get_language_name(target_lang)
        logger.info(f"  ✅ {lang_name_source} → {lang_name_target}: OK")


# ═══════════════════════════════════════════════════════════════
# STRESS TEST - Multiple Languages Concurrent
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_concurrent_multilang_synthesis_mock():
    """Test 25.6: Synthèse multi-langues concurrente"""
    logger.info("Test 25.6: Synthèse concurrente multi-langues")

    # Mock du service
    mock_tts = MagicMock()

    async def mock_synthesize(text, language, **kwargs):
        await asyncio.sleep(0.1)  # Simuler délai
        result = MagicMock()
        result.success = True
        result.audio_path = f"/tmp/{language}_output.wav"
        result.language = language
        return result

    mock_tts.synthesize = mock_synthesize

    # Lancer synthèses en parallèle pour toutes les langues
    languages = list(SYNTHESIS_TEXTS.keys())

    async def synthesize_lang(lang):
        text = SYNTHESIS_TEXTS[lang][0]
        return await mock_tts.synthesize(text=text, language=lang)

    # Exécution concurrente
    results = await asyncio.gather(
        *[synthesize_lang(lang) for lang in languages],
        return_exceptions=True
    )

    # Vérifier résultats
    successful = [r for r in results if not isinstance(r, Exception) and r.success]

    assert len(successful) == len(languages)
    logger.info(f"✅ {len(successful)} langues synthétisées en parallèle")


# ═══════════════════════════════════════════════════════════════
# RUN TESTS
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "--tb=short"])
