"""
TTS Models Management API - REST Endpoints
Gestion des modèles TTS (Chatterbox, Higgs Audio V2, XTTS)

Endpoints:
- GET /v1/tts/models - Liste tous les modèles disponibles
- GET /v1/tts/models/current - Modèle actuel
- GET /v1/tts/models/status - Statut de tous les modèles (local/téléchargé/chargé)
- POST /v1/tts/models/switch - Changer de modèle (hot-loading)
- POST /v1/tts/models/{model}/download - Télécharger un modèle
- GET /v1/tts/models/{model}/info - Infos détaillées d'un modèle
- GET /v1/tts/models/{model}/license - Informations de licence
"""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════

class TTSModelInfoResponse(BaseModel):
    """Informations sur un modèle TTS"""
    name: str
    display_name: str
    license: str
    commercial_use: bool
    license_warning: Optional[str]
    languages: List[str]
    languages_count: int
    min_audio_seconds: float
    quality_score: int
    speed_score: int
    vram_gb: float
    model_size_gb: float
    is_recommended: bool = False


class TTSModelStatusResponse(BaseModel):
    """Statut d'un modèle TTS"""
    model: str
    is_available: bool       # Package Python installé
    is_downloaded: bool      # Modèle téléchargé localement
    is_loaded: bool          # Modèle chargé en mémoire (actif)
    is_downloading: bool     # Téléchargement en cours
    download_progress: float # Progression 0-100


class TTSAllModelsStatusResponse(BaseModel):
    """Statut de tous les modèles"""
    current_model: str
    fallback_model: str
    disk_space_available_gb: float
    models: Dict[str, TTSModelStatusResponse]


class TTSModelsListResponse(BaseModel):
    """Liste des modèles TTS disponibles"""
    models: Dict[str, TTSModelInfoResponse]
    current_model: str
    recommended_model: str = "chatterbox"


class TTSModelSwitchRequest(BaseModel):
    """Requête de changement de modèle"""
    model: str = Field(..., description="Model name: chatterbox, chatterbox-turbo, higgs-audio-v2, xtts-v2")
    acknowledge_license: bool = Field(False, description="Acknowledge license restrictions for non-commercial models")
    force: bool = Field(False, description="Force reload even if already active")


class TTSModelSwitchResponse(BaseModel):
    """Réponse de changement de modèle"""
    success: bool
    previous_model: str
    new_model: str
    license_warning: Optional[str]
    message: str


class TTSModelDownloadRequest(BaseModel):
    """Requête de téléchargement d'un modèle"""
    background: bool = Field(True, description="Download in background")


class TTSModelDownloadResponse(BaseModel):
    """Réponse de téléchargement"""
    model: str
    status: str  # "started", "already_downloaded", "downloading", "completed", "failed"
    message: str


class TTSLicenseInfoResponse(BaseModel):
    """Informations de licence d'un modèle"""
    model: str
    license_name: str
    commercial_use_allowed: bool
    restrictions: List[str]
    warning: Optional[str]
    recommendation: Optional[str]


class TTSCurrentModelResponse(BaseModel):
    """Modèle TTS actuel"""
    model: str
    display_name: str
    license: str
    commercial_use: bool
    is_initialized: bool
    is_downloaded: bool
    languages_count: int
    quality_score: int


# ═══════════════════════════════════════════════════════════════════════════
# ROUTER FACTORY
# ═══════════════════════════════════════════════════════════════════════════

def create_tts_models_router(unified_tts_service=None) -> APIRouter:
    """
    Crée le routeur FastAPI pour la gestion des modèles TTS.

    Args:
        unified_tts_service: Instance du service TTS unifié
    """
    router = APIRouter(prefix="/v1/tts", tags=["TTS Models"])

    # Import des types du service TTS
    try:
        from services.tts_service import TTSModel, TTS_MODEL_INFO
    except ImportError:
        TTSModel = None
        TTS_MODEL_INFO = {}

    def _get_model_info_response(model_enum, info) -> TTSModelInfoResponse:
        """Convertit les infos du modèle en réponse API"""
        return TTSModelInfoResponse(
            name=info.name,
            display_name=info.display_name,
            license=info.license,
            commercial_use=info.commercial_use,
            license_warning=info.license_warning,
            languages=info.languages,
            languages_count=len(info.languages),
            min_audio_seconds=info.min_audio_seconds,
            quality_score=info.quality_score,
            speed_score=info.speed_score,
            vram_gb=info.vram_gb,
            model_size_gb=info.model_size_gb,
            is_recommended=(model_enum == TTSModel.CHATTERBOX)
        )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Liste tous les modèles TTS disponibles
    # ─────────────────────────────────────────────────────
    @router.get("/models", response_model=TTSModelsListResponse)
    async def list_tts_models():
        """
        Liste tous les modèles TTS disponibles avec leurs caractéristiques.

        Returns:
            TTSModelsListResponse avec tous les modèles et le modèle actuel
        """
        if not unified_tts_service or not TTS_MODEL_INFO:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        models = {}
        for model_enum, info in TTS_MODEL_INFO.items():
            models[model_enum.value] = _get_model_info_response(model_enum, info)

        return TTSModelsListResponse(
            models=models,
            current_model=unified_tts_service.current_model.value,
            recommended_model="chatterbox"
        )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Obtenir le modèle actuel
    # ─────────────────────────────────────────────────────
    @router.get("/models/current", response_model=TTSCurrentModelResponse)
    async def get_current_model():
        """
        Retourne les informations sur le modèle TTS actuellement utilisé.
        """
        if not unified_tts_service:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        current = unified_tts_service.current_model
        info = TTS_MODEL_INFO[current]

        # Vérifier si le modèle est téléchargé
        status = await unified_tts_service.get_model_status(current)

        return TTSCurrentModelResponse(
            model=current.value,
            display_name=info.display_name,
            license=info.license,
            commercial_use=info.commercial_use,
            is_initialized=unified_tts_service.is_initialized,
            is_downloaded=status.is_downloaded,
            languages_count=len(info.languages),
            quality_score=info.quality_score
        )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Statut de tous les modèles TTS
    # ─────────────────────────────────────────────────────
    @router.get("/models/status", response_model=TTSAllModelsStatusResponse)
    async def get_all_models_status():
        """
        Retourne le statut de tous les modèles TTS.

        Inclut:
        - is_available: Package Python installé
        - is_downloaded: Modèle téléchargé localement
        - is_loaded: Modèle chargé en mémoire (actif)
        - is_downloading: Téléchargement en cours
        - download_progress: Progression 0-100%
        """
        if not unified_tts_service:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        all_status = await unified_tts_service.get_all_models_status()

        models = {}
        for model_name, status in all_status.items():
            models[model_name] = TTSModelStatusResponse(
                model=model_name,
                is_available=status.is_available,
                is_downloaded=status.is_downloaded,
                is_loaded=status.is_loaded,
                is_downloading=status.is_downloading,
                download_progress=status.download_progress
            )

        return TTSAllModelsStatusResponse(
            current_model=unified_tts_service.current_model.value,
            fallback_model=TTSModel.get_fallback().value,
            disk_space_available_gb=unified_tts_service._get_available_disk_space_gb(),
            models=models
        )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Télécharger un modèle TTS
    # ─────────────────────────────────────────────────────
    @router.post("/models/{model_name}/download", response_model=TTSModelDownloadResponse)
    async def download_model(
        model_name: str,
        request: TTSModelDownloadRequest = TTSModelDownloadRequest(),
        background_tasks: BackgroundTasks = None
    ):
        """
        Download a specific TTS model to local storage.

        Downloads model weights from HuggingFace to enable offline use.
        Supports background download for large models.

        Args:
            model_name: Model name (chatterbox, chatterbox-turbo, higgs-audio-v2, xtts-v2)
            request: Download options (background=True by default)

        Returns:
            TTSModelDownloadResponse with:
            - model: Model name
            - status: "started", "already_downloaded", "downloading", "completed", "failed"
            - message: Human-readable status message

        Model Sizes:
            - chatterbox: ~2.5 GB
            - chatterbox-turbo: ~1.2 GB
            - higgs-audio-v2: ~3.0 GB
            - xtts-v2: ~1.8 GB

        Example:
            ```
            # Start background download
            curl -X POST /v1/tts/models/chatterbox/download

            # Check progress
            curl -X GET /v1/tts/models/status
            ```
        """
        if not unified_tts_service or not TTSModel:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        # Valider le modèle
        try:
            model_enum = TTSModel(model_name)
        except ValueError:
            raise HTTPException(
                status_code=404,
                detail=f"Model not found: {model_name}. Valid options: {[m.value for m in TTSModel]}"
            )

        # Vérifier le statut actuel
        status = await unified_tts_service.get_model_status(model_enum)

        if not status.is_available:
            raise HTTPException(
                status_code=400,
                detail=f"Python package for {model_name} is not installed"
            )

        if status.is_downloaded:
            return TTSModelDownloadResponse(
                model=model_name,
                status="already_downloaded",
                message=f"Model {model_name} is already downloaded"
            )

        if status.is_downloading:
            return TTSModelDownloadResponse(
                model=model_name,
                status="downloading",
                message=f"Model {model_name} is currently downloading ({status.download_progress:.1f}%)"
            )

        # Vérifier l'espace disque
        if not unified_tts_service._can_download_model(model_enum):
            model_info = TTS_MODEL_INFO[model_enum]
            raise HTTPException(
                status_code=507,
                detail={
                    "error": "Insufficient disk space",
                    "required_gb": model_info.model_size_gb,
                    "available_gb": unified_tts_service._get_available_disk_space_gb()
                }
            )

        # Obtenir le backend
        if model_enum not in unified_tts_service.backends:
            unified_tts_service.backends[model_enum] = unified_tts_service._create_backend(model_enum)
        backend = unified_tts_service.backends[model_enum]

        if request.background and background_tasks:
            # Téléchargement en arrière-plan
            async def background_download():
                try:
                    await backend.download_model()
                    logger.info(f"[TTS] ✅ Téléchargement de {model_name} terminé")
                except Exception as e:
                    logger.error(f"[TTS] ❌ Erreur téléchargement {model_name}: {e}")

            import asyncio
            asyncio.create_task(background_download())

            return TTSModelDownloadResponse(
                model=model_name,
                status="started",
                message=f"Download of {model_name} started in background. Use GET /models/status to check progress."
            )
        else:
            # Téléchargement synchrone
            try:
                success = await backend.download_model()
                if success:
                    return TTSModelDownloadResponse(
                        model=model_name,
                        status="completed",
                        message=f"Model {model_name} downloaded successfully"
                    )
                else:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to download model {model_name}"
                    )
            except Exception as e:
                logger.error(f"[TTS] Erreur téléchargement {model_name}: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=str(e)
                )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Changer de modèle TTS
    # ─────────────────────────────────────────────────────
    @router.post("/models/switch", response_model=TTSModelSwitchResponse)
    async def switch_tts_model(request: TTSModelSwitchRequest):
        """
        Change le modèle TTS utilisé.

        IMPORTANT: Certains modèles ont des restrictions de licence:
        - higgs-audio-v2: Usage commercial limité à <100k users/an
        - xtts-v2: Usage commercial INTERDIT

        Args:
            request: TTSModelSwitchRequest avec le nom du modèle

        Returns:
            TTSModelSwitchResponse avec le résultat du changement
        """
        if not unified_tts_service or not TTSModel:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        # Valider le modèle
        try:
            new_model = TTSModel(request.model)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model: {request.model}. Valid options: {[m.value for m in TTSModel]}"
            )

        # Vérifier les restrictions de licence
        info = TTS_MODEL_INFO[new_model]
        if not info.commercial_use and not request.acknowledge_license:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "License acknowledgment required",
                    "message": f"Model '{new_model.value}' has commercial use restrictions.",
                    "license_warning": info.license_warning,
                    "action_required": "Set 'acknowledge_license: true' to confirm you understand the license restrictions."
                }
            )

        # Effectuer le changement
        previous_model = unified_tts_service.current_model.value

        try:
            success = await unified_tts_service.switch_model(new_model)

            if success:
                message = f"Successfully switched from {previous_model} to {new_model.value}"
                if info.license_warning:
                    message += f"\n\nLicense Warning: {info.license_warning}"
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to switch to model: {new_model.value}"
                )

            return TTSModelSwitchResponse(
                success=success,
                previous_model=previous_model,
                new_model=new_model.value,
                license_warning=info.license_warning,
                message=message
            )

        except Exception as e:
            logger.error(f"Error switching TTS model: {e}")
            raise HTTPException(
                status_code=500,
                detail=str(e)
            )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Informations détaillées d'un modèle
    # ─────────────────────────────────────────────────────
    @router.get("/models/{model_name}/info", response_model=TTSModelInfoResponse)
    async def get_model_info(model_name: str):
        """
        Retourne les informations détaillées d'un modèle TTS spécifique.

        Args:
            model_name: Nom du modèle (chatterbox, chatterbox-turbo, higgs-audio-v2, xtts-v2)
        """
        if not TTSModel or not TTS_MODEL_INFO:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        try:
            model_enum = TTSModel(model_name)
        except ValueError:
            raise HTTPException(
                status_code=404,
                detail=f"Model not found: {model_name}. Valid options: {[m.value for m in TTSModel]}"
            )

        info = TTS_MODEL_INFO[model_enum]
        return _get_model_info_response(model_enum, info)

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Informations de licence d'un modèle
    # ─────────────────────────────────────────────────────
    @router.get("/models/{model_name}/license", response_model=TTSLicenseInfoResponse)
    async def get_model_license(model_name: str):
        """
        Retourne les informations de licence détaillées d'un modèle TTS.

        IMPORTANT pour l'usage commercial!

        Args:
            model_name: Nom du modèle
        """
        if not TTSModel or not TTS_MODEL_INFO:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        try:
            model_enum = TTSModel(model_name)
        except ValueError:
            raise HTTPException(
                status_code=404,
                detail=f"Model not found: {model_name}"
            )

        info = TTS_MODEL_INFO[model_enum]

        # Construire les restrictions
        restrictions = []
        recommendation = None

        if model_enum == TTSModel.CHATTERBOX or model_enum == TTSModel.CHATTERBOX_TURBO:
            restrictions = ["None - Full commercial use allowed under Apache 2.0"]
            recommendation = None
        elif model_enum == TTSModel.HIGGS_AUDIO_V2:
            restrictions = [
                "Commercial use limited to products/services with < 100,000 annual active users",
                "Must obtain commercial license from Boson AI if exceeding 100k users",
                "Contact: https://www.boson.ai/contact"
            ]
            recommendation = "Consider Chatterbox for unrestricted commercial use"
        elif model_enum == TTSModel.XTTS_V2:
            restrictions = [
                "NO commercial use allowed",
                "Personal and research use only",
                "Coqui Public Model License",
                "Note: Coqui company shut down in 2024, no longer maintained"
            ]
            recommendation = "Use Chatterbox (Apache 2.0) for commercial applications"

        return TTSLicenseInfoResponse(
            model=model_name,
            license_name=info.license,
            commercial_use_allowed=info.commercial_use,
            restrictions=restrictions,
            warning=info.license_warning,
            recommendation=recommendation
        )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Langues supportées par modèle
    # ─────────────────────────────────────────────────────
    @router.get("/models/{model_name}/languages")
    async def get_model_languages(model_name: str):
        """
        Retourne la liste des langues supportées par un modèle TTS.

        Args:
            model_name: Nom du modèle
        """
        if not TTSModel or not TTS_MODEL_INFO:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        try:
            model_enum = TTSModel(model_name)
        except ValueError:
            raise HTTPException(
                status_code=404,
                detail=f"Model not found: {model_name}"
            )

        info = TTS_MODEL_INFO[model_enum]

        return {
            "model": model_name,
            "languages": info.languages,
            "count": len(info.languages)
        }

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Comparaison des modèles
    # ─────────────────────────────────────────────────────
    @router.get("/models/compare")
    async def compare_models(
        models: str = Query(
            "chatterbox,higgs-audio-v2",
            description="Comma-separated list of models to compare"
        )
    ):
        """
        Compare multiple TTS models side by side.

        Returns a comparison table of model characteristics to help choose
        the best model for your use case.

        Args:
            models: Comma-separated list of model names to compare

        Returns:
            Comparison object with:
            - comparison: Dict of model characteristics (quality, speed, license, etc.)
            - recommendation: Best model for different use cases

        Available Models:
            - chatterbox: Best overall, Apache 2.0 license, commercial use allowed
            - chatterbox-turbo: Fastest, same license as chatterbox
            - higgs-audio-v2: Highest quality, limited commercial use (<100k users)
            - xtts-v2: No commercial use, research only

        Example:
            ```
            curl -X GET "/v1/tts/models/compare?models=chatterbox,higgs-audio-v2"
            ```
        """
        if not TTSModel or not TTS_MODEL_INFO:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        model_names = [m.strip() for m in models.split(",")]
        comparison = {}

        for name in model_names:
            try:
                model_enum = TTSModel(name)
                info = TTS_MODEL_INFO[model_enum]
                comparison[name] = {
                    "display_name": info.display_name,
                    "license": info.license,
                    "commercial_use": info.commercial_use,
                    "quality_score": info.quality_score,
                    "speed_score": info.speed_score,
                    "languages_count": len(info.languages),
                    "vram_gb": info.vram_gb,
                    "min_audio_seconds": info.min_audio_seconds
                }
            except ValueError:
                comparison[name] = {"error": f"Model not found: {name}"}

        # Ajouter la recommandation
        recommendation = {
            "best_quality": "higgs-audio-v2",
            "best_speed": "chatterbox-turbo",
            "best_commercial": "chatterbox",
            "best_overall": "chatterbox"
        }

        return {
            "comparison": comparison,
            "recommendation": recommendation
        }

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Statistiques du service TTS
    # ─────────────────────────────────────────────────────
    @router.get("/stats")
    async def get_tts_stats():
        """
        Retourne les statistiques du service TTS unifié.
        """
        if not unified_tts_service:
            raise HTTPException(
                status_code=503,
                detail="TTS service not available"
            )

        return await unified_tts_service.get_stats()

    return router
