"""
Handler pour les requêtes de traduction texte

Gère les requêtes de traduction texte simple via ZMQ.
"""

import asyncio
import json
import logging
import psutil
import re
import time
import uuid
from typing import Dict, Optional

# Import des modèles ZMQ
from .zmq_models import TranslationTask

logger = logging.getLogger(__name__)

# Import du service de cache Redis
CACHE_AVAILABLE = False
try:
    from .redis_service import get_redis_service, get_translation_cache_service
    CACHE_AVAILABLE = True
except ImportError:
    pass

# Import de la configuration des limites
from config.message_limits import can_translate_message

# Import des constantes de disponibilité des pipelines
try:
    from services.zmq_audio_handler import AUDIO_PIPELINE_AVAILABLE
except ImportError:
    AUDIO_PIPELINE_AVAILABLE = False

# Définir les constantes Voice API et Voice Profile localement
# (évite les imports circulaires avec services.__init__.py)
VOICE_API_AVAILABLE = False
VoiceAPIHandler = None
try:
    from .voice_api import VoiceAPIHandler, get_voice_api_handler
    VOICE_API_AVAILABLE = True
except ImportError:
    pass

VOICE_PROFILE_HANDLER_AVAILABLE = False
try:
    from .voice_profile_handler import get_voice_profile_handler
    VOICE_PROFILE_HANDLER_AVAILABLE = True
except ImportError:
    pass


class TranslationHandler:
    """Handler pour les traductions texte via ZMQ"""

    def __init__(self, pool_manager, pub_socket, database_service=None, gateway_push_port=None, gateway_sub_port=None):
        """
        Initialise le handler de traduction

        Args:
            pool_manager: TranslationPoolManager instance
            pub_socket: Socket ZMQ PUB pour publier les résultats
            database_service: Service de base de données optionnel
            gateway_push_port: Port PULL du serveur (optionnel)
            gateway_sub_port: Port PUB du serveur (optionnel)
        """
        self.pool_manager = pool_manager
        self.pub_socket = pub_socket
        self.db = database_service
        self.gateway_push_port = gateway_push_port
        self.gateway_sub_port = gateway_sub_port

        # Tâches en vol (taskId → échéance time.monotonic()). Le gateway
        # re-pushe la même tâche toutes les ~30 s tant qu'aucun résultat
        # n'est publié : sans déduplication, chaque re-push empile une
        # exécution concurrente du même texte sur le même lock modèle et
        # tout texte >30 s de traduction s'auto-étrangle (incident
        # 2026-07-04, tempête de retries).
        self._inflight_tasks: dict = {}

        # Cache Redis si disponible
        if CACHE_AVAILABLE:
            self.cache_service = get_translation_cache_service()
        else:
            self.cache_service = None

        # Voice API Handler si disponible
        if VOICE_API_AVAILABLE:
            try:
                self.voice_api_handler = get_voice_api_handler()
                logger.info("✅ VoiceAPIHandler initialisé")
            except Exception as e:
                logger.warning(f"⚠️ Impossible d'initialiser VoiceAPIHandler: {e}")
                self.voice_api_handler = None
        else:
            self.voice_api_handler = None
            logger.info("ℹ️ Voice API non disponible")

        # Voice Profile Handler si disponible
        if VOICE_PROFILE_HANDLER_AVAILABLE:
            try:
                self.voice_profile_handler = get_voice_profile_handler()
                logger.info("✅ VoiceProfileHandler initialisé")
            except Exception as e:
                logger.warning(f"⚠️ Impossible d'initialiser VoiceProfileHandler: {e}")
                self.voice_profile_handler = None
        else:
            self.voice_profile_handler = None
            logger.info("ℹ️ Voice Profile Handler non disponible")

    @staticmethod
    def inflight_ttl_for(text_length: int, language_count: int) -> float:
        """Fenêtre de déduplication d'une tâche : budget cumulé de toutes
        ses langues (traduites séquentiellement) + marge fixe. Passé ce
        délai, un re-push du même taskId est une relance légitime."""
        from .zmq_pool.translation_processor import inference_timeout_for
        return max(1, language_count) * inference_timeout_for(text_length) + 30.0

    def claim_inflight(self, task_id: str, ttl_s: float, now_s: float = None) -> bool:
        """Réserve task_id pour ttl_s secondes. False si déjà en vol."""
        now = time.monotonic() if now_s is None else now_s
        self._inflight_tasks = {
            tid: exp for tid, exp in self._inflight_tasks.items() if exp > now
        }
        if task_id in self._inflight_tasks:
            return False
        self._inflight_tasks[task_id] = now + ttl_s
        return True

    async def _handle_translation_request_multipart(self, frames: list[bytes]):
        """
        Traite une requête multipart ZMQ.

        Protocol multipart:
        - Frame 0: JSON metadata avec 'binaryFrames' indiquant les indices des binaires
        - Frame 1+: Données binaires (audio, embedding, etc.)

        Le champ 'binaryFrames' dans le JSON indique où trouver les binaires:
        - binaryFrames.audio = 1 → l'audio binaire est dans frames[1]
        - binaryFrames.embedding = 2 → l'embedding pkl est dans frames[2]

        Rétrocompatibilité:
        - Si un seul frame → ancien format JSON avec base64
        - Si binaryFrames absent → utiliser audioBase64/audioData (legacy)
        """
        if not frames:
            logger.warning("⚠️ [TRANSLATOR] Message multipart vide reçu")
            return

        # Frame 0: JSON metadata
        json_frame = frames[0]

        # Extraire les frames binaires si présents
        binary_frames = frames[1:] if len(frames) > 1 else []

        # Parser le JSON
        try:
            request_data = json.loads(json_frame.decode('utf-8'))
        except json.JSONDecodeError as e:
            logger.error(f"❌ [TRANSLATOR] Erreur parsing JSON multipart: {e}")
            return

        # Extraire les infos des frames binaires
        binary_frame_info = request_data.get('binaryFrames', {})

        # Si on a des frames binaires, les injecter dans request_data
        if binary_frames and binary_frame_info:
            # Audio binaire
            audio_idx = binary_frame_info.get('audio')
            if audio_idx and audio_idx <= len(binary_frames):
                # Stocker le binaire directement (pas de base64!)
                request_data['_audioBinary'] = binary_frames[audio_idx - 1]
                audio_size = len(binary_frames[audio_idx - 1])
                logger.info(f"📦 [TRANSLATOR] Audio binaire extrait du frame {audio_idx}: {audio_size / 1024:.1f}KB")

            # Embedding binaire (pkl)
            embedding_idx = binary_frame_info.get('embedding')
            if embedding_idx and embedding_idx <= len(binary_frames):
                request_data['_embeddingBinary'] = binary_frames[embedding_idx - 1]
                embedding_size = len(binary_frames[embedding_idx - 1])
                logger.info(f"📦 [TRANSLATOR] Embedding binaire extrait du frame {embedding_idx}: {embedding_size / 1024:.1f}KB")

        # Déléguer au handler existant
        await self._handle_translation_request(request_data, binary_frames)

    async def _handle_translation_request(self, request_data: dict, binary_frames: list[bytes] = None):
        """
        Traite une requête de traduction reçue via SUB

        XXX: PARALLÉLISATION OPPORTUNITÉ #3 - Traduction multi-langues simultanée
        TODO: Actuellement, si targetLanguages = ['en', 'es', 'de', 'it', 'pt']
              chaque langue est traduite SÉQUENTIELLEMENT par le worker
        TODO: Optimisation possible:
              - Créer UNE tâche par langue cible (5 tâches au lieu d'1)
              - Les workers traitent en parallèle (si plusieurs workers disponibles)
              - OU: Batch translation dans le worker (traduire toutes les langues en 1 passe)
        TODO: Implémentation suggérée:
              # Option A: Multiple tasks (simple, utilise workers existants)
              for target_lang in target_languages:
                  task = TranslationTask(
                      target_languages=[target_lang],  # UNE langue par tâche
                      ...
                  )
                  await self.pool_manager.enqueue_task(task)
              
              # Option B: Batch API dans ML service (plus efficace)
              results = await ml_service.translate_batch_multilingual(
                  text=text,
                  source_lang=source_lang,
                  target_langs=['en', 'es', 'de', 'it', 'pt'],  # Toutes ensemble
                  model_type=model_type
              )
        TODO: Gains attendus:
              - Option A: N workers × vitesse (si N workers disponibles)
              - Option B: 2-3x plus rapide (overhead réduit, batch processing)
        """
        try:
            # Note: request_data est déjà parsé par _handle_translation_request_multipart
            # binary_frames contient les données binaires si présentes

            # Dispatcher selon le type de message
            message_type = request_data.get('type')

            # === PING ===
            if message_type == 'ping':
                logger.info(f"🏓 [TRANSLATOR] Ping reçu, timestamp: {request_data.get('timestamp')}")
                # Répondre au ping via PUB
                ping_response = {
                    'type': 'pong',
                    'timestamp': time.time(),
                    'translator_status': 'alive',
                    'translator_port_pub': self.gateway_sub_port,
                    'translator_port_pull': self.gateway_push_port,
                    'audio_pipeline_available': AUDIO_PIPELINE_AVAILABLE
                }
                if self.pub_socket:
                    await self.pub_socket.send(json.dumps(ping_response).encode('utf-8'))
                    logger.info(f"🏓 [TRANSLATOR] Pong envoyé via port {self.gateway_sub_port}")
                else:
                    logger.error(f"❌ [TRANSLATOR] Socket PUB non disponible pour pong (port {self.gateway_sub_port})")
                return

            # === TEXT TRANSLATION ===
            # Les requêtes de traduction texte peuvent avoir type='translation' ou pas de type (legacy)
            if message_type == 'translation' or message_type is None:
                # Vérifier que c'est une requête de traduction texte valide
                if request_data.get('text') and request_data.get('targetLanguages'):
                    # Continuer avec le traitement de traduction texte (suite du code ci-dessous)
                    pass
                else:
                    # Log détaillé pour debug
                    text_preview = str(request_data.get('text', ''))[:100] if request_data.get('text') else '<empty>'
                    targets = request_data.get('targetLanguages', [])
                    msg_id = request_data.get('messageId', '<no-id>')
                    conv_id = request_data.get('conversationId', '<no-conv>')
                    all_keys = list(request_data.keys())
                    logger.warning(
                        f"⚠️ [TRANSLATOR] Requête de traduction invalide: "
                        f"type={message_type}, messageId={msg_id}, conversationId={conv_id}, "
                        f"has_text={bool(request_data.get('text'))}, text_preview='{text_preview}', "
                        f"has_targets={bool(targets)}, targets={targets}, "
                        f"all_keys={all_keys}"
                    )
                    return

            # === AUDIO PROCESSING ===
            elif message_type == 'audio_process':
                await self._handle_audio_process_request(request_data)
                return

            # === TRANSCRIPTION ONLY ===
            elif message_type == 'transcription_only':
                await self._handle_transcription_only_request(request_data)
                return

            # === STORY TEXT OBJECT TRANSLATION ===
            # Le gateway envoie ce type quand un textObject d'une story doit etre
            # traduit en plusieurs langues. On gathered toutes les traductions et
            # publie un seul event combine `story_text_object_translation_completed`.
            elif message_type == 'story_text_object_translation':
                await self._handle_story_text_object_translation(request_data)
                return

            # === VOICE API ===
            elif VOICE_API_AVAILABLE and self.voice_api_handler and self.voice_api_handler.is_voice_api_request(message_type):
                await self._handle_voice_api_request(request_data)
                return

            # === VOICE PROFILE (internal processing for Gateway) ===
            elif VOICE_PROFILE_HANDLER_AVAILABLE and self.voice_profile_handler and self.voice_profile_handler.is_voice_profile_request(message_type):
                await self._handle_voice_profile_request(request_data)
                return

            # === UNKNOWN TYPE ===
            else:
                logger.warning(f"⚠️ [TRANSLATOR] Type de requête inconnu: {message_type}")
                return

            # === TRAITEMENT TRADUCTION TEXTE (après validation ci-dessus) ===

            # Vérifier la longueur du message pour la traduction
            message_text = request_data.get('text', '')
            if not can_translate_message(message_text):
                logger.warning(f"⚠️ [TRANSLATOR] Message too long to be translated: {len(message_text)} caractères (max: {MessageLimits.MAX_TRANSLATION_LENGTH})")
                # Ne pas traiter ce message, retourner un résultat vide ou le texte original
                # On pourrait aussi envoyer une notification à la gateway ici si nécessaire
                no_translation_message = {
                    'type': 'translation_skipped',
                    'messageId': request_data.get('messageId'),
                    'reason': 'message_too_long',
                    'length': len(message_text),
                    'max_length': MessageLimits.MAX_TRANSLATION_LENGTH,
                    'conversationId': request_data.get('conversationId', 'unknown')
                }
                if self.pub_socket:
                    await self.pub_socket.send(json.dumps(no_translation_message).encode('utf-8'))
                    logger.info(f"[TRANSLATOR] translation message ignored for message {request_data.get('messageId')}")
                return
            
            # Dédupliquer les re-pushes gateway du même taskId pendant que
            # la tâche initiale tourne encore (cf. _inflight_tasks).
            incoming_task_id = request_data.get('taskId')
            if incoming_task_id:
                ttl = self.inflight_ttl_for(
                    text_length=len(message_text),
                    language_count=len(request_data.get('targetLanguages', [])),
                )
                if not self.claim_inflight(incoming_task_id, ttl_s=ttl):
                    logger.info(
                        f"🔁 [TRANSLATOR] Re-push ignoré, tâche déjà en vol: "
                        f"{incoming_task_id} (ttl {ttl:.0f}s)"
                    )
                    return

            # Créer la tâche de traduction
            # CORRECTION: Réutiliser le taskId envoyé par la Gateway pour que la corrélation
            # de la réponse ZMQ fonctionne. Si le worker génère un nouveau uuid4(), la Gateway
            # attend une réponse sur l'ancien taskId qui n'arrivera jamais → timeout 4×30s.
            task = TranslationTask(
                task_id=incoming_task_id or str(uuid.uuid4()),
                message_id=request_data.get('messageId'),
                text=message_text,
                source_language=request_data.get('sourceLanguage', 'fr'),
                target_languages=request_data.get('targetLanguages', []),
                conversation_id=request_data.get('conversationId', 'unknown'),
                model_type=request_data.get('modelType', 'basic')
            )
            
            logger.info(f"🔧 [TRANSLATOR] Tâche créée: {task.task_id} pour {task.conversation_id} ({len(task.target_languages)} langues)")
            logger.info(f"📝 [TRANSLATOR] Détails: texte='{task.text[:50]}...', source={task.source_language}, target={task.target_languages}, modèle={task.model_type}")
            
            # Enfiler la tâche dans la pool appropriée
            success = await self.pool_manager.enqueue_task(task)
            
            if not success:
                # Pool pleine, publier un message d'erreur vers la gateway
                error_message = {
                    'type': 'translation_error',
                    'taskId': task.task_id,
                    'messageId': task.message_id,
                    'error': 'translation pool full',
                    'conversationId': task.conversation_id
                }
                # Utiliser le socket PUB configuré pour envoyer l'erreur à la gateway
                if self.pub_socket:
                    await self.pub_socket.send(json.dumps(error_message).encode('utf-8'))
                    logger.warning(f"Pool pleine, rejet de la tâche {task.task_id}")
                else:
                    logger.error("❌ Socket PUB non initialisé pour envoyer l'erreur")
            
        except json.JSONDecodeError as e:
            logger.error(f"Erreur de décodage JSON: {e}")
        except Exception as e:
            logger.error(f"Erreur lors du traitement de la requête: {e}")

    async def _publish_translation_result(self, task_id: str, result: dict, target_language: str):
        """Publie un résultat de traduction via PUB vers la gateway avec informations techniques complètes"""
        try:
            # DEBUG: Logs réduits de 60% - Suppression des vérifications détaillées
            
            # Récupérer les informations techniques du système
            import socket
            import uuid
            
            # Calculer le temps d'attente en queue
            queue_time = time.time() - result.get('created_at', time.time())
            
            # Récupérer les métriques système
            memory_usage = psutil.Process().memory_info().rss / 1024 / 1024  # MB
            # OPTIMISATION: Suppression du sleep(0.1) qui ajoutait 100ms de latence
            # Utiliser la valeur CPU mise en cache ou 0.0 si non disponible
            cpu_usage = getattr(self, '_cached_cpu_usage', 0.0)
            
            # Enrichir le résultat avec toutes les informations techniques
            enriched_result = {
                # Informations applicatives existantes
                'messageId': result.get('messageId'),
                'translatedText': result.get('translatedText'),
                'sourceLanguage': result.get('sourceLanguage'),
                'targetLanguage': result.get('targetLanguage'),
                'confidenceScore': result.get('confidenceScore', 0.0),
                'processingTime': result.get('processingTime', 0.0),
                'modelType': result.get('modelType', 'basic'),
                'workerName': result.get('workerName', 'unknown'),
                
                # NOUVELLES INFORMATIONS TECHNIQUES
                'translatorModel': result.get('modelType', 'basic'),  # Modèle ML utilisé
                'workerId': result.get('workerName', 'unknown'),      # Worker qui a traité
                'poolType': result.get('poolType', 'normal'),         # Pool utilisée (normal/any)
                'translationTime': result.get('processingTime', 0.0), # Temps de traduction
                'queueTime': queue_time,                              # Temps d'attente en queue
                'memoryUsage': memory_usage,                          # Usage mémoire (MB)
                'cpuUsage': cpu_usage,                                # Usage CPU (%)
                'timestamp': time.time(),
                'version': '1.0.0'  # Version du Translator
            }
            
            # Créer le message enrichi
            message = {
                'type': 'translation_completed',
                'taskId': task_id,
                'result': enriched_result,
                'targetLanguage': target_language,
                'timestamp': time.time(),
                # MÉTADONNÉES TECHNIQUES
                'metadata': {
                    'translatorVersion': '1.0.0',
                    'modelVersion': result.get('modelType', 'basic'),
                    'processingNode': socket.gethostname(),
                    'sessionId': str(uuid.uuid4()),
                    'requestId': task_id,
                    'protocol': 'ZMQ_PUB_SUB',
                    'encoding': 'UTF-8'
                }
            }
            
            # DEBUG: Logs réduits de 60% - Suppression des détails techniques
            
            # VÉRIFICATION DE LA QUALITÉ DE LA TRADUCTION
            translated_text = result.get('translatedText', '')
            is_valid_translation = self._is_valid_translation(translated_text, result)
            
            if not is_valid_translation:
                # Traduction invalide - NE PAS ENVOYER à la Gateway
                logger.error(f"❌ [TRANSLATOR] Traduction invalide détectée - PAS D'ENVOI à la Gateway:")
                logger.error(f"   📋 Task ID: {task_id}")
                logger.error(f"   📋 Message ID: {result.get('messageId')}")
                logger.error(f"   📋 Source: {result.get('sourceLanguage')} -> Target: {target_language}")
                logger.error(f"   📋 Texte original: {result.get('originalText', 'N/A')}")
                logger.error(f"   📋 Texte traduit: '{translated_text}'")
                logger.error(f"   📋 Modèle utilisé: {result.get('modelType', 'unknown')}")
                logger.error(f"   📋 Worker: {result.get('workerName', 'unknown')}")
                logger.error(f"   📋 Raison: {self._get_translation_error_reason(translated_text)}")
                return  # Sortir sans envoyer à la Gateway
            
            # Traduction valide - SAUVEGARDE ET ENVOI
            try:
                # Préparer les données pour la sauvegarde
                save_data = {
                    'messageId': result.get('messageId'),
                    'sourceLanguage': result.get('sourceLanguage'),
                    'targetLanguage': result.get('targetLanguage'),
                    'translatedText': result.get('translatedText'),
                    'translatorModel': result.get('translatorModel', result.get('modelType', 'basic')),
                    'confidenceScore': result.get('confidenceScore', 0.9),
                    'processingTime': result.get('processingTime', 0.0),
                    'workerName': result.get('workerName', 'unknown'),
                    'poolType': result.get('poolType', 'normal')
                }
                
                # ═══════════════════════════════════════════════════════════════════════
                # ARCHITECTURE: PAS DE SAUVEGARDE EN BASE ICI
                # ═══════════════════════════════════════════════════════════════════════
                # La persistance des traductions est la RESPONSABILITÉ DE LA GATEWAY.
                # Translator ne fait que:
                #   1. Traduire (avec cache Redis pour éviter les retraductions)
                #   2. Renvoyer les résultats à Gateway via ZMQ PUB
                # Gateway reçoit les résultats et persiste en base de données.
                #
                # Avantages:
                #   - Séparation claire des responsabilités
                #   - Translator peut fonctionner sans base de données
                #   - Gateway contrôle la logique de persistance (encryption, etc.)
                #   - Meilleure scalabilité (Translator stateless)
                # ═══════════════════════════════════════════════════════════════════════
                # CODE DÉSACTIVÉ - Conservé pour référence uniquement:
                # if self.database_service.is_db_connected():
                #     save_success = await self.database_service.save_translation(save_data)
                # ═══════════════════════════════════════════════════════════════════════
                    
            except Exception as e:
                logger.error(f"❌ [TRANSLATOR] Erreur sauvegarde base de données: {e}")
            
            # ENVOI À LA GATEWAY (seulement si traduction valide)
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(message).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Résultat envoyé à la Gateway: {task_id} -> {target_language}")
            else:
                logger.error("❌ Socket PUB non initialisé")
            
        except Exception as e:
            logger.error(f"Erreur lors de la publication du résultat enrichi: {e}")
            import traceback
            traceback.print_exc()
    
    def _is_valid_translation(self, translated_text: str, result: dict) -> bool:
        """
        Vérifie si une traduction est valide et peut être envoyée à la Gateway
        
        Args:
            translated_text: Le texte traduit
            result: Le résultat complet de la traduction
        
        Returns:
            bool: True si la traduction est valide, False sinon
        """
        # Vérifier que le texte traduit existe et n'est pas vide
        if not translated_text or translated_text.strip() == '':
            return False
        
        # Vérifier que ce n'est pas un message d'erreur
        error_patterns = [
            r'^\[.*Error.*\]',
            r'^\[.*Failed.*\]',
            r'^\[.*No.*Result.*\]',
            r'^\[.*Fallback.*\]',
            r'^\[.*ML.*Error.*\]',
            r'^\[.*ÉCHEC.*\]',
            r'^\[.*MODÈLES.*NON.*\]',
            r'^\[.*MODÈLES.*NON.*CHARGÉS.*\]',
            r'^\[.*NLLB.*No.*Result.*\]',
            r'^\[.*NLLB.*Fallback.*\]',
            r'^\[.*ERREUR.*\]',
            r'^\[.*FAILED.*\]',
            r'^\[.*TIMEOUT.*\]',
            r'^\[.*META.*TENSOR.*\]'
        ]
        
        for pattern in error_patterns:
            if re.search(pattern, translated_text, re.IGNORECASE):
                return False
        
        # Vérifier que le texte traduit n'est pas identique au texte source
        original_text = result.get('originalText', '')
        if original_text and translated_text.strip().lower() == original_text.strip().lower():
            return False
        
        # Vérifier que le score de confiance est acceptable
        confidence_score = result.get('confidenceScore', 1.0)
        if confidence_score < 0.1:
            return False
        
        # Vérifier qu'il n'y a pas d'erreur dans le résultat
        if result.get('error'):
            return False
        
        return True
    
    def _get_translation_error_reason(self, translated_text: str) -> str:
        """
        Retourne la raison de l'échec de traduction
        
        Args:
            translated_text: Le texte traduit
        
        Returns:
            str: La raison de l'échec
        """
        if not translated_text or translated_text.strip() == '':
            return "Texte traduit vide"
        
        error_patterns = [
            (r'^\[.*Error.*\]', "Message d'erreur détecté"),
            (r'^\[.*Failed.*\]', "Échec de traduction détecté"),
            (r'^\[.*No.*Result.*\]', "Aucun résultat de traduction"),
            (r'^\[.*Fallback.*\]', "Fallback de traduction détecté"),
            (r'^\[.*ML.*Error.*\]', "Erreur ML détectée"),
            (r'^\[.*ÉCHEC.*\]', "Échec de traduction"),
            (r'^\[.*MODÈLES.*NON.*\]', "Modèles non disponibles"),
            (r'^\[.*MODÈLES.*NON.*CHARGÉS.*\]', "Modèles non chargés"),
            (r'^\[.*NLLB.*No.*Result.*\]', "NLLB: Aucun résultat"),
            (r'^\[.*NLLB.*Fallback.*\]', "NLLB: Fallback"),
            (r'^\[.*ERREUR.*\]', "Erreur générale"),
            (r'^\[.*FAILED.*\]', "Échec général"),
            (r'^\[.*TIMEOUT.*\]', "Timeout de traduction"),
            (r'^\[.*META.*TENSOR.*\]', "Erreur meta tensor")
        ]
        
        for pattern, reason in error_patterns:
            if re.search(pattern, translated_text, re.IGNORECASE):
                return reason

        return "Erreur de validation inconnue"

    async def _handle_story_text_object_translation(self, request_data: dict):
        """
        Traduit un textObject de story en N langues et publie un event combine.

        Avant ce handler, le gateway envoyait des requetes `story_text_object_translation`
        sans handler cote translator → tombait dans le `else` final et le pipeline
        textObjects-translation etait silencieusement mort en production. Toutes les
        stories montraient le texte original quel que soit la langue de l'utilisateur.

        Format requete:
            {type, postId, textObjectIndex, text, sourceLanguage, targetLanguages, timestamp}
        Format reponse (publie sur PUB):
            {type: 'story_text_object_translation_completed',
             postId, textObjectIndex,
             translations: {targetLang: translatedText, ...},
             timestamp}
        """
        post_id = request_data.get('postId')
        text_object_index = request_data.get('textObjectIndex')
        text = request_data.get('text', '')
        source_language = request_data.get('sourceLanguage', 'fr')
        target_languages = request_data.get('targetLanguages', [])

        # Validation minimale — ignore les requetes malformees plutot que de crash
        if not post_id or text_object_index is None or not text or not target_languages:
            logger.warning(
                f"⚠️ [TRANSLATOR] story_text_object_translation requete invalide: "
                f"postId={post_id}, index={text_object_index}, has_text={bool(text)}, "
                f"targets={target_languages}"
            )
            return

        # Verifier la longueur (memes limites que les messages)
        if not can_translate_message(text):
            logger.warning(
                f"⚠️ [TRANSLATOR] story textObject trop long: postId={post_id}, "
                f"index={text_object_index}, length={len(text)}"
            )
            return

        translation_service = getattr(self.pool_manager, 'translation_service', None)
        if translation_service is None:
            logger.error(
                "❌ [TRANSLATOR] story_text_object_translation: translation_service non disponible"
            )
            return

        translations: Dict[str, str] = {}
        start_time = time.time()

        for target_lang in target_languages:
            if target_lang == source_language:
                # Pas besoin de traduire vers la langue source
                continue
            try:
                result = await translation_service.translate_with_structure(
                    text=text,
                    source_language=source_language,
                    target_language=target_lang,
                    model_type=request_data.get('modelType', 'basic'),
                    source_channel='zmq_story_text_object'
                )
                translated = result.get('translated_text') if isinstance(result, dict) else None
                if translated and translated.strip() and translated != text:
                    translations[target_lang] = translated
            except Exception as e:
                logger.warning(
                    f"⚠️ [TRANSLATOR] story textObject translation failed: "
                    f"postId={post_id}, index={text_object_index}, target={target_lang}, err={e}"
                )

        if not translations:
            logger.warning(
                f"⚠️ [TRANSLATOR] story_text_object: no translations produced for "
                f"postId={post_id}, index={text_object_index}"
            )
            # On publie quand meme l'event vide pour que le gateway sache que la
            # requete a ete traitee (evite les listener leaks cote gateway).

        completed_event = {
            'type': 'story_text_object_translation_completed',
            'postId': post_id,
            'textObjectIndex': text_object_index,
            'translations': translations,
            'timestamp': int(time.time() * 1000),
        }

        if self.pub_socket:
            await self.pub_socket.send(json.dumps(completed_event).encode('utf-8'))
            logger.info(
                f"✅ [TRANSLATOR] story_text_object_translation_completed: "
                f"postId={post_id}, index={text_object_index}, "
                f"translations={len(translations)}, elapsed={time.time() - start_time:.2f}s"
            )
        else:
            logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour story_text_object event")

    async def _handle_audio_process_request(self, request_data: dict):
        """
        Délègue les requêtes audio_process au handler approprié.
        Note: Cette fonctionnalité doit être implémentée dans zmq_audio_handler
        """
        logger.warning(f"⚠️ [TRANSLATOR] Requête audio_process reçue mais handler non disponible")
        logger.warning(f"   Type: {request_data.get('type')}")
        logger.warning(f"   MessageID: {request_data.get('messageId')}")
        logger.warning(f"   → Les requêtes audio doivent être gérées par ZmqAudioHandler")

    async def _handle_transcription_only_request(self, request_data: dict):
        """
        Délègue les requêtes transcription_only au handler approprié.
        Note: Cette fonctionnalité doit être implémentée dans zmq_audio_handler
        """
        logger.warning(f"⚠️ [TRANSLATOR] Requête transcription_only reçue mais handler non disponible")
        logger.warning(f"   Type: {request_data.get('type')}")
        logger.warning(f"   MessageID: {request_data.get('messageId')}")
        logger.warning(f"   → Les requêtes de transcription doivent être gérées par ZmqAudioHandler")

    async def _handle_voice_api_request(self, request_data: dict):
        """
        Délègue les requêtes Voice API au VoiceAPIHandler.
        """
        try:
            if not self.voice_api_handler:
                logger.error("❌ [TRANSLATOR] VoiceAPIHandler non disponible")
                return

            logger.info(f"🎤 [TRANSLATOR] Traitement requête Voice API: {request_data.get('type')}")

            # Déléguer au VoiceAPIHandler
            response = await self.voice_api_handler.handle_request(request_data)

            # Publier la réponse via PUB socket
            if self.pub_socket and response:
                await self.pub_socket.send(json.dumps(response).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Réponse Voice API envoyée: {response.get('type')}")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible ou réponse vide")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur traitement Voice API: {e}")
            import traceback
            traceback.print_exc()

    async def _handle_voice_profile_request(self, request_data: dict):
        """
        Délègue les requêtes Voice Profile au VoiceProfileHandler.
        Note: Cette fonctionnalité doit être implémentée dans zmq_voice_handler
        """
        logger.warning(f"⚠️ [TRANSLATOR] Requête voice_profile reçue mais handler non disponible")
        logger.warning(f"   Type: {request_data.get('type')}")
        logger.warning(f"   → Les requêtes voice profile doivent être gérées par VoiceProfileHandler")
    
