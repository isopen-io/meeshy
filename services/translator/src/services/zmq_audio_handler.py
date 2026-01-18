"""
Handler pour les requêtes de traitement audio

Gère les requêtes de traitement audio (transcription, traduction, TTS)
avec support multipart ZMQ pour optimiser la bande passante.
"""

import asyncio
import base64
import json
import logging
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)

# Import du pipeline audio
AUDIO_PIPELINE_AVAILABLE = False
try:
    from .audio_message_pipeline import AudioMessagePipeline, AudioMessageMetadata, get_audio_pipeline
    AUDIO_PIPELINE_AVAILABLE = True
except ImportError:
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
        
        # Obtenir le pipeline audio si disponible
        if AUDIO_PIPELINE_AVAILABLE:
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
        logger.info(f"🔍 [VOICE-PROFILE-TRACE] ======== DÉBUT AUDIO PROCESS ========")
        logger.info(f"🔍 [VOICE-PROFILE-TRACE] Request data reçu:")
        logger.info(f"   - type: {request_data.get('type')}")
        logger.info(f"   - messageId: {request_data.get('messageId')}")
        logger.info(f"   - attachmentId: {request_data.get('attachmentId')}")
        logger.info(f"   - senderId: {request_data.get('senderId')}")
        logger.info(f"   - conversationId: {request_data.get('conversationId')}")
        logger.info(f"   - generateVoiceClone: {request_data.get('generateVoiceClone')}")
        logger.info(f"   - existingVoiceProfile: {'YES' if request_data.get('existingVoiceProfile') else 'NO'}")
        logger.info(f"   - targetLanguages: {request_data.get('targetLanguages')}")
        logger.info(f"   - audioDurationMs: {request_data.get('audioDurationMs')}")

        if request_data.get('existingVoiceProfile'):
            profile = request_data.get('existingVoiceProfile')
            logger.info(f"🔍 [VOICE-PROFILE-TRACE] Profil vocal existant fourni:")
            logger.info(f"   - profileId: {profile.get('profileId')}")
            logger.info(f"   - userId: {profile.get('userId')}")
            logger.info(f"   - qualityScore: {profile.get('qualityScore')}")
            logger.info(f"   - embedding: {len(profile.get('embedding', '')) if profile.get('embedding') else 0} chars")

        task_id = str(uuid.uuid4())
        logger.info(f"🔍 [VOICE-PROFILE-TRACE] Task ID généré: {task_id}")
        start_time = time.time()

        logger.info(f"🎤 [TRANSLATOR] Audio process request reçu: {request_data.get('messageId')}")

        logger.info(f"🔍 [VOICE-PROFILE-TRACE] Vérification disponibilité AudioPipeline...")
        if not AUDIO_PIPELINE_AVAILABLE:
            logger.error("🔍 [VOICE-PROFILE-TRACE] ❌ AudioPipeline NON DISPONIBLE")
            logger.error("[TRANSLATOR] Audio pipeline non disponible")
            await self._publish_audio_error(
                task_id=task_id,
                message_id=request_data.get('messageId', ''),
                attachment_id=request_data.get('attachmentId', ''),
                error="Audio pipeline not available",
                error_code="pipeline_unavailable"
            )
            return

        logger.info(f"🔍 [VOICE-PROFILE-TRACE] ✅ AudioPipeline disponible")

        try:
            logger.info(f"🔍 [VOICE-PROFILE-TRACE] Validation des champs requis...")
            # Valider les données requises (audioPath n'est plus requis, on utilise base64 ou URL)
            required_fields = ['messageId', 'attachmentId', 'senderId']
            for field in required_fields:
                if not request_data.get(field):
                    logger.error(f"🔍 [VOICE-PROFILE-TRACE] ❌ Champ manquant: {field}")
                    raise ValueError(f"Champ requis manquant: {field}")

            logger.info(f"🔍 [VOICE-PROFILE-TRACE] ✅ Tous les champs requis présents")

            # ═══════════════════════════════════════════════════════════════
            # ACQUISITION AUDIO (binaire multipart > base64 > URL > path legacy)
            # ═══════════════════════════════════════════════════════════════
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

            # Flag pour savoir si on doit nettoyer le fichier temp après
            should_cleanup_audio = audio_source in ('base64', 'url')

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
                metadata=metadata,
                target_languages=request_data.get('targetLanguages'),
                generate_voice_clone=request_data.get('generateVoiceClone', True),
                model_type=request_data.get('modelType', 'medium'),
                # Voice profile options (pour messages transférés - voix de l'émetteur original)
                original_sender_id=request_data.get('originalSenderId'),
                existing_voice_profile=request_data.get('existingVoiceProfile'),
                use_original_voice=request_data.get('useOriginalVoice', True),
                # Paramètres de clonage vocal configurables
                cloning_params=cloning_params
            )

            processing_time = int((time.time() - start_time) * 1000)
            logger.info(f"✅ [TRANSLATOR] Pipeline terminé: {task_id}, {len(result.translations)} traductions, {processing_time}ms")

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
                # Décoder l'audio base64 → bytes pour envoi binaire
                audio_bytes = None
                if t.audio_data_base64:
                    try:
                        audio_bytes = base64.b64decode(t.audio_data_base64)
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
                    except Exception as e:
                        logger.warning(f"[MULTIPART] Erreur décodage audio {t.language}: {e}")
                elif t.audio_path and os.path.exists(t.audio_path):
                    # Si pas de base64, charger depuis le fichier
                    try:
                        with open(t.audio_path, 'rb') as f:
                            audio_bytes = f.read()
                        binary_frames.append(audio_bytes)

                        audio_key = f"audio_{t.language}"
                        binary_frames_info[audio_key] = {
                            'index': frame_index,
                            'size': len(audio_bytes),
                            'mimeType': t.audio_mime_type or 'audio/mp3'
                        }
                        frame_index += 1

                        logger.debug(f"[MULTIPART] Frame {frame_index-1}: audio {t.language} depuis fichier ({len(audio_bytes)} bytes)")
                    except Exception as e:
                        logger.warning(f"[MULTIPART] Erreur lecture fichier audio {t.language}: {e}")

                # Metadata sans base64 (contient juste le mapping vers le frame)
                translated_audios_metadata.append({
                    'targetLanguage': t.language,
                    'translatedText': t.translated_text,
                    'audioUrl': t.audio_url,
                    'audioPath': t.audio_path,
                    'durationMs': t.duration_ms,
                    'voiceCloned': t.voice_cloned,
                    'voiceQuality': t.voice_quality,
                    'audioMimeType': t.audio_mime_type or 'audio/mp3'
                    # Pas de audioDataBase64 - données dans binaryFrames
                })

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

                # Metadata sans base64
                new_voice_profile_metadata = {
                    'userId': nvp.user_id,
                    'profileId': nvp.profile_id,
                    # Pas de embedding base64 - données dans binaryFrames
                    'qualityScore': nvp.quality_score,
                    'audioCount': nvp.audio_count,
                    'totalDurationMs': nvp.total_duration_ms,
                    'version': nvp.version,
                    'fingerprint': nvp.fingerprint,
                    'voiceCharacteristics': nvp.voice_characteristics
                }
                logger.info(f"📦 [TRANSLATOR] Nouveau profil vocal multipart pour Gateway: {nvp.user_id}")

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 3: Construire le JSON metadata (Frame 0)
            # ═══════════════════════════════════════════════════════════════
            metadata = {
                'type': 'audio_process_completed',
                'taskId': task_id,
                'messageId': result.message_id,
                'attachmentId': result.attachment_id,
                'transcription': {
                    'text': result.original.transcription,
                    'language': result.original.language,
                    'confidence': result.original.confidence,
                    'source': result.original.source,
                    'segments': result.original.segments
                },
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

