"""
Voice Clone Audio Processor

Handles audio processing operations for voice cloning:
- Voice embedding extraction
- Audio concatenation and aggregation
- Audio history management
- Audio quality scoring
- Best audio selection for cloning

Extracted from voice_clone_service.py to reduce God Object complexity.
"""

import os
import logging
import asyncio
from typing import Optional, List
from pathlib import Path
import numpy as np

try:
    from pydub import AudioSegment
    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    AUDIO_PROCESSING_AVAILABLE = False

from .voice_metadata import AudioQualityMetadata

logger = logging.getLogger(__name__)


class VoiceCloneAudioProcessor:
    """
    Processes audio files for voice cloning operations.

    Responsibilities:
    - Extract voice embeddings from audio files
    - Concatenate multiple audio files for aggregation
    - Retrieve audio history from database
    - Calculate audio duration and quality scores
    - Select best audio for cloning based on multiple criteria
    """

    def __init__(
        self,
        database_service=None,
        se_extractor_module=None,
        tone_color_converter=None,
        max_audio_history: int = 20
    ):
        """
        Initialize audio processor.

        Args:
            database_service: Optional database service for audio history
            se_extractor_module: OpenVoice se_extractor module
            tone_color_converter: OpenVoice ToneColorConverter instance
            max_audio_history: Maximum number of historical audios to aggregate
        """
        self.database_service = database_service
        self.se_extractor_module = se_extractor_module
        self.tone_color_converter = tone_color_converter
        self.MAX_AUDIO_HISTORY = max_audio_history

    def set_openvoice_components(
        self,
        se_extractor_module,
        tone_color_converter
    ):
        """
        Inject OpenVoice components after initialization.

        Args:
            se_extractor_module: OpenVoice se_extractor module
            tone_color_converter: OpenVoice ToneColorConverter instance
        """
        self.se_extractor_module = se_extractor_module
        self.tone_color_converter = tone_color_converter

    def set_database_service(self, database_service):
        """
        Inject database service for audio history access.

        Args:
            database_service: Database service with Prisma client
        """
        self.database_service = database_service

    async def extract_voice_embedding(
        self,
        audio_path: str,
        target_dir: Path
    ) -> Optional[np.ndarray]:
        """
        Extract voice embedding from an audio file using OpenVoice.

        Args:
            audio_path: Path to audio file
            target_dir: Directory to store temporary files

        Returns:
            Voice embedding as numpy array, or zeros if OpenVoice unavailable
        """
        if self.se_extractor_module is None or self.tone_color_converter is None:
            logger.warning("[VOICE_CLONE_AUDIO] OpenVoice non disponible, embedding factice")
            return np.zeros(256)

        try:
            loop = asyncio.get_event_loop()
            # get_se returns a tuple (embedding, audio_name)
            result = await loop.run_in_executor(
                None,
                lambda: self.se_extractor_module.get_se(
                    audio_path,
                    self.tone_color_converter,
                    target_dir=str(target_dir)
                )
            )
            # Extract embedding from tuple
            embedding, _audio_name = result

            # Convert PyTorch tensor to numpy array if needed
            if hasattr(embedding, 'cpu'):
                embedding = embedding.cpu().detach().numpy()

            logger.info(
                f"[VOICE_CLONE_AUDIO] Embedding extrait: "
                f"shape={embedding.shape}, dtype={embedding.dtype}"
            )
            return embedding

        except Exception as e:
            logger.error(f"[VOICE_CLONE_AUDIO] Erreur extraction embedding: {e}")
            import traceback
            traceback.print_exc()
            return np.zeros(256)

    async def concatenate_audios(
        self,
        audio_paths: List[str],
        output_dir: Path,
        user_id: str
    ) -> str:
        """
        Concatenate multiple audio files into a single file.

        Args:
            audio_paths: List of audio file paths to concatenate
            output_dir: Directory to save concatenated audio
            user_id: User ID for filename

        Returns:
            Path to concatenated audio file
        """
        if not AUDIO_PROCESSING_AVAILABLE:
            logger.warning("[VOICE_CLONE_AUDIO] pydub non disponible, retour premier audio")
            return audio_paths[0]

        try:
            combined = AudioSegment.empty()
            valid_count = 0

            for path in audio_paths:
                try:
                    audio = AudioSegment.from_file(path)
                    combined += audio
                    valid_count += 1
                    logger.debug(f"[VOICE_CLONE_AUDIO] Audio ajouté: {path} ({len(audio)}ms)")
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE_AUDIO] Impossible de lire {path}: {e}")

            if valid_count == 0:
                logger.error("[VOICE_CLONE_AUDIO] Aucun audio valide pour concaténation")
                return audio_paths[0]

            # Save combined audio
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"{user_id}_combined_audio.wav"
            combined.export(str(output_path), format="wav")

            logger.info(
                f"[VOICE_CLONE_AUDIO] {valid_count} audios concaténés: "
                f"{len(combined)}ms → {output_path}"
            )
            return str(output_path)

        except Exception as e:
            logger.error(f"[VOICE_CLONE_AUDIO] Erreur concaténation: {e}")
            return audio_paths[0]

    async def get_user_audio_history(
        self,
        user_id: str,
        exclude: Optional[List[str]] = None,
        limit: Optional[int] = None
    ) -> List[str]:
        """
        Retrieve audio message history for a user from database.

        Args:
            user_id: User ID
            exclude: List of file paths to exclude
            limit: Maximum number of audios to retrieve

        Returns:
            List of audio file paths, sorted by most recent first
        """
        limit = limit or self.MAX_AUDIO_HISTORY
        exclude = exclude or []

        if not self.database_service:
            logger.warning("[VOICE_CLONE_AUDIO] Database service non disponible")
            return []

        try:
            # Query audio attachments from user's messages
            attachments = await self.database_service.prisma.messageattachment.find_many(
                where={
                    "message": {
                        "senderId": user_id
                    },
                    "mimeType": {
                        "startswith": "audio/"
                    }
                },
                order={"createdAt": "desc"},
                take=limit
            )

            # Filter existing files and excluded paths
            audio_paths = []
            for att in attachments:
                if (att.filePath
                    and att.filePath not in exclude
                    and os.path.exists(att.filePath)):
                    audio_paths.append(att.filePath)

            logger.info(
                f"[VOICE_CLONE_AUDIO] {len(audio_paths)} audios historiques "
                f"trouvés pour {user_id}"
            )
            return audio_paths

        except Exception as e:
            logger.error(f"[VOICE_CLONE_AUDIO] Erreur récupération historique: {e}")
            return []

    async def get_best_audio_for_cloning(
        self,
        user_id: str,
        limit: int = 10
    ) -> Optional[AudioQualityMetadata]:
        """
        Select the best audio for voice cloning based on quality criteria.

        Criteria (priority order):
        1. Longest duration
        2. Highest clarity (low noise)
        3. Single speaker (no other speakers)
        4. Most recent

        Args:
            user_id: User ID
            limit: Maximum number of recent audios to evaluate

        Returns:
            AudioQualityMetadata of best audio, or None if no audio found
        """
        if not self.database_service:
            logger.warning("[VOICE_CLONE_AUDIO] Database service non disponible")
            return None

        try:
            # Query recent audio attachments
            attachments = await self.database_service.prisma.messageattachment.find_many(
                where={
                    "message": {
                        "senderId": user_id
                    },
                    "mimeType": {
                        "startswith": "audio/"
                    }
                },
                order={"createdAt": "desc"},
                take=limit
            )

            if not attachments:
                logger.info(f"[VOICE_CLONE_AUDIO] Aucun audio trouvé pour {user_id}")
                return None

            # Convert to AudioQualityMetadata and calculate scores
            quality_audios: List[AudioQualityMetadata] = []

            for att in attachments:
                if att.filePath and os.path.exists(att.filePath):
                    duration_ms = await self.get_audio_duration_ms(att.filePath)

                    # Extract quality metadata if available
                    # These fields should be added to MessageAttachment Prisma schema
                    noise_level = getattr(att, 'noiseLevel', 0.0) or 0.0
                    clarity_score = getattr(att, 'clarityScore', 1.0) or 1.0
                    has_other_speakers = getattr(att, 'hasOtherSpeakers', False) or False

                    audio_meta = AudioQualityMetadata(
                        attachment_id=att.id,
                        file_path=att.filePath,
                        duration_ms=duration_ms,
                        noise_level=noise_level,
                        clarity_score=clarity_score,
                        has_other_speakers=has_other_speakers,
                        created_at=att.createdAt if hasattr(att, 'createdAt') else None
                    )
                    audio_meta.calculate_overall_score()
                    quality_audios.append(audio_meta)

            if not quality_audios:
                logger.warning(f"[VOICE_CLONE_AUDIO] Aucun audio valide pour {user_id}")
                return None

            # Sort by score descending and return best
            quality_audios.sort(key=lambda x: x.overall_score, reverse=True)
            best_audio = quality_audios[0]

            logger.info(
                f"[VOICE_CLONE_AUDIO] Meilleur audio sélectionné pour {user_id}: "
                f"id={best_audio.attachment_id}, duration={best_audio.duration_ms}ms, "
                f"score={best_audio.overall_score:.2f}"
            )
            return best_audio

        except Exception as e:
            logger.error(f"[VOICE_CLONE_AUDIO] Erreur sélection meilleur audio: {e}")
            return None

    async def calculate_total_duration(self, audio_paths: List[str]) -> int:
        """
        Calculate total duration of multiple audio files.

        Args:
            audio_paths: List of audio file paths

        Returns:
            Total duration in milliseconds
        """
        total = 0
        for path in audio_paths:
            duration = await self.get_audio_duration_ms(path)
            total += duration

        logger.debug(
            f"[VOICE_CLONE_AUDIO] Durée totale: {total}ms "
            f"({len(audio_paths)} fichiers)"
        )
        return total

    async def get_audio_duration_ms(self, audio_path: str) -> int:
        """
        Get audio file duration in milliseconds.

        Tries librosa first for better accuracy, falls back to pydub
        for formats not supported by soundfile (e.g., webm, mp4).

        Args:
            audio_path: Path to audio file

        Returns:
            Duration in milliseconds, or 0 if unable to read
        """
        if not AUDIO_PROCESSING_AVAILABLE:
            return 0

        loop = asyncio.get_event_loop()

        # Try librosa first
        try:
            import librosa
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            if duration > 0:
                duration_ms = int(duration * 1000)
                logger.debug(
                    f"[VOICE_CLONE_AUDIO] Durée (librosa): {duration_ms}ms - {audio_path}"
                )
                return duration_ms
        except Exception as e:
            logger.debug(f"[VOICE_CLONE_AUDIO] librosa n'a pas pu lire {audio_path}: {e}")

        # Fallback to pydub (supports more formats via ffmpeg)
        try:
            def get_duration_with_pydub():
                audio = AudioSegment.from_file(audio_path)
                return len(audio)  # pydub returns duration in ms

            duration_ms = await loop.run_in_executor(None, get_duration_with_pydub)
            logger.debug(
                f"[VOICE_CLONE_AUDIO] Durée (pydub): {duration_ms}ms - {audio_path}"
            )
            return duration_ms

        except Exception as e:
            logger.warning(
                f"[VOICE_CLONE_AUDIO] Impossible de lire la durée de {audio_path}: {e}"
            )
            return 0

    def calculate_quality_score(self, duration_ms: int, audio_count: int) -> float:
        """
        Calculate quality score based on duration and audio count.

        Score ranges:
        - 0-10s: 0.3 (low)
        - 10-30s: 0.5 (medium)
        - 30-60s: 0.7 (good)
        - 60s+: 0.9 (excellent)
        - Bonus: +0.05 per additional audio (max +0.1)

        Args:
            duration_ms: Total audio duration in milliseconds
            audio_count: Number of audio files aggregated

        Returns:
            Quality score between 0.0 and 1.0
        """
        # Base score from duration
        if duration_ms < 10_000:
            base_score = 0.3
        elif duration_ms < 30_000:
            base_score = 0.5
        elif duration_ms < 60_000:
            base_score = 0.7
        else:
            base_score = 0.9

        # Bonus from multiple audios (diversity)
        audio_bonus = min(0.1, (audio_count - 1) * 0.05)

        final_score = min(1.0, base_score + audio_bonus)

        logger.debug(
            f"[VOICE_CLONE_AUDIO] Score qualité calculé: {final_score:.2f} "
            f"(durée={duration_ms}ms, audios={audio_count})"
        )
        return final_score
