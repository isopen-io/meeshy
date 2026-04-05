"""
Serveur de traduction haute performance Meeshy
Architecture: PUB/SUB + REQ/REP avec pool de connexions et traitement asynchrone
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

# Charger les variables d'environnement
try:
    from dotenv import load_dotenv
    # Load .env from parent directory (translator/.env)
    env_path = Path(__file__).parent.parent / '.env'
    env_local_path = Path(__file__).parent.parent / '.env.local'
    
    if env_path.exists():
        load_dotenv(env_path)
        print(f"[TRANSLATOR] ✅ Variables d'environnement chargées depuis {env_path}")
    else:
        print(f"[TRANSLATOR] ⚠️ Fichier .env non trouvé: {env_path}")
    
    # Then load .env.local (overrides base - local development)
    if env_local_path.exists():
        load_dotenv(env_local_path, override=True)
        print("[TRANSLATOR] ✅ Variables d'environnement .env.local chargées (override)")
        print(f"[TRANSLATOR] 🔍 MODELS_PATH depuis .env.local: {os.getenv('MODELS_PATH', 'NOT SET')}")
        print(f"[TRANSLATOR] 🔍 HF_HOME depuis .env.local: {os.getenv('HF_HOME', 'NOT SET')}")
        print(f"[TRANSLATOR] 🔍 TRANSFORMERS_CACHE depuis .env.local: {os.getenv('TRANSFORMERS_CACHE', 'NOT SET')}")
except ImportError:
    print("[TRANSLATOR] ⚠️ python-dotenv non disponible, utilisation des variables système")

# Ajouter le répertoire src au path
src_path = Path(__file__).parent
sys.path.insert(0, str(src_path))

# ═══════════════════════════════════════════════════════════════════
# FILTRAGE DES WARNINGS NON-CRITIQUES
# ═══════════════════════════════════════════════════════════════════
# IMPORTANT: À faire AVANT les imports de bibliothèques (torch, transformers, etc.)
from utils.warning_filters import configure_warning_filters
configure_warning_filters()

from config.settings import Settings
from services.zmq_server import ZMQTranslationServer
from services.translation_ml_service import TranslationMLService

from api.translation_api import TranslationAPI

# Import du service Redis (cache avec fallback mémoire)
REDIS_AVAILABLE = False
try:
    from services.redis_service import get_redis_service, get_audio_cache_service
    REDIS_AVAILABLE = True
except ImportError as e:
    pass  # Will be logged later

# Import des services audio (optionnel)
AUDIO_SERVICES_AVAILABLE = False
UNIFIED_TTS_AVAILABLE = False
try:
    from services.audio_message_pipeline import get_audio_pipeline
    from services.transcription_service import get_transcription_service
    from services.voice_clone_service import get_voice_clone_service
    AUDIO_SERVICES_AVAILABLE = True
except ImportError as e:
    pass  # Will be logged later

# Import du service TTS unifié (Chatterbox, Higgs Audio V2, XTTS, MMS)
try:
    from services.tts.tts_service import (
        get_tts_service,
        TTSService,
        TTSModel,
        TTS_MODEL_INFO,
        check_license_compliance
    )
    # Alias pour compatibilité avec ancien code
    get_unified_tts_service = get_tts_service
    UnifiedTTSService = TTSService
    UNIFIED_TTS_AVAILABLE = True
    print("[TRANSLATOR] ✅ Service TTS unifié importé avec succès")
except ImportError as e:
    print(f"[TRANSLATOR] ❌ CRITIQUE: Échec import TTS unifié: {e}")
    import traceback
    traceback.print_exc()

# Import des services Voice API (optionnel)
VOICE_API_AVAILABLE = False
try:
    from services.voice_analyzer_service import get_voice_analyzer_service
    from services.translation_pipeline_service import get_translation_pipeline_service
    from services.analytics_service import get_analytics_service
    from api.voice_api import create_voice_api_router
    VOICE_API_AVAILABLE = True
except ImportError as e:
    pass  # Will be logged later

# Import de l'API TTS Models (optionnel)
TTS_MODELS_API_AVAILABLE = False
try:
    from api.tts_models_api import create_tts_models_router
    TTS_MODELS_API_AVAILABLE = True
except ImportError as e:
    pass  # Will be logged later

# Configuration du logging
# Configurable via LOG_LEVEL env var (default: INFO en dev, INFO en prod pour visibilite startup)
log_level_str = os.getenv('LOG_LEVEL', 'INFO').upper()
log_level = getattr(logging, log_level_str, logging.INFO)

logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('translator.log', mode='w')
    ]
)

# Reduire le bruit des libs externes en production
if os.getenv('NODE_ENV') == 'production':
    for noisy in ['urllib3', 'httpx', 'httpcore', 'transformers', 'torch', 'diffusers', 'huggingface_hub']:
        logging.getLogger(noisy).setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

class MeeshyTranslationServer:
    """Serveur de traduction haute performance Meeshy"""

    def __init__(self):
        self.settings = Settings()
        # Afficher et créer les répertoires de modèles
        self.settings.ensure_model_directories()
        self.translation_service = None
        self.zmq_server = None
        self.translation_api = None
        self.redis_service = None
        self.audio_cache_service = None
        self.is_initialized = False
    
    async def initialize(self) -> bool:
        """Initialise le serveur de traduction (sans charger les modèles immédiatement)"""
        try:
            logger.info("[TRANSLATOR] 🚀 Initialisation du serveur de traduction avec TranslationMLService...")
            
            # 1. Initialiser le service ML unifié (sans charger les modèles)
            max_workers = int(os.getenv('TRANSLATION_WORKERS', '50'))
            quantization_level = os.getenv('QUANTIZATION_LEVEL', 'float16')
            
            # Utiliser le service ML unifié avec tous les modèles
            self.translation_service = TranslationMLService(self.settings, model_type="all", max_workers=max_workers, quantization_level=quantization_level)
            
            logger.info(f"[TRANSLATOR] ✅ Service ML unifié créé (modèles seront chargés en arrière-plan)")
            logger.info(f"[TRANSLATOR] 📚 Le chargement des modèles ML démarrera après le serveur FastAPI...")

            # 1.5 Initialiser le service Redis (cache avec fallback mémoire)
            if REDIS_AVAILABLE:
                try:
                    logger.info("[TRANSLATOR] 🔴 Initialisation du service Redis...")
                    self.redis_service = get_redis_service()
                    await self.redis_service.initialize()
                    self.audio_cache_service = get_audio_cache_service(self.settings)

                    stats = self.redis_service.get_stats()
                    logger.info(f"[TRANSLATOR] ✅ Service Redis initialisé (mode: {stats['mode']})")
                except Exception as e:
                    logger.warning(f"[TRANSLATOR] ⚠️ Erreur init Redis: {e} - cache mémoire utilisé")

            # 2. Initialiser le serveur ZMQ avec le service ML unifié
            zmq_push_port = int(os.getenv('TRANSLATOR_ZMQ_PULL_PORT', '5555'))
            zmq_pub_port = int(os.getenv('TRANSLATOR_ZMQ_PUB_PORT', '5558'))
            
            # Configuration des workers avec valeurs configurables
            normal_workers_default = int(os.getenv('NORMAL_WORKERS_DEFAULT', '20'))
            any_workers_default = int(os.getenv('ANY_WORKERS_DEFAULT', '10'))
            
            # Calculer les workers en fonction de max_workers si pas configuré explicitement
            if os.getenv('NORMAL_WORKERS_DEFAULT') is None:
                normal_workers = max(normal_workers_default, max_workers // 2)
            else:
                normal_workers = normal_workers_default
                
            if os.getenv('ANY_WORKERS_DEFAULT') is None:
                any_workers = max(any_workers_default, max_workers // 4)
            else:
                any_workers = any_workers_default
            
            # TRANSLATOR N'A PAS BESOIN DE MongoDB - utilise uniquement Redis pour le cache
            # Les profils vocaux sont gérés par le Gateway, pas par le Translator
            database_url = None  # Désactivé : Translator n'accède pas à MongoDB

            self.zmq_server = ZMQTranslationServer(
                gateway_push_port=zmq_push_port,
                gateway_sub_port=zmq_pub_port,
                normal_workers=normal_workers,
                any_workers=any_workers,
                translation_service=self.translation_service,
                database_url=database_url
            )
            
            logger.info(f"[TRANSLATOR] 🔧 Configuration workers haute performance: normal={normal_workers}, any={any_workers}, total={normal_workers + any_workers}")
            logger.info(f"[TRANSLATOR] 🚀 Capacité estimée: ~{normal_workers + any_workers} traductions simultanées")
            # Initialiser le serveur ZMQ
            await self.zmq_server.initialize()
            logger.info("[TRANSLATOR] ✅ Serveur ZMQ configuré avec service ML unifié")
            
            # 3. Initialiser les services audio si disponibles
            audio_pipeline = None
            transcription_service = None
            voice_clone_service = None
            tts_service = None
            unified_tts_service = None

            # 3.1 Initialiser le service TTS unifié (Chatterbox, Higgs Audio V2, XTTS)
            if UNIFIED_TTS_AVAILABLE:
                try:
                    tts_model_name = self.settings.tts_model
                    logger.info(f"[TRANSLATOR] 🎵 Initialisation du service TTS unifié (modèle: {tts_model_name})...")

                    # Vérifier la licence
                    try:
                        tts_model = TTSModel(tts_model_name)
                        is_commercial_ok, license_warning = check_license_compliance(tts_model)

                        if license_warning:
                            logger.warning(license_warning)
                            print(f"\n{license_warning}\n")

                        if is_commercial_ok:
                            logger.info(f"[TRANSLATOR] ✅ Modèle TTS '{tts_model_name}' - Licence commerciale OK")
                        else:
                            logger.warning(f"[TRANSLATOR] ⚠️ Modèle TTS '{tts_model_name}' - Usage commercial LIMITÉ")
                    except ValueError:
                        logger.warning(f"[TRANSLATOR] ⚠️ Modèle TTS inconnu: {tts_model_name}, utilisation de chatterbox par défaut")
                        tts_model = TTSModel.CHATTERBOX

                    unified_tts_service = get_unified_tts_service()

                    # CRITIQUE: Initialiser le service TTS pour charger le modèle
                    logger.info(f"[TRANSLATOR] 🔄 Initialisation du modèle TTS {tts_model.value}...")
                    tts_initialized = await unified_tts_service.initialize(tts_model)

                    if tts_initialized:
                        # Utiliser model_manager.active_model au lieu de current_model (qui n'existe pas)
                        active_model = unified_tts_service.model_manager.active_model
                        model_name = active_model.value if active_model else tts_model.value
                        logger.info(f"[TRANSLATOR] ✅ Service TTS unifié initialisé: {model_name}")
                    else:
                        logger.warning(
                            f"[TRANSLATOR] ⚠️ TTS non initialisé immédiatement, "
                            f"téléchargement en arrière-plan de {tts_model.value}"
                        )

                except Exception as e:
                    logger.warning(f"[TRANSLATOR] ⚠️ Erreur init TTS unifié: {e}")
                    import traceback
                    traceback.print_exc()

            if AUDIO_SERVICES_AVAILABLE:
                try:
                    logger.info("[TRANSLATOR] 🎤 Initialisation des services audio...")
                    transcription_service = get_transcription_service()
                    voice_clone_service = get_voice_clone_service()

                    # Injecter MongoDB pour persistance des profils vocaux
                    voice_clone_service.set_database_service(self.zmq_server.database_service)
                    logger.info("[TRANSLATOR] ✅ Voice clone: MongoDB configure")

                    # Utiliser le service TTS unifie si disponible, sinon l'ancien
                    if unified_tts_service:
                        tts_service = unified_tts_service
                        logger.info("[TRANSLATOR] ✅ Utilisation du service TTS unifie (Chatterbox/Higgs/XTTS)")
                    else:
                        tts_service = get_tts_service()
                        logger.info("[TRANSLATOR] ⚠️ Utilisation du service TTS legacy (XTTS)")

                    audio_pipeline = get_audio_pipeline()

                    # Injecter les dependances
                    audio_pipeline.set_translation_service(self.translation_service)
                    audio_pipeline.set_database_service(self.zmq_server.database_service)

                    logger.info("[TRANSLATOR] ✅ Services audio configures")
                except Exception as e:
                    logger.warning(f"[TRANSLATOR] ⚠️ Erreur init services audio: {e}")

            # 4. Initialiser les services Voice API si disponibles
            voice_analyzer = None
            translation_pipeline = None
            analytics_service = None

            if VOICE_API_AVAILABLE and self.settings.enable_voice_api:
                try:
                    logger.info("[TRANSLATOR] 🎙️ Initialisation des services Voice API...")
                    voice_analyzer = get_voice_analyzer_service()
                    translation_pipeline = get_translation_pipeline_service()
                    analytics_service = get_analytics_service()

                    # Injecter les services dans le pipeline
                    translation_pipeline.set_services(
                        transcription_service=transcription_service,
                        voice_clone_service=voice_clone_service,
                        tts_service=tts_service,
                        translation_service=self.translation_service
                    )

                    # CRITIQUE: Initialiser le pipeline pour créer la queue de jobs
                    pipeline_initialized = await translation_pipeline.initialize()

                    # FIABILITÉ: Valider que le pipeline est bien initialisé
                    if not pipeline_initialized or not translation_pipeline.is_initialized:
                        raise RuntimeError(
                            "Translation pipeline initialization failed - workers not started"
                        )

                    logger.info(
                        f"[TRANSLATOR] ✅ Services Voice API configurés "
                        f"(pipeline: {len(translation_pipeline._workers)} workers)"
                    )
                except Exception as e:
                    logger.warning(f"[TRANSLATOR] ⚠️ Erreur init services Voice API: {e}")
                    import traceback
                    traceback.print_exc()

            # 4.5 Configurer les services dans le ZMQ server pour Voice Profile handler
            # Ceci est nécessaire pour que le Voice Profile handler puisse créer des profils vocaux
            self.zmq_server.set_voice_api_services(
                transcription_service=transcription_service,
                translation_service=self.translation_service,
                voice_clone_service=voice_clone_service,
                tts_service=tts_service,
                voice_analyzer=voice_analyzer,
                translation_pipeline=translation_pipeline,
                analytics_service=analytics_service
            )

            # 5. Initialiser l'API FastAPI avec le service ML unifié
            self.translation_api = TranslationAPI(
                translation_service=self.translation_service,
                database_service=self.zmq_server.database_service,
                zmq_server=self.zmq_server,
                # Audio services
                transcription_service=transcription_service,
                voice_clone_service=voice_clone_service,
                tts_service=tts_service,
                audio_pipeline=audio_pipeline
            )

            # 6. Ajouter le routeur Voice API si disponible
            if VOICE_API_AVAILABLE and self.settings.enable_voice_api:
                try:
                    voice_router = create_voice_api_router(
                        transcription_service=transcription_service,
                        voice_clone_service=voice_clone_service,
                        tts_service=tts_service,
                        translation_service=self.translation_service,
                        translation_pipeline=translation_pipeline,
                        voice_analyzer=voice_analyzer,
                        analytics_service=analytics_service
                    )
                    self.translation_api.app.include_router(voice_router)
                    logger.info("[TRANSLATOR] ✅ Voice API Router ajouté (20+ endpoints)")
                except Exception as e:
                    logger.warning(f"[TRANSLATOR] ⚠️ Erreur ajout Voice API Router: {e}")

            # 7. Ajouter le routeur TTS Models API si disponible
            if TTS_MODELS_API_AVAILABLE and unified_tts_service:
                try:
                    tts_models_router = create_tts_models_router(
                        unified_tts_service=unified_tts_service
                    )
                    self.translation_api.app.include_router(tts_models_router)
                    logger.info("[TRANSLATOR] ✅ TTS Models API Router ajouté (gestion Chatterbox/Higgs/XTTS)")
                except Exception as e:
                    logger.warning(f"[TRANSLATOR] ⚠️ Erreur ajout TTS Models API Router: {e}")

            logger.info("[TRANSLATOR] ✅ API FastAPI configurée avec service ML unifié")
            
            self.is_initialized = True
            logger.info("[TRANSLATOR] ✅ Architecture unifiée initialisée avec succès")
            logger.info(f"[TRANSLATOR] 🎯 Serveur prêt, modèles ML se chargeront en arrière-plan")
            
            return True
            
        except Exception as e:
            logger.error(f"[TRANSLATOR] ❌ Erreur lors de l'initialisation: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def initialize_models_background(self):
        """Charge les modèles ML en arrière-plan après le démarrage du serveur"""
        try:
            logger.info("[TRANSLATOR] 🔄 Démarrage du chargement des modèles ML en arrière-plan...")
            logger.info("[TRANSLATOR] ⏱️ Cette opération prendra environ 2-5 minutes...")
            
            # Charger les modèles ML
            ml_initialized = await self.translation_service.initialize()
            
            if ml_initialized:
                stats = await self.translation_service.get_stats()
                available_models = list(stats.get('models_loaded', {}).keys())
                logger.info(f"[TRANSLATOR] ✅ Modèles ML chargés avec succès: {available_models}")
                logger.info(f"[TRANSLATOR] 🎯 Service de traduction maintenant pleinement opérationnel")
            else:
                logger.error("[TRANSLATOR] ❌ Échec du chargement des modèles ML")
                logger.warning("[TRANSLATOR] ⚠️ Le serveur continue de fonctionner mais les traductions ML ne seront pas disponibles")
                
        except Exception as e:
            logger.error(f"[TRANSLATOR] ❌ Erreur lors du chargement des modèles ML: {e}")
            import traceback
            traceback.print_exc()
    
    async def start_zmq_server(self):
        """Démarre le serveur ZMQ haute performance"""
        try:
            logger.info("[TRANSLATOR] 🔌 Démarrage du serveur ZMQ haute performance...")
            # Marquer le serveur comme démarré
            self.zmq_server.running = True
            logger.info(f"[TRANSLATOR] ✅ Serveur ZMQ marqué comme démarré (running={self.zmq_server.running})")
            # Démarrer le serveur ZMQ en arrière-plan
            task = asyncio.create_task(self.zmq_server.start())
            logger.info("[TRANSLATOR] ✅ Tâche serveur ZMQ créée avec succès")
            return task
        except Exception as e:
            logger.error(f"[TRANSLATOR] ❌ Erreur serveur ZMQ: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    async def start_api_server(self):
        """Démarre l'API FastAPI"""
        try:
            logger.info("[TRANSLATOR] 🌐 Démarrage de l'API FastAPI...")
            import uvicorn

            host = "0.0.0.0"
            port = int(self.settings.fastapi_port or 8000)

            # Configuration SSL/HTTPS si activée
            use_https = os.getenv('USE_HTTPS', 'false').lower() == 'true'
            ssl_keyfile = None
            ssl_certfile = None

            if use_https:
                # Chemins vers les certificats SSL (mêmes certificats que le frontend)
                frontend_cert_dir = Path(__file__).parent.parent.parent / 'frontend' / '.cert'
                ssl_keyfile = str(frontend_cert_dir / 'localhost-key.pem')
                ssl_certfile = str(frontend_cert_dir / 'localhost.pem')

                if not Path(ssl_keyfile).exists() or not Path(ssl_certfile).exists():
                    logger.warning(f"[TRANSLATOR] ⚠️ Certificats SSL non trouvés dans {frontend_cert_dir}")
                    logger.warning("[TRANSLATOR] ⚠️ Démarrage en HTTP au lieu de HTTPS")
                    ssl_keyfile = None
                    ssl_certfile = None
                else:
                    logger.info(f"[TRANSLATOR] 🔒 Mode HTTPS activé avec certificats: {frontend_cert_dir}")

            config = uvicorn.Config(
                app=self.translation_api.app,
                host=host,
                port=port,
                log_level="info",
                access_log=True,
                ssl_keyfile=ssl_keyfile,
                ssl_certfile=ssl_certfile
            )
            
            server = uvicorn.Server(config)
            await server.serve()
            
        except Exception as e:
            logger.error(f"[TRANSLATOR] ❌ Erreur API FastAPI: {e}")
    
    async def start(self):
        """Démarre le serveur de traduction"""
        if not await self.initialize():
            logger.error("[TRANSLATOR] ❌ Échec de l'initialisation, arrêt du serveur")
            return
        
        try:
            logger.info("[TRANSLATOR] 🚀 Démarrage du serveur de traduction haute performance...")
            
            # Démarrer le chargement des modèles ML en arrière-plan
            logger.info("[TRANSLATOR] 🔄 Lancement du chargement des modèles ML en arrière-plan...")
            models_task = asyncio.create_task(self.initialize_models_background())
            
            # Démarrer le serveur ZMQ en arrière-plan
            zmq_task = await self.start_zmq_server()
            if not zmq_task:
                logger.error("[TRANSLATOR] ❌ Impossible de démarrer le serveur ZMQ")
                return
            
            logger.info("[TRANSLATOR] ✅ Serveur ZMQ démarré avec succès")
            logger.info("[TRANSLATOR] 🌐 Démarrage de l'API FastAPI (serveur prêt immédiatement)...")
            
            # Démarrer l'API FastAPI - le serveur sera healthy immédiatement
            api_task = asyncio.create_task(self.start_api_server())
            
            # Attendre que les tâches se terminent (models_task va se terminer quand les modèles sont chargés)
            await asyncio.gather(zmq_task, api_task, models_task, return_exceptions=True)
            
        except KeyboardInterrupt:
            logger.info("[TRANSLATOR] 🛑 Arrêt demandé par l'utilisateur")
        except Exception as e:
            logger.error(f"[TRANSLATOR] ❌ Erreur serveur: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await self.stop()
    
    async def stop(self):
        """Arrête le serveur de traduction"""
        logger.info("🛑 Arrêt du serveur de traduction haute performance...")

        try:
            if self.zmq_server:
                await self.zmq_server.stop()

            if self.translation_service:
                await self.translation_service.close()

            if self.redis_service:
                await self.redis_service.close()

            logger.info("✅ Serveur de traduction haute performance arrêté")

        except Exception as e:
            logger.error(f"❌ Erreur lors de l'arrêt: {e}")

async def main():
    """Point d'entrée principal"""
    logger.info("[TRANSLATOR] 🚀 Démarrage de la fonction main()")
    server = MeeshyTranslationServer()
    # DEBUG: Logs réduits de 60% - Suppression des confirmations de création
    await server.start()
    # DEBUG: Logs réduits de 60% - Suppression des confirmations de fin

if __name__ == "__main__":
    try:
        logger.info("[TRANSLATOR] 🚀 Point d'entrée __main__ atteint")
        asyncio.run(main())
        logger.info("[TRANSLATOR] ✅ asyncio.run(main()) terminé")
    except KeyboardInterrupt:
        logger.info("🛑 Arrêt du programme")
    except Exception as e:
        logger.error(f"❌ Erreur fatale: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
