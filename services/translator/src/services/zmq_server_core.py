"""
Serveur ZMQ principal - Composition des handlers

Serveur ZeroMQ haute performance pour le service de traduction Meeshy.
Architecture: PUB/SUB + REQ/REP avec pool de connexions et traitement asynchrone.
"""

import asyncio
import json
import logging
import uuid
import zmq
import zmq.asyncio
import psutil
from typing import Dict, Optional
import time

# Configuration du logging
logger = logging.getLogger(__name__)

# Import des modules refactorisés
from .zmq_models import TranslationTask
from .zmq_pool_manager import TranslationPoolManager
from .zmq_translation_handler import TranslationHandler
from .zmq_audio_handler import AudioHandler
from .zmq_transcription_handler import TranscriptionHandler
from .zmq_voice_handler import VoiceHandler

# Import du service de base de données
from .database_service import DatabaseService
from .audio_fetcher import get_audio_fetcher


class ZMQTranslationServer:
    """
    Serveur ZMQ haute performance avec architecture modulaire
    
    Délègue les responsabilités aux handlers spécialisés :
    - TranslationHandler : traductions texte
    - AudioHandler : traitement audio (multipart)
    - TranscriptionHandler : transcriptions seules
    - VoiceHandler : Voice API et profils vocaux
    """
    def __init__(self,
                 host: str = "0.0.0.0",
                 gateway_push_port: int = 5555,  # Port où Translator PULL bind (Gateway PUSH connect ici)
                 gateway_sub_port: int = 5558,   # Port où Translator PUB bind (Gateway SUB connect ici)
                 normal_pool_size: int = 10000,
                 any_pool_size: int = 10000,
                 normal_workers: int = 3,
                 any_workers: int = 2,
                 translation_service=None,
                 database_url: str = None):
        
        self.host = host
        self.gateway_push_port = gateway_push_port  # Port pour PULL (recevoir commandes)
        self.gateway_sub_port = gateway_sub_port    # Port pour PUB (envoyer réponses)
        self.context = zmq.asyncio.Context()
        
        # Sockets
        self.pull_socket = None  # PULL pour recevoir les commandes de traduction
        self.pub_socket = None   # PUB pour publier les résultats (inchangé)
        
        # Pool manager
        self.pool_manager = TranslationPoolManager(
            normal_pool_size=normal_pool_size,
            any_pool_size=any_pool_size,
            normal_workers=normal_workers,
            any_workers=any_workers,
            translation_service=translation_service
        )
        
        # Remplacer la méthode de publication du pool manager
        self.pool_manager._publish_translation_result = self._publish_translation_result
        
        # Service de base de données
        self.database_service = DatabaseService(database_url)

        # Handlers spécialisés (seront initialisés après la création des sockets)
        self.translation_handler = None
        self.audio_handler = None
        self.transcription_handler = None
        self.voice_handler = None

        # État du serveur
        self.running = False
        self.worker_tasks = []

        # OPTIMISATION: Cache CPU pour éviter le sleep(0.1) dans _publish_translation_result
        self._cached_cpu_usage = 0.0
        self._cpu_update_task = None

        logger.info(f"ZMQTranslationServer initialisé: Gateway PUSH {host}:{gateway_push_port} (PULL bind)")
        logger.info(f"ZMQTranslationServer initialisé: Gateway SUB {host}:{gateway_sub_port} (PUB bind)")

    async def _connect_database_background(self):
        """Connecte à la base de données en arrière-plan sans bloquer le démarrage"""
        try:
            logger.info("[TRANSLATOR-DB] 🔗 Tentative de connexion à MongoDB...")
            db_connected = await self.database_service.connect()
            if db_connected:
                logger.info("[TRANSLATOR-DB] ✅ Connexion à la base de données établie")
            else:
                logger.warning("[TRANSLATOR-DB] ⚠️ Connexion à la base de données échouée, sauvegarde désactivée")
        except Exception as e:
            logger.error(f"[TRANSLATOR-DB] ❌ Erreur lors de la connexion à la base de données: {e}")

    async def _update_cpu_usage_background(self):
        """
        OPTIMISATION: Mise à jour périodique du CPU usage en arrière-plan.
        Évite le sleep(0.1) dans _publish_translation_result qui ajoutait 100ms de latence.
        """
        while self.running:
            try:
                # Mesurer le CPU toutes les 5 secondes
                self._cached_cpu_usage = psutil.Process().cpu_percent(interval=1.0)
                await asyncio.sleep(4.0)  # Total: 5 secondes entre les mesures
            except Exception as e:
                logger.debug(f"[CPU-MONITOR] Erreur: {e}")
                await asyncio.sleep(5.0)
    
    async def initialize(self):
        """Initialise les sockets ZMQ avec architecture PUSH/PULL + PUB/SUB"""
        try:
            # Connexion à la base de données en arrière-plan (non-bloquante)
            logger.info("[TRANSLATOR] 🔗 Lancement de la connexion à la base de données en arrière-plan...")
            # Créer une tâche asynchrone pour la connexion DB sans bloquer
            asyncio.create_task(self._connect_database_background())
            logger.info("[TRANSLATOR] ✅ Connexion DB lancée en arrière-plan, le serveur continue son démarrage...")
            
            # Socket PULL pour recevoir les commandes du Gateway (remplace SUB)
            self.pull_socket = self.context.socket(zmq.PULL)
            self.pull_socket.bind(f"tcp://{self.host}:{self.gateway_push_port}")
            
            # Socket PUB pour publier les résultats vers le Gateway (inchangé)
            self.pub_socket = self.context.socket(zmq.PUB)
            self.pub_socket.bind(f"tcp://{self.host}:{self.gateway_sub_port}")
            
            # Petit délai pour établir les connexions ZMQ
            await asyncio.sleep(0.1)
            logger.info("[TRANSLATOR] ✅ Sockets ZMQ créés")

            # Initialiser les handlers avec les sockets créés
            self.translation_handler = TranslationHandler(
                pool_manager=self.pool_manager,
                pub_socket=self.pub_socket,
                database_service=self.database_service,
                gateway_push_port=self.gateway_push_port,
                gateway_sub_port=self.gateway_sub_port
            )
            self.audio_handler = AudioHandler(
                pub_socket=self.pub_socket,
                database_service=self.database_service
            )
            self.transcription_handler = TranscriptionHandler(
                pub_socket=self.pub_socket,
                database_service=self.database_service
            )
            self.voice_handler = VoiceHandler(
                pub_socket=self.pub_socket,
                database_service=self.database_service
            )
            logger.info("[TRANSLATOR] ✅ Handlers initialisés")

            # Démarrer les workers
            self.worker_tasks = await self.pool_manager.start_workers()
            logger.info(f"[TRANSLATOR] ✅ Workers démarrés: {len(self.worker_tasks)} tâches")
            
            logger.info("ZMQTranslationServer initialisé avec succès")
            logger.info(f"🔌 Socket PULL lié au port: {self.host}:{self.gateway_push_port}")
            logger.info(f"🔌 Socket PUB lié au port: {self.host}:{self.gateway_sub_port}")
            
        except Exception as e:
            logger.error(f"Erreur lors de l'initialisation: {e}")
            raise
    
    async def start(self):
        """Démarre le serveur"""
        if not self.pull_socket or not self.pub_socket:
            await self.initialize()

        self.running = True

        # OPTIMISATION: Démarrer le monitoring CPU en arrière-plan
        self._cpu_update_task = asyncio.create_task(self._update_cpu_usage_background())

        logger.info("ZMQTranslationServer démarré")

        try:
            while self.running:
                try:
                    # Recevoir une commande via PULL (multipart pour supporter binaires)
                    # Frame 0: JSON metadata
                    # Frame 1+: Données binaires (audio, embedding, etc.)
                    frames = await self.pull_socket.recv_multipart()
                    await self._handle_translation_request_multipart(frames)

                except zmq.ZMQError as e:
                    if self.running:
                        logger.error(f"Erreur ZMQ: {e}")
                    break
                except Exception as e:
                    logger.error(f"Erreur inattendue: {e}")
                    import traceback
                    traceback.print_exc()
                    
        except KeyboardInterrupt:
            logger.info("Arrêt demandé par l'utilisateur")
        finally:
            await self.stop()
    
    # ══════════════════════════════════════════════════════════════
    # Méthodes de routing vers les handlers spécialisés
    # ══════════════════════════════════════════════════════════════

    def _inject_binary_frames(self, request_data: dict, binary_frames: list):
        """
        Injecte les frames binaires dans request_data selon binaryFrames indices.

        Cette méthode extrait les données binaires des frames ZMQ et les injecte
        dans request_data sous les clés _audioBinary, _embeddingBinary, etc.

        Args:
            request_data: Dictionnaire contenant les métadonnées JSON
            binary_frames: Liste des frames binaires (frames[1:])
        """
        if not binary_frames:
            return

        binary_frame_info = request_data.get('binaryFrames', {})
        if not binary_frame_info:
            return

        # Audio binaire
        audio_idx = binary_frame_info.get('audio')
        if audio_idx and audio_idx <= len(binary_frames):
            request_data['_audioBinary'] = binary_frames[audio_idx - 1]
            audio_size = len(binary_frames[audio_idx - 1])
            logger.info(f"📦 [ZMQ-SERVER] Audio binaire extrait du frame {audio_idx}: {audio_size / 1024:.1f}KB")

        # Embedding binaire (pkl)
        embedding_idx = binary_frame_info.get('embedding')
        if embedding_idx and embedding_idx <= len(binary_frames):
            request_data['_embeddingBinary'] = binary_frames[embedding_idx - 1]
            embedding_size = len(binary_frames[embedding_idx - 1])
            logger.info(f"📦 [ZMQ-SERVER] Embedding binaire extrait du frame {embedding_idx}: {embedding_size / 1024:.1f}KB")

    async def _handle_translation_request_multipart(self, frames):
        """Route la requête multipart vers le handler approprié"""
        # Le premier frame contient toujours le JSON
        metadata_frame = frames[0]
        binary_frames = frames[1:] if len(frames) > 1 else []

        # Parser le JSON
        request_data = json.loads(metadata_frame.decode('utf-8'))
        request_type = request_data.get('type', 'translation')

        # Router vers le handler approprié
        if request_type == 'translation':
            await self.translation_handler._handle_translation_request_multipart(frames)
        elif request_type == 'audio_process':
            # Injecter les binaires dans request_data pour audio_process
            self._inject_binary_frames(request_data, binary_frames)
            await self.audio_handler._handle_audio_process_request(request_data)
        elif request_type == 'transcription_only':
            # Injecter les binaires dans request_data pour transcription_only
            self._inject_binary_frames(request_data, binary_frames)
            await self.transcription_handler._handle_transcription_only_request(request_data)
        elif request_type == 'voice_api':
            await self.voice_handler._handle_voice_api_request(request_data)
        elif request_type == 'voice_profile':
            await self.voice_handler._handle_voice_profile_request(request_data)
        else:
            logger.warning(f"Type de requête inconnu: {request_type}")

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
        """Configure les services Voice API"""
        if self.voice_handler:
            self.voice_handler.set_voice_api_services(
                transcription_service=transcription_service,
                translation_service=translation_service,
                voice_clone_service=voice_clone_service,
                tts_service=tts_service,
                voice_analyzer=voice_analyzer,
                translation_pipeline=translation_pipeline,
                analytics_service=analytics_service
            )

    async def _publish_translation_result(self, task_id: str, result: dict, target_language: str):
        """Délègue la publication au handler de traduction"""
        if self.translation_handler:
            await self.translation_handler._publish_translation_result(task_id, result, target_language)

    # ══════════════════════════════════════════════════════════════
    # Lifecycle et monitoring
    # ══════════════════════════════════════════════════════════════

    async def stop(self):
        """Arrête le serveur"""
        self.running = False

        # Arrêter le monitoring CPU
        if self._cpu_update_task:
            self._cpu_update_task.cancel()
            try:
                await self._cpu_update_task
            except asyncio.CancelledError:
                pass

        # Arrêter les workers
        await self.pool_manager.stop_workers()

        # Attendre que tous les workers se terminent
        if self.worker_tasks:
            await asyncio.gather(*self.worker_tasks, return_exceptions=True)
        
        # Fermer la connexion à la base de données
        await self.database_service.disconnect()
        
        # Fermer les sockets
        if self.pull_socket:
            self.pull_socket.close()
        if self.pub_socket:
            self.pub_socket.close()
        
        logger.info("ZMQTranslationServer arrêté")
    
    def get_stats(self) -> dict:
        """Retourne les statistiques du serveur"""
        pool_stats = self.pool_manager.get_stats()

        return {
            'server_status': 'running' if self.running else 'stopped',
            'gateway_push_port': self.gateway_push_port,
            'gateway_sub_port': self.gateway_sub_port,
            'normal_workers': self.pool_manager.normal_pool.current_workers,
            'any_workers': self.pool_manager.any_pool.current_workers,
            **pool_stats
        }
    
    async def health_check(self) -> dict:
        """Vérification de santé du serveur"""
        try:
            stats = self.get_stats()
            return {
                'status': 'healthy',
                'running': self.running,
                'stats': stats
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }
