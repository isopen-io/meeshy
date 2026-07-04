"""
Handler pour les requêtes de traitement audio

Gère les requêtes de traitement audio (transcription, traduction, TTS)
avec support multipart ZMQ pour optimiser la bande passante.
"""

import asyncio
import base64
import json
import logging
import time
import traceback
import uuid
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)

from .segment_serialization import _get_voice_similarity_score, _segment_to_dict
from utils.audio_format import read_audio_bytes

# Import du pipeline audio.
#
# Incident prod 2026-07-03 : un ImportError au boot du process (ordre
# d'import/circularité transitoire) était avalé par un `except: pass`
# silencieux et figeait AUDIO_PIPELINE_AVAILABLE=False pour TOUTE la vie du
# process — tous les messages vocaux répondaient pipeline_unavailable pendant
# 8 h alors que le module s'importait très bien après coup (vérifié dans le
# container). Le flag n'est plus définitif : l'échec est LOGGÉ avec son
# traceback et l'import est retenté à chaud à la première requête via
# `_retry_audio_pipeline_import()`.
AUDIO_PIPELINE_AVAILABLE = False
try:
    from .audio_message_pipeline import AudioMessagePipeline, AudioMessageMetadata, get_audio_pipeline
    AUDIO_PIPELINE_AVAILABLE = True
except ImportError:
    logger.error(
        "[TRANSLATOR] ❌ Import du pipeline audio échoué au chargement du module — "
        "retentera à chaud à la première requête audio:\n%s",
        traceback.format_exc()
    )


def _retry_audio_pipeline_import() -> bool:
    """Retente l'import du pipeline audio si le boot l'a raté.

    Idempotent et bon marché quand le pipeline est déjà disponible. Met à
    jour les symboles module (`get_audio_pipeline`, …) et le flag — le mode
    dégradé du boot n'est plus irréversible.
    """
    global AUDIO_PIPELINE_AVAILABLE, AudioMessagePipeline, AudioMessageMetadata, get_audio_pipeline
    if AUDIO_PIPELINE_AVAILABLE:
        return True
    try:
        from .audio_message_pipeline import (
            AudioMessagePipeline as _pipeline_cls,
            AudioMessageMetadata as _metadata_cls,
            get_audio_pipeline as _get_pipeline,
        )
    except ImportError:
        logger.error(
            "[TRANSLATOR] ❌ Retry d'import du pipeline audio échoué:\n%s",
            traceback.format_exc()
        )
        return False
    AudioMessagePipeline = _pipeline_cls
    AudioMessageMetadata = _metadata_cls
    get_audio_pipeline = _get_pipeline
    AUDIO_PIPELINE_AVAILABLE = True
    logger.info("[TRANSLATOR] ✅ Pipeline audio importé au retry — mode dégradé du boot levé")
    return True

# Import du service audio fetcher
AUDIO_FETCHER_AVAILABLE = False
get_audio_fetcher = None
try:
    from .audio_fetcher import get_audio_fetcher
    AUDIO_FETCHER_AVAILABLE = True
except ImportError as e:
    logger.warning(f"⚠️ [AUDIO-HANDLER] AudioFetcher non disponible: {e}")
    pass


class AudioHandler:
    """Handler pour les traitements audio via ZMQ"""
    
    def __init__(self, pub_socket, database_service=None):
        """
        Initialise le handler audio
        
        Args:
            pub_socket: Socket ZMQ PUB pour publier les résultats
            database_service: Service de base de données optionnel
        """
        self.pub_socket = pub_socket
        self.db = database_service
        
        # Obtenir le pipeline audio si disponible (retente l'import si le
        # boot du module l'a raté — voir _retry_audio_pipeline_import).
        if _retry_audio_pipeline_import():
            self.audio_pipeline = get_audio_pipeline()
        else:
            self.audio_pipeline = None
    async def _handle_audio_process_request(self, request_data: dict):
        """
        Traite une requête de processing audio.

        Pipeline complet:
        1. Transcription (mobile ou Whisper)
        2. Traduction vers les langues cibles
        3. Clonage vocal
        4. Génération TTS

        Format attendu:
        {
            "type": "audio_process",
            "messageId": str,
            "attachmentId": str,
            "conversationId": str,
            "senderId": str,
            "audioUrl": str,
            "audioPath": str,
            "audioDurationMs": int,
            "userLanguage": str,  // Langue définie par l'utilisateur (fallback détection)
                                 // - Audio < 6s: userLanguage prévaut
                                 // - Audio >= 6s + confiance > 80%: detected prévaut
                                 // - Sinon: userLanguage si fourni
            "mobileTranscription": {
                "text": str,
                "language": str,
                "confidence": float,
                "source": str
            },
            "targetLanguages": [str],
            "generateVoiceClone": bool,
            "modelType": str,
            // Paramètres de clonage vocal configurables par l'utilisateur
            "cloningParams": {
                "exaggeration": float,  // 0.0-1.0, défaut 0.5
                "cfgWeight": float,     // 0.0-1.0, défaut 0.5 (0.0 pour non-anglais)
                "temperature": float,   // 0.1-2.0, défaut 1.0
                "topP": float,          // 0.0-1.0, défaut 0.9
                "qualityPreset": str    // "fast", "balanced", "high_quality"
            }
        }
        """
        # ═══════════════════════════════════════════════════════════════
        # LOG RÉCEPTION REQUÊTE AUDIO
        # ═══════════════════════════════════════════════════════════════
        logger.info("═" * 70)
        logger.info(f"🎤 [TRANSLATOR] NOUVELLE REQUÊTE AUDIO")
        logger.info(f"   ├─ Message ID: {request_data.get('messageId')}")
        logger.info(f"   ├─ Sender: {request_data.get('senderId')}")
        logger.info(f"   ├─ Durée: {request_data.get('audioDurationMs')}ms")
        logger.info(f"   ├─ Langues cibles: {request_data.get('targetLanguages')}")
        logger.info(f"   ├─ Voice clone: {request_data.get('generateVoiceClone')}")
        logger.info(f"   └─ Profil vocal existant: {'OUI' if request_data.get('existingVoiceProfile') else 'NON'}")
        logger.info("─" * 70)

        # Reconstruire existingVoiceProfile avec l'embedding binaire si disponible
        if request_data.get('_voiceProfileBinary'):
            import base64
            profile_metadata = request_data.get('existingVoiceProfile', {})
            voice_profile_bytes = request_data.get('_voiceProfileBinary')
            embedding_base64 = base64.b64encode(voice_profile_bytes).decode('utf-8')
            request_data['existingVoiceProfile'] = {
                'profileId': profile_metadata.get('profileId'),
                'userId': profile_metadata.get('userId'),
                'qualityScore': profile_metadata.get('qualityScore'),
                'embedding': embedding_base64
            }
            logger.debug(f"[TRANSLATOR] Profil vocal reconstruit: {len(voice_profile_bytes)} bytes")

        task_id = str(uuid.uuid4())
        start_time = time.time()

        if not _retry_audio_pipeline_import():
            logger.error("[TRANSLATOR] ❌ Audio pipeline non disponible")
            await self._publish_audio_error(
                task_id=task_id,
                message_id=request_data.get('messageId', ''),
                attachment_id=request_data.get('attachmentId', ''),
                error="Audio pipeline not available",
                error_code="pipeline_unavailable"
            )
            return

        try:
            # Valider les données requises
            required_fields = ['messageId', 'attachmentId', 'senderId']
            for field in required_fields:
                if not request_data.get(field):
                    raise ValueError(f"Champ requis manquant: {field}")

            # ═══════════════════════════════════════════════════════════════
            # ACQUISITION AUDIO (binaire multipart > base64 > URL > path legacy)
            # ═══════════════════════════════════════════════════════════════
            if not AUDIO_FETCHER_AVAILABLE or get_audio_fetcher is None:
                raise RuntimeError("AudioFetcher n'est pas disponible - service requis pour le traitement audio")

            audio_fetcher = get_audio_fetcher()
            local_audio_path, audio_source = await audio_fetcher.acquire_audio(
                attachment_id=request_data.get('attachmentId'),
                audio_binary=request_data.get('_audioBinary'),  # ZMQ multipart (plus efficace)
                audio_base64=request_data.get('audioBase64'),   # Legacy base64
                audio_mime_type=request_data.get('audioMimeType'),
                audio_url=request_data.get('audioUrl'),
                audio_path=request_data.get('audioPath')  # Legacy fallback
            )

            if not local_audio_path:
                raise ValueError(
                    f"Impossible d'acquérir l'audio: "
                    f"base64={'yes' if request_data.get('audioBase64') else 'no'}, "
                    f"url={request_data.get('audioUrl') or 'none'}"
                )

            logger.info(f"[TRANSLATOR] Audio acquis via {audio_source}: {local_audio_path}")

            # Flag pour savoir si on doit nettoyer le fichier temp après.
            # 'binary' (ZMQ multipart, le chemin PRIMAIRE) écrit aussi un fichier
            # dans /tmp/meeshy_audio via _save_from_binary → doit être nettoyé,
            # sinon chaque audio multipart fuit un fichier temp (disque qui se
            # remplit). 'path' est exclu (fichier legacy pré-existant, pas à nous ;
            # cleanup_temp_file garde de toute façon sur TEMP_AUDIO_DIR).
            should_cleanup_audio = audio_source in ('base64', 'url', 'binary')

            # Préparer les métadonnées mobiles
            metadata = None
            mobile_trans = request_data.get('mobileTranscription')
            if mobile_trans and mobile_trans.get('text'):
                metadata = AudioMessageMetadata(
                    transcription=mobile_trans.get('text'),
                    language=mobile_trans.get('language'),
                    confidence=mobile_trans.get('confidence'),
                    source=mobile_trans.get('source'),
                    segments=mobile_trans.get('segments')
                )

            # Obtenir le pipeline et l'initialiser
            pipeline = get_audio_pipeline()

            # Injecter les services si pas encore fait
            if pipeline.translation_service is None and hasattr(self, 'pool_manager') and self.pool_manager.translation_service:
                pipeline.set_translation_service(self.pool_manager.translation_service)

            if pipeline.database_service is None and hasattr(self, 'database_service'):
                pipeline.set_database_service(self.database_service)

            # Extraire les paramètres de clonage vocal (configurables par l'utilisateur)
            # Tous les 6 paramètres Chatterbox supportés:
            # - exaggeration: 0.0-1.0 (expressivité vocale)
            # - cfg_weight: 0.0-1.0 (guidance du modèle)
            # - temperature: 0.0-2.0 (créativité)
            # - repetition_penalty: 1.0-3.0 (pénalité répétition)
            # - min_p: 0.0-1.0 (probabilité minimum sampling)
            # - top_p: 0.0-1.0 (nucleus sampling)
            cloning_params = None
            raw_cloning = request_data.get('cloningParams') or request_data.get('voiceCloneParams')
            if raw_cloning:
                cloning_params = {
                    'exaggeration': raw_cloning.get('exaggeration'),
                    'cfg_weight': raw_cloning.get('cfgWeight') or raw_cloning.get('cfg_weight'),
                    'temperature': raw_cloning.get('temperature'),
                    'repetition_penalty': raw_cloning.get('repetitionPenalty') or raw_cloning.get('repetition_penalty'),
                    'min_p': raw_cloning.get('minP') or raw_cloning.get('min_p'),
                    'top_p': raw_cloning.get('topP') or raw_cloning.get('top_p'),
                    'auto_optimize': raw_cloning.get('autoOptimize', True),
                }
                # Filtrer les valeurs None pour n'envoyer que les paramètres spécifiés
                cloning_params = {k: v for k, v in cloning_params.items() if v is not None}

                logger.info(
                    f"[TRANSLATOR] Paramètres clonage personnalisés: {cloning_params}"
                )

            # Callback pour publier la transcription dès qu'elle est prête
            # (avant la traduction pour une réponse plus rapide à la gateway)
            async def on_transcription_ready(transcription_data: dict):
                # ═══════════════════════════════════════════════════════════════
                # LOG TRANSCRIPTION COMPLÈTE (AVANT TRADUCTION)
                # ═══════════════════════════════════════════════════════════════
                transcription = transcription_data.get('transcription')
                if transcription:
                    logger.info("=" * 70)
                    logger.info(f"📜 [TRANSCRIPTION] TEXTE COMPLET À TRADUIRE:")
                    logger.info(f"   🔑 Message ID: {transcription_data.get('message_id')}")
                    logger.info(f"   🌍 Langue détectée: {transcription.language} (confiance: {transcription.confidence:.2f})")
                    logger.info(f"   🎭 Locuteurs: {transcription.speaker_count or 1}")
                    logger.info(f"   ⏱️ Durée: {transcription.duration_ms}ms")
                    logger.info(f"   📝 TEXTE: \"{transcription.text}\"")
                    logger.info("=" * 70)
                await self._publish_transcription_result(task_id, transcription_data)

            # Callback pour publier chaque traduction dès qu'elle est prête
            # (envoi progressif des traductions au lieu d'attendre la fin)
            async def on_translation_ready(translation_data: dict):
                await self._publish_translation_ready(task_id, translation_data)

            # Exécuter le pipeline audio avec le chemin local acquis
            logger.info(f"🔄 [TRANSLATOR] Démarrage pipeline audio: {task_id}")
            result = await pipeline.process_audio_message(
                audio_path=local_audio_path,  # Chemin local (base64 décodé, téléchargé, ou legacy)
                audio_url=request_data.get('audioUrl', ''),
                sender_id=request_data.get('senderId'),
                conversation_id=request_data.get('conversationId', ''),
                message_id=request_data.get('messageId'),
                attachment_id=request_data.get('attachmentId'),
                audio_duration_ms=request_data.get('audioDurationMs', 0),
                user_language=request_data.get('userLanguage'),  # Langue utilisateur pour fallback
                metadata=metadata,
                target_languages=request_data.get('targetLanguages'),
                generate_voice_clone=request_data.get('generateVoiceClone', True),
                model_type=request_data.get('modelType', 'medium'),
                # Voice profile options (pour messages transférés - voix de l'émetteur original)
                original_sender_id=request_data.get('originalSenderId'),
                existing_voice_profile=request_data.get('existingVoiceProfile'),
                use_original_voice=request_data.get('useOriginalVoice', True),
                # Paramètres de clonage vocal configurables
                cloning_params=cloning_params,
                # Callback pour envoi progressif de la transcription
                on_transcription_ready=on_transcription_ready,
                # Callback pour envoi progressif des traductions
                on_translation_ready=on_translation_ready
            )

            processing_time = int((time.time() - start_time) * 1000)

            # ═══════════════════════════════════════════════════════════════
            # LOG RÉCAPITULATIF DU TRAITEMENT AUDIO
            # ═══════════════════════════════════════════════════════════════
            original = result.original
            orig_text = original.transcription or ''
            logger.info("═" * 70)
            logger.info(f"📊 [TRANSLATOR] RÉSULTAT TRAITEMENT AUDIO")
            logger.info(f"   ├─ Message ID: {result.message_id}")
            logger.info(f"   ├─ Texte: \"{orig_text[:100]}{'...' if len(orig_text) > 100 else ''}\"")
            logger.info(f"   ├─ Langue: {original.language} (confiance: {original.confidence:.2f})")
            logger.info(f"   ├─ Durée: {original.duration_ms}ms")

            # Info diarisation
            speaker_count = original.speaker_count or 1
            logger.info(f"   ├─ Speakers: {speaker_count}")
            if original.segments:
                logger.info(f"   ├─ Segments: {len(original.segments)}")

            # Info traductions
            logger.info(f"   ├─ Traductions: {len(result.translations)} langue(s)")
            for lang, trans in result.translations.items():
                trans_text = trans.translated_text if hasattr(trans, 'translated_text') else trans.get('translated_text', '')
                logger.info(f"   │   └─ {lang}: \"{trans_text[:50]}{'...' if len(trans_text) > 50 else ''}\"")

            # Info clonage vocal
            logger.info(f"   ├─ Voice quality: {result.voice_model_quality:.2f}")
            logger.info(f"   └─ Temps total: {processing_time}ms")
            logger.info("═" * 70)

            # Publier le résultat
            logger.info(f"📤 [TRANSLATOR] Publication résultat audio: {task_id}")
            await self._publish_audio_result(task_id, result, processing_time)
            logger.info(f"✅ [TRANSLATOR] Résultat audio publié: {task_id}")

            logger.info(
                f"✅ [TRANSLATOR] Audio process terminé: "
                f"msg={result.message_id}, "
                f"translations={len(result.translations)}, "
                f"time={processing_time}ms, "
                f"audio_source={audio_source}"
            )

            # Nettoyer le fichier temporaire si nécessaire
            if should_cleanup_audio:
                audio_fetcher.cleanup_temp_file(local_audio_path)

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur audio process: {e}")
            import traceback
            traceback.print_exc()

            # Nettoyer le fichier temporaire en cas d'erreur
            try:
                if 'should_cleanup_audio' in locals() and should_cleanup_audio and 'local_audio_path' in locals():
                    if AUDIO_FETCHER_AVAILABLE and get_audio_fetcher is not None:
                        audio_fetcher = get_audio_fetcher()
                        audio_fetcher.cleanup_temp_file(local_audio_path)
            except Exception:
                pass  # Ignorer les erreurs de nettoyage

            await self._publish_audio_error(
                task_id=task_id,
                message_id=request_data.get('messageId', ''),
                attachment_id=request_data.get('attachmentId', ''),
                error=str(e),
                error_code="processing_failed"
            )

    async def _publish_audio_result(self, task_id: str, result, processing_time: int):
        """
        Publie le résultat du processing audio via PUB en multipart.

        Architecture ZMQ Multipart:
        - Frame 0: JSON metadata avec binaryFrames
        - Frame 1+: Audios traduits binaires (un par langue)
        - Frame N: Embedding vocal (si nouveau profil créé)

        Avantages vs base64:
        - Économie de 33% de bande passante
        - Pas d'encodage/décodage CPU
        - Support de fichiers volumineux
        """
        try:
            import base64

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 1: Préparer les frames binaires et le mapping
            # ═══════════════════════════════════════════════════════════════
            binary_frames = []
            binary_frames_info = {}
            frame_index = 1  # Frame 0 = JSON metadata

            # Préparer les métadonnées des audios traduits (sans base64)
            translated_audios_metadata = []

            for t in result.translations.values():
                # D2: lire les octets depuis le fichier (base64 = fallback legacy)
                audio_bytes = None
                try:
                    audio_bytes = await asyncio.to_thread(
                        read_audio_bytes,
                        audio_path=t.audio_path,
                        audio_data_base64=t.audio_data_base64,
                    )
                except Exception as e:
                    logger.warning(f"[MULTIPART] Erreur lecture audio {t.language}: {e}")

                if audio_bytes:
                    binary_frames.append(audio_bytes)

                    # Enregistrer l'indice du frame binaire
                    audio_key = f"audio_{t.language}"
                    binary_frames_info[audio_key] = {
                        'index': frame_index,
                        'size': len(audio_bytes),
                        'mimeType': t.audio_mime_type or 'audio/mp3'
                    }
                    frame_index += 1

                    logger.debug(f"[MULTIPART] Frame {frame_index-1}: audio {t.language} ({len(audio_bytes)} bytes)")

                if audio_bytes:
                    binary_frames.append(audio_bytes)
                    audio_key = f"audio_{t.language}"
                    binary_frames_info[audio_key] = {
                        'index': frame_index,
                        'size': len(audio_bytes),
                        'mimeType': t.audio_mime_type or 'audio/mp3'
                    }
                    frame_index += 1
                    logger.debug(f"[MULTIPART] Frame {frame_index-1}: audio {t.language} ({len(audio_bytes)} bytes)")

                # Metadata sans base64 (contient juste le mapping vers le frame)
                translated_audio_dict = {
                    'targetLanguage': t.language,
                    'translatedText': t.translated_text,
                    'audioUrl': t.audio_url,
                    'audioPath': t.audio_path,
                    'durationMs': t.duration_ms,
                    'voiceCloned': t.voice_cloned,
                    'voiceQuality': t.voice_quality,
                    'audioMimeType': t.audio_mime_type or 'audio/mp3'
                    # Pas de audioDataBase64 - données dans binaryFrames
                }

                # Ajouter les segments si disponibles (convertir en dicts)
                if hasattr(t, 'segments') and t.segments:
                    translated_audio_dict['segments'] = [
                        {
                            'text': seg.text if hasattr(seg, 'text') else seg.get('text'),
                            'startMs': seg.start_ms if hasattr(seg, 'start_ms') else seg.get('start_ms', seg.get('startMs', 0)),
                            'endMs': seg.end_ms if hasattr(seg, 'end_ms') else seg.get('end_ms', seg.get('endMs', 0)),
                            'confidence': seg.confidence if hasattr(seg, 'confidence') else seg.get('confidence'),
                            'speakerId': (seg.speaker_id if hasattr(seg, 'speaker_id') else seg.get('speaker_id', seg.get('speakerId'))) or None,
                            'voiceSimilarityScore': _get_voice_similarity_score(seg),
                            'language': seg.language if hasattr(seg, 'language') else seg.get('language')
                        }
                        for seg in t.segments
                    ]
                    logger.info(f"[ZMQ] ✅ {t.language}: {len(translated_audio_dict['segments'])} segments traduits inclus")
                else:
                    logger.warning(f"[ZMQ] ⚠️ {t.language}: Pas de segments traduits (hasattr={hasattr(t, 'segments')}, value={t.segments if hasattr(t, 'segments') else 'N/A'})")

                translated_audios_metadata.append(translated_audio_dict)

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 2: Ajouter l'embedding vocal si présent
            # ═══════════════════════════════════════════════════════════════
            new_voice_profile_metadata = None
            if hasattr(result, 'new_voice_profile') and result.new_voice_profile:
                nvp = result.new_voice_profile

                # Décoder l'embedding base64 → bytes
                try:
                    embedding_bytes = base64.b64decode(nvp.embedding_base64)
                    binary_frames.append(embedding_bytes)

                    binary_frames_info['embedding'] = {
                        'index': frame_index,
                        'size': len(embedding_bytes)
                    }
                    frame_index += 1

                    logger.debug(f"[MULTIPART] Frame {frame_index-1}: embedding vocal ({len(embedding_bytes)} bytes)")
                except Exception as e:
                    logger.warning(f"[MULTIPART] Erreur décodage embedding: {e}")

                # Metadata sans embedding base64 (envoyé en binaire via binaryFrames)
                new_voice_profile_metadata = {
                    'userId': nvp.user_id,
                    'profileId': nvp.profile_id,
                    'qualityScore': nvp.quality_score,
                    'audioCount': nvp.audio_count,
                    'totalDurationMs': nvp.total_duration_ms,
                    'version': nvp.version,
                    'fingerprint': nvp.fingerprint,
                    'voiceCharacteristics': nvp.voice_characteristics,
                }

                # Champs optionnels pour Chatterbox TTS et audio de référence
                if getattr(nvp, 'chatterbox_conditionals_base64', None):
                    new_voice_profile_metadata['chatterbox_conditionals_base64'] = nvp.chatterbox_conditionals_base64
                if getattr(nvp, 'reference_audio_id', None):
                    new_voice_profile_metadata['reference_audio_id'] = nvp.reference_audio_id
                if getattr(nvp, 'reference_audio_url', None):
                    new_voice_profile_metadata['reference_audio_url'] = nvp.reference_audio_url

                logger.info(f"📦 [TRANSLATOR] Nouveau profil vocal multipart pour Gateway: {nvp.user_id}")

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 3: Construire le JSON metadata (Frame 0)
            # ═══════════════════════════════════════════════════════════════
            # Construire le dictionnaire de transcription avec diarisation
            transcription_dict = {
                'text': result.original.transcription,
                'language': result.original.language,
                'confidence': result.original.confidence,
                'source': result.original.source,
                'segments': [
                    {
                        'text': seg.text if hasattr(seg, 'text') else seg.get('text', ''),
                        'startMs': seg.start_ms if hasattr(seg, 'start_ms') else seg.get('start_ms', seg.get('startMs', 0)),
                        'endMs': seg.end_ms if hasattr(seg, 'end_ms') else seg.get('end_ms', seg.get('endMs', 0)),
                        'confidence': seg.confidence if hasattr(seg, 'confidence') else seg.get('confidence'),
                        'speakerId': (seg.speaker_id if hasattr(seg, 'speaker_id') else seg.get('speaker_id', seg.get('speakerId'))) or None,
                        'voiceSimilarityScore': _get_voice_similarity_score(seg),
                        'language': seg.language if hasattr(seg, 'language') else seg.get('language')
                    }
                    for seg in (result.original.segments or [])
                ] if result.original.segments else None,
                'durationMs': result.original.duration_ms
            }

            # Ajouter les champs de diarisation si disponibles
            if result.original.speaker_count is not None:
                transcription_dict['speakerCount'] = result.original.speaker_count
            if result.original.primary_speaker_id:
                transcription_dict['primarySpeakerId'] = result.original.primary_speaker_id
            if result.original.sender_voice_identified is not None:
                transcription_dict['senderVoiceIdentified'] = result.original.sender_voice_identified
            if result.original.sender_speaker_id is not None:
                transcription_dict['senderSpeakerId'] = result.original.sender_speaker_id
            if result.original.speaker_analysis:
                transcription_dict['speakerAnalysis'] = result.original.speaker_analysis

            # ═══════════════════════════════════════════════════════════════
            # LOG TRANSCRIPTION FINALE AVEC SPEAKERS
            # ═══════════════════════════════════════════════════════════════
            logger.info("─" * 70)
            logger.info(f"📜 [TRANSLATOR] TRANSCRIPTION FINALE: {result.message_id}")
            logger.info(f"   🌍 Langue: {result.original.language} | Confiance: {result.original.confidence:.2f}")
            logger.info(f"   🎭 Speakers: {result.original.speaker_count or 1} | Primary: {result.original.primary_speaker_id or 'N/A'}")
            logger.info(f"   📝 Texte complet: \"{result.original.transcription}\"")

            # Log par speaker si diarisation disponible
            if result.original.segments and result.original.speaker_count and result.original.speaker_count > 1:
                from collections import defaultdict
                by_speaker = defaultdict(list)
                for seg in result.original.segments:
                    spk = seg.speaker_id if hasattr(seg, 'speaker_id') else seg.get('speaker_id', '?')
                    txt = seg.text if hasattr(seg, 'text') else seg.get('text', '')
                    by_speaker[spk or '?'].append(txt)
                for spk_id, texts in sorted(by_speaker.items()):
                    logger.info(f"   [{spk_id}]: \"{' '.join(texts)}\"")
            logger.info("─" * 70)

            metadata = {
                'type': 'audio_process_completed',
                'taskId': task_id,
                'messageId': result.message_id,
                'attachmentId': result.attachment_id,
                'transcription': transcription_dict,
                'translatedAudios': translated_audios_metadata,
                'voiceModelUserId': result.voice_model_user_id,
                'voiceModelQuality': result.voice_model_quality,
                'processingTimeMs': processing_time,
                'timestamp': time.time(),
                # Mapping des frames binaires
                'binaryFrames': binary_frames_info
            }

            if new_voice_profile_metadata:
                metadata['newVoiceProfile'] = new_voice_profile_metadata

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 4: Envoyer via multipart
            # ═══════════════════════════════════════════════════════════════
            if self.pub_socket:
                # Construire les frames: [JSON, audio1, audio2, ..., embedding]
                frames = [json.dumps(metadata).encode('utf-8')] + binary_frames

                # Calculer la taille totale
                total_size = sum(len(f) for f in frames)

                await self.pub_socket.send_multipart(frames)

                logger.info(f"✅ [TRANSLATOR] Audio result multipart publié: {result.message_id}")
                logger.info(f"   📦 {len(frames)} frames, {total_size:,} bytes total ({len(binary_frames)} binaires)")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour audio result")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication audio result multipart: {e}")
            import traceback
            traceback.print_exc()

    async def _publish_transcription_result(self, task_id: str, transcription_data: dict):
        """
        Publie le résultat de transcription seule via PUB (avant traduction).

        Permet à la gateway de recevoir la transcription immédiatement,
        sans attendre la fin de la traduction/TTS.

        Type: 'transcription_ready' (distinct de 'audio_process_completed')
        """
        try:
            transcription = transcription_data['transcription']

            # Construire le dictionnaire de transcription avec diarisation
            transcription_dict = {
                'text': transcription.text,
                'language': transcription.language,
                'confidence': transcription.confidence,
                'source': transcription.source,
                'segments': [
                    _segment_to_dict(seg)
                    for seg in (transcription.segments or [])
                ] if transcription.segments else None,
                'durationMs': transcription.duration_ms
            }

            # Ajouter les champs de diarisation si disponibles
            if transcription.speaker_count is not None:
                transcription_dict['speakerCount'] = transcription.speaker_count
            if transcription.primary_speaker_id:
                transcription_dict['primarySpeakerId'] = transcription.primary_speaker_id
            if transcription.sender_voice_identified is not None:
                transcription_dict['senderVoiceIdentified'] = transcription.sender_voice_identified
            if transcription.sender_speaker_id is not None:
                transcription_dict['senderSpeakerId'] = transcription.sender_speaker_id
            if transcription.speaker_analysis:
                transcription_dict['speakerAnalysis'] = transcription.speaker_analysis

            metadata = {
                'type': 'transcription_ready',  # Type distinct pour différencier
                'taskId': task_id,
                'messageId': transcription_data['message_id'],
                'attachmentId': transcription_data['attachment_id'],
                'transcription': transcription_dict,
                'processingTimeMs': transcription_data['processing_time_ms'],
                'timestamp': time.time()
            }

            if self.pub_socket:
                # Debug: Afficher la taille du payload
                import json
                payload_str = json.dumps(metadata)
                logger.info(f"[DEBUG] Transcription payload size: {len(payload_str)} bytes")
                logger.info(f"[DEBUG] Transcription payload type: {metadata['type']}")
                logger.info(f"[DEBUG] Transcription text preview: {transcription.text[:50]}...")

                # Envoyer en simple frame (pas de binaire pour la transcription)
                await self.pub_socket.send_json(metadata)

                logger.info(
                    f"✅ [TRANSLATOR] Transcription ready publié: "
                    f"msg={transcription_data['message_id']}, "
                    f"lang={transcription.language}, "
                    f"segments={len(transcription.segments) if transcription.segments else 0}, "
                    f"time={transcription_data['processing_time_ms']}ms"
                )
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour transcription")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication transcription: {e}")
            import traceback
            traceback.print_exc()

    async def _publish_translation_ready(self, task_id: str, translation_data: dict):
        """
        Publie le résultat d'une traduction individuelle via PUB (dès qu'elle est prête).

        Permet à la gateway de recevoir chaque traduction progressivement,
        sans attendre la fin de toutes les traductions.

        Type: 'translation_ready' (distinct de 'audio_process_completed')

        Args:
            task_id: ID de la tâche
            translation_data: Données de la traduction {
                'message_id': str,
                'attachment_id': str,
                'language': str,
                'translation': TranslatedAudio (avec segments complets)
            }
        """
        try:
            translation = translation_data['translation']

            # D2: prefer raw bytes (no base64 round-trip), fall back to base64 or file
            audio_bytes = None
            if getattr(translation, 'audio_bytes', None):
                audio_bytes = translation.audio_bytes
            elif translation.audio_data_base64:
                try:
                    audio_bytes = base64.b64decode(translation.audio_data_base64)
                except Exception as e:
                    logger.warning(f"[MULTIPART] Erreur décodage audio {translation.language}: {e}")
            elif translation.audio_path and os.path.exists(translation.audio_path):
                try:
                    with open(translation.audio_path, 'rb') as f:
                        audio_bytes = f.read()
                except Exception as e:
                    logger.warning(f"[MULTIPART] Erreur lecture fichier audio {translation.language}: {e}")

            # Préparer le metadata JSON (Frame 0)
            translated_audio_dict = {
                'targetLanguage': translation.language,
                'translatedText': translation.translated_text,
                'audioUrl': translation.audio_url,
                'audioPath': translation.audio_path,
                'durationMs': translation.duration_ms,
                'voiceCloned': translation.voice_cloned,
                'voiceQuality': translation.voice_quality,
                'audioMimeType': translation.audio_mime_type or 'audio/mp3'
            }

            # Ajouter les segments si disponibles (convertir en dicts)
            if hasattr(translation, 'segments') and translation.segments:
                translated_audio_dict['segments'] = [
                    {
                        'text': seg.text if hasattr(seg, 'text') else seg.get('text'),
                        'startMs': seg.start_ms if hasattr(seg, 'start_ms') else seg.get('start_ms', seg.get('startMs', 0)),
                        'endMs': seg.end_ms if hasattr(seg, 'end_ms') else seg.get('end_ms', seg.get('endMs', 0)),
                        'confidence': seg.confidence if hasattr(seg, 'confidence') else seg.get('confidence'),
                        'speakerId': (seg.speaker_id if hasattr(seg, 'speaker_id') else seg.get('speaker_id', seg.get('speakerId'))) or None,
                        'voiceSimilarityScore': _get_voice_similarity_score(seg),
                        'language': seg.language if hasattr(seg, 'language') else seg.get('language')
                    }
                    for seg in translation.segments
                ]
                logger.info(f"[ZMQ] ✅ {translation.language}: {len(translated_audio_dict['segments'])} segments traduits inclus")
            else:
                logger.warning(f"[ZMQ] ⚠️ {translation.language}: Pas de segments traduits")

            # Déterminer le type d'événement selon le contexte
            is_single_language = translation_data.get('is_single_language', False)
            is_last_language = translation_data.get('is_last_language', False)
            current_index = translation_data.get('current_index', 1)
            total_languages = translation_data.get('total_languages', 1)

            # Logique de choix du type d'événement:
            # - 1 seule langue → 'audio_translation_ready'
            # - Dernière langue (multi) → 'audio_translations_completed'
            # - Autre langue (multi) → 'audio_translations_progressive'
            if is_single_language:
                event_type = 'audio_translation_ready'
                logger.info(f"[ZMQ] 📤 Événement: AUDIO_TRANSLATION_READY (langue unique)")
            elif is_last_language:
                event_type = 'audio_translations_completed'
                logger.info(
                    f"[ZMQ] 📤 Événement: AUDIO_TRANSLATIONS_COMPLETED "
                    f"(dernière: {current_index}/{total_languages})"
                )
            else:
                event_type = 'audio_translations_progressive'
                logger.info(
                    f"[ZMQ] 📤 Événement: AUDIO_TRANSLATIONS_PROGRESSIVE "
                    f"({current_index}/{total_languages})"
                )

            metadata = {
                'type': event_type,
                'taskId': task_id,
                'messageId': translation_data['message_id'],
                'attachmentId': translation_data['attachment_id'],
                'language': translation.language,
                'translatedAudio': translated_audio_dict,
                'timestamp': time.time()
            }

            # Envoyer via multipart si audio disponible, sinon simple JSON
            if self.pub_socket:
                if audio_bytes:
                    # Multipart: JSON + binaire
                    frames = [
                        json.dumps(metadata).encode('utf-8'),
                        audio_bytes
                    ]
                    await self.pub_socket.send_multipart(frames)
                    logger.info(
                        f"✅ [TRANSLATOR] Translation ready (multipart) publié: "
                        f"{translation.language}, "
                        f"{len(audio_bytes):,} bytes"
                    )
                else:
                    # Simple JSON (pas d'audio binaire)
                    await self.pub_socket.send_json(metadata)
                    logger.info(
                        f"✅ [TRANSLATOR] Translation ready (JSON) publié: "
                        f"{translation.language}"
                    )
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour translation ready")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication translation ready: {e}")
            import traceback
            traceback.print_exc()

    async def _publish_audio_error(
        self,
        task_id: str,
        message_id: str,
        attachment_id: str,
        error: str,
        error_code: str
    ):
        """Publie une erreur de processing audio via PUB"""
        try:
            message = {
                'type': 'audio_process_error',
                'taskId': task_id,
                'messageId': message_id,
                'attachmentId': attachment_id,
                'error': error,
                'errorCode': error_code,
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.warning(f"⚠️ [TRANSLATOR] Audio error publié: {message_id} - {error_code}")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour audio error")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication audio error: {e}")

    # ═══════════════════════════════════════════════════════════════════════════
    # TRANSCRIPTION ONLY - Transcription sans traduction ni TTS
    # ═══════════════════════════════════════════════════════════════════════════

