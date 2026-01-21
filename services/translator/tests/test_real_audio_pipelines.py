#!/usr/bin/env python3
"""
Test RÉEL des Pipelines avec vrais fichiers audio
==================================================

Teste les pipelines mono et multi-locuteur avec de vrais fichiers audio.

Usage:
    cd services/translator
    python tests/test_real_audio_pipelines.py
"""

import sys
import os
import asyncio
import logging
import time

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Configuration logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Couleurs
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
CYAN = '\033[96m'
RESET = '\033[0m'
BOLD = '\033[1m'

# Fichiers audio de test
MONO_AUDIO = "/Users/smpceo/Documents/v2_meeshy/services/gateway/uploads/attachments/2026/01/696f7d4e9c34b8c4d8f8a2af/audio_1768939251016_6c02642a-32e0-4fa7-aafb-04811c5a64d6.m4a"
MULTI_AUDIO = "/Users/smpceo/Documents/v2_meeshy/services/gateway/uploads/attachments/2026/01/696f7d4e9c34b8c4d8f8a2af/audio_1768934767203_758d9ecd-f6a8-4ce8-bfc4-f9ec90c467e4.m4a"


def print_header(text: str):
    print(f"\n{BOLD}{BLUE}{'='*70}{RESET}")
    print(f"{BOLD}{BLUE}  {text}{RESET}")
    print(f"{BOLD}{BLUE}{'='*70}{RESET}\n")


def print_step(step: int, text: str):
    print(f"\n{CYAN}[Étape {step}]{RESET} {BOLD}{text}{RESET}")
    print(f"{'-'*60}")


def print_success(text: str):
    print(f"{GREEN}✅ {text}{RESET}")


def print_error(text: str):
    print(f"{RED}❌ {text}{RESET}")


def print_warning(text: str):
    print(f"{YELLOW}⚠️  {text}{RESET}")


def print_info(text: str):
    print(f"{BLUE}ℹ️  {text}{RESET}")


async def test_real_mono_speaker():
    """Test du pipeline mono-locuteur avec un vrai fichier audio"""

    print_header("TEST MONO-LOCUTEUR (Audio Réel)")

    errors = []

    if not os.path.exists(MONO_AUDIO):
        print_error(f"Fichier audio non trouvé: {MONO_AUDIO}")
        return False, ["Fichier audio non trouvé"]

    print_info(f"Audio: {os.path.basename(MONO_AUDIO)}")
    print_info(f"Taille: {os.path.getsize(MONO_AUDIO) / 1024:.1f} KB")

    # ═══════════════════════════════════════════════════════════════
    print_step(1, "Initialisation du pipeline")
    # ═══════════════════════════════════════════════════════════════

    try:
        from services.audio_pipeline.audio_message_pipeline import get_audio_pipeline
        from mock_translation_service import MockTranslationService

        start = time.time()
        pipeline = get_audio_pipeline()  # Pas async

        # Injecter le service de traduction mock
        mock_translation = MockTranslationService()
        await mock_translation.initialize()
        pipeline.set_translation_service(mock_translation)

        init_time = time.time() - start
        print_success(f"Pipeline initialisé en {init_time:.2f}s (avec traduction mock)")
    except Exception as e:
        print_error(f"Erreur initialisation: {e}")
        import traceback
        traceback.print_exc()
        return False, [str(e)]

    # ═══════════════════════════════════════════════════════════════
    print_step(2, "Traitement audio complet")
    # ═══════════════════════════════════════════════════════════════

    try:
        start = time.time()

        result = await pipeline.process_audio_message(
            audio_path=MONO_AUDIO,
            audio_url="",
            sender_id="test_user_mono",
            conversation_id="test_conv_mono",
            message_id="test_msg_mono",
            attachment_id="test_attach_mono",
            audio_duration_ms=10000,
            metadata={},
            target_languages=["en", "es"],  # Traduire en anglais et espagnol
            generate_voice_clone=True,
            model_type="medium"
        )

        total_time = time.time() - start

        if result:
            print_success(f"Pipeline terminé en {total_time:.2f}s")

            # Afficher les résultats
            print(f"\n{CYAN}📊 Résultats:{RESET}")

            # Transcription
            if result.original:
                print(f"  • Transcription: \"{result.original.transcription[:80]}...\"")
                print(f"  • Langue détectée: {result.original.language}")
                print(f"  • Confiance: {result.original.confidence:.2%}")
                if result.original.segments:
                    print(f"  • Segments: {len(result.original.segments)}")
                if result.original.speaker_count:
                    print(f"  • Speakers: {result.original.speaker_count}")

            # Traductions
            if result.translations:
                print(f"\n  📢 Traductions générées: {len(result.translations)}")
                for trans in result.translations:
                    audio_exists = "✓" if trans.audio_path and os.path.exists(trans.audio_path) else "✗"
                    segments_info = f", {len(trans.segments)} segments" if trans.segments else ""
                    print(f"    • {trans.language}: {trans.duration_ms}ms, cloned={trans.voice_cloned} [{audio_exists}]{segments_info}")
            else:
                print_warning("Aucune traduction générée")
                errors.append("Aucune traduction")
        else:
            print_error("Résultat vide")
            errors.append("Résultat vide")

    except Exception as e:
        print_error(f"Erreur traitement: {e}")
        errors.append(str(e))
        import traceback
        traceback.print_exc()

    return len(errors) == 0, errors


async def test_real_multi_speaker():
    """Test du pipeline multi-locuteur avec un vrai fichier audio"""

    print_header("TEST MULTI-LOCUTEUR (Audio Réel - 2 speakers)")

    errors = []

    if not os.path.exists(MULTI_AUDIO):
        print_error(f"Fichier audio non trouvé: {MULTI_AUDIO}")
        return False, ["Fichier audio non trouvé"]

    print_info(f"Audio: {os.path.basename(MULTI_AUDIO)}")
    print_info(f"Taille: {os.path.getsize(MULTI_AUDIO) / 1024:.1f} KB")

    # ═══════════════════════════════════════════════════════════════
    print_step(1, "Initialisation du pipeline")
    # ═══════════════════════════════════════════════════════════════

    try:
        from services.audio_pipeline.audio_message_pipeline import get_audio_pipeline
        from mock_translation_service import MockTranslationService

        start = time.time()
        pipeline = get_audio_pipeline()  # Pas async

        # Injecter le service de traduction mock
        mock_translation = MockTranslationService()
        await mock_translation.initialize()
        pipeline.set_translation_service(mock_translation)

        init_time = time.time() - start
        print_success(f"Pipeline initialisé en {init_time:.2f}s (avec traduction mock)")
    except Exception as e:
        print_error(f"Erreur initialisation: {e}")
        return False, [str(e)]

    # ═══════════════════════════════════════════════════════════════
    print_step(2, "Traitement audio multi-locuteur complet")
    # ═══════════════════════════════════════════════════════════════

    try:
        start = time.time()

        result = await pipeline.process_audio_message(
            audio_path=MULTI_AUDIO,
            audio_url="",
            sender_id="test_user_multi",
            conversation_id="test_conv_multi",
            message_id="test_msg_multi",
            attachment_id="test_attach_multi",
            audio_duration_ms=20000,
            metadata={},
            target_languages=["en", "es"],  # Traduire en anglais et espagnol
            generate_voice_clone=True,
            model_type="medium"
        )

        total_time = time.time() - start

        if result:
            print_success(f"Pipeline terminé en {total_time:.2f}s")

            # Afficher les résultats
            print(f"\n{CYAN}📊 Résultats:{RESET}")

            # Transcription
            if result.original:
                print(f"  • Transcription: \"{result.original.transcription[:80]}...\"")
                print(f"  • Langue détectée: {result.original.language}")
                print(f"  • Confiance: {result.original.confidence:.2%}")

                if result.original.segments:
                    print(f"  • Segments: {len(result.original.segments)}")

                    # Afficher les speakers détectés
                    speakers = set()
                    for seg in result.original.segments:
                        if hasattr(seg, 'speaker_id') and seg.speaker_id:
                            speakers.add(seg.speaker_id)
                        elif isinstance(seg, dict) and seg.get('speaker_id'):
                            speakers.add(seg['speaker_id'])

                    if speakers:
                        print(f"  • Speakers détectés: {len(speakers)} ({', '.join(speakers)})")

                if result.original.speaker_count:
                    print(f"  • Speaker count (diarisation): {result.original.speaker_count}")

                    if result.original.speaker_count > 1:
                        print_success("Mode MULTI-LOCUTEUR activé!")
                    else:
                        print_warning("Mode mono-locuteur (1 seul speaker détecté)")

            # Traductions
            if result.translations:
                print(f"\n  📢 Traductions générées: {len(result.translations)}")
                for trans in result.translations:
                    audio_exists = "✓" if trans.audio_path and os.path.exists(trans.audio_path) else "✗"
                    segments_info = ""
                    if trans.segments:
                        # Compter les speakers dans les segments traduits
                        trans_speakers = set(s.get('speakerId', 'unknown') for s in trans.segments if isinstance(s, dict))
                        segments_info = f", {len(trans.segments)} segments ({len(trans_speakers)} speakers)"
                    print(f"    • {trans.language}: {trans.duration_ms}ms, cloned={trans.voice_cloned} [{audio_exists}]{segments_info}")

                    # Afficher les premiers segments traduits
                    if trans.segments and len(trans.segments) > 0:
                        print(f"      Premiers segments:")
                        for i, seg in enumerate(trans.segments[:3]):
                            if isinstance(seg, dict):
                                text = seg.get('text', '')[:40]
                                speaker = seg.get('speakerId', '?')
                                print(f"        [{speaker}] \"{text}...\"")
            else:
                print_warning("Aucune traduction générée")
                errors.append("Aucune traduction")
        else:
            print_error("Résultat vide")
            errors.append("Résultat vide")

    except Exception as e:
        print_error(f"Erreur traitement: {e}")
        errors.append(str(e))
        import traceback
        traceback.print_exc()

    return len(errors) == 0, errors


async def main():
    """Exécute les deux tests avec les vrais fichiers audio"""

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}{BLUE}  🔬 TESTS PIPELINES AVEC AUDIO RÉEL - Meeshy Translator{RESET}")
    print(f"{BOLD}{'='*70}{RESET}")

    total_start = time.time()
    results = {}

    # Test 1: Mono-locuteur
    success_mono, errors_mono = await test_real_mono_speaker()
    results['mono'] = {'success': success_mono, 'errors': errors_mono}

    # Test 2: Multi-locuteur
    success_multi, errors_multi = await test_real_multi_speaker()
    results['multi'] = {'success': success_multi, 'errors': errors_multi}

    # Résumé final
    total_time = time.time() - total_start

    print_header("RÉSUMÉ FINAL")

    all_success = True
    for name, result in results.items():
        status = f"{GREEN}✅ PASS{RESET}" if result['success'] else f"{RED}❌ FAIL{RESET}"
        if not result['success']:
            all_success = False
        print(f"  {name.upper():15} {status}")
        if result['errors']:
            for err in result['errors']:
                print(f"    └─ {err[:70]}")

    print(f"\n  Temps total: {total_time:.2f}s")

    print(f"\n{BOLD}{'='*70}{RESET}")
    if all_success:
        print(f"{GREEN}{BOLD}  ✅ TOUS LES TESTS PASSENT!{RESET}")
    else:
        print(f"{RED}{BOLD}  ❌ DES TESTS ONT ÉCHOUÉ{RESET}")
    print(f"{BOLD}{'='*70}{RESET}\n")

    return all_success


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
