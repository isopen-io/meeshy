"""
Meeshy Audio Processing API - FastAPI Routes
Endpoints REST pour transcription, TTS et clonage vocal
Compatible avec le format OpenAI API
"""

from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
import asyncio
import uuid
import os
from pathlib import Path
import base64
import tempfile
import shutil

logger = logging.getLogger(__name__)

# ===== MODÈLES PYDANTIC =====

class TranscriptionResponse(BaseModel):
    """Réponse de transcription (format OpenAI)"""
    text: str
    language: str
    confidence: float = 0.0
    duration_ms: int = 0
    source: str = "whisper"


class TranslationRequest(BaseModel):
    """Requête de traduction texte"""
    text: str = Field(..., min_length=1)
    source_language: str
    target_language: str


class TranslationResponse(BaseModel):
    """Réponse de traduction"""
    translated_text: str
    source_language: str
    target_language: str


class TTSRequest(BaseModel):
    """Requête TTS avec clonage"""
    text: str
    language: str = "en"
    voice_id: Optional[str] = None  # User ID for voice cloning


class VoiceRegistrationResponse(BaseModel):
    """Réponse d'enregistrement de voix"""
    user_id: str
    voice_embedding_id: str
    quality_score: float
    audio_count: int
    status: str


class VoiceMessageRequest(BaseModel):
    """Requête pipeline complet"""
    target_language: str
    generate_voice_clone: bool = True


class VoiceMessageResponse(BaseModel):
    """Réponse pipeline complet"""
    original_text: str
    original_language: str
    translated_text: str
    target_language: str
    audio_url: str
    processing_time_ms: int


# ===== ROUTEUR AUDIO =====

def create_audio_router(
    transcription_service=None,
    voice_clone_service=None,
    tts_service=None,
    translation_service=None,
    audio_pipeline=None
) -> APIRouter:
    """
    Crée le routeur FastAPI pour les endpoints audio.

    Args:
        transcription_service: Service de transcription Whisper
        voice_clone_service: Service de clonage vocal OpenVoice
        tts_service: Service TTS XTTS
        translation_service: Service de traduction ML
        audio_pipeline: Pipeline audio complet
    """
    router = APIRouter(prefix="/v1", tags=["Audio"])

    # Répertoires temporaires
    # Use relative paths for local dev, /app for Docker
    base_dir = Path(__file__).parent.parent.parent  # services/translator/
    default_upload_dir = str(base_dir / 'uploads')
    default_output_dir = str(base_dir / 'outputs' / 'audio')
    UPLOAD_DIR = Path(os.getenv('UPLOAD_DIR', default_upload_dir))
    OUTPUT_DIR = Path(os.getenv('OUTPUT_DIR', default_output_dir))
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Transcription (Compatible OpenAI API)
    # ─────────────────────────────────────────────────────
    @router.post("/audio/transcriptions", response_model=TranscriptionResponse)
    async def transcribe_audio(
        file: UploadFile = File(..., description="Audio file to transcribe"),
        model: str = Form("large-v3", description="Whisper model to use"),
        language: Optional[str] = Form(None, description="Source language (auto-detect if not provided)")
    ):
        """
        Transcribe audio to text using Whisper.
        Compatible with OpenAI API format.
        """
        if not transcription_service:
            raise HTTPException(status_code=503, detail="Transcription service not available")

        temp_path = None
        try:
            # Sauvegarder le fichier temporaire
            suffix = Path(file.filename).suffix if file.filename else ".m4a"
            temp_path = UPLOAD_DIR / f"temp_{uuid.uuid4()}{suffix}"

            with open(temp_path, "wb") as f:
                content = await file.read()
                f.write(content)

            # Transcrire
            result = await transcription_service.transcribe(
                audio_path=str(temp_path),
                mobile_transcription=None,
                return_timestamps=False
            )

            return TranscriptionResponse(
                text=result.text,
                language=result.language,
                confidence=result.confidence,
                duration_ms=result.duration_ms,
                source=result.source
            )

        except Exception as e:
            logger.error(f"Erreur transcription: {e}")
            raise HTTPException(status_code=500, detail=str(e))

        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink()

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Text-to-Speech avec clonage vocal
    # ─────────────────────────────────────────────────────
    @router.post("/tts")
    async def synthesize_voice(
        text: str = Form(..., description="Text to synthesize"),
        language: str = Form("en", description="Target language"),
        voice_id: Optional[str] = Form(None, description="User ID for voice cloning"),
        voice_embedding: Optional[UploadFile] = File(None, description="Voice embedding file")
    ):
        """
        Synthesize speech with optional voice cloning.
        If voice_id is provided, uses cached voice model.
        If voice_embedding is provided, uses that directly.
        """
        if not tts_service:
            raise HTTPException(status_code=503, detail="TTS service not available")

        try:
            voice_model = None

            # Récupérer le modèle de voix si disponible
            if voice_id and voice_clone_service:
                try:
                    voice_model = await voice_clone_service.get_or_create_voice_model(
                        user_id=voice_id
                    )
                except Exception as e:
                    logger.warning(f"Impossible de charger le modèle de voix: {e}")

            # Synthétiser
            if voice_model:
                result = await tts_service.synthesize_with_voice(
                    text=text,
                    voice_model=voice_model,
                    target_language=language,
                    output_format="mp3"
                )
            else:
                result = await tts_service.synthesize(
                    text=text,
                    language=language,
                    output_format="mp3"
                )

            # Retourner le fichier audio
            return FileResponse(
                result.audio_path,
                media_type="audio/mpeg",
                filename=f"synthesized_{uuid.uuid4()}.mp3"
            )

        except Exception as e:
            logger.error(f"Erreur TTS: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Enregistrement de voix utilisateur
    # ─────────────────────────────────────────────────────
    @router.post("/register-voice", response_model=VoiceRegistrationResponse)
    async def register_user_voice(
        audio: UploadFile = File(..., description="Audio sample for voice cloning"),
        user_id: str = Form(..., description="User ID to associate with voice")
    ):
        """
        Register a user's voice for cloning.
        Extracts and stores voice embedding for future use.
        """
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        temp_path = None
        try:
            # Sauvegarder le fichier
            suffix = Path(audio.filename).suffix if audio.filename else ".m4a"
            temp_path = UPLOAD_DIR / f"voice_{user_id}_{uuid.uuid4()}{suffix}"

            with open(temp_path, "wb") as f:
                content = await audio.read()
                f.write(content)

            # Extraire et sauvegarder l'embedding
            voice_model = await voice_clone_service.get_or_create_voice_model(
                user_id=user_id,
                current_audio_path=str(temp_path)
            )

            return VoiceRegistrationResponse(
                user_id=user_id,
                voice_embedding_id=voice_model.embedding_path,
                quality_score=voice_model.quality_score,
                audio_count=voice_model.audio_count,
                status="registered"
            )

        except Exception as e:
            logger.error(f"Erreur enregistrement voix: {e}")
            raise HTTPException(status_code=500, detail=str(e))

        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink()

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Pipeline complet (Transcription + Traduction + TTS)
    # ─────────────────────────────────────────────────────
    @router.post("/voice-message", response_model=VoiceMessageResponse)
    async def process_voice_message(
        audio: UploadFile = File(..., description="Voice message audio"),
        user_id: str = Form(..., description="Sender user ID"),
        conversation_id: str = Form("", description="Conversation ID"),
        target_language: str = Form(..., description="Target language for translation"),
        generate_voice_clone: bool = Form(True, description="Clone sender's voice")
    ):
        """
        Complete pipeline: transcribe → translate → synthesize with voice cloning.
        """
        if not audio_pipeline:
            raise HTTPException(status_code=503, detail="Audio pipeline not available")

        temp_path = None
        try:
            # Sauvegarder le fichier
            suffix = Path(audio.filename).suffix if audio.filename else ".m4a"
            temp_path = UPLOAD_DIR / f"msg_{uuid.uuid4()}{suffix}"

            with open(temp_path, "wb") as f:
                content = await audio.read()
                f.write(content)

            # Exécuter le pipeline
            message_id = str(uuid.uuid4())
            attachment_id = str(uuid.uuid4())

            result = await audio_pipeline.process_audio_message(
                audio_path=str(temp_path),
                audio_url=f"/uploads/{temp_path.name}",
                sender_id=user_id,
                conversation_id=conversation_id,
                message_id=message_id,
                attachment_id=attachment_id,
                target_languages=[target_language],
                generate_voice_clone=generate_voice_clone
            )

            # Récupérer la traduction pour la langue cible
            translation = result.translations.get(target_language)
            if not translation:
                raise HTTPException(
                    status_code=500,
                    detail=f"Translation failed for language: {target_language}"
                )

            return VoiceMessageResponse(
                original_text=result.original.transcription,
                original_language=result.original.language,
                translated_text=translation.translated_text,
                target_language=target_language,
                audio_url=translation.audio_url,
                processing_time_ms=result.processing_time_ms
            )

        except Exception as e:
            logger.error(f"Erreur pipeline audio: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

        finally:
            # Note: On garde le fichier temp car il pourrait être utilisé
            # pour améliorer le modèle de voix
            pass

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Récupérer un fichier audio généré
    # ─────────────────────────────────────────────────────
    @router.get("/audio/{filename}")
    async def get_audio_file(filename: str):
        """
        Retrieve a generated audio file.
        """
        audio_path = OUTPUT_DIR / "translated" / filename

        if not audio_path.exists():
            audio_path = OUTPUT_DIR / filename

        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Audio file not found")

        return FileResponse(
            audio_path,
            media_type="audio/mpeg",
            filename=filename
        )

    # ─────────────────────────────────────────────────────
    # ENDPOINT: Statistiques du service audio
    # ─────────────────────────────────────────────────────
    @router.get("/audio/stats")
    async def get_audio_stats():
        """
        Get statistics for all audio services.
        """
        stats = {
            "transcription": None,
            "voice_clone": None,
            "tts": None,
            "pipeline": None
        }

        if transcription_service:
            stats["transcription"] = await transcription_service.get_stats()
        if voice_clone_service:
            stats["voice_clone"] = await voice_clone_service.get_stats()
        if tts_service:
            stats["tts"] = await tts_service.get_stats()
        if audio_pipeline:
            stats["pipeline"] = await audio_pipeline.get_stats()

        return stats

    return router
