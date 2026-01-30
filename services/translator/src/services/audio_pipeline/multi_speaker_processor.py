"""
Multi-Speaker Audio Processor
==============================

Traite les audios multi-speakers en créant des TOURS DE PAROLE.

Architecture:
1. Extraire l'audio de chaque speaker (un fichier par speaker)
2. Créer un voice_model par speaker (en utilisant leur audio extrait)
3. Comparer les voice_models et fusionner les speakers similaires
4. Créer des "tours de parole" (segments consécutifs du même speaker)
5. Traiter chaque TOUR DE PAROLE avec la chaîne MONO-LOCUTEUR
   - Chaque tour utilise le voice_model de son speaker (réutilisé)
6. Concaténer les tours traduits dans l'ordre original

Cette approche optimise le nombre d'appels TTS et préserve l'ordre de la conversation.

Cache WAV:
- Les conversions M4A → WAV sont mises en cache pendant 7 jours
- Répertoire: models/wav_cache
- Nettoyage automatique des fichiers expirés

"""

import os
import logging
import numpy as np
import time
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Répertoire de cache WAV
WAV_CACHE_DIR = "/Users/smpceo/Documents/v2_meeshy/services/translator/models/wav_cache"
WAV_CACHE_MAX_AGE_DAYS = 7


def cleanup_wav_cache(cache_dir: str = WAV_CACHE_DIR, max_age_days: int = WAV_CACHE_MAX_AGE_DAYS) -> int:
    """
    Nettoie le cache WAV en supprimant les fichiers plus vieux que max_age_days.

    Args:
        cache_dir: Répertoire du cache
        max_age_days: Âge maximum des fichiers en jours

    Returns:
        Nombre de fichiers supprimés
    """
    if not os.path.exists(cache_dir):
        return 0

    max_age_seconds = max_age_days * 86400
    current_time = time.time()
    removed_count = 0

    try:
        for filename in os.listdir(cache_dir):
            if not filename.endswith('.wav'):
                continue

            file_path = os.path.join(cache_dir, filename)
            file_age = current_time - os.path.getmtime(file_path)

            if file_age > max_age_seconds:
                try:
                    os.remove(file_path)
                    removed_count += 1
                    logger.info(
                        f"[WAV_CACHE] 🗑️  Supprimé: {filename} "
                        f"(âge: {file_age/86400:.1f}j > {max_age_days}j)"
                    )
                except Exception as e:
                    logger.warning(f"[WAV_CACHE] ⚠️  Impossible de supprimer {filename}: {e}")

        if removed_count > 0:
            logger.info(f"[WAV_CACHE] ✅ Nettoyage terminé: {removed_count} fichier(s) supprimé(s)")

    except Exception as e:
        logger.error(f"[WAV_CACHE] ❌ Erreur nettoyage cache: {e}")

    return removed_count


def get_wav_cache_stats(cache_dir: str = WAV_CACHE_DIR) -> Dict[str, Any]:
    """
    Retourne les statistiques du cache WAV.

    Returns:
        Dict avec: total_files, total_size_mb, oldest_file_age_days
    """
    if not os.path.exists(cache_dir):
        return {"total_files": 0, "total_size_mb": 0, "oldest_file_age_days": 0}

    total_files = 0
    total_size = 0
    oldest_age = 0
    current_time = time.time()

    try:
        for filename in os.listdir(cache_dir):
            if not filename.endswith('.wav'):
                continue

            file_path = os.path.join(cache_dir, filename)
            total_files += 1
            total_size += os.path.getsize(file_path)
            file_age = (current_time - os.path.getmtime(file_path)) / 86400
            oldest_age = max(oldest_age, file_age)

    except Exception as e:
        logger.error(f"[WAV_CACHE] ❌ Erreur stats cache: {e}")

    return {
        "total_files": total_files,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "oldest_file_age_days": round(oldest_age, 1)
    }


@dataclass
class SpeakerData:
    """Données d'un speaker"""
    speaker_id: str
    segments: List[Dict[str, Any]]  # Segments de ce speaker
    full_text: str                   # Texte concaténé
    audio_path: str                  # Audio extrait du speaker
    voice_model: Any                 # Voice model créé
    segment_positions: List[int]     # Positions globales des segments


@dataclass
class TurnOfSpeech:
    """Tour de parole : segments consécutifs du même speaker"""
    speaker_id: str
    text: str                        # Texte complet du tour
    segments: List[Dict[str, Any]]   # Segments constituant ce tour
    start_position: int              # Position du premier segment
    end_position: int                # Position du dernier segment


async def process_multi_speaker_audio(
    translation_stage,
    voice_clone_service,
    segments: List[Dict[str, Any]],
    source_audio_path: str,
    target_languages: List[str],
    source_language: str,
    message_id: str,
    attachment_id: str,
    user_voice_model: Optional[Any] = None,
    sender_speaker_id: Optional[str] = None,
    model_type: str = "premium",
    on_translation_ready: Optional[Any] = None,
    diarization_speakers: Optional[List[Any]] = None
) -> Dict[str, Any]:
    """
    Traite un audio multi-speaker en créant des tours de parole.

    Processus:
    1. Groupe les segments par speaker
    2. Extrait l'audio de chaque speaker dans un fichier séparé
    3. Crée un voice_model par speaker (UNE SEULE FOIS, réutilisé ensuite)
    4. Compare les voice_models et fusionne les speakers trop similaires
    5. Crée des "tours de parole" (segments consécutifs du même speaker)
    6. Traite chaque TOUR DE PAROLE avec la chaîne mono-locuteur:
       - Traduit le texte complet du tour
       - Synthétise avec le voice_model du speaker (déjà calculé)
    7. Concatène tous les tours dans l'ordre original de la conversation
    8. **Re-transcription légère** pour obtenir des segments fins:
       - Transcrit l'audio traduit avec Whisper (sans diarisation)
       - Mappe les speakers en utilisant les timestamps des tours
       - Remplace les segments grossiers par des segments fins précis
    9. **Callback immédiat** après chaque langue:
       - Remonte la traduction à la gateway dès qu'elle est prête
       - Permet une mise à jour progressive de l'UI

    Avantages:
    - Voice_model créé une seule fois par speaker (pas recalculé)
    - Speakers similaires fusionnés automatiquement
    - Moins d'appels TTS (un par tour au lieu d'un par segment)
    - Meilleure continuité audio dans les tours de parole
    - Segments fins avec timestamps exacts (+30% overhead vs +80% avec diarisation)
    - Remontée progressive des résultats (UX réactive)

    Args:
        translation_stage: TranslationStage avec la chaîne mono-locuteur
        voice_clone_service: Service de clonage vocal
        segments: Segments avec speaker_id
        source_audio_path: Chemin audio source
        target_languages: Langues cibles
        source_language: Langue source
        message_id: ID message
        attachment_id: ID attachment
        user_voice_model: Voice model utilisateur (optionnel)
        sender_speaker_id: Speaker identifié comme expéditeur
        model_type: Type de modèle de traduction
        on_translation_ready: Callback appelé après chaque traduction de langue
                             (permet remontée progressive à la gateway)
        diarization_speakers: Segments de diarization bruts (pour filtrage overlaps)

    Returns:
        Dict avec les traductions par langue
    """
    logger.info(
        f"[MULTI_SPEAKER] 🎭 Traitement multi-speaker: "
        f"{len(segments)} segments, langues={target_languages}"
    )

    # Nettoyage automatique du cache WAV (fichiers > 7 jours)
    cleanup_wav_cache()

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 1: GROUPER PAR SPEAKER
    # ═══════════════════════════════════════════════════════════════
    speakers_data = await _group_segments_by_speaker(segments)

    logger.info(f"[MULTI_SPEAKER] Speakers détectés: {len(speakers_data)}")
    for speaker_id, data in speakers_data.items():
        logger.info(
            f"[MULTI_SPEAKER]   • {speaker_id}: "
            f"{len(data['segments'])} segments, "
            f"{len(data['full_text'])} chars"
        )

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 2: EXTRAIRE L'AUDIO DE CHAQUE SPEAKER
    # ═══════════════════════════════════════════════════════════════
    for speaker_id, data in speakers_data.items():
        audio_path = await _extract_speaker_audio(
            speaker_id=speaker_id,
            source_audio_path=source_audio_path,
            segments=data['segments'],
            all_diarization_speakers=diarization_speakers
        )

        if not audio_path:
            logger.error(f"[MULTI_SPEAKER] ❌ Échec extraction audio pour {speaker_id}")
            return {}

        data['audio_path'] = audio_path

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 3: CRÉER VOICE MODEL POUR CHAQUE SPEAKER
    # ═══════════════════════════════════════════════════════════════
    for speaker_id, data in speakers_data.items():
        # Si c'est l'expéditeur et qu'on a son modèle, l'utiliser
        if sender_speaker_id == speaker_id and user_voice_model:
            logger.info(f"[MULTI_SPEAKER] ✅ Utilisation du modèle utilisateur pour {speaker_id}")
            data['voice_model'] = user_voice_model
            continue

        # Sinon créer un modèle temporaire
        temp_user_id = f"temp_speaker_{speaker_id}"
        voice_model = await voice_clone_service.get_or_create_voice_model(
            user_id=temp_user_id,
            current_audio_path=data['audio_path'],
            current_audio_duration_ms=data['total_duration_ms']
        )

        if not voice_model:
            logger.error(f"[MULTI_SPEAKER] ❌ Échec création voice model pour {speaker_id}")
            return {}

        data['voice_model'] = voice_model

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 4: FUSIONNER LES SPEAKERS SIMILAIRES
    # ═══════════════════════════════════════════════════════════════
    logger.info("[MULTI_SPEAKER] 🔍 Comparaison des voice_models...")
    speaker_mapping = await _merge_similar_speakers(
        speakers_data=speakers_data,
        similarity_threshold=0.85
    )

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 5: CRÉER LES TOURS DE PAROLE
    # ═══════════════════════════════════════════════════════════════
    logger.info("[MULTI_SPEAKER] 📋 Création des tours de parole...")
    turns_of_speech = _create_turns_of_speech(
        segments=segments,
        speaker_mapping=speaker_mapping
    )

    if not turns_of_speech:
        logger.error("[MULTI_SPEAKER] ❌ Aucun tour de parole créé")
        return {}

    # ═══════════════════════════════════════════════════════════════
    # ÉTAPE 6: TRAITER CHAQUE TOUR DE PAROLE
    # ═══════════════════════════════════════════════════════════════
    translations = {}

    for target_lang in target_languages:
        logger.info(f"[MULTI_SPEAKER] 🌐 Traitement langue: {target_lang}")

        turn_translations = []

        # Traiter chaque tour de parole
        for turn_idx, turn in enumerate(turns_of_speech):
            speaker_id = turn.speaker_id

            # Récupérer le voice_model du speaker (déjà calculé)
            speaker_data = speakers_data.get(speaker_id)
            if not speaker_data:
                logger.error(f"[MULTI_SPEAKER] ❌ Speaker {speaker_id} introuvable")
                continue

            voice_model = speaker_data['voice_model']

            # ═══════════════════════════════════════════════════════════════
            # UTILISER LA CHAÎNE MONO-LOCUTEUR POUR CE TOUR DE PAROLE
            # ═══════════════════════════════════════════════════════════════
            import time
            lang_start = time.time()

            _, translation_result = await translation_stage._process_single_language_async(
                target_lang=target_lang,
                source_text=turn.text,
                source_language=source_language,
                audio_hash=f"{speaker_id}_{message_id}_{turn_idx}",
                voice_model=voice_model,
                message_id=message_id,
                attachment_id=f"{attachment_id}_{speaker_id}_{turn_idx}",
                model_type=model_type,
                cloning_params=None,
                lang_start=lang_start,
                source_audio_path=speaker_data['audio_path']
            )

            if not translation_result:
                logger.error(
                    f"[MULTI_SPEAKER] ❌ Échec traduction tour {turn_idx+1}, "
                    f"speaker {speaker_id}, langue {target_lang}"
                )
                continue

            turn_translations.append({
                'speaker_id': speaker_id,
                'translation': translation_result,
                'turn': turn
            })

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 7: CONCATÉNER LES TOURS DE PAROLE DANS L'ORDRE
        # ═══════════════════════════════════════════════════════════════
        if turn_translations:
            logger.info(
                f"[MULTI_SPEAKER] 🔗 Concaténation de {len(turn_translations)} tours "
                f"pour {target_lang}..."
            )

            final_audio = await _concatenate_turns_in_order(
                turn_translations=turn_translations,
                target_lang=target_lang,
                message_id=message_id,
                attachment_id=attachment_id
            )

            if final_audio:
                # ═══════════════════════════════════════════════════════════════
                # ÉTAPE 8: RE-TRANSCRIPTION LÉGÈRE POUR SEGMENTS FINS
                # ═══════════════════════════════════════════════════════════════
                # Essayer la re-transcription, mais ne pas bloquer si elle échoue
                fine_segments = None
                try:
                    # Extraire les métadonnées des tours depuis turn_translations
                    turns_metadata = []
                    current_time_ms = 0
                    for turn_data in turn_translations:
                        translation = turn_data['translation']
                        turn = turn_data.get('turn')
                        if translation and turn:
                            # Récupérer les métadonnées complètes du speaker
                            speaker_data = speakers_data.get(turn.speaker_id, {})

                            turns_metadata.append({
                                'start_ms': current_time_ms,
                                'end_ms': current_time_ms + translation.duration_ms,
                                'speaker_id': turn.speaker_id,
                                'voice_similarity_score': speaker_data.get('voice_similarity_score')
                            })
                            current_time_ms += translation.duration_ms

                    # Re-transcrire avec mapping speakers
                    from .retranscription_service import retranscribe_translated_audio

                    fine_segments = await retranscribe_translated_audio(
                        audio_path=final_audio.audio_path,
                        target_language=target_lang,
                        turns_metadata=turns_metadata
                    )

                    # Vérifier si on a reçu des segments invalides
                    # 1. Liste vide = re-transcription échouée silencieusement
                    # 2. Segments de fallback = re-transcription échouée explicitement
                    is_empty = not fine_segments or len(fine_segments) == 0
                    is_fallback = fine_segments and len(fine_segments) > 0 and fine_segments[0].get('fallback', False)

                    if is_empty or is_fallback:
                        logger.warning(
                            f"[MULTI_SPEAKER] ⚠️ Re-transcription invalide pour {target_lang} "
                            f"(vide={is_empty}, fallback={is_fallback}), utilisation des textes traduits"
                        )
                        # Forcer l'utilisation du fallback avec vrais textes
                        raise Exception("Re-transcription invalide, utilisation des textes traduits")

                    # Remplacer les segments grossiers par les segments fins
                    final_audio.segments = fine_segments

                except Exception as e:
                    logger.warning(
                        f"[MULTI_SPEAKER] ⚠️ Échec re-transcription pour {target_lang}: {e}"
                    )
                    # Fallback: créer des segments grossiers basés sur les tours
                    fine_segments = []
                    current_time_ms = 0
                    for turn_data in turn_translations:
                        translation = turn_data['translation']
                        turn = turn_data.get('turn')
                        if translation and turn:
                            speaker_data = speakers_data.get(turn.speaker_id, {})
                            fine_segments.append({
                                'text': translation.translated_text,
                                'startMs': current_time_ms,
                                'endMs': current_time_ms + translation.duration_ms,
                                'speakerId': turn.speaker_id,
                                'confidence': 0.9,  # Confiance par défaut
                                'voiceSimilarityScore': speaker_data.get('voice_similarity_score'),
                                'language': target_lang
                            })
                            current_time_ms += translation.duration_ms

                    final_audio.segments = fine_segments

                translations[target_lang] = final_audio

                # ═══════════════════════════════════════════════════════════════
                # ÉTAPE 9: CALLBACK POUR REMONTÉE IMMÉDIATE À LA GATEWAY
                # ═══════════════════════════════════════════════════════════════
                if on_translation_ready:
                    try:
                        # Déterminer le type d'événement selon le nombre de langues
                        total_languages = len(target_languages)
                        is_single_language = total_languages == 1
                        current_index = list(target_languages).index(target_lang) + 1
                        is_last_language = current_index == total_languages

                        translation_data = {
                            'message_id': message_id,
                            'attachment_id': attachment_id,
                            'language': target_lang,
                            'translation': final_audio,
                            'segments': fine_segments,
                            # Métadonnées pour déterminer le type d'événement
                            'is_single_language': is_single_language,
                            'is_last_language': is_last_language,
                            'current_index': current_index,
                            'total_languages': total_languages
                        }

                        # Appeler le callback (peut être async)
                        if asyncio.iscoroutinefunction(on_translation_ready):
                            await on_translation_ready(translation_data)
                        else:
                            on_translation_ready(translation_data)

                    except Exception as e:
                        logger.warning(f"[MULTI_SPEAKER] ⚠️ Erreur callback traduction: {e}")

            else:
                logger.error(f"[MULTI_SPEAKER] ❌ Échec concaténation pour {target_lang}")

    logger.info(
        f"[MULTI_SPEAKER] ✅ Traitement terminé: "
        f"{len(translations)}/{len(target_languages)} langues"
    )

    return translations


async def _group_segments_by_speaker(
    segments: List[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """Groupe les segments par speaker"""
    speakers = {}

    for i, seg in enumerate(segments):
        speaker_id = seg.get('speaker_id', seg.get('speakerId', 'unknown'))
        text = seg.get('text', '')

        if not text.strip():
            continue

        if speaker_id not in speakers:
            speakers[speaker_id] = {
                'segments': [],
                'full_text': '',
                'segment_positions': [],
                'total_duration_ms': 0,
                'voice_similarity_score': None  # Sera extrait du premier segment
            }

        speakers[speaker_id]['segments'].append(seg)
        speakers[speaker_id]['segment_positions'].append(i)
        speakers[speaker_id]['full_text'] += ' ' + text
        speakers[speaker_id]['total_duration_ms'] += (
            seg.get('end_ms', seg.get('endMs', 0)) -
            seg.get('start_ms', seg.get('startMs', 0))
        )

        # Extraire voiceSimilarityScore du premier segment de ce speaker
        if speakers[speaker_id]['voice_similarity_score'] is None:
            speakers[speaker_id]['voice_similarity_score'] = seg.get(
                'voice_similarity_score',
                seg.get('voiceSimilarityScore')
            )

    # Nettoyer les espaces
    for speaker_id in speakers:
        speakers[speaker_id]['full_text'] = speakers[speaker_id]['full_text'].strip()

    return speakers


def _compare_voice_models(voice_model_1: Any, voice_model_2: Any) -> float:
    """
    Compare deux voice_models et retourne un score de similarité (0.0 à 1.0).

    Utilise les caractéristiques vocales pour comparer les models.
    """
    try:
        # Extraire les caractéristiques vocales
        chars_1 = getattr(voice_model_1, 'voice_characteristics', None)
        chars_2 = getattr(voice_model_2, 'voice_characteristics', None)

        if not chars_1 or not chars_2:
            logger.warning("[MULTI_SPEAKER] ⚠️ Voice characteristics manquantes")
            return 0.0

        # Comparer pitch (hauteur de voix)
        pitch_1 = getattr(chars_1, 'pitch_mean', 0)
        pitch_2 = getattr(chars_2, 'pitch_mean', 0)

        if pitch_1 == 0 or pitch_2 == 0:
            return 0.0

        pitch_diff = abs(pitch_1 - pitch_2) / max(pitch_1, pitch_2)
        pitch_similarity = 1.0 - min(pitch_diff, 1.0)

        # Comparer énergie vocale
        energy_1 = getattr(chars_1, 'rms_energy', 0)
        energy_2 = getattr(chars_2, 'rms_energy', 0)

        if energy_1 > 0 and energy_2 > 0:
            energy_diff = abs(energy_1 - energy_2) / max(energy_1, energy_2)
            energy_similarity = 1.0 - min(energy_diff, 1.0)
        else:
            energy_similarity = 0.5

        # Score final (moyenne pondérée)
        similarity = 0.7 * pitch_similarity + 0.3 * energy_similarity

        logger.info(
            f"[MULTI_SPEAKER] 🔍 Similarité voice_models: {similarity:.2f} "
            f"(pitch: {pitch_similarity:.2f}, energy: {energy_similarity:.2f})"
        )

        return similarity

    except Exception as e:
        logger.error(f"[MULTI_SPEAKER] ❌ Erreur comparaison voice_models: {e}")
        return 0.0


async def _merge_similar_speakers(
    speakers_data: Dict[str, Dict[str, Any]],
    similarity_threshold: float = 0.85
) -> Dict[str, str]:
    """
    Fusionne les speakers avec voice_models similaires.

    Args:
        speakers_data: Données des speakers avec voice_models
        similarity_threshold: Seuil de similarité (0.85 = 85% similaire)

    Returns:
        Dict de mapping: speaker_id_original → speaker_id_final
    """
    speaker_ids = list(speakers_data.keys())
    merged_mapping = {}  # speaker_id → speaker_id_merged

    # Initialiser : chaque speaker pointe vers lui-même
    for speaker_id in speaker_ids:
        merged_mapping[speaker_id] = speaker_id

    # Comparer tous les speakers entre eux
    for i, speaker_1 in enumerate(speaker_ids):
        for speaker_2 in speaker_ids[i+1:]:
            voice_model_1 = speakers_data[speaker_1].get('voice_model')
            voice_model_2 = speakers_data[speaker_2].get('voice_model')

            if not voice_model_1 or not voice_model_2:
                continue

            similarity = _compare_voice_models(voice_model_1, voice_model_2)

            if similarity >= similarity_threshold:
                logger.info(
                    f"[MULTI_SPEAKER] 🔗 Fusion: {speaker_2} → {speaker_1} "
                    f"(similarité: {similarity:.2%})"
                )

                # Fusionner speaker_2 dans speaker_1
                merged_mapping[speaker_2] = speaker_1

                # Fusionner les données
                speakers_data[speaker_1]['segments'].extend(
                    speakers_data[speaker_2]['segments']
                )
                speakers_data[speaker_1]['segment_positions'].extend(
                    speakers_data[speaker_2]['segment_positions']
                )

    # Nombre de speakers après fusion
    unique_speakers = len(set(merged_mapping.values()))
    if unique_speakers < len(speaker_ids):
        logger.info(
            f"[MULTI_SPEAKER] ✅ Fusion terminée: {len(speaker_ids)} → {unique_speakers} speakers"
        )

    return merged_mapping


def _create_turns_of_speech(
    segments: List[Dict[str, Any]],
    speaker_mapping: Dict[str, str]
) -> List[TurnOfSpeech]:
    """
    Crée des tours de parole en regroupant les segments consécutifs du même speaker.

    Args:
        segments: Liste des segments originaux
        speaker_mapping: Mapping speaker_id_original → speaker_id_final

    Returns:
        Liste de TurnOfSpeech dans l'ordre original
    """
    turns = []
    current_turn = None

    for i, seg in enumerate(segments):
        speaker_id = seg.get('speaker_id', seg.get('speakerId', 'unknown'))
        text = seg.get('text', '').strip()

        if not text:
            continue

        # Appliquer le mapping de fusion
        final_speaker_id = speaker_mapping.get(speaker_id, speaker_id)

        # Si c'est le même speaker que le tour en cours, ajouter au tour
        if current_turn and current_turn.speaker_id == final_speaker_id:
            current_turn.text += ' ' + text
            current_turn.segments.append(seg)
            current_turn.end_position = i
        else:
            # Nouveau tour de parole
            if current_turn:
                turns.append(current_turn)

            current_turn = TurnOfSpeech(
                speaker_id=final_speaker_id,
                text=text,
                segments=[seg],
                start_position=i,
                end_position=i
            )

    # Ajouter le dernier tour
    if current_turn:
        turns.append(current_turn)

    logger.info(
        f"[MULTI_SPEAKER] 📋 Tours de parole créés: {len(turns)} tours "
        f"pour {len(segments)} segments"
    )

    for i, turn in enumerate(turns):
        logger.info(
            f"[MULTI_SPEAKER]   • Tour {i+1}: Speaker {turn.speaker_id}, "
            f"{len(turn.segments)} segments, {len(turn.text)} chars"
        )

    return turns


def _check_overlap_with_others(
    seg_start: int,
    seg_end: int,
    speaker_id: str,
    all_diarization_speakers: Optional[List]
) -> bool:
    """
    Vérifie si d'autres speakers parlent dans cette zone temporelle.

    Args:
        seg_start: Début du segment (ms)
        seg_end: Fin du segment (ms)
        speaker_id: ID du speaker actuel
        all_diarization_speakers: Liste de tous les speakers de diarization

    Returns:
        True si overlap détecté (un autre speaker parle), False si ce speaker parle seul
    """
    if not all_diarization_speakers:
        return False  # Pas de diarization, pas d'overlap possible

    for speaker in all_diarization_speakers:
        # Skip self
        if speaker.speaker_id == speaker_id:
            continue

        # Vérifier overlap avec ce speaker
        for diar_seg in speaker.segments:
            # Il y a overlap si les segments se chevauchent
            if (diar_seg.start_ms < seg_end and diar_seg.end_ms > seg_start):
                return True  # Overlap détecté

    return False  # Aucun overlap, ce speaker parle seul


async def _extract_speaker_audio(
    speaker_id: str,
    source_audio_path: str,
    segments: List[Dict[str, Any]],
    all_diarization_speakers: Optional[List] = None
) -> Optional[str]:
    """
    Extrait l'audio de RÉFÉRENCE d'un speaker pour le clonage vocal.

    STRATÉGIE DE FILTRAGE OVERLAP:
    1. Si all_diarization_speakers fourni, filtre les segments en deux catégories:
       - Segments PROPRES : ce speaker parle seul (aucun autre speaker)
       - Segments OVERLAP : un autre speaker parle en même temps
    2. Priorise les segments PROPRES pour un voice model pur
    3. Si pas assez d'audio propre (< 3s), ajoute des segments avec overlap

    Cette stratégie garantit un clonage vocal de haute qualité sans contamination.

    Args:
        speaker_id: ID du speaker
        source_audio_path: Chemin audio source
        segments: Segments de ce speaker (transcrits avec succès)
        all_diarization_speakers: Liste des speakers de diarization (pour filtrage overlap)

    Returns:
        Chemin vers l'audio de référence (N segments les plus longs, jusqu'à 7s)
    """
    try:
        import soundfile as sf
        import numpy as np
        import subprocess
        import hashlib
        import time
        from pathlib import Path

        logger.info(f"[MULTI_SPEAKER] 📂 Lecture audio source: {source_audio_path}")

        # Vérifier si le fichier est en M4A/AAC et le convertir en WAV si nécessaire
        audio_path_to_read = source_audio_path
        temp_wav_path = None
        cache_used = False

        if source_audio_path.lower().endswith(('.m4a', '.aac', '.mp4')):
            # Calculer hash du fichier source pour le cache
            with open(source_audio_path, 'rb') as f:
                file_hash = hashlib.md5(f.read()).hexdigest()[:16]

            # Répertoire de cache persistant (7 jours)
            os.makedirs(WAV_CACHE_DIR, exist_ok=True)

            # Nom du fichier en cache
            cached_wav_filename = f"{file_hash}_{Path(source_audio_path).stem}.wav"
            cached_wav_path = os.path.join(WAV_CACHE_DIR, cached_wav_filename)

            # Vérifier si conversion déjà en cache
            if os.path.exists(cached_wav_path):
                # Vérifier l'âge du cache (7 jours = 604800 secondes)
                file_age = time.time() - os.path.getmtime(cached_wav_path)
                if file_age < 604800:  # 7 jours
                    logger.info(
                        f"[MULTI_SPEAKER] ♻️  Utilisation cache WAV existant "
                        f"(âge: {file_age/3600:.1f}h): {cached_wav_filename}"
                    )
                    audio_path_to_read = cached_wav_path
                    temp_wav_path = cached_wav_path  # Pour référence, mais ne sera pas supprimé
                    cache_used = True
                else:
                    logger.info(f"[MULTI_SPEAKER] 🗑️  Cache WAV expiré (>{file_age/86400:.1f}j), reconversion nécessaire")
                    os.remove(cached_wav_path)

            # Conversion nécessaire
            if not cache_used:
                logger.info(f"[MULTI_SPEAKER] 🔄 Conversion M4A/AAC vers WAV avec cache...")

                # Convertir avec ffmpeg
                cmd = [
                    'ffmpeg', '-i', source_audio_path,
                    '-ar', '16000',  # Sample rate 16kHz
                    '-ac', '1',      # Mono
                    '-y',            # Overwrite
                    cached_wav_path
                ]

                result = subprocess.run(cmd, capture_output=True, timeout=30)

                if result.returncode != 0:
                    error_msg = result.stderr.decode() if result.stderr else "Unknown error"
                    logger.error(f"[MULTI_SPEAKER] ❌ Erreur conversion ffmpeg: {error_msg}")
                    return None

                audio_path_to_read = cached_wav_path
                temp_wav_path = cached_wav_path
                logger.info(f"[MULTI_SPEAKER] ✅ Conversion réussie et mise en cache (7j): {cached_wav_filename}")

        audio_data, sample_rate = sf.read(audio_path_to_read)

        # ═══════════════════════════════════════════════════════════════
        # STRATÉGIE : Concaténer les segments TRANSCRITS les plus longs
        # pour créer un échantillon vocal propre et suffisant
        # ═══════════════════════════════════════════════════════════════

        # Trier segments par durée (les plus longs en premier)
        sorted_segments = sorted(
            segments,
            key=lambda s: s.get('end_ms', s.get('endMs', 0)) - s.get('start_ms', s.get('startMs', 0)),
            reverse=True
        )

        # ═══════════════════════════════════════════════════════════════
        # FILTRER LES OVERLAPS (si diarization fournie)
        # ═══════════════════════════════════════════════════════════════
        if all_diarization_speakers:
            clean_segments = []
            overlap_segments = []

            for seg in sorted_segments:
                start_ms = seg.get('start_ms', seg.get('startMs', 0))
                end_ms = seg.get('end_ms', seg.get('endMs', 0))

                # Vérifier overlap avec d'autres speakers
                has_overlap = _check_overlap_with_others(
                    start_ms, end_ms, speaker_id, all_diarization_speakers
                )

                if has_overlap:
                    overlap_segments.append(seg)
                else:
                    clean_segments.append(seg)

            logger.info(
                f"[MULTI_SPEAKER] 🔍 {speaker_id}: "
                f"{len(clean_segments)} segments propres, "
                f"{len(overlap_segments)} avec overlap"
            )

            # Remplacer sorted_segments : clean d'abord, overlap ensuite
            sorted_segments = clean_segments + overlap_segments

        # Prendre les N segments les plus longs jusqu'à atteindre 5-10s d'audio
        TARGET_DURATION_MS = 7000  # 7 secondes cible
        MIN_DURATION_MS = 3000     # 3 secondes minimum
        MIN_SEGMENT_DURATION = 200  # Ignorer segments < 200ms (trop courts/bruités)

        selected_segments = []
        total_duration = 0

        for seg in sorted_segments:
            start_ms = seg.get('start_ms', seg.get('startMs', 0))
            end_ms = seg.get('end_ms', seg.get('endMs', 0))
            duration = end_ms - start_ms

            # Ignorer segments trop courts (bruit, artefacts)
            if duration < MIN_SEGMENT_DURATION:
                continue

            selected_segments.append(seg)
            total_duration += duration

            # Stop si on a assez d'audio
            if total_duration >= TARGET_DURATION_MS:
                break

        if not selected_segments:
            logger.error(f"[MULTI_SPEAKER] ❌ Aucun segment valide trouvé pour {speaker_id}")
            return None

        if total_duration < MIN_DURATION_MS:
            logger.warning(
                f"[MULTI_SPEAKER] ⚠️ Seulement {total_duration}ms d'audio pour {speaker_id} "
                f"(minimum recommandé: {MIN_DURATION_MS}ms)"
            )

        # Logger statistiques de filtrage overlap
        if all_diarization_speakers and (clean_segments or overlap_segments):
            clean_used = sum(1 for seg in selected_segments if seg in clean_segments)
            overlap_used = len(selected_segments) - clean_used
            logger.info(
                f"[MULTI_SPEAKER] 🎯 {speaker_id}: "
                f"{len(selected_segments)} segments sélectionnés "
                f"({clean_used} propres, {overlap_used} avec overlap) "
                f"= {total_duration}ms total"
            )

        # Extraire et concaténer les segments sélectionnés
        audio_chunks = []
        for seg in selected_segments:
            start_ms = seg.get('start_ms', seg.get('startMs', 0))
            end_ms = seg.get('end_ms', seg.get('endMs', 0))

            start_sample = int((start_ms / 1000.0) * sample_rate)
            end_sample = int((end_ms / 1000.0) * sample_rate)

            # Vérifier limites
            if start_sample >= len(audio_data) or end_sample > len(audio_data):
                logger.warning(
                    f"[MULTI_SPEAKER] ⚠️ Segment hors limites ignoré: "
                    f"{start_ms}-{end_ms}ms"
                )
                continue

            chunk = audio_data[start_sample:end_sample]
            audio_chunks.append(chunk)

        if not audio_chunks:
            logger.error(f"[MULTI_SPEAKER] ❌ Aucun audio extrait pour {speaker_id}")
            return None

        # Concaténer tous les chunks
        reference_audio = np.concatenate(audio_chunks)

        logger.info(
            f"[MULTI_SPEAKER] 🎯 Audio de référence pour {speaker_id}: "
            f"{total_duration}ms concaténés depuis {len(selected_segments)} segments "
            f"(parmi {len(segments)} disponibles)"
        )

        # Normaliser l'audio de référence
        max_val = np.max(np.abs(reference_audio))
        if max_val > 0:
            target_db = -20.0
            current_db = 20 * np.log10(max_val)
            gain_db = target_db - current_db
            gain_linear = 10 ** (gain_db / 20)
            reference_audio = reference_audio * gain_linear

        # Sauvegarder en WAV
        output_dir = "/tmp/multi_speaker_tts"
        os.makedirs(output_dir, exist_ok=True)

        # Remplacer l'extension par .wav
        source_basename = Path(source_audio_path).stem  # Nom sans extension
        output_path = os.path.join(
            output_dir,
            f"speaker_{speaker_id}_{source_basename}_ref.wav"  # _ref pour "référence"
        )

        sf.write(output_path, reference_audio, sample_rate)

        logger.info(
            f"[MULTI_SPEAKER] ✅ Audio de référence extrait pour {speaker_id}: "
            f"{total_duration}ms → {output_path}"
        )

        # Ne PAS supprimer le fichier WAV en cache (réutilisable pendant 7 jours)
        # Le nettoyage se fera automatiquement après 7 jours lors de la prochaine utilisation

        return output_path

    except Exception as e:
        logger.error(f"[MULTI_SPEAKER] ❌ Erreur extraction audio: {e}")
        import traceback
        traceback.print_exc()

        # En cas d'erreur, ne pas supprimer le cache WAV (peut être utile pour debug)

        return None


async def _concatenate_turns_in_order(
    turn_translations: List[Dict[str, Any]],
    target_lang: str,
    message_id: str,
    attachment_id: str
) -> Optional[Any]:
    """
    Concatène les tours de parole traduits dans l'ordre original de la conversation.

    IMPORTANT: Utilise le re-encodage pour éviter les glitchs et assurer
    une transition fluide entre les tours de parole.

    Args:
        turn_translations: Liste de dicts avec 'speaker_id', 'translation', 'turn'
        target_lang: Langue cible
        message_id: ID message
        attachment_id: ID attachment

    Returns:
        TranslatedAudioVersion avec l'audio final concaténé
    """
    try:
        # Collecter les audio paths dans l'ordre
        audio_paths = []
        translated_texts = []
        translated_segments = []  # Segments traduits pour synchronisation
        total_duration_ms = 0

        for turn_data in turn_translations:
            translation = turn_data['translation']
            turn = turn_data.get('turn')

            if translation and translation.audio_path:
                audio_paths.append(translation.audio_path)
                translated_texts.append(translation.translated_text)

                # Créer un segment traduit pour ce tour
                if turn:
                    translated_segments.append({
                        'text': translation.translated_text,
                        'startMs': total_duration_ms,
                        'endMs': total_duration_ms + translation.duration_ms,
                        'speakerId': turn.speaker_id,
                        'confidence': 1.0
                    })

                total_duration_ms += translation.duration_ms

        if not audio_paths:
            logger.error("[MULTI_SPEAKER] ❌ Aucun audio à concaténer")
            return None

        logger.info(
            f"[MULTI_SPEAKER] 📝 Concaténation PROPRE de {len(audio_paths)} tours "
            f"({total_duration_ms}ms total)"
        )

        # Concaténer avec ffmpeg - RE-ENCODAGE pour éviter les glitchs
        from .translation_stage import TranslatedAudioVersion
        import subprocess
        from pathlib import Path

        # Utiliser un chemin absolu pour éviter les problèmes de répertoire de travail
        output_path = os.path.abspath(f"generated/audios/translated/{message_id}_{attachment_id}_{target_lang}_multi.mp3")
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        # Créer liste de concaténation
        concat_list_path = f"/tmp/concat_list_{message_id}_{target_lang}.txt"
        with open(concat_list_path, 'w') as f:
            for audio_path in audio_paths:
                f.write(f"file '{os.path.abspath(audio_path)}'\n")

        # RE-ENCODAGE avec paramètres uniformes pour éviter tout glitch
        # - Normalisation du sample rate (44100 Hz standard)
        # - Mono pour cohérence
        # - Bitrate constant pour qualité uniforme
        cmd = [
            'ffmpeg', '-f', 'concat', '-safe', '0',
            '-i', concat_list_path,
            '-ar', '44100',          # Sample rate uniforme
            '-ac', '1',              # Mono
            '-b:a', '128k',          # Bitrate constant
            '-af', 'aresample=async=1:min_hard_comp=0.100000:first_pts=0',  # Resample propre
            '-y', output_path
        ]

        result = subprocess.run(cmd, capture_output=True, timeout=60)

        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(
                f"[MULTI_SPEAKER] ✅ Audio final: {output_path} | "
                f"{len(translated_segments)} segments traduits | "
                f"Taille: {os.path.getsize(output_path) / 1024:.1f}KB"
            )

            # Joindre tous les textes traduits
            full_translated_text = ' '.join(translated_texts)

            # Nettoyer le fichier de liste temporaire
            try:
                os.remove(concat_list_path)
            except:
                pass

            # Le fichier sera lu et envoyé en binaire multipart par zmq_audio_handler.py
            # (voir ligne 673-679: lecture depuis audio_path et envoi via send_multipart)
            # Donc: pas besoin d'encoder en base64, juste fournir le chemin correct

            return TranslatedAudioVersion(
                language=target_lang,
                translated_text=full_translated_text,
                audio_path=output_path,
                audio_url=f"/audio/{os.path.basename(output_path)}",  # URL utilisée seulement si binaire échoue
                duration_ms=total_duration_ms,
                format="mp3",
                voice_cloned=True,
                voice_quality=0.85,
                processing_time_ms=0,
                audio_data_base64=None,  # Pas de base64, on utilise le binaire multipart
                audio_mime_type="audio/mpeg",
                segments=translated_segments  # ✅ Segments traduits pour synchronisation
            )
        else:
            error_msg = result.stderr.decode() if result.stderr else "Unknown error"
            logger.error(f"[MULTI_SPEAKER] ❌ Erreur ffmpeg: {error_msg}")
            return None

    except Exception as e:
        logger.error(f"[MULTI_SPEAKER] ❌ Erreur concaténation: {e}")
        import traceback
        traceback.print_exc()
        return None
