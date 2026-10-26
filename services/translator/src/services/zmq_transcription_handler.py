"""
Handler pour les requêtes de transcription seule

Gère les requêtes de transcription uniquement (sans traduction ni TTS).
"""

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Dict, Optional
from services.task_privacy import shown, under_declared_regime

logger = logging.getLogger(__name__)

# Import du service de transcription
TRANSCRIPTION_SERVICE_AVAILABLE = False
try:
    from .transcription_service import get_transcription_service
    TRANSCRIPTION_SERVICE_AVAILABLE = True
except ImportError:
    pass


class TranscriptionHandler:
    """Handler pour les transcriptions via ZMQ"""
    
    def __init__(self, pub_socket, database_service=None):
        """
        Initialise le handler de transcription
        
        Args:
            pub_socket: Socket ZMQ PUB pour publier les résultats
            database_service: Service de base de données optionnel
        """
        self.pub_socket = pub_socket
        self.db = database_service
        
        # Obtenir le service de transcription si disponible
        if TRANSCRIPTION_SERVICE_AVAILABLE:
            self.transcription_service = get_transcription_service()
        else:
            self.transcription_service = None
    @under_declared_regime
    async def _handle_transcription_only_request(self, request_data: dict):
        """
        Traite une requête de transcription seule (sans traduction ni TTS).

        Format attendu (trois modes):

        Mode 1 - Via chemin fichier (attachments):
        {
            "type": "transcription_only",
            "taskId": str,
            "messageId": str,
            "attachmentId": str,
            "audioPath": str,
            "audioUrl": str (optionnel),
            "mobileTranscription": {...}
        }

        Mode 2 - Via audio base64 (legacy):
        {
            "type": "transcription_only",
            "taskId": str,
            "messageId": str,
            "audioData": str (base64),
            "audioFormat": str (wav, mp3, ogg, webm, m4a),
            "mobileTranscription": {...}
        }

        Mode 3 - Via binaire ZMQ multipart (RECOMMANDÉ - plus efficace):
        {
            "type": "transcription_only",
            "taskId": str,
            "messageId": str,
            "binaryFrames": { "audio": 1 },
            "audioFormat": str,
            "_audioBinary": bytes (injecté par _handle_translation_request_multipart)
        }
        """
        logger.info(f"🔍 [TRANSLATOR-TRACE] ======== DÉBUT TRANSCRIPTION ========")
        logger.info(f"🔍 [TRANSLATOR-TRACE] Request data reçu:")
        logger.info(f"   - type: {request_data.get('type')}")
        logger.info(f"   - taskId: {request_data.get('taskId')}")
        logger.info(f"   - messageId: {request_data.get('messageId')}")
        logger.info(f"   - attachmentId: {request_data.get('attachmentId')}")
        logger.info(f"   - audioPath: {request_data.get('audioPath', 'N/A')}")
        logger.info(f"   - audioData: {('YES, ' + str(len(request_data.get('audioData', ''))) + ' chars') if request_data.get('audioData') else 'N/A'}")
        logger.info(f"   - _audioBinary: {('YES, ' + str(len(request_data.get('_audioBinary', b''))) + ' bytes') if request_data.get('_audioBinary') else 'N/A'}")
        logger.info(f"   - audioFormat: {request_data.get('audioFormat', 'N/A')}")
        logger.info(f"   - binaryFrames: {request_data.get('binaryFrames', 'N/A')}")
        logger.info(f"   - mobileTranscription: {'YES' if request_data.get('mobileTranscription') else 'NO'}")

        task_id = request_data.get('taskId', str(uuid.uuid4()))
        logger.info(f"🔍 [TRANSLATOR-TRACE] Task ID final: {task_id}")

        start_time = time.time()
        temp_file_path = None  # Pour nettoyage

        logger.info(f"📝 [TRANSLATOR] Transcription only request: {request_data.get('messageId')}")

        try:
            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 1: Vérification service transcription...")
            # Vérifier que le service de transcription est disponible
            if not TRANSCRIPTION_SERVICE_AVAILABLE:
                logger.error(f"🔍 [TRANSLATOR-TRACE] ❌ TranscriptionService NON DISPONIBLE")
                raise RuntimeError("TranscriptionService non disponible")

            logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ TranscriptionService disponible")

            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 2: Validation données...")
            # Valider les données requises - messageId est toujours requis
            if not request_data.get('messageId'):
                logger.error(f"🔍 [TRANSLATOR-TRACE] ❌ messageId manquant")
                raise ValueError("Champ requis manquant: messageId")

            logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ messageId présent")

            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 3: Détermination du mode audio...")
            # Déterminer le mode: _audioBinary (multipart) > audioData (base64) > audioPath
            audio_path = request_data.get('audioPath')
            audio_binary = request_data.get('_audioBinary')  # Binaire injecté par multipart handler
            audio_data = request_data.get('audioData')
            audio_format = request_data.get('audioFormat', 'wav')

            logger.info(f"🔍 [TRANSLATOR-TRACE] Sources disponibles:")
            logger.info(f"   - audio_binary: {len(audio_binary) if audio_binary else 0} bytes")
            logger.info(f"   - audio_data: {len(audio_data) if audio_data else 0} chars")
            logger.info(f"   - audio_path: {audio_path or 'N/A'}")

            if not audio_path and not audio_data and not audio_binary:
                logger.error(f"🔍 [TRANSLATOR-TRACE] ❌ Aucune source audio fournie")
                raise ValueError("audioPath, audioData ou _audioBinary requis")

            # Mode 3: Binaire ZMQ multipart (plus efficace, pas de décodage)
            if audio_binary:
                logger.info(f"🔍 [TRANSLATOR-TRACE] Mode: BINAIRE ZMQ multipart")
                import tempfile
                from pathlib import Path

                # Créer un fichier temporaire directement depuis le binaire
                temp_dir = Path(tempfile.gettempdir()) / "transcription_temp"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file_path = temp_dir / f"trans_{task_id}.{audio_format}"

                logger.info(f"🔍 [TRANSLATOR-TRACE] Création fichier temp: {temp_file_path}")
                with open(temp_file_path, 'wb') as f:
                    f.write(audio_binary)

                audio_path = str(temp_file_path)
                logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Audio binaire ZMQ: {len(audio_binary)} bytes → {temp_file_path}")

            # Mode 2: Si audioData (base64) est fourni, décoder en fichier temporaire
            elif audio_data:
                logger.info(f"🔍 [TRANSLATOR-TRACE] Mode: BASE64")
                import base64
                import tempfile
                from pathlib import Path

                try:
                    logger.info(f"🔍 [TRANSLATOR-TRACE] Décodage base64...")
                    audio_bytes = base64.b64decode(audio_data)
                    logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Décodé: {len(audio_bytes)} bytes")
                except Exception as e:
                    logger.error(f"🔍 [TRANSLATOR-TRACE] ❌ Erreur décodage base64: {e}")
                    raise ValueError(f"Données audio base64 invalides: {e}")

                # Créer un fichier temporaire
                temp_dir = Path(tempfile.gettempdir()) / "transcription_temp"
                temp_dir.mkdir(parents=True, exist_ok=True)
                temp_file_path = temp_dir / f"trans_{task_id}.{audio_format}"

                logger.info(f"🔍 [TRANSLATOR-TRACE] Création fichier temp: {temp_file_path}")
                with open(temp_file_path, 'wb') as f:
                    f.write(audio_bytes)

                audio_path = str(temp_file_path)
                logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Audio base64 décodé: {len(audio_bytes)} bytes → {temp_file_path}")
            else:
                logger.info(f"🔍 [TRANSLATOR-TRACE] Mode: FICHIER direct")

            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 4: Obtention service transcription...")
            # Obtenir le service de transcription
            transcription_service = get_transcription_service()
            if not transcription_service.is_initialized:
                logger.info(f"🔍 [TRANSLATOR-TRACE] Initialisation du service...")
                await transcription_service.initialize()
                logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Service initialisé")

            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 5: Préparation transcription mobile...")
            # Préparer les données mobiles si disponibles
            mobile_transcription = None
            mobile_trans = request_data.get('mobileTranscription')
            if mobile_trans and mobile_trans.get('text'):
                mobile_transcription = {
                    "text": mobile_trans.get('text'),
                    "language": mobile_trans.get('language'),
                    "confidence": mobile_trans.get('confidence', 0.85),
                    "source": mobile_trans.get('source', 'mobile'),
                    "segments": mobile_trans.get('segments')
                }
                logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Transcription mobile fournie: {mobile_trans.get('text')[:50]}...")
            else:
                logger.info(f"🔍 [TRANSLATOR-TRACE] Pas de transcription mobile")

            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 6: Lancement transcription Whisper...")
            logger.info(f"🔍 [TRANSLATOR-TRACE] Audio path: {audio_path}")
            logger.info(f"🔍 [TRANSLATOR-TRACE] Audio exists: {Path(audio_path).exists() if audio_path else False}")
            if audio_path and Path(audio_path).exists():
                file_size = Path(audio_path).stat().st_size
                logger.info(f"🔍 [TRANSLATOR-TRACE] Audio file size: {file_size} bytes ({file_size/1024:.2f} KB)")

            # Effectuer la transcription
            result = await transcription_service.transcribe(
                audio_path=audio_path,
                mobile_transcription=mobile_transcription,
                return_timestamps=True
            )

            logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Transcription terminée:")
            logger.info(f"   - text: {shown(result.text, 100)}...")
            logger.info(f"   - language: {result.language}")
            logger.info(f"   - confidence: {result.confidence}")
            logger.info(f"   - duration_ms: {result.duration_ms}")
            logger.info(f"   - source: {result.source}")
            logger.info(f"   - segments: {len(result.segments) if result.segments else 0} segments")
            if result.segments and len(result.segments) > 0:
                logger.info(f"   - premier segment: {shown(result.segments[0].text, 30)}... ({result.segments[0].start_ms}ms - {result.segments[0].end_ms}ms)")

            processing_time = int((time.time() - start_time) * 1000)
            logger.info(f"🔍 [TRANSLATOR-TRACE] Processing time: {processing_time}ms")

            logger.info(f"🔍 [TRANSLATOR-TRACE] Étape 7: Publication du résultat...")
            # Publier le résultat
            await self._publish_transcription_result(
                task_id=task_id,
                message_id=request_data.get('messageId'),
                attachment_id=request_data.get('attachmentId'),
                result=result,
                processing_time=processing_time
            )

            logger.info(f"🔍 [TRANSLATOR-TRACE] ✅ Résultat publié")
            logger.info(f"🔍 [TRANSLATOR-TRACE] ======== FIN TRANSCRIPTION (succès) ========")

            logger.info(
                f"✅ [TRANSLATOR] Transcription only terminée: "
                f"msg={request_data.get('messageId')}, "
                f"lang={result.language}, "
                f"time={processing_time}ms"
            )

        except Exception as e:
            logger.error(f"🔍 [TRANSLATOR-TRACE] ❌ ERREUR TRANSCRIPTION:")
            logger.error(f"🔍 [TRANSLATOR-TRACE] Type: {type(e).__name__}")
            logger.error(f"🔍 [TRANSLATOR-TRACE] Message: {str(e)}")
            logger.error(f"❌ [TRANSLATOR] Erreur transcription only: {e}")
            import traceback
            logger.error(f"🔍 [TRANSLATOR-TRACE] Stack trace:")
            traceback.print_exc()

            logger.info(f"🔍 [TRANSLATOR-TRACE] Publication erreur...")
            await self._publish_transcription_error(
                task_id=task_id,
                message_id=request_data.get('messageId', ''),
                attachment_id=request_data.get('attachmentId', ''),
                error=str(e),
                error_code="transcription_failed"
            )
            logger.info(f"🔍 [TRANSLATOR-TRACE] ======== FIN TRANSCRIPTION (erreur) ========")

        finally:
            # Nettoyer le fichier temporaire si créé
            if temp_file_path is not None:
                try:
                    from pathlib import Path
                    temp_path = Path(temp_file_path) if not isinstance(temp_file_path, Path) else temp_file_path
                    if temp_path.exists():
                        temp_path.unlink()
                        logger.debug(f"   🧹 Fichier temporaire supprimé: {temp_file_path}")
                except Exception as cleanup_error:
                    logger.warning(f"   ⚠️ Impossible de supprimer le fichier temp: {cleanup_error}")

    async def _publish_transcription_result(
        self,
        task_id: str,
        message_id: str,
        attachment_id: str,
        result,
        processing_time: int
    ):
        """Publie le résultat de la transcription via PUB"""
        try:
            # Convertir les segments en dictionnaires sérialisables
            segments = getattr(result, 'segments', None)
            segments_dict = None
            if segments:
                segments_dict = [
                    {
                        'text': s.text,
                        'startMs': s.start_ms,
                        'endMs': s.end_ms,
                        'confidence': s.confidence,
                        'speakerId': getattr(s, 'speaker_id', None),
                        'voiceSimilarityScore': getattr(s, 'voice_similarity_score', None),
                        'language': getattr(s, 'language', None)
                    }
                    for s in segments
                ]

            # Construire le dictionnaire de transcription
            transcription_dict = {
                'text': result.text,
                'language': result.language,
                'confidence': result.confidence,
                'durationMs': result.duration_ms,
                'source': result.source,
                'model': result.model or 'whisper_boost',
                'segments': segments_dict
            }

            # Ajouter les champs de diarisation si disponibles
            if getattr(result, 'speaker_count', None) is not None:
                transcription_dict['speakerCount'] = result.speaker_count
            if getattr(result, 'primary_speaker_id', None):
                transcription_dict['primarySpeakerId'] = result.primary_speaker_id
            if getattr(result, 'sender_voice_identified', None) is not None:
                transcription_dict['senderVoiceIdentified'] = result.sender_voice_identified
            if getattr(result, 'sender_speaker_id', None) is not None:
                transcription_dict['senderSpeakerId'] = result.sender_speaker_id
            if getattr(result, 'speaker_analysis', None):
                transcription_dict['speakerAnalysis'] = result.speaker_analysis

            message = {
                'type': 'transcription_completed',
                'taskId': task_id,
                'messageId': message_id,
                'attachmentId': attachment_id,
                'transcription': transcription_dict,
                'processingTimeMs': processing_time,
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.info(f"✅ [TRANSLATOR] Transcription result publié: {message_id}")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour transcription result")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication transcription result: {e}")

    async def _publish_transcription_error(
        self,
        task_id: str,
        message_id: str,
        attachment_id: str,
        error: str,
        error_code: str
    ):
        """Publie une erreur de transcription via PUB"""
        try:
            message = {
                'type': 'transcription_error',
                'taskId': task_id,
                'messageId': message_id,
                'attachmentId': attachment_id,
                'error': error,
                'errorCode': error_code,
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.warning(f"⚠️ [TRANSLATOR] Transcription error publié: {message_id} - {error_code}")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour transcription error")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication transcription error: {e}")

