"""
Handler pour les requêtes Voice API et Voice Profile

Gère les requêtes de l'API vocale et les profils vocaux.
"""

import asyncio
import json
import logging
import time
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Import du Voice API handler
VOICE_API_AVAILABLE = False
try:
    from .voice_api_handler import VoiceAPIHandler, get_voice_api_handler
    VOICE_API_AVAILABLE = True
except ImportError:
    pass

# Import du Voice Profile handler
VOICE_PROFILE_HANDLER_AVAILABLE = False
try:
    from .voice_profile_handler import VoiceProfileHandler, get_voice_profile_handler
    VOICE_PROFILE_HANDLER_AVAILABLE = True
except ImportError:
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

        # Initialiser les handlers si disponibles
        if VOICE_API_AVAILABLE:
            self.voice_api_handler = get_voice_api_handler()
            logger.info("✅ [ZMQ] VoiceAPIHandler initialisé")

        if VOICE_PROFILE_HANDLER_AVAILABLE:
            self.voice_profile_handler = get_voice_profile_handler()
            logger.info("✅ [ZMQ] VoiceProfileHandler initialisé")
    async def _handle_voice_api_request(self, request_data: dict):
        """
        Traite une requête Voice API.
        Délègue au VoiceAPIHandler et publie le résultat via PUB.
        """
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
            logger.info("✅ [ZMQ] Voice API services configurés")

        # Also configure voice profile handler
        if self.voice_profile_handler:
            self.voice_profile_handler.voice_clone_service = voice_clone_service
            self.voice_profile_handler.transcription_service = transcription_service
            logger.info("✅ [ZMQ] Voice Profile handler services configurés")

