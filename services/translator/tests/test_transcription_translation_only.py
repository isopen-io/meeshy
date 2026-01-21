#!/usr/bin/env python3
"""
Test SIMPLIFIÉ - Transcription + Traduction uniquement
=======================================================

Teste UNIQUEMENT la transcription et traduction (SANS TTS) pour éviter
les problèmes d'espace disque avec mpsgraph.

Usage:
    cd services/translator
    python tests/test_transcription_translation_only.py
"""

import sys
import os
import asyncio
import logging

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


def print_success(text: str):
    print(f"{GREEN}✅ {text}{RESET}")


def print_error(text: str):
    print(f"{RED}❌ {text}{RESET}")


def print_info(text: str):
    print(f"{BLUE}ℹ️  {text}{RESET}")


async def test_transcription_and_translation(audio_path: str, test_name: str, expected_speakers: int = 1):
    """Test transcription + traduction UNIQUEMENT (sans TTS)"""

    print_header(f"TEST {test_name}")

    if not os.path.exists(audio_path):
        print_error(f"Fichier audio non trouvé: {audio_path}")
        return False, [f"Fichier non trouvé: {audio_path}"]

    print_info(f"Audio: {os.path.basename(audio_path)}")
    print_info(f"Taille: {os.path.getsize(audio_path) / 1024:.1f} KB")
    print_info(f"Speakers attendus: {expected_speakers}")

    errors = []

    try:
        # Import stages individuellement
        from services.audio_pipeline.transcription_stage import create_transcription_stage
        from services.audio_pipeline.translation_stage import create_translation_stage
        from mock_translation_service import MockTranslationService

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 1: Transcription + Diarisation
        # ═══════════════════════════════════════════════════════════════
        print(f"\n{CYAN}[Étape 1]{RESET} {BOLD}Transcription + Diarisation{RESET}")

        transcription_stage = create_transcription_stage()
        await transcription_stage.initialize()

        attachment_id = f'test_attach_{test_name}'

        # Appeler directement process avec audio_path et attachment_id
        # metadata est optionnel (pour transcription mobile)
        transcription_result = await transcription_stage.process(
            audio_path=audio_path,
            attachment_id=attachment_id,
            metadata=None,  # Pas de transcription mobile
            use_cache=False  # Force la transcription pour le test
        )

        if transcription_result:
            print_success("Transcription réussie")
            print(f"  • Texte: \"{transcription_result.text[:80]}...\"")
            print(f"  • Langue: {transcription_result.language}")
            print(f"  • Confiance: {transcription_result.confidence:.2%}")

            if transcription_result.speaker_count:
                print(f"  • Speakers détectés: {transcription_result.speaker_count}")
                if transcription_result.speaker_count != expected_speakers:
                    print_error(f"ERREUR DIARISATION: Attendu {expected_speakers} speakers, obtenu {transcription_result.speaker_count}")
                    errors.append(f"Diarisation incorrecte: {transcription_result.speaker_count} au lieu de {expected_speakers}")
                else:
                    print_success(f"Diarisation correcte: {transcription_result.speaker_count} speaker(s)")

            if transcription_result.segments:
                print(f"  • Segments: {len(transcription_result.segments)}")

                # Afficher les segments par speaker pour multi-speaker
                if transcription_result.speaker_count and transcription_result.speaker_count > 1:
                    print(f"\n  📝 Transcription par speaker:")

                    # Grouper les segments par speaker_id
                    speaker_texts = {}
                    for seg in transcription_result.segments:
                        speaker_id = seg.get('speaker_id', 'unknown') if isinstance(seg, dict) else getattr(seg, 'speaker_id', 'unknown')
                        text = seg.get('text', '') if isinstance(seg, dict) else getattr(seg, 'text', '')

                        if speaker_id not in speaker_texts:
                            speaker_texts[speaker_id] = []
                        speaker_texts[speaker_id].append(text)

                    # Afficher pour chaque speaker
                    for speaker_id in sorted(speaker_texts.keys()):
                        full_text = ' '.join(speaker_texts[speaker_id])
                        segment_count = len(speaker_texts[speaker_id])
                        print(f"    • [{speaker_id}] ({segment_count} seg): \"{full_text}\"")
        else:
            print_error("Pas de résultat de transcription")
            errors.append("Transcription vide")
            return False, errors

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 2: Traduction
        # ═══════════════════════════════════════════════════════════════
        print(f"\n{CYAN}[Étape 2]{RESET} {BOLD}Traduction (en + es){RESET}")

        # Créer le service de traduction mock
        mock_translation = MockTranslationService()
        await mock_translation.initialize()

        # Traduction pour EN
        result_en = await mock_translation.translate_with_structure(
            text=transcription_result.text,
            source_language=transcription_result.language,
            target_language='en',
            model_type='600M'
        )

        print(f"  • EN: \"{result_en['translated_text'][:80]}...\"")

        # Vérifier que le texte a été traduit (pas identique à l'original)
        if result_en['translated_text'] == transcription_result.text:
            print_error("ERREUR: Traduction EN identique à l'original!")
            errors.append("Traduction EN non effectuée")
        else:
            print_success("Traduction EN différente de l'original (OK)")

        # Traduction pour ES
        result_es = await mock_translation.translate_with_structure(
            text=transcription_result.text,
            source_language=transcription_result.language,
            target_language='es',
            model_type='600M'
        )

        print(f"  • ES: \"{result_es['translated_text'][:80]}...\"")

        # Vérifier que le texte a été traduit (pas identique à l'original)
        if result_es['translated_text'] == transcription_result.text:
            print_error("ERREUR: Traduction ES identique à l'original!")
            errors.append("Traduction ES non effectuée")
        else:
            print_success("Traduction ES différente de l'original (OK)")

    except Exception as e:
        print_error(f"Erreur: {e}")
        errors.append(str(e))
        import traceback
        traceback.print_exc()

    return len(errors) == 0, errors


async def main():
    """Exécute les tests simplifiés"""

    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}{BLUE}  🔬 TESTS TRANSCRIPTION + TRADUCTION (SANS TTS){RESET}")
    print(f"{BOLD}{'='*70}{RESET}")

    results = {}

    # Test 1: Mono-locuteur
    success_mono, errors_mono = await test_transcription_and_translation(
        MONO_AUDIO,
        "MONO",
        expected_speakers=1
    )
    results['mono'] = {'success': success_mono, 'errors': errors_mono}

    # Test 2: Multi-locuteur
    success_multi, errors_multi = await test_transcription_and_translation(
        MULTI_AUDIO,
        "MULTI",
        expected_speakers=2
    )
    results['multi'] = {'success': success_multi, 'errors': errors_multi}

    # Résumé final
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
