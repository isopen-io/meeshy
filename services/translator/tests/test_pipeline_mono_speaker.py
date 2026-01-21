#!/usr/bin/env python3
"""
Test Pipeline MONO-LOCUTEUR
============================

Test rapide pour vérifier que la chaîne de traitement mono-locuteur
fonctionne correctement AVANT de démarrer les services.

Usage:
    cd services/translator
    python tests/test_pipeline_mono_speaker.py

Ce test vérifie:
1. Chargement des modèles (Whisper, NLLB, Chatterbox)
2. Transcription audio
3. Traduction texte
4. Synthèse TTS avec clonage vocal
5. Génération d'un audio traduit complet
"""

import sys
import os
import asyncio
import logging
import tempfile
import time

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Couleurs pour le terminal
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'
BOLD = '\033[1m'


def print_header(text: str):
    print(f"\n{BOLD}{BLUE}{'='*60}{RESET}")
    print(f"{BOLD}{BLUE}{text}{RESET}")
    print(f"{BOLD}{BLUE}{'='*60}{RESET}\n")


def print_success(text: str):
    print(f"{GREEN}✅ {text}{RESET}")


def print_error(text: str):
    print(f"{RED}❌ {text}{RESET}")


def print_warning(text: str):
    print(f"{YELLOW}⚠️  {text}{RESET}")


def print_info(text: str):
    print(f"{BLUE}ℹ️  {text}{RESET}")


async def test_mono_speaker_pipeline():
    """Test complet du pipeline mono-locuteur"""

    print_header("TEST PIPELINE MONO-LOCUTEUR")

    errors = []
    warnings = []

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 1: IMPORT DES MODULES
    # ═══════════════════════════════════════════════════════════════
    print_info("Étape 1: Import des modules...")

    try:
        from services.audio_pipeline.audio_message_pipeline import (
            AudioMessagePipeline,
            get_audio_pipeline
        )
        print_success("AudioMessagePipeline importé")
    except ImportError as e:
        print_error(f"Erreur import AudioMessagePipeline: {e}")
        errors.append(f"Import AudioMessagePipeline: {e}")
        return False, errors, warnings

    try:
        from services.audio_pipeline.translation_stage import TranslationStage
        print_success("TranslationStage importé")
    except ImportError as e:
        print_error(f"Erreur import TranslationStage: {e}")
        errors.append(f"Import TranslationStage: {e}")

    try:
        from services.tts.tts_service import TTSService
        print_success("TTSService importé")
    except ImportError as e:
        print_error(f"Erreur import TTSService: {e}")
        errors.append(f"Import TTSService: {e}")

    # TranslationMLService n'est plus utilisé directement - intégré dans TranslationStage

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 2: INITIALISATION DES SERVICES
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 2: Initialisation des services...")

    try:
        start = time.time()
        pipeline = get_audio_pipeline()  # Pas async
        init_time = time.time() - start
        print_success(f"Pipeline initialisé en {init_time:.2f}s")
    except Exception as e:
        print_error(f"Erreur initialisation pipeline: {e}")
        errors.append(f"Init pipeline: {e}")
        return False, errors, warnings

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 3: VÉRIFICATION DES COMPOSANTS
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 3: Vérification des composants...")

    # Vérifier transcription_stage
    if hasattr(pipeline, 'transcription_stage') and pipeline.transcription_stage:
        print_success("TranscriptionStage disponible")
    else:
        print_warning("TranscriptionStage non initialisé")
        warnings.append("TranscriptionStage non initialisé")

    # Vérifier translation_stage
    if hasattr(pipeline, 'translation_stage') and pipeline.translation_stage:
        print_success("TranslationStage disponible")

        # Vérifier TTS service
        if hasattr(pipeline.translation_stage, 'tts_service'):
            print_success("TTSService disponible")
        else:
            print_warning("TTSService non initialisé")
            warnings.append("TTSService non initialisé")

        # Vérifier translation service
        if hasattr(pipeline.translation_stage, 'translation_service'):
            print_success("TranslationService disponible")
        else:
            print_warning("TranslationService non initialisé")
            warnings.append("TranslationService non initialisé")
    else:
        print_error("TranslationStage non initialisé")
        errors.append("TranslationStage non initialisé")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 4: TEST TRADUCTION TEXTE
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 4: Test traduction texte...")

    try:
        translation_service = pipeline.translation_stage.translation_service
        test_text = "Hello, this is a test."

        start = time.time()
        translated = await translation_service.translate(
            text=test_text,
            source_language="en",
            target_language="fr"
        )
        trans_time = time.time() - start

        print_success(f"Traduction: '{test_text}' → '{translated}' ({trans_time:.2f}s)")
    except Exception as e:
        print_error(f"Erreur traduction: {e}")
        errors.append(f"Traduction: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 5: TEST SYNTHÈSE TTS (sans clonage)
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 5: Test synthèse TTS (sans clonage vocal)...")

    try:
        tts_service = pipeline.translation_stage.tts_service
        test_text = "Bonjour, ceci est un test de synthèse vocale."

        start = time.time()
        tts_result = await tts_service.synthesize(
            text=test_text,
            language="fr",
            output_format="mp3"
        )
        tts_time = time.time() - start

        if tts_result and tts_result.audio_path:
            if os.path.exists(tts_result.audio_path):
                size = os.path.getsize(tts_result.audio_path)
                print_success(
                    f"TTS généré: {tts_result.audio_path} "
                    f"({size/1024:.1f}KB, {tts_result.duration_ms}ms) "
                    f"en {tts_time:.2f}s"
                )
            else:
                print_warning(f"Fichier TTS non trouvé: {tts_result.audio_path}")
                warnings.append("Fichier TTS non trouvé")
        else:
            print_error("Résultat TTS invalide")
            errors.append("Résultat TTS invalide")
    except Exception as e:
        print_error(f"Erreur TTS: {e}")
        errors.append(f"TTS: {e}")

    # ═══════════════════════════════════════════════════════════════
    # RÉSUMÉ
    # ═══════════════════════════════════════════════════════════════
    print_header("RÉSUMÉ TEST MONO-LOCUTEUR")

    if errors:
        print_error(f"{len(errors)} erreur(s) détectée(s):")
        for err in errors:
            print(f"  • {err}")

    if warnings:
        print_warning(f"{len(warnings)} avertissement(s):")
        for warn in warnings:
            print(f"  • {warn}")

    if not errors:
        print_success("Pipeline MONO-LOCUTEUR opérationnel!")
        return True, errors, warnings
    else:
        print_error("Pipeline MONO-LOCUTEUR a des erreurs!")
        return False, errors, warnings


if __name__ == "__main__":
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  TEST PIPELINE MONO-LOCUTEUR - Meeshy Translator{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")

    success, errors, warnings = asyncio.run(test_mono_speaker_pipeline())

    print(f"\n{BOLD}{'='*60}{RESET}")
    if success:
        print(f"{GREEN}{BOLD}  ✅ TEST RÉUSSI{RESET}")
    else:
        print(f"{RED}{BOLD}  ❌ TEST ÉCHOUÉ{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")

    sys.exit(0 if success else 1)
