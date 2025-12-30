"""
Meeshy Translation API - FastAPI Application
API REST pour le service de traduction multi-langues
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
import asyncio

# Import du health router
from api.health import health_router, set_services
from config.message_limits import can_translate_message, MessageLimits

# Import du audio router (lazy loading)
try:
    from api.audio_api import create_audio_router
    AUDIO_API_AVAILABLE = True
except ImportError:
    AUDIO_API_AVAILABLE = False

logger = logging.getLogger(__name__)

# ===== MODÈLES PYDANTIC =====

class TranslationRequest(BaseModel):
    """Requête de traduction"""
    text: str = Field(..., min_length=1, max_length=100000)  # Limite très élevée, découpage par paragraphes
    source_language: str = Field(default="auto", description="Langue source (auto pour détection)")
    target_language: str = Field(..., description="Langue cible")
    model_type: str = Field(default="basic", description="Type de modèle: basic, medium, premium")

class TranslationResponse(BaseModel):
    """Réponse de traduction"""
    original_text: str
    translated_text: str
    source_language: str
    target_language: str
    model_used: str
    confidence_score: float
    processing_time_ms: int
    from_cache: bool

class HealthResponse(BaseModel):
    """Réponse de santé du service"""
    status: str
    version: str
    models_loaded: Dict[str, bool]
    uptime_seconds: float

class ErrorResponse(BaseModel):
    """Réponse d'erreur standardisée"""
    error: str
    detail: str
    error_code: str

# ===== API FASTAPI =====

class TranslationAPI:
    """API FastAPI pour le service de traduction"""

    def __init__(
        self,
        translation_service,
        database_service=None,
        zmq_server=None,
        # Audio processing services (optional)
        transcription_service=None,
        voice_clone_service=None,
        tts_service=None,
        audio_pipeline=None
    ):
        self.translation_service = translation_service
        self.database_service = database_service
        self.zmq_server = zmq_server

        # Audio services
        self.transcription_service = transcription_service
        self.voice_clone_service = voice_clone_service
        self.tts_service = tts_service
        self.audio_pipeline = audio_pipeline

        self.app = FastAPI(
            title="Meeshy Translation API",
            description="Service de traduction multi-langues avec ML et audio processing",
            version="1.1.0",
            docs_url="/docs",
            redoc_url="/redoc"
        )

        # Configuration CORS
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Configurer les services pour le health check
        set_services(
            trans_service=translation_service,
            db_service=database_service,
            zmq_srv=zmq_server
        )

        # Inclure le routeur de santé principal
        self.app.include_router(health_router)

        # Inclure le routeur audio si disponible
        if AUDIO_API_AVAILABLE:
            audio_router = create_audio_router(
                transcription_service=transcription_service,
                voice_clone_service=voice_clone_service,
                tts_service=tts_service,
                translation_service=translation_service,
                audio_pipeline=audio_pipeline
            )
            self.app.include_router(audio_router)
            logger.info("[TRANSLATOR] 🎤 Audio API routes registered")

        # Enregistrer les autres routes
        self._register_routes()

        # Variables de monitoring
        self.start_time = None
    
    def _register_routes(self):
        """Enregistre toutes les routes de l'API"""
        
        @self.app.on_event("startup")
        async def startup_event():
            import time
            self.start_time = time.time()
            logger.info("[TRANSLATOR] 🚀 API FastAPI démarrée")
        
        @self.app.on_event("shutdown")
        async def shutdown_event():
            logger.info("[TRANSLATOR] 🛑 API FastAPI arrêtée")
        
        # ===== ROUTES DE TRADUCTION =====
        
        @self.app.post("/translate", response_model=TranslationResponse)
        async def translate_text(request: TranslationRequest):
            """Traduit un texte vers la langue cible"""
            try:
                import time
                start_time = time.time()
                
                logger.info(f"🌐 [TRANSLATOR-API] Requête REST reçue: texte='{request.text[:50]}...', source={request.source_language}, target={request.target_language}, modèle={request.model_type}")
                
                # Validation des paramètres
                if not request.text.strip():
                    raise HTTPException(status_code=400, detail="Text cannot be empty")
                
                # Vérification de la longueur pour la traduction
                if not can_translate_message(request.text):
                    logger.warning(f"⚠️ [TRANSLATOR-API] Message too long to be translated: {len(request.text)} caractères (max: {MessageLimits.MAX_TRANSLATION_LENGTH})")
                    # Retourner le texte original sans traduction
                    return TranslationResponse(
                        original_text=request.text,
                        translated_text=request.text,
                        source_language=request.source_language,
                        target_language=request.target_language,
                        model_used="none",
                        confidence_score=1.0,
                        processing_time_ms=0,
                        from_cache=False
                    )
                
                # OPTIMISATION: Éviter la traduction si source = target
                if request.source_language != "auto" and request.source_language == request.target_language:
                    logger.info(f"🔄 [TRANSLATOR-API] Langues identiques ({request.source_language} → {request.target_language}), pas de traduction nécessaire")
                    return TranslationResponse(
                        original_text=request.text,
                        translated_text=request.text,
                        source_language=request.source_language,
                        target_language=request.target_language,
                        model_used="none",
                        confidence_score=1.0,
                        processing_time_ms=0,
                        from_cache=False
                    )
                
                # Appel au service de traduction unifié avec préservation de structure
                # La méthode translate_with_structure détecte automatiquement si le texte
                # nécessite une traduction structurée (paragraphes, emojis) ou non
                result = await self.translation_service.translate_with_structure(
                    text=request.text,
                    source_language=request.source_language,
                    target_language=request.target_language,
                    model_type=request.model_type,
                    source_channel='rest'  # Identifier le canal source
                )
                
                processing_time = int((time.time() - start_time) * 1000)
                
                logger.info(f"✅ [TRANSLATOR-API] Traduction REST terminée: '{request.text[:30]}...' → '{result.get('translated_text', '')[:30]}...' ({processing_time}ms)")
                
                return TranslationResponse(
                    original_text=request.text,
                    translated_text=result.get('translated_text', request.text),
                    source_language=result.get('detected_language', request.source_language),
                    target_language=request.target_language,
                    model_used=result.get('model_used', request.model_type),
                    confidence_score=result.get('confidence', 0.9),
                    processing_time_ms=processing_time,
                    from_cache=result.get('from_cache', False)
                )
                
            except Exception as e:
                logger.error(f"[TRANSLATOR] ❌ Erreur traduction API: {e}")
                import traceback
                traceback.print_exc()
                raise HTTPException(
                    status_code=500, 
                    detail=f"Translation failed: {str(e)}"
                )
        
        @self.app.post("/translate/batch")
        async def translate_batch(requests: List[TranslationRequest]):
            """Traduit plusieurs textes en lot"""
            if len(requests) > 10:
                raise HTTPException(status_code=400, detail="Maximum 10 requests per batch")
            
            results = []
            for req in requests:
                try:
                    # Réutiliser la route individuelle
                    result = await translate_text(req)
                    results.append(result)
                except Exception as e:
                    results.append({
                        "error": str(e),
                        "original_text": req.text
                    })
            
            return {"results": results}
        
        # ===== ROUTES D'INFORMATION =====
        
        @self.app.get("/languages")
        async def get_supported_languages():
            """Retourne les langues supportées"""
            languages = {
                "fr": "Français",
                "en": "English", 
                "es": "Español",
                "de": "Deutsch",
                "pt": "Português",
                "zh": "中文",
                "ja": "日本語",
                "ar": "العربية"
            }
            return {"supported_languages": languages}
        
        @self.app.get("/models")
        async def get_available_models():
            """Retourne les modèles disponibles"""
            models = {
                "basic": {
                    "name": "T5-Small",
                    "description": "Modèle rapide pour traductions courantes",
                    "languages": ["fr", "en", "es", "de"]
                },
                "medium": {
                    "name": "NLLB-200-Distilled-600M",
                    "description": "Modèle équilibré qualité/vitesse",
                    "languages": ["fr", "en", "es", "de", "pt", "zh", "ja", "ar"]
                },
                "premium": {
                    "name": "NLLB-200-Distilled-1.3B",
                    "description": "Modèle haute qualité",
                    "languages": ["fr", "en", "es", "de", "pt", "zh", "ja", "ar"]
                }
            }
            return {"available_models": models}
        
        # ===== ROUTES DE DEBUG =====
        
        @self.app.get("/debug/cache")
        async def get_cache_stats():
            """Statistiques du cache (debug)"""
            if hasattr(self.translation_service, 'cache_service'):
                stats = await self.translation_service.cache_service.get_stats()
                return {"cache_stats": stats}
            return {"message": "Cache service not available"}
        
        @self.app.post("/debug/clear-cache")
        async def clear_cache():
            """Vide le cache (debug)"""
            if hasattr(self.translation_service, 'cache_service'):
                await self.translation_service.cache_service.clear_all()
                return {"message": "Cache cleared"}
            return {"message": "Cache service not available"}
