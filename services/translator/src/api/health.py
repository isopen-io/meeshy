"""
API de santé pour le service de traduction Meeshy
Routes complètes de monitoring et health checks avec statut DB, ZMQ et ML
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
import time
import logging
import asyncio

logger = logging.getLogger(__name__)

# Variables globales pour les services
translation_service = None
database_service = None
zmq_server = None

# Temps de démarrage
startup_time = time.time()

def set_services(trans_service=None, db_service=None, zmq_srv=None):
    """Configure les références vers les services pour le monitoring"""
    global translation_service, database_service, zmq_server
    if trans_service:
        translation_service = trans_service
    if db_service:
        database_service = db_service
    if zmq_srv:
        zmq_server = zmq_srv

async def check_database_health() -> Dict[str, Any]:
    """Vérifie l'état de santé de la base de données"""
    if database_service is None:
        return {
            "connected": False,
            "status": "service_not_initialized",
            "error": "Database service not configured"
        }
    
    try:
        if hasattr(database_service, 'health_check'):
            return await database_service.health_check()
        else:
            # Pour le service temporaire
            return {
                "connected": database_service.is_connected if hasattr(database_service, 'is_connected') else False,
                "status": "degraded_mode",
                "mode": "temporary_service",
                "note": "Using temporary database service"
            }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "connected": False,
            "status": "error",
            "error": str(e)
        }

async def check_zmq_health() -> Dict[str, Any]:
    """Vérifie l'état de santé du serveur ZMQ"""
    if zmq_server is None:
        return {
            "running": False,
            "status": "service_not_initialized",
            "error": "ZMQ server not configured"
        }
    
    try:
        # Vérifier si le serveur ZMQ a une méthode de health check
        if hasattr(zmq_server, 'is_running'):
            running = zmq_server.is_running
        elif hasattr(zmq_server, 'context') and zmq_server.context:
            running = not zmq_server.context.closed
        else:
            running = zmq_server is not None
            
        return {
            "running": running,
            "status": "healthy" if running else "stopped",
            "port": getattr(zmq_server, 'port', 5555),
            "address": f"tcp://0.0.0.0:{getattr(zmq_server, 'port', 5555)}"
        }
    except Exception as e:
        logger.error(f"ZMQ health check failed: {e}")
        return {
            "running": False,
            "status": "error",
            "error": str(e)
        }

async def check_models_health() -> Dict[str, Any]:
    """Vérifie l'état des modèles de traduction"""
    if translation_service is None:
        return {
            "loaded": False,
            "count": 0,
            "models": {},
            "status": "service_not_initialized"
        }
    
    try:
        models_info = {}
        models_count = 0
        
        # Vérifier les modèles chargés avec gestion d'erreur
        try:
            if hasattr(translation_service, 'models') and translation_service.models:
                models_count = len(translation_service.models)
                for model_name in translation_service.models.keys():
                    models_info[str(model_name)] = {
                        "loaded": True,
                        "type": "transformer_model"
                    }
        except Exception as e:
            logger.warning(f"Erreur lors de la vérification des modèles: {e}")
        
        # Vérifier les pipelines avec gestion d'erreur
        pipelines_count = 0
        try:
            if hasattr(translation_service, 'pipelines') and translation_service.pipelines:
                pipelines_count = len(translation_service.pipelines)
                for pipeline_name in translation_service.pipelines.keys():
                    pipeline_key = str(pipeline_name)
                    if pipeline_key in models_info:
                        models_info[pipeline_key]["pipeline_ready"] = True
                    else:
                        models_info[pipeline_key] = {
                            "loaded": True,
                            "type": "pipeline_only",
                            "pipeline_ready": True
                        }
        except Exception as e:
            logger.warning(f"Erreur lors de la vérification des pipelines: {e}")
        
        # Déterminer le statut global des modèles
        if models_count == 0 and pipelines_count == 0:
            status = "degraded_mode"
        elif models_count > 0 or pipelines_count > 0:
            status = "healthy"
        else:
            status = "unknown"
        
        # Vérifier le mode dégradé avec gestion d'erreur
        degraded_mode = False
        try:
            degraded_mode = hasattr(translation_service, 'degraded_mode') and translation_service.degraded_mode
        except Exception as e:
            logger.warning(f"Impossible de vérifier le mode dégradé: {e}")
            
        return {
            "loaded": models_count > 0 or pipelines_count > 0,
            "count": max(models_count, pipelines_count),
            "models_count": models_count,
            "pipelines_count": pipelines_count,
            "models": models_info,
            "status": status,
            "degraded_mode": degraded_mode
        }
        
    except Exception as e:
        logger.error(f"Models health check failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "loaded": False,
            "count": 0,
            "models": {},
            "status": "error",
            "error": str(e)
        }

# Router pour les routes de santé
health_router = APIRouter(prefix="", tags=["health"])

@health_router.get("/health")
async def comprehensive_health_check() -> Dict[str, Any]:
    """Health check complet avec état de tous les composants"""
    try:
        # Exécuter les vérifications en parallèle
        db_health, zmq_health, models_health = await asyncio.gather(
            check_database_health(),
            check_zmq_health(),
            check_models_health(),
            return_exceptions=True
        )
        
        # Gérer les exceptions
        if isinstance(db_health, Exception):
            db_health = {"connected": False, "status": "error", "error": str(db_health)}
        if isinstance(zmq_health, Exception):
            zmq_health = {"running": False, "status": "error", "error": str(zmq_health)}
        if isinstance(models_health, Exception):
            models_health = {"loaded": False, "status": "error", "error": str(models_health)}
        
        # Déterminer le statut global
        db_ok = db_health.get("connected", False) or db_health.get("status") == "degraded_mode"
        zmq_ok = zmq_health.get("running", False)
        models_ok = models_health.get("loaded", False) or models_health.get("status") == "degraded_mode"
        
        # Le service est "healthy" dès que le serveur démarre (même sans modèles)
        # Les modèles se chargent en arrière-plan
        models_loading = not models_health.get("loaded", False)
        
        if db_ok and zmq_ok:
            if models_ok:
                overall_status = "healthy"
            elif models_loading:
                overall_status = "healthy"  # Healthy même si modèles en cours de chargement
            else:
                overall_status = "degraded"  # Erreur de chargement des modèles
        else:
            overall_status = "unhealthy"  # DB ou ZMQ non disponible
        
        # Uptime
        uptime_seconds = time.time() - startup_time
        
        return {
            "status": overall_status,
            "service": "meeshy-translator",
            "version": "1.0.0", 
            "timestamp": time.time(),
            "uptime_seconds": uptime_seconds,
            "models_loading": models_loading,  # Indicateur de chargement en cours
            "components": {
                "database": db_health,
                "zmq_server": zmq_health,
                "translation_models": models_health
            },
            "summary": {
                "database_connected": db_ok,
                "zmq_running": zmq_ok,
                "models_loaded": models_ok,
                "models_loading": models_loading,
                "total_models": models_health.get("count", 0)
            }
        }
        
    except Exception as e:
        logger.error(f"Comprehensive health check failed: {e}")
        return {
            "status": "error",
            "service": "meeshy-translator",
            "version": "1.0.0",
            "timestamp": time.time(),
            "error": str(e),
            "uptime_seconds": time.time() - startup_time
        }

@health_router.get("/ready")
async def readiness_check() -> Dict[str, Any]:
    """Vérification de disponibilité - service prêt à traiter les requêtes"""
    try:
        # Vérifications critiques pour la disponibilité
        db_health = await check_database_health()
        zmq_health = await check_zmq_health()
        
        db_ready = db_health.get("connected", False) or db_health.get("status") == "degraded_mode"
        zmq_ready = zmq_health.get("running", False)
        
        if not (db_ready and zmq_ready):
            raise HTTPException(
                status_code=503, 
                detail={
                    "message": "Service not ready",
                    "database_ready": db_ready,
                    "zmq_ready": zmq_ready
                }
            )
        
        return {
            "status": "ready",
            "message": "Service ready to handle translation requests",
            "database_ready": db_ready,
            "zmq_ready": zmq_ready
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Readiness check failed: {str(e)}")

@health_router.get("/live")
async def liveness_check() -> Dict[str, Any]:
    """Vérification de vitalité - service vivant"""
    return {
        "status": "alive",
        "service": "meeshy-translator",
        "timestamp": time.time(),
        "uptime_seconds": time.time() - startup_time
    }
