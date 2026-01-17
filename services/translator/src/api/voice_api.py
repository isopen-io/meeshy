"""
Voice Translation API - Production-Ready REST Endpoints
20+ endpoints pour traduction vocale SaaS

Endpoints:
- Voice Translation: translate, translate/async, jobs
- Voice Profiles: CRUD + samples
- Voice Analysis: analyze, compare, languages
- Feedback & Analytics: feedback, stats, history
- Admin: metrics, queue, A/B testing, health
"""

from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Query, Header, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
import asyncio
import uuid
import os
import base64
import tempfile
from pathlib import Path
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════

class TranslateRequest(BaseModel):
    """Requête de traduction vocale"""
    target_languages: List[str] = Field(default=["en"], description="Target languages")
    source_language: Optional[str] = Field(None, description="Source language (auto-detect if not provided)")
    generate_voice_clone: bool = Field(True, description="Clone the speaker's voice")
    audio_base64: Optional[str] = Field(None, description="Audio encoded in base64")


class TranslateAsyncRequest(BaseModel):
    """Requête de traduction async"""
    target_languages: List[str] = Field(default=["en"])
    source_language: Optional[str] = None
    generate_voice_clone: bool = True
    webhook_url: Optional[str] = Field(None, description="URL to call when job completes")
    priority: int = Field(1, ge=0, le=3, description="Job priority (0=low, 3=urgent)")
    callback_metadata: Optional[Dict[str, Any]] = None


class TranslationResponse(BaseModel):
    """Réponse de traduction"""
    success: bool
    original_text: str
    original_language: str
    translations: Dict[str, Dict[str, Any]]
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int


class JobResponse(BaseModel):
    """Status d'un job"""
    id: str
    status: str
    progress: int
    current_step: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class VoiceProfileResponse(BaseModel):
    """Profil vocal"""
    user_id: str
    quality_score: float
    audio_count: int
    total_duration_ms: int
    version: int
    voice_type: Optional[str] = None
    is_active: bool = True
    created_at: str
    updated_at: str


class VoiceAnalysisResponse(BaseModel):
    """Résultat d'analyse vocale"""
    pitch: Dict[str, float]
    spectral: Dict[str, float]
    energy: Dict[str, float]
    quality: Dict[str, float]
    mfcc: Dict[str, List[float]]
    classification: Dict[str, str]
    metadata: Dict[str, Any]


class VoiceComparisonResponse(BaseModel):
    """Résultat de comparaison vocale"""
    overall_score: float
    is_likely_same_speaker: bool
    confidence: float
    components: Dict[str, float]
    analysis_time_ms: int


class FeedbackRequest(BaseModel):
    """Requête de feedback"""
    translation_id: str
    rating: int = Field(..., ge=1, le=5)
    feedback_type: str = Field("overall", description="voice_quality, translation_accuracy, speed, overall")
    comment: Optional[str] = None
    target_language: Optional[str] = None
    voice_cloned: bool = False


class FeedbackResponse(BaseModel):
    """Réponse de feedback"""
    id: str
    user_id: str
    translation_id: str
    rating: int
    feedback_type: str
    created_at: str


class UserStatsResponse(BaseModel):
    """Statistiques utilisateur"""
    user_id: str
    total_translations: int
    total_audio_seconds: float
    languages_used: Dict[str, int]
    avg_rating: float
    total_feedback: int
    voice_profile_quality: float


class HistoryResponse(BaseModel):
    """Réponse historique"""
    entries: List[Dict[str, Any]]
    total: int
    page: int
    limit: int


class ABTestRequest(BaseModel):
    """Requête création test A/B"""
    name: str
    description: str = ""
    variants: List[Dict[str, Any]]
    traffic_split: Optional[List[float]] = None
    target_sample_size: int = 1000


class ABTestResponse(BaseModel):
    """Réponse test A/B"""
    id: str
    name: str
    status: str
    variants: List[Dict[str, Any]]
    results: Dict[str, Any]
    created_at: str


class QueueStatusResponse(BaseModel):
    """Status de la queue"""
    queue_size: int
    processing: int
    completed_total: int
    failed_total: int
    workers_active: int
    workers_max: int


class MetricsResponse(BaseModel):
    """Métriques système"""
    translation_pipeline: Dict[str, Any]
    voice_analyzer: Dict[str, Any]
    analytics: Dict[str, Any]
    transcription: Optional[Dict[str, Any]] = None
    voice_clone: Optional[Dict[str, Any]] = None
    tts: Optional[Dict[str, Any]] = None


class LanguagesResponse(BaseModel):
    """Langues supportées"""
    transcription: List[str]
    translation: List[str]
    tts: List[str]
    voice_cloning: List[str]


# ═══════════════════════════════════════════════════════════════════════════
# ROUTER FACTORY
# ═══════════════════════════════════════════════════════════════════════════

def create_voice_api_router(
    transcription_service=None,
    voice_clone_service=None,
    tts_service=None,
    translation_service=None,
    translation_pipeline=None,
    voice_analyzer=None,
    analytics_service=None
) -> APIRouter:
    """
    Crée le routeur FastAPI pour l'API Voice.

    Args:
        transcription_service: Service de transcription
        voice_clone_service: Service de clonage vocal
        tts_service: Service TTS
        translation_service: Service de traduction
        translation_pipeline: Pipeline de traduction async
        voice_analyzer: Service d'analyse vocale
        analytics_service: Service d'analytics
    """
    router = APIRouter(prefix="/api/v1", tags=["Voice"])

    # Répertoires
    UPLOAD_DIR = Path(os.getenv('UPLOAD_DIR', './uploads'))
    OUTPUT_DIR = Path(os.getenv('AUDIO_OUTPUT_DIR', './audio_output'))
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Helper pour extraire user_id (à adapter selon votre auth)
    def get_user_id(authorization: Optional[str] = None) -> str:
        if authorization and authorization.startswith("Bearer "):
            # Dans un vrai système, décoder le JWT
            return "user_" + authorization[-8:]
        return "anonymous_" + uuid.uuid4().hex[:8]

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE TRANSLATION
    # ═══════════════════════════════════════════════════════════════════════

    @router.post("/voice/translate", response_model=TranslationResponse)
    async def translate_voice_sync(
        audio: UploadFile = File(..., description="Audio file to translate"),
        target_languages: str = Form("en", description="Comma-separated target languages"),
        source_language: Optional[str] = Form(None),
        generate_voice_clone: bool = Form(True),
        authorization: Optional[str] = Header(None)
    ):
        """
        Translate audio synchronously with voice cloning.

        Performs the complete pipeline: transcription → translation → TTS with voice cloning.
        Returns JSON with translations and audio URLs.

        Args:
            audio: Source audio file (multipart/form-data)
            target_languages: Comma-separated target language codes (e.g., "en,fr,es")
            source_language: Source language code (auto-detect if not provided)
            generate_voice_clone: Clone the speaker's voice for TTS (default: True)
            authorization: Bearer token for authentication

        Returns:
            TranslationResponse with original text, translations, and audio URLs

        Example:
            ```
            curl -X POST /api/v1/voice/translate \\
              -F "audio=@message.m4a" \\
              -F "target_languages=en,fr" \\
              -F "generate_voice_clone=true"
            ```
        """
        if not translation_pipeline:
            raise HTTPException(status_code=503, detail="Translation pipeline not available")

        user_id = get_user_id(authorization)
        target_langs = [l.strip() for l in target_languages.split(",")]

        # Sauvegarder le fichier temporaire
        temp_path = await _save_upload(audio, UPLOAD_DIR)

        try:
            # Utiliser le pipeline sync
            result = await translation_pipeline.translate_sync(
                user_id=user_id,
                audio_path=str(temp_path),
                target_languages=target_langs,
                generate_voice_clone=generate_voice_clone
            )

            # Enregistrer dans l'historique
            if analytics_service:
                for lang, trans in result.translations.items():
                    if trans.get("success", True):
                        await analytics_service.record_translation(
                            user_id=user_id,
                            translation_id=result.job_id,
                            source_language=result.original_language,
                            target_language=lang,
                            original_text=result.original_text,
                            translated_text=trans.get("translated_text", ""),
                            voice_cloned=trans.get("voice_cloned", False),
                            voice_quality=result.voice_quality,
                            processing_time_ms=result.processing_time_ms,
                            audio_url=trans.get("audio_url")
                        )

            return TranslationResponse(
                success=True,
                original_text=result.original_text,
                original_language=result.original_language,
                translations=result.translations,
                voice_cloned=result.voice_cloned,
                voice_quality=result.voice_quality,
                processing_time_ms=result.processing_time_ms
            )

        finally:
            # Cleanup
            if temp_path.exists():
                temp_path.unlink()

    @router.post("/voice/translate/audio")
    async def translate_voice_audio(
        audio: UploadFile = File(...),
        target_language: str = Form("en"),
        source_language: Optional[str] = Form(None),
        generate_voice_clone: bool = Form(True),
        output_format: str = Form("mp3"),
        authorization: Optional[str] = Header(None)
    ):
        """
        Translate audio and return the translated audio file directly.

        This endpoint performs the full pipeline (transcribe → translate → TTS)
        and returns the generated audio file as a binary response.

        Args:
            audio: Source audio file to translate
            target_language: Target language code (default: en)
            source_language: Source language code (auto-detect if not provided)
            generate_voice_clone: Clone the speaker's voice (default: True)
            output_format: Output audio format: mp3, wav (default: mp3)
            authorization: Bearer token for authentication

        Returns:
            Audio file (binary) with the translated speech
        """
        if not translation_pipeline:
            raise HTTPException(status_code=503, detail="Translation pipeline not available")

        user_id = get_user_id(authorization)
        temp_path = await _save_upload(audio, UPLOAD_DIR)

        try:
            result = await translation_pipeline.translate_sync(
                user_id=user_id,
                audio_path=str(temp_path),
                target_languages=[target_language],
                generate_voice_clone=generate_voice_clone
            )

            translation = result.translations.get(target_language)
            if not translation or not translation.get("audio_path"):
                raise HTTPException(status_code=500, detail="Audio generation failed")

            audio_path = translation["audio_path"]
            if not os.path.exists(audio_path):
                raise HTTPException(status_code=404, detail="Generated audio not found")

            return FileResponse(
                audio_path,
                media_type=f"audio/{output_format}",
                filename=f"translated_{target_language}.{output_format}"
            )

        finally:
            if temp_path.exists():
                temp_path.unlink()

    @router.post("/voice/translate/async", response_model=JobResponse)
    async def translate_voice_async(
        audio: UploadFile = File(...),
        target_languages: str = Form("en"),
        source_language: Optional[str] = Form(None),
        generate_voice_clone: bool = Form(True),
        webhook_url: Optional[str] = Form(None),
        priority: int = Form(1),
        authorization: Optional[str] = Header(None)
    ):
        """
        Submit an asynchronous voice translation job.

        For long audio files or batch processing. Returns a job_id to track progress.
        Use GET /voice/job/{job_id} to check status.

        Args:
            audio: Source audio file (multipart/form-data)
            target_languages: Comma-separated target language codes
            source_language: Source language code (auto-detect if not provided)
            generate_voice_clone: Clone the speaker's voice (default: True)
            webhook_url: URL to call when job completes (optional)
            priority: Job priority 0-3 (0=low, 1=normal, 2=high, 3=urgent)
            authorization: Bearer token for authentication

        Returns:
            JobResponse with job_id and initial status

        Example:
            ```
            curl -X POST /api/v1/voice/translate/async \\
              -F "audio=@long_message.m4a" \\
              -F "target_languages=en,fr,es,de" \\
              -F "priority=2"
            ```
        """
        if not translation_pipeline:
            raise HTTPException(status_code=503, detail="Translation pipeline not available")

        user_id = get_user_id(authorization)
        target_langs = [l.strip() for l in target_languages.split(",")]

        # Sauvegarder le fichier
        temp_path = await _save_upload(audio, UPLOAD_DIR, keep=True)

        try:
            from services.translation_pipeline_service import JobPriority

            job = await translation_pipeline.submit_job(
                user_id=user_id,
                audio_path=str(temp_path),
                target_languages=target_langs,
                generate_voice_clone=generate_voice_clone,
                webhook_url=webhook_url,
                priority=JobPriority(priority)
            )

            return JobResponse(
                id=job.id,
                status=job.status.value,
                progress=job.progress,
                current_step=job.current_step,
                created_at=job.created_at.isoformat()
            )

        except Exception as e:
            if temp_path.exists():
                temp_path.unlink()
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/voice/job/{job_id}", response_model=JobResponse)
    async def get_job_status(job_id: str):
        """Récupérer le status d'un job de traduction."""
        if not translation_pipeline:
            raise HTTPException(status_code=503, detail="Translation pipeline not available")

        job = await translation_pipeline.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return JobResponse(
            id=job.id,
            status=job.status.value,
            progress=job.progress,
            current_step=job.current_step,
            result=job.result,
            error=job.error,
            created_at=job.created_at.isoformat(),
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None
        )

    @router.delete("/voice/job/{job_id}")
    async def cancel_job(job_id: str):
        """Annuler un job en attente."""
        if not translation_pipeline:
            raise HTTPException(status_code=503, detail="Translation pipeline not available")

        success = await translation_pipeline.cancel_job(job_id)
        if not success:
            raise HTTPException(status_code=400, detail="Job cannot be cancelled (already processing or completed)")

        return {"cancelled": True, "job_id": job_id}

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE PROFILES
    # ═══════════════════════════════════════════════════════════════════════

    @router.get("/voice/profile", response_model=VoiceProfileResponse)
    async def get_voice_profile(authorization: Optional[str] = Header(None)):
        """Récupérer le profil vocal de l'utilisateur."""
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)

        try:
            model = await voice_clone_service._load_cached_model(user_id)
            if not model:
                raise HTTPException(status_code=404, detail="No voice profile found")

            return VoiceProfileResponse(
                user_id=model.user_id,
                quality_score=model.quality_score,
                audio_count=model.audio_count,
                total_duration_ms=model.total_duration_ms,
                version=model.version,
                is_active=True,
                created_at=model.created_at.isoformat(),
                updated_at=model.updated_at.isoformat()
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting voice profile: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/voice/profile", response_model=VoiceProfileResponse)
    async def create_or_update_voice_profile(
        audio: UploadFile = File(..., description="Audio sample for voice cloning"),
        authorization: Optional[str] = Header(None)
    ):
        """Créer ou améliorer le profil vocal."""
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)
        temp_path = await _save_upload(audio, UPLOAD_DIR)

        try:
            model = await voice_clone_service.get_or_create_voice_model(
                user_id=user_id,
                current_audio_path=str(temp_path)
            )

            return VoiceProfileResponse(
                user_id=model.user_id,
                quality_score=model.quality_score,
                audio_count=model.audio_count,
                total_duration_ms=model.total_duration_ms,
                version=model.version,
                is_active=True,
                created_at=model.created_at.isoformat(),
                updated_at=model.updated_at.isoformat()
            )

        finally:
            if temp_path.exists():
                temp_path.unlink()

    @router.post("/voice/profile/sample", response_model=VoiceProfileResponse)
    async def add_voice_sample(
        audio: UploadFile = File(...),
        authorization: Optional[str] = Header(None)
    ):
        """Ajouter un échantillon audio pour améliorer le profil."""
        return await create_or_update_voice_profile(audio, authorization)

    @router.delete("/voice/profile")
    async def delete_voice_profile(authorization: Optional[str] = Header(None)):
        """Supprimer le profil vocal."""
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)

        # Supprimer le répertoire du cache
        import shutil
        user_dir = voice_clone_service.voice_cache_dir / user_id
        if user_dir.exists():
            shutil.rmtree(user_dir)

        return {"deleted": True, "user_id": user_id}

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE ANALYSIS
    # ═══════════════════════════════════════════════════════════════════════

    @router.post("/voice/analyze", response_model=VoiceAnalysisResponse)
    async def analyze_voice(
        audio: UploadFile = File(...),
        use_cache: bool = Form(True)
    ):
        """Analyser les caractéristiques vocales d'un audio."""
        if not voice_analyzer:
            raise HTTPException(status_code=503, detail="Voice analyzer not available")

        temp_path = await _save_upload(audio, UPLOAD_DIR)

        try:
            result = await voice_analyzer.analyze(str(temp_path), use_cache=use_cache)
            return VoiceAnalysisResponse(**result.to_dict())

        finally:
            if temp_path.exists():
                temp_path.unlink()

    @router.post("/voice/compare", response_model=VoiceComparisonResponse)
    async def compare_voices(
        audio1: UploadFile = File(..., description="First audio file"),
        audio2: UploadFile = File(..., description="Second audio file"),
        detailed: bool = Form(False)
    ):
        """
        Compare two voice samples and return a similarity score.

        Useful for speaker verification, voice profile quality assessment,
        or detecting if two audio samples are from the same speaker.

        Args:
            audio1: First audio file (multipart/form-data)
            audio2: Second audio file (multipart/form-data)
            detailed: Return detailed component scores (default: False)

        Returns:
            VoiceComparisonResponse with:
            - overall_score: 0.0-1.0 similarity score
            - is_likely_same_speaker: Boolean prediction
            - confidence: Confidence level of the prediction
            - components: Detailed similarity breakdown (pitch, timbre, MFCC, energy)

        Example:
            ```
            curl -X POST /api/v1/voice/compare \\
              -F "audio1=@sample1.wav" \\
              -F "audio2=@sample2.wav" \\
              -F "detailed=true"
            ```
        """
        if not voice_analyzer:
            raise HTTPException(status_code=503, detail="Voice analyzer not available")

        temp_path1 = await _save_upload(audio1, UPLOAD_DIR, prefix="compare1_")
        temp_path2 = await _save_upload(audio2, UPLOAD_DIR, prefix="compare2_")

        try:
            result = await voice_analyzer.compare(
                str(temp_path1),
                str(temp_path2),
                detailed=detailed
            )

            return VoiceComparisonResponse(
                overall_score=result.overall_score,
                is_likely_same_speaker=result.is_likely_same_speaker,
                confidence=result.confidence,
                components={
                    "pitch_similarity": result.pitch_similarity,
                    "timbre_similarity": result.timbre_similarity,
                    "mfcc_similarity": result.mfcc_similarity,
                    "energy_similarity": result.energy_similarity
                },
                analysis_time_ms=result.analysis_time_ms
            )

        finally:
            if temp_path1.exists():
                temp_path1.unlink()
            if temp_path2.exists():
                temp_path2.unlink()

    @router.get("/voice/languages", response_model=LanguagesResponse)
    async def get_supported_languages():
        """Récupérer les langues supportées par chaque service."""
        transcription_langs = ["en", "fr", "es", "de", "it", "pt", "ru", "zh", "ja", "ko", "ar", "nl", "pl", "tr"]
        translation_langs = [
            "af", "ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fa", "fi", "fr",
            "he", "hi", "hr", "hu", "hy", "id", "ig", "it", "ja", "ko", "ln", "lt", "ms",
            "nl", "no", "pl", "pt", "ro", "ru", "sv", "sw", "th", "tr", "uk", "ur", "vi", "zh"
        ]
        tts_langs = ["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "ko", "hu"]
        cloning_langs = tts_langs  # XTTS supports the same languages

        return LanguagesResponse(
            transcription=transcription_langs,
            translation=translation_langs,
            tts=tts_langs,
            voice_cloning=cloning_langs
        )

    # ═══════════════════════════════════════════════════════════════════════
    # FEEDBACK & ANALYTICS
    # ═══════════════════════════════════════════════════════════════════════

    @router.post("/voice/feedback", response_model=FeedbackResponse)
    async def submit_feedback(
        request: FeedbackRequest,
        authorization: Optional[str] = Header(None)
    ):
        """Soumettre un feedback de qualité."""
        if not analytics_service:
            raise HTTPException(status_code=503, detail="Analytics service not available")

        user_id = get_user_id(authorization)

        from services.analytics_service import FeedbackType

        try:
            feedback_type = FeedbackType(request.feedback_type)
        except ValueError:
            feedback_type = FeedbackType.OVERALL

        feedback = await analytics_service.submit_feedback(
            user_id=user_id,
            translation_id=request.translation_id,
            rating=request.rating,
            feedback_type=feedback_type,
            comment=request.comment,
            target_language=request.target_language or "",
            voice_cloned=request.voice_cloned
        )

        return FeedbackResponse(
            id=feedback.id,
            user_id=feedback.user_id,
            translation_id=feedback.translation_id,
            rating=feedback.rating,
            feedback_type=feedback.feedback_type.value,
            created_at=feedback.created_at.isoformat()
        )

    @router.get("/voice/stats", response_model=UserStatsResponse)
    async def get_user_stats(authorization: Optional[str] = Header(None)):
        """Récupérer les statistiques de l'utilisateur."""
        if not analytics_service:
            raise HTTPException(status_code=503, detail="Analytics service not available")

        user_id = get_user_id(authorization)
        stats = await analytics_service.get_user_stats(user_id)

        return UserStatsResponse(
            user_id=stats.user_id,
            total_translations=stats.total_translations,
            total_audio_seconds=stats.total_audio_seconds,
            languages_used=stats.languages_used,
            avg_rating=stats.avg_rating,
            total_feedback=stats.total_feedback,
            voice_profile_quality=stats.voice_profile_quality
        )

    @router.get("/voice/history", response_model=HistoryResponse)
    async def get_translation_history(
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
        language: Optional[str] = Query(None),
        authorization: Optional[str] = Header(None)
    ):
        """
        Get user's translation history with pagination.

        Returns a paginated list of past translations with metadata.

        Args:
            page: Page number (default: 1)
            limit: Items per page, 1-100 (default: 20)
            language: Filter by target language code (optional)
            authorization: Bearer token for authentication

        Returns:
            HistoryResponse with:
            - entries: List of translation records
            - total: Total number of records
            - page: Current page number
            - limit: Items per page

        Example:
            ```
            curl -X GET "/api/v1/voice/history?page=1&limit=10&language=fr" \\
              -H "Authorization: Bearer <token>"
            ```
        """
        if not analytics_service:
            raise HTTPException(status_code=503, detail="Analytics service not available")

        user_id = get_user_id(authorization)

        entries, total = await analytics_service.get_user_history(
            user_id=user_id,
            page=page,
            limit=limit,
            language=language
        )

        return HistoryResponse(
            entries=[e.to_dict() for e in entries],
            total=total,
            page=page,
            limit=limit
        )

    # ═══════════════════════════════════════════════════════════════════════
    # ADMIN / MONITORING
    # ═══════════════════════════════════════════════════════════════════════

    @router.get("/admin/metrics", response_model=MetricsResponse)
    async def get_system_metrics():
        """Récupérer les métriques système en temps réel."""
        metrics = {
            "translation_pipeline": {},
            "voice_analyzer": {},
            "analytics": {}
        }

        if translation_pipeline:
            metrics["translation_pipeline"] = await translation_pipeline.get_stats()
        if voice_analyzer:
            metrics["voice_analyzer"] = await voice_analyzer.get_stats()
        if analytics_service:
            metrics["analytics"] = await analytics_service.get_stats()
        if transcription_service:
            metrics["transcription"] = await transcription_service.get_stats()
        if voice_clone_service:
            metrics["voice_clone"] = await voice_clone_service.get_stats()
        if tts_service:
            metrics["tts"] = await tts_service.get_stats()

        return MetricsResponse(**metrics)

    @router.get("/admin/queue", response_model=QueueStatusResponse)
    async def get_queue_status():
        """Récupérer le status de la queue de jobs."""
        if not translation_pipeline:
            raise HTTPException(status_code=503, detail="Translation pipeline not available")

        status = await translation_pipeline.get_queue_status()
        return QueueStatusResponse(**status)

    @router.post("/admin/ab-test", response_model=ABTestResponse)
    async def create_ab_test(request: ABTestRequest):
        """Créer un nouveau test A/B."""
        if not analytics_service:
            raise HTTPException(status_code=503, detail="Analytics service not available")

        test = await analytics_service.create_ab_test(
            name=request.name,
            description=request.description,
            variants=request.variants,
            traffic_split=request.traffic_split,
            target_sample_size=request.target_sample_size
        )

        return ABTestResponse(
            id=test.id,
            name=test.name,
            status=test.status.value,
            variants=test.variants,
            results=test.to_dict()["results"],
            created_at=test.created_at.isoformat()
        )

    @router.get("/admin/ab-test/{test_id}", response_model=ABTestResponse)
    async def get_ab_test_results(test_id: str):
        """Récupérer les résultats d'un test A/B."""
        if not analytics_service:
            raise HTTPException(status_code=503, detail="Analytics service not available")

        results = await analytics_service.get_ab_test_results(test_id)
        if not results:
            raise HTTPException(status_code=404, detail="A/B test not found")

        return ABTestResponse(
            id=results["id"],
            name=results["name"],
            status=results["status"],
            variants=results["variants"],
            results=results.get("results", {}),
            created_at=results["created_at"]
        )

    @router.post("/admin/ab-test/{test_id}/start")
    async def start_ab_test(test_id: str):
        """Démarrer un test A/B."""
        if not analytics_service:
            raise HTTPException(status_code=503, detail="Analytics service not available")

        test = await analytics_service.start_ab_test(test_id)
        return {"started": True, "test_id": test_id, "status": test.status.value}

    @router.get("/health")
    async def health_check():
        """Health check endpoint."""
        status = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "services": {}
        }

        if transcription_service:
            status["services"]["transcription"] = transcription_service.is_initialized
        if voice_clone_service:
            status["services"]["voice_clone"] = voice_clone_service.is_initialized
        if tts_service:
            status["services"]["tts"] = tts_service.is_initialized
        if translation_pipeline:
            status["services"]["translation_pipeline"] = translation_pipeline.is_initialized
        if voice_analyzer:
            status["services"]["voice_analyzer"] = voice_analyzer.is_initialized
        if analytics_service:
            status["services"]["analytics"] = analytics_service.is_initialized

        return status

    # ═══════════════════════════════════════════════════════════════════════
    # HELPER FUNCTIONS
    # ═══════════════════════════════════════════════════════════════════════

    async def _save_upload(
        upload: UploadFile,
        directory: Path,
        prefix: str = "upload_",
        keep: bool = False
    ) -> Path:
        """Sauvegarde un fichier uploadé."""
        suffix = Path(upload.filename).suffix if upload.filename else ".wav"
        temp_path = directory / f"{prefix}{uuid.uuid4()}{suffix}"

        with open(temp_path, "wb") as f:
            content = await upload.read()
            f.write(content)

        return temp_path

    return router
