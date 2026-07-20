"""
Handler pour les requêtes Voice API et Voice Profile

Gère les requêtes de l'API vocale et les profils vocaux.
"""

import asyncio
import json
import logging
import time
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)

# Long-running Voice API operations that go through the translation pipeline
# worker pool (Whisper + NLLB + TTS). Subject to dedup-by-taskId so a duplicate
# Gateway PUSH (e.g. an old retry path) doesn't enqueue a parallel pipeline run.
_LONG_RUNNING_VOICE_TYPES = frozenset({
    'voice_translate',
    'voice_translate_async',
})

# Import du Voice API handler
VOICE_API_AVAILABLE = False
try:
    from .voice_api import VoiceAPIHandler, get_voice_api_handler
    VOICE_API_AVAILABLE = True
except ImportError:  # pragma: no cover
    pass

# Import du Voice Profile handler
VOICE_PROFILE_HANDLER_AVAILABLE = False
try:
    from .voice_profile_handler import VoiceProfileHandler, get_voice_profile_handler
    VOICE_PROFILE_HANDLER_AVAILABLE = True
except ImportError:  # pragma: no cover
    pass


class VoiceHandler:
    """Handler pour Voice API et Voice Profile via ZMQ"""
    
    def __init__(self, pub_socket, database_service=None):
        """
        Initialise le handler voice

        Args:
            pub_socket: Socket ZMQ PUB pour publier les résultats
            database_service: Service de base de données optionnel
        """
        self.pub_socket = pub_socket
        self.db = database_service

        # Handlers voice (initialisés si disponibles)
        self.voice_api_handler = None
        self.voice_profile_handler = None

        # Dedup set for in-flight long-running voice translations (by taskId).
        # Defensive: with the Gateway no-retry policy on voice_translate, the
        # same taskId should only arrive once. If it ever arrives twice we log
        # and drop the duplicate instead of saturating the worker pool with a
        # parallel pipeline run.
        self._in_flight_voice_translates: Set[str] = set()

        # Initialiser les handlers si disponibles
        if VOICE_API_AVAILABLE:  # pragma: no branch
            self.voice_api_handler = get_voice_api_handler()
            logger.info("✅ [ZMQ] VoiceAPIHandler initialisé")

        if VOICE_PROFILE_HANDLER_AVAILABLE:  # pragma: no branch
            self.voice_profile_handler = get_voice_profile_handler()
            logger.info("✅ [ZMQ] VoiceProfileHandler initialisé")

    def is_voice_api_request(self, request_type: str) -> bool:
        """Vérifie si le type de requête est une requête Voice API"""
        if self.voice_api_handler and hasattr(self.voice_api_handler, 'is_voice_api_request'):
            return self.voice_api_handler.is_voice_api_request(request_type)
        return False

    async def _handle_voice_api_request(self, request_data: dict):
        """
        Traite une requête Voice API.
        Délègue au VoiceAPIHandler et publie le résultat via PUB.

        Pour les opérations longues (voice_translate / voice_translate_async),
        dédoublonne par taskId : si le même taskId est déjà en cours d'exécution,
        on log et on ignore la nouvelle requête plutôt que de lancer un pipeline
        parallèle qui saturerait le worker pool.
        """
        request_type = request_data.get('type', '')
        task_id = request_data.get('taskId', '')
        is_long_running = request_type in _LONG_RUNNING_VOICE_TYPES

        if is_long_running and task_id:
            if task_id in self._in_flight_voice_translates:
                logger.warning(
                    f"⚠️ [TRANSLATOR] Duplicate {request_type} ignored (taskId={task_id} already in-flight)"
                )
                return
            self._in_flight_voice_translates.add(task_id)

        try:
            if not self.voice_api_handler:
                logger.error("[TRANSLATOR] Voice API handler non disponible")
                return

            # Déléguer au handler
            response = await self.voice_api_handler.handle_request(request_data)

            # Publier la réponse via PUB
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(response).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Voice API response publiée: {response.get('taskId')} ({response.get('type')})")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour Voice API response")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur Voice API: {e}")
            import traceback
            traceback.print_exc()

            # Publier une erreur
            error_response = {
                'type': 'voice_api_error',
                'taskId': request_data.get('taskId', ''),
                'requestType': request_data.get('type', ''),
                'error': str(e),
                'errorCode': 'INTERNAL_ERROR',
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(error_response).encode('utf-8'))

        finally:
            if is_long_running and task_id:
                self._in_flight_voice_translates.discard(task_id)

    async def _handle_voice_profile_request(self, request_data: dict):
        """
        Traite une requête Voice Profile (internal processing for Gateway).

        Gateway sends audio via ZMQ, Translator processes and returns:
        - Fingerprint
        - Voice characteristics
        - Quality score
        - Embedding path

        Gateway then persists the results in database.
        """
        try:
            if not self.voice_profile_handler:
                logger.error("[TRANSLATOR] Voice Profile handler non disponible")
                return

            # Déléguer au handler
            response = await self.voice_profile_handler.handle_request(request_data)

            # Publier la réponse via PUB
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(response).encode('utf-8'))
                logger.info(f"📤 [TRANSLATOR] Voice Profile response publiée: {response.get('request_id')} ({response.get('type')})")
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour Voice Profile response")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur Voice Profile: {e}")
            import traceback
            traceback.print_exc()

            # Publier une erreur
            error_response = {
                'type': 'voice_profile_error',
                'request_id': request_data.get('request_id', ''),
                'user_id': request_data.get('user_id', ''),
                'error': str(e),
                'success': False,
                'timestamp': time.time()
            }

            if self.pub_socket:
                await self.pub_socket.send(json.dumps(error_response).encode('utf-8'))

    async def _on_translation_job_completed(self, job):
        """
        CRITIQUE: Callback appelé par TranslationPipelineService quand un job est terminé.
        Publie le résultat via ZMQ PUB vers le Gateway.

        Args:
            job: TranslationJob complété ou échoué
        """
        try:
            # Formater le résultat pour le Gateway
            response = {
                'type': 'voice_translation_completed' if job.status.value == 'completed' else 'voice_translation_failed',
                'jobId': job.id,
                'status': job.status.value,
                'userId': job.user_id,
                'timestamp': time.time()
            }

            if job.status.value == 'completed' and job.result:
                response['result'] = job.result
            elif job.error:
                response['error'] = job.error
                response['errorCode'] = job.error_code

            # Publier via ZMQ PUB
            if self.pub_socket:
                await self.pub_socket.send(json.dumps(response).encode('utf-8'))
                logger.info(
                    f"📤 [TRANSLATOR] Translation job completed: {job.id} "
                    f"(status={job.status.value})"
                )
            else:
                logger.error("❌ [TRANSLATOR] Socket PUB non disponible pour publier résultat du job")

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR] Erreur publication résultat job: {e}")
            import traceback
            traceback.print_exc()

    def set_voice_api_services(
        self,
        transcription_service=None,
        translation_service=None,
        voice_clone_service=None,
        tts_service=None,
        voice_analyzer=None,
        translation_pipeline=None,
        analytics_service=None
    ):
        """
        Configure les services pour le Voice API handler et Voice Profile handler.
        Appelé par main.py après initialisation des services.
        """
        if self.voice_api_handler:
            self.voice_api_handler.transcription_service = transcription_service
            self.voice_api_handler.translation_service = translation_service
            self.voice_api_handler.voice_clone_service = voice_clone_service
            self.voice_api_handler.tts_service = tts_service
            self.voice_api_handler.voice_analyzer = voice_analyzer
            self.voice_api_handler.translation_pipeline = translation_pipeline
            self.voice_api_handler.analytics_service = analytics_service

            # CRITIQUE: Injecter également dans les handlers imbriqués
            if hasattr(self.voice_api_handler, 'operation_handlers') and self.voice_api_handler.operation_handlers:
                self.voice_api_handler.operation_handlers.transcription_service = transcription_service
                self.voice_api_handler.operation_handlers.translation_service = translation_service
                self.voice_api_handler.operation_handlers.voice_clone_service = voice_clone_service
                self.voice_api_handler.operation_handlers.tts_service = tts_service
                self.voice_api_handler.operation_handlers.voice_analyzer = voice_analyzer
                self.voice_api_handler.operation_handlers.translation_pipeline = translation_pipeline
                self.voice_api_handler.operation_handlers.analytics_service = analytics_service
                logger.info("✅ [ZMQ] OperationHandlers services configurés")

            if hasattr(self.voice_api_handler, 'system_handlers') and self.voice_api_handler.system_handlers:
                self.voice_api_handler.system_handlers.transcription_service = transcription_service
                self.voice_api_handler.system_handlers.translation_service = translation_service
                self.voice_api_handler.system_handlers.voice_clone_service = voice_clone_service
                self.voice_api_handler.system_handlers.tts_service = tts_service
                self.voice_api_handler.system_handlers.translation_pipeline = translation_pipeline
                self.voice_api_handler.system_handlers.analytics_service = analytics_service
                logger.info("✅ [ZMQ] SystemHandlers services configurés")

            logger.info("✅ [ZMQ] Voice API services configurés")

        # CRITIQUE: Configurer le callback pour le translation_pipeline
        if translation_pipeline and hasattr(translation_pipeline, 'on_job_completed'):
            translation_pipeline.on_job_completed = self._on_translation_job_completed
            logger.info("✅ [ZMQ] Translation pipeline callback configuré pour notifications ZMQ")

        # Also configure voice profile handler
        if self.voice_profile_handler:
            self.voice_profile_handler.voice_clone_service = voice_clone_service
            self.voice_profile_handler.transcription_service = transcription_service
            logger.info("✅ [ZMQ] Voice Profile handler services configurés")

