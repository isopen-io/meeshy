"""
Voice Profile Registration API - Dedicated endpoints for voice profile management

Features:
- Voice profile registration with 10s minimum audio
- Background noise isolation
- Database persistence (MongoDB via Prisma)
- Fingerprint-based update verification
- Consent workflow integration
- Age-based expiration (2 months for <18 years)
"""

from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Header, Depends
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path
import logging
import tempfile
import uuid
import os

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════

# Minimum audio duration for dedicated profile registration (10 seconds)
MIN_PROFILE_AUDIO_DURATION_MS = 10000

# Profile expiration for users under 18 (2 months)
MINOR_PROFILE_EXPIRATION_DAYS = 60

# Standard profile expiration (3 months)
STANDARD_PROFILE_EXPIRATION_DAYS = 90

# Minimum similarity threshold for profile updates
UPDATE_SIMILARITY_THRESHOLD = 0.80


# ═══════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════

class VoiceProfileRegistrationResponse(BaseModel):
    """Response for voice profile registration"""
    success: bool
    profile_id: str
    user_id: str
    quality_score: float
    audio_duration_ms: int
    voice_characteristics: Dict[str, Any]
    fingerprint_id: str
    version: int
    expires_at: str
    created_at: str
    message: str


class VoiceProfileUpdateResponse(BaseModel):
    """Response for voice profile update"""
    success: bool
    profile_id: str
    user_id: str
    quality_score: float
    version: int
    fingerprint_match_score: float
    updated_at: str
    expires_at: str
    message: str


class VoiceProfileDetailsResponse(BaseModel):
    """Detailed voice profile information"""
    profile_id: str
    user_id: str
    quality_score: float
    audio_count: int
    total_duration_ms: int
    version: int
    voice_characteristics: Optional[Dict[str, Any]] = None
    fingerprint: Optional[Dict[str, Any]] = None
    is_expired: bool
    expires_at: Optional[str] = None
    created_at: str
    updated_at: str
    next_update_suggested_at: Optional[str] = None


class ConsentRequest(BaseModel):
    """Request for voice profile consent"""
    consent_voice_recording: bool = Field(..., description="User consents to voice recording")
    birth_date: Optional[str] = Field(None, description="Birth date for age verification (YYYY-MM-DD)")
    accept_terms: bool = Field(..., description="User accepts terms of service")


class ConsentResponse(BaseModel):
    """Response for consent registration"""
    success: bool
    user_id: str
    voice_profile_consent_at: Optional[str] = None
    age_verification_consent_at: Optional[str] = None
    is_minor: bool
    profile_expiration_days: int
    message: str


# ═══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def get_user_id(authorization: Optional[str]) -> str:
    """Extract user ID from authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization required")

    # In production, verify JWT and extract user_id
    # For now, use header value directly or extract from Bearer token
    if authorization.startswith("Bearer "):
        # In production: decode JWT
        token = authorization[7:]
        # Placeholder: return token as user_id
        return token
    return authorization


async def save_upload_file(upload_file: UploadFile, target_dir: Path) -> Path:
    """Save uploaded file to target directory"""
    target_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload_file.filename).suffix if upload_file.filename else ".wav"
    temp_path = target_dir / f"upload_{uuid.uuid4().hex}{suffix}"

    content = await upload_file.read()
    with open(temp_path, "wb") as f:
        f.write(content)

    return temp_path


def calculate_age(birth_date: datetime) -> int:
    """Calculate age from birth date"""
    today = datetime.now()
    age = today.year - birth_date.year
    if (today.month, today.day) < (birth_date.month, birth_date.day):
        age -= 1
    return age


# ═══════════════════════════════════════════════════════════════════════════
# ROUTER FACTORY
# ═══════════════════════════════════════════════════════════════════════════

def create_voice_profile_router(
    voice_clone_service=None,
    database_service=None
) -> APIRouter:
    """
    Create voice profile router with injected dependencies.

    Args:
        voice_clone_service: VoiceCloneService instance
        database_service: DatabaseService instance for Prisma operations
    """
    router = APIRouter(prefix="/voice/profile", tags=["Voice Profile"])

    # Upload directory
    UPLOAD_DIR = Path(os.getenv('UPLOAD_DIR', './uploads'))

    # ═══════════════════════════════════════════════════════════════════════
    # CONSENT ENDPOINTS
    # ═══════════════════════════════════════════════════════════════════════

    @router.post("/consent", response_model=ConsentResponse)
    async def register_consent(
        consent: ConsentRequest,
        authorization: Optional[str] = Header(None)
    ):
        """
        Register user consent for voice profile recording.

        Must be called before creating a voice profile.
        If birth_date is provided and user is under 18, special expiration rules apply.
        """
        user_id = get_user_id(authorization)

        if not consent.consent_voice_recording or not consent.accept_terms:
            raise HTTPException(
                status_code=400,
                detail="Both voice recording consent and terms acceptance are required"
            )

        # Determine if user is a minor
        is_minor = False
        profile_expiration_days = STANDARD_PROFILE_EXPIRATION_DAYS
        birth_date_parsed = None

        if consent.birth_date:
            try:
                birth_date_parsed = datetime.strptime(consent.birth_date, "%Y-%m-%d")
                age = calculate_age(birth_date_parsed)
                is_minor = age < 18
                if is_minor:
                    profile_expiration_days = MINOR_PROFILE_EXPIRATION_DAYS
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid birth_date format. Use YYYY-MM-DD")

        # Update user consent in database
        consent_at = datetime.now()

        if database_service:
            try:
                await database_service.update_user_consent(
                    user_id=user_id,
                    voice_profile_consent_at=consent_at,
                    age_verification_consent_at=consent_at if consent.birth_date else None,
                    birth_date=birth_date_parsed,
                    voice_cloning_enabled_at=consent_at
                )
            except Exception as e:
                logger.error(f"Failed to update user consent: {e}")
                raise HTTPException(status_code=500, detail="Failed to save consent")

        return ConsentResponse(
            success=True,
            user_id=user_id,
            voice_profile_consent_at=consent_at.isoformat(),
            age_verification_consent_at=consent_at.isoformat() if consent.birth_date else None,
            is_minor=is_minor,
            profile_expiration_days=profile_expiration_days,
            message="Consent registered successfully. You can now create your voice profile."
        )

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE PROFILE REGISTRATION
    # ═══════════════════════════════════════════════════════════════════════

    @router.post("/register", response_model=VoiceProfileRegistrationResponse)
    async def register_voice_profile(
        audio: UploadFile = File(..., description="Audio recording (minimum 10 seconds)"),
        authorization: Optional[str] = Header(None)
    ):
        """
        Register a new voice profile with dedicated high-quality audio.

        Requirements:
        - User must have given consent (call /consent first)
        - Audio must be at least 10 seconds long
        - Only the primary speaker's voice will be extracted
        - Background noise will be isolated

        This endpoint is different from the auto-profile creation:
        - Requires explicit 10+ second recording
        - Higher quality requirements
        - Stores in database (not just cache)
        """
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)

        # Verify consent
        if database_service:
            try:
                user = await database_service.get_user(user_id)
                if not user or not user.get('voiceProfileConsentAt'):
                    raise HTTPException(
                        status_code=403,
                        detail="Voice profile consent required. Please call /consent first."
                    )
            except HTTPException:
                raise
            except Exception as e:
                logger.warning(f"Could not verify consent: {e}")

        # Save uploaded audio
        temp_path = await save_upload_file(audio, UPLOAD_DIR)

        try:
            # Get audio duration
            audio_duration_ms = await voice_clone_service._get_audio_duration_ms(str(temp_path))

            # Validate minimum duration (10 seconds)
            if audio_duration_ms < MIN_PROFILE_AUDIO_DURATION_MS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Audio too short. Minimum {MIN_PROFILE_AUDIO_DURATION_MS/1000:.0f} seconds required, "
                           f"got {audio_duration_ms/1000:.1f} seconds."
                )

            # Check if profile already exists
            existing_profile = await voice_clone_service._load_cached_model(user_id)
            if existing_profile:
                raise HTTPException(
                    status_code=409,
                    detail="Voice profile already exists. Use PUT /register/{profile_id} to update."
                )

            # Create voice model with full analysis
            model = await voice_clone_service._create_voice_model(
                user_id=user_id,
                audio_paths=[str(temp_path)],
                total_duration_ms=audio_duration_ms
            )

            # Generate fingerprint
            if model.voice_characteristics or model.embedding is not None:
                model.generate_fingerprint()

            # Determine expiration based on user age
            expiration_days = STANDARD_PROFILE_EXPIRATION_DAYS
            if database_service:
                try:
                    user = await database_service.get_user(user_id)
                    if user and user.get('birthDate'):
                        birth_date = user['birthDate']
                        if isinstance(birth_date, str):
                            birth_date = datetime.fromisoformat(birth_date.replace('Z', '+00:00'))
                        age = calculate_age(birth_date)
                        if age < 18:
                            expiration_days = MINOR_PROFILE_EXPIRATION_DAYS
                except Exception as e:
                    logger.warning(f"Could not determine user age: {e}")

            expires_at = datetime.now() + timedelta(days=expiration_days)
            model.next_recalibration_at = expires_at

            # Save to cache
            await voice_clone_service._save_model_to_cache(model)

            # Persist to database
            if database_service:
                try:
                    await database_service.save_voice_profile(
                        user_id=user_id,
                        profile_id=model.profile_id,
                        embedding_path=model.embedding_path,
                        audio_count=model.audio_count,
                        total_duration_ms=model.total_duration_ms,
                        quality_score=model.quality_score,
                        version=model.version,
                        voice_characteristics=model.voice_characteristics.to_dict() if model.voice_characteristics else None,
                        fingerprint=model.fingerprint.to_dict() if model.fingerprint else None,
                        signature_short=model.fingerprint.signature_short if model.fingerprint else None,
                        next_recalibration_at=expires_at
                    )
                except Exception as e:
                    logger.error(f"Failed to persist voice profile to database: {e}")
                    # Continue - profile is saved to cache

            return VoiceProfileRegistrationResponse(
                success=True,
                profile_id=model.profile_id or f"vp_{user_id[:12]}",
                user_id=user_id,
                quality_score=model.quality_score,
                audio_duration_ms=model.total_duration_ms,
                voice_characteristics=model.voice_characteristics.to_dict() if model.voice_characteristics else {},
                fingerprint_id=model.fingerprint.fingerprint_id if model.fingerprint else "",
                version=model.version,
                expires_at=expires_at.isoformat(),
                created_at=model.created_at.isoformat(),
                message="Voice profile created successfully"
            )

        finally:
            # Cleanup
            if temp_path.exists():
                temp_path.unlink()

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE PROFILE UPDATE
    # ═══════════════════════════════════════════════════════════════════════

    @router.put("/register/{profile_id}", response_model=VoiceProfileUpdateResponse)
    async def update_voice_profile(
        profile_id: str,
        audio: UploadFile = File(..., description="New audio recording for profile update"),
        authorization: Optional[str] = Header(None)
    ):
        """
        Update an existing voice profile with new audio.

        Requirements:
        - Profile must exist
        - New audio must match existing voice signature (>80% similarity)
        - Audio must be at least 10 seconds long

        The fingerprint verification ensures the same person is updating their profile.
        """
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)

        # Load existing profile
        existing_model = await voice_clone_service._load_cached_model(user_id)
        if not existing_model:
            raise HTTPException(status_code=404, detail="Voice profile not found")

        if existing_model.profile_id and existing_model.profile_id != profile_id:
            raise HTTPException(status_code=403, detail="Profile ID mismatch")

        # Save uploaded audio
        temp_path = await save_upload_file(audio, UPLOAD_DIR)

        try:
            # Get audio duration
            audio_duration_ms = await voice_clone_service._get_audio_duration_ms(str(temp_path))

            # Validate minimum duration
            if audio_duration_ms < MIN_PROFILE_AUDIO_DURATION_MS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Audio too short. Minimum {MIN_PROFILE_AUDIO_DURATION_MS/1000:.0f} seconds required."
                )

            # Load embedding if needed
            if existing_model.embedding is None:
                existing_model = await voice_clone_service._load_embedding(existing_model)

            # Analyze new audio and verify fingerprint match
            from services.voice_clone_service import get_voice_analyzer
            voice_analyzer = get_voice_analyzer()

            metadata = await voice_analyzer.analyze_audio(str(temp_path))

            fingerprint_match_score = 0.0

            if existing_model.fingerprint and metadata.primary_speaker:
                # Generate fingerprint for new audio
                new_fingerprint = metadata.primary_speaker.generate_fingerprint(
                    embedding=existing_model.embedding  # Use existing embedding for comparison
                )

                if new_fingerprint:
                    fingerprint_match_score = existing_model.fingerprint.similarity_score(new_fingerprint)

                    if fingerprint_match_score < UPDATE_SIMILARITY_THRESHOLD:
                        raise HTTPException(
                            status_code=403,
                            detail=f"Voice signature mismatch. Similarity: {fingerprint_match_score:.2%}, "
                                   f"required: {UPDATE_SIMILARITY_THRESHOLD:.0%}. "
                                   "Please ensure you are the original profile owner."
                        )

            # Update model with new audio
            updated_model = await voice_clone_service._improve_model(
                existing_model,
                str(temp_path)
            )

            # Regenerate fingerprint
            if updated_model.voice_characteristics or updated_model.embedding is not None:
                updated_model.generate_fingerprint()

            # Determine new expiration
            expiration_days = STANDARD_PROFILE_EXPIRATION_DAYS
            if database_service:
                try:
                    user = await database_service.get_user(user_id)
                    if user and user.get('birthDate'):
                        birth_date = user['birthDate']
                        if isinstance(birth_date, str):
                            birth_date = datetime.fromisoformat(birth_date.replace('Z', '+00:00'))
                        age = calculate_age(birth_date)
                        if age < 18:
                            expiration_days = MINOR_PROFILE_EXPIRATION_DAYS
                except Exception as e:
                    logger.warning(f"Could not determine user age: {e}")

            expires_at = datetime.now() + timedelta(days=expiration_days)
            updated_model.next_recalibration_at = expires_at

            # Save to cache
            await voice_clone_service._save_model_to_cache(updated_model)

            # Update database
            if database_service:
                try:
                    await database_service.update_voice_profile(
                        user_id=user_id,
                        quality_score=updated_model.quality_score,
                        audio_count=updated_model.audio_count,
                        total_duration_ms=updated_model.total_duration_ms,
                        version=updated_model.version,
                        voice_characteristics=updated_model.voice_characteristics.to_dict() if updated_model.voice_characteristics else None,
                        fingerprint=updated_model.fingerprint.to_dict() if updated_model.fingerprint else None,
                        signature_short=updated_model.fingerprint.signature_short if updated_model.fingerprint else None,
                        next_recalibration_at=expires_at
                    )
                except Exception as e:
                    logger.error(f"Failed to update voice profile in database: {e}")

            return VoiceProfileUpdateResponse(
                success=True,
                profile_id=updated_model.profile_id or profile_id,
                user_id=user_id,
                quality_score=updated_model.quality_score,
                version=updated_model.version,
                fingerprint_match_score=fingerprint_match_score,
                updated_at=updated_model.updated_at.isoformat(),
                expires_at=expires_at.isoformat(),
                message="Voice profile updated successfully"
            )

        finally:
            if temp_path.exists():
                temp_path.unlink()

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE PROFILE DETAILS
    # ═══════════════════════════════════════════════════════════════════════

    @router.get("/details", response_model=VoiceProfileDetailsResponse)
    async def get_voice_profile_details(
        authorization: Optional[str] = Header(None)
    ):
        """
        Get detailed information about the user's voice profile.

        Includes:
        - Profile quality and version
        - Voice characteristics (pitch, gender, etc.)
        - Fingerprint info (without embedding vector)
        - Expiration status
        """
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)

        model = await voice_clone_service._load_cached_model(user_id)
        if not model:
            raise HTTPException(status_code=404, detail="Voice profile not found")

        # Check expiration
        is_expired = False
        expires_at = None
        if model.next_recalibration_at:
            is_expired = datetime.now() > model.next_recalibration_at
            expires_at = model.next_recalibration_at.isoformat()

        # Suggest next update
        next_update = None
        if model.next_recalibration_at:
            # Suggest update 1 week before expiration
            next_update = (model.next_recalibration_at - timedelta(days=7)).isoformat()

        return VoiceProfileDetailsResponse(
            profile_id=model.profile_id or f"vp_{user_id[:12]}",
            user_id=user_id,
            quality_score=model.quality_score,
            audio_count=model.audio_count,
            total_duration_ms=model.total_duration_ms,
            version=model.version,
            voice_characteristics=model.voice_characteristics.to_dict() if model.voice_characteristics else None,
            fingerprint=model.fingerprint.to_dict() if model.fingerprint else None,
            is_expired=is_expired,
            expires_at=expires_at,
            created_at=model.created_at.isoformat(),
            updated_at=model.updated_at.isoformat(),
            next_update_suggested_at=next_update
        )

    # ═══════════════════════════════════════════════════════════════════════
    # VOICE PROFILE DELETION
    # ═══════════════════════════════════════════════════════════════════════

    @router.delete("/")
    async def delete_voice_profile(
        authorization: Optional[str] = Header(None)
    ):
        """
        Delete the user's voice profile completely.

        This removes:
        - Cached model and embedding files
        - Database record
        - All associated data

        This action cannot be undone.
        """
        if not voice_clone_service:
            raise HTTPException(status_code=503, detail="Voice clone service not available")

        user_id = get_user_id(authorization)

        # Delete from cache (file system)
        import shutil
        user_dir = voice_clone_service.voice_cache_dir / user_id
        if user_dir.exists():
            shutil.rmtree(user_dir)

        # Delete from database
        if database_service:
            try:
                await database_service.delete_voice_profile(user_id)
            except Exception as e:
                logger.error(f"Failed to delete voice profile from database: {e}")

        return {
            "success": True,
            "user_id": user_id,
            "message": "Voice profile deleted successfully"
        }

    return router
