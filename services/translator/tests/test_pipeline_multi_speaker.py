#!/usr/bin/env python3
"""
Test Pipeline MULTI-LOCUTEUR
=============================

Test rapide pour vérifier que la chaîne de traitement multi-locuteur
fonctionne correctement AVANT de démarrer les services.

Usage:
    cd services/translator
    python tests/test_pipeline_multi_speaker.py

Ce test vérifie:
1. Import des modules multi-speaker
2. Fonctions de groupement des segments par speaker
3. Fonction d'extraction du segment le plus long
4. Création des tours de parole
5. Fonction de concaténation audio
6. Pipeline complet avec données simulées
"""

import sys
import os
import asyncio
import logging
import tempfile
import time
import numpy as np

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


async def test_multi_speaker_pipeline():
    """Test complet du pipeline multi-locuteur"""

    print_header("TEST PIPELINE MULTI-LOCUTEUR")

    errors = []
    warnings = []

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 1: IMPORT DES MODULES
    # ═══════════════════════════════════════════════════════════════
    print_info("Étape 1: Import des modules multi-speaker...")

    try:
        from services.audio_pipeline.multi_speaker_processor import (
            process_multi_speaker_audio,
            _group_segments_by_speaker,
            _create_turns_of_speech,
            _merge_similar_speakers,
            TurnOfSpeech,
            SpeakerData
        )
        print_success("multi_speaker_processor importé")
    except ImportError as e:
        print_error(f"Erreur import multi_speaker_processor: {e}")
        errors.append(f"Import multi_speaker_processor: {e}")
        return False, errors, warnings

    try:
        from services.audio_pipeline.audio_message_pipeline import (
            AudioMessagePipeline,
            get_audio_pipeline
        )
        print_success("AudioMessagePipeline importé")
    except ImportError as e:
        print_error(f"Erreur import AudioMessagePipeline: {e}")
        errors.append(f"Import AudioMessagePipeline: {e}")

    try:
        from services.audio_pipeline.translation_stage import TranslatedAudioVersion
        print_success("TranslatedAudioVersion importé")

        # Vérifier que le champ segments existe
        import dataclasses
        fields = {f.name for f in dataclasses.fields(TranslatedAudioVersion)}
        if 'segments' in fields:
            print_success("TranslatedAudioVersion a le champ 'segments'")
        else:
            print_error("TranslatedAudioVersion manque le champ 'segments'")
            errors.append("TranslatedAudioVersion.segments manquant")
    except ImportError as e:
        print_error(f"Erreur import TranslatedAudioVersion: {e}")
        errors.append(f"Import TranslatedAudioVersion: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 2: TEST GROUPEMENT PAR SPEAKER
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 2: Test groupement des segments par speaker...")

    # Segments simulés multi-locuteur
    test_segments = [
        {'text': 'Bonjour tout le monde', 'start_ms': 0, 'end_ms': 2000, 'speaker_id': 's0'},
        {'text': 'Salut comment ça va', 'start_ms': 2000, 'end_ms': 4000, 'speaker_id': 's1'},
        {'text': 'Ça va bien merci', 'start_ms': 4000, 'end_ms': 6000, 'speaker_id': 's0'},
        {'text': 'Super content de te voir', 'start_ms': 6000, 'end_ms': 9000, 'speaker_id': 's1'},
        {'text': 'Moi aussi', 'start_ms': 9000, 'end_ms': 10000, 'speaker_id': 's0'},
    ]

    try:
        speakers_data = await _group_segments_by_speaker(test_segments)

        if len(speakers_data) == 2:
            print_success(f"Groupement correct: {len(speakers_data)} speakers détectés")

            for speaker_id, data in speakers_data.items():
                seg_count = len(data['segments'])
                total_duration = data['total_duration_ms']
                print(f"    • {speaker_id}: {seg_count} segments, {total_duration}ms")
        else:
            print_error(f"Groupement incorrect: attendu 2 speakers, obtenu {len(speakers_data)}")
            errors.append(f"Groupement: attendu 2, obtenu {len(speakers_data)}")
    except Exception as e:
        print_error(f"Erreur groupement: {e}")
        errors.append(f"Groupement: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 3: TEST SEGMENT LE PLUS LONG
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 3: Vérification extraction segment le plus long...")

    # Vérifier que pour s1, le segment le plus long est celui de 3000ms (6000-9000)
    try:
        s1_segments = speakers_data.get('s1', {}).get('segments', [])
        if s1_segments:
            longest = max(s1_segments, key=lambda s: s['end_ms'] - s['start_ms'])
            duration = longest['end_ms'] - longest['start_ms']
            if duration == 3000:
                print_success(f"Segment le plus long pour s1: {duration}ms ✓")
            else:
                print_warning(f"Segment inattendu: {duration}ms (attendu 3000ms)")
                warnings.append(f"Segment plus long s1: {duration}ms != 3000ms")
        else:
            print_error("Pas de segments pour s1")
            errors.append("Pas de segments pour s1")
    except Exception as e:
        print_error(f"Erreur vérification segment: {e}")
        errors.append(f"Segment plus long: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 4: TEST CRÉATION TOURS DE PAROLE
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 4: Test création des tours de parole...")

    try:
        # Mapping identité (pas de fusion)
        speaker_mapping = {'s0': 's0', 's1': 's1'}

        turns = _create_turns_of_speech(test_segments, speaker_mapping)

        # Attendu: 5 tours (alternance s0-s1-s0-s1-s0)
        if len(turns) == 5:
            print_success(f"Tours de parole créés: {len(turns)} tours")
            for i, turn in enumerate(turns):
                print(f"    • Tour {i+1}: {turn.speaker_id}, {len(turn.text)} chars")
        else:
            print_warning(f"Nombre de tours inattendu: {len(turns)} (attendu 5)")
            warnings.append(f"Tours: {len(turns)} != 5")

        # Vérifier l'ordre des speakers
        expected_order = ['s0', 's1', 's0', 's1', 's0']
        actual_order = [t.speaker_id for t in turns]
        if actual_order == expected_order:
            print_success("Ordre des tours correct")
        else:
            print_error(f"Ordre incorrect: {actual_order} != {expected_order}")
            errors.append(f"Ordre tours: {actual_order} != {expected_order}")

    except Exception as e:
        print_error(f"Erreur tours de parole: {e}")
        errors.append(f"Tours de parole: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 5: TEST INITIALISATION PIPELINE COMPLET
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 5: Test initialisation pipeline complet...")

    try:
        start = time.time()
        pipeline = get_audio_pipeline()  # Pas async
        init_time = time.time() - start
        print_success(f"Pipeline initialisé en {init_time:.2f}s")

        # Vérifier translation_stage
        if hasattr(pipeline, 'translation_stage') and pipeline.translation_stage:
            print_success("TranslationStage disponible pour multi-speaker")
        else:
            print_error("TranslationStage non disponible")
            errors.append("TranslationStage non disponible")

    except Exception as e:
        print_error(f"Erreur initialisation: {e}")
        errors.append(f"Init pipeline: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 6: TEST SYNTHÈSE TTS (requis pour multi-speaker)
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 6: Test synthèse TTS (base du multi-speaker)...")

    try:
        tts_service = pipeline.translation_stage.tts_service

        # Test TTS français
        start = time.time()
        result_fr = await tts_service.synthesize(
            text="Bonjour, je suis le locuteur numéro un.",
            language="fr",
            output_format="mp3"
        )
        tts_time = time.time() - start

        if result_fr and result_fr.audio_path and os.path.exists(result_fr.audio_path):
            print_success(f"TTS français: {result_fr.duration_ms}ms ({tts_time:.2f}s)")
        else:
            print_error("TTS français échoué")
            errors.append("TTS français échoué")

        # Test TTS anglais
        start = time.time()
        result_en = await tts_service.synthesize(
            text="Hello, I am speaker number two.",
            language="en",
            output_format="mp3"
        )
        tts_time = time.time() - start

        if result_en and result_en.audio_path and os.path.exists(result_en.audio_path):
            print_success(f"TTS anglais: {result_en.duration_ms}ms ({tts_time:.2f}s)")
        else:
            print_error("TTS anglais échoué")
            errors.append("TTS anglais échoué")

    except Exception as e:
        print_error(f"Erreur TTS: {e}")
        errors.append(f"TTS: {e}")

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 7: TEST CONCATÉNATION AUDIO (simulation)
    # ═══════════════════════════════════════════════════════════════
    print_info("\nÉtape 7: Test concaténation audio...")

    try:
        from services.audio_pipeline.multi_speaker_processor import _concatenate_turns_in_order

        # Créer des mock translations
        mock_turn_translations = []
        if result_fr and result_fr.audio_path:
            mock_turn_translations.append({
                'speaker_id': 's0',
                'translation': TranslatedAudioVersion(
                    language='en',
                    translated_text='Hello everyone',
                    audio_path=result_fr.audio_path,
                    audio_url='/test.mp3',
                    duration_ms=result_fr.duration_ms,
                    format='mp3',
                    voice_cloned=False,
                    voice_quality=0.0,
                    processing_time_ms=100
                ),
                'turn': TurnOfSpeech(
                    speaker_id='s0',
                    text='Bonjour',
                    segments=[],
                    start_position=0,
                    end_position=0
                )
            })

        if result_en and result_en.audio_path:
            mock_turn_translations.append({
                'speaker_id': 's1',
                'translation': TranslatedAudioVersion(
                    language='en',
                    translated_text='Hi how are you',
                    audio_path=result_en.audio_path,
                    audio_url='/test2.mp3',
                    duration_ms=result_en.duration_ms,
                    format='mp3',
                    voice_cloned=False,
                    voice_quality=0.0,
                    processing_time_ms=100
                ),
                'turn': TurnOfSpeech(
                    speaker_id='s1',
                    text='Salut',
                    segments=[],
                    start_position=1,
                    end_position=1
                )
            })

        if len(mock_turn_translations) >= 2:
            start = time.time()
            final_audio = await _concatenate_turns_in_order(
                turn_translations=mock_turn_translations,
                target_lang='en',
                message_id='test_multi',
                attachment_id='test_attach'
            )
            concat_time = time.time() - start

            if final_audio and final_audio.audio_path and os.path.exists(final_audio.audio_path):
                size = os.path.getsize(final_audio.audio_path)
                print_success(
                    f"Concaténation réussie: {final_audio.duration_ms}ms, "
                    f"{size/1024:.1f}KB ({concat_time:.2f}s)"
                )

                # Vérifier les segments
                if final_audio.segments:
                    print_success(f"Segments traduits inclus: {len(final_audio.segments)}")
                else:
                    print_warning("Pas de segments dans l'audio final")
                    warnings.append("Pas de segments dans audio concaténé")
            else:
                print_error("Concaténation échouée")
                errors.append("Concaténation échouée")
        else:
            print_warning("Pas assez d'audios pour tester la concaténation")
            warnings.append("Test concaténation incomplet")

    except Exception as e:
        print_error(f"Erreur concaténation: {e}")
        errors.append(f"Concaténation: {e}")
        import traceback
        traceback.print_exc()

    # ═══════════════════════════════════════════════════════════════
    # RÉSUMÉ
    # ═══════════════════════════════════════════════════════════════
    print_header("RÉSUMÉ TEST MULTI-LOCUTEUR")

    if errors:
        print_error(f"{len(errors)} erreur(s) détectée(s):")
        for err in errors:
            print(f"  • {err}")

    if warnings:
        print_warning(f"{len(warnings)} avertissement(s):")
        for warn in warnings:
            print(f"  • {warn}")

    if not errors:
        print_success("Pipeline MULTI-LOCUTEUR opérationnel!")
        return True, errors, warnings
    else:
        print_error("Pipeline MULTI-LOCUTEUR a des erreurs!")
        return False, errors, warnings


if __name__ == "__main__":
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  TEST PIPELINE MULTI-LOCUTEUR - Meeshy Translator{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")

    success, errors, warnings = asyncio.run(test_multi_speaker_pipeline())

    print(f"\n{BOLD}{'='*60}{RESET}")
    if success:
        print(f"{GREEN}{BOLD}  ✅ TEST RÉUSSI{RESET}")
    else:
        print(f"{RED}{BOLD}  ❌ TEST ÉCHOUÉ{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")

    sys.exit(0 if success else 1)
