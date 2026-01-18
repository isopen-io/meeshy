"""
Audio Pipeline Package
======================

Modular audio message processing pipeline with specialized stages.

Architecture:
- Transcription Stage: Audio → Text (with caching)
- Translation Stage: Text → Translated Audio (parallel processing)
- Pipeline Orchestrator: Coordinates stages

Public API:
- AudioMessagePipeline: Main orchestrator
- get_audio_pipeline(): Singleton getter
- AudioMessageResult: Result dataclass
- Supporting dataclasses for inputs/outputs

Usage:
    from services.audio_pipeline import get_audio_pipeline, AudioMessageMetadata

    pipeline = get_audio_pipeline()
    await pipeline.initialize()

    result = await pipeline.process_audio_message(
        audio_path="/path/to/audio.mp3",
        audio_url="https://...",
        sender_id="user123",
        conversation_id="conv456",
        message_id="msg789",
        attachment_id="att999",
        target_languages=["en", "fr", "es"]
    )
"""

# Main pipeline
from .audio_message_pipeline import (
    AudioMessagePipeline,
    get_audio_pipeline,
    AudioMessageResult,
    OriginalAudio,
    NewVoiceProfileData
)

# Transcription stage
from .transcription_stage import (
    TranscriptionStage,
    TranscriptionStageResult,
    AudioMessageMetadata,
    create_transcription_stage
)

# Translation stage
from .translation_stage import (
    TranslationStage,
    TranslatedAudioVersion,
    create_translation_stage
)


__all__ = [
    # Main pipeline API
    "AudioMessagePipeline",
    "get_audio_pipeline",
    "AudioMessageResult",
    "OriginalAudio",
    "NewVoiceProfileData",

    # Transcription stage
    "TranscriptionStage",
    "TranscriptionStageResult",
    "AudioMessageMetadata",
    "create_transcription_stage",

    # Translation stage
    "TranslationStage",
    "TranslatedAudioVersion",
    "create_translation_stage",
]


# Package metadata
__version__ = "2.0.0"
__author__ = "Meeshy Team"
__description__ = "Modular audio message processing pipeline"
