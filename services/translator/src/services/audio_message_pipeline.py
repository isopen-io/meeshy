"""
Audio Message Pipeline - Main Entry Point
==========================================

This module maintains backward compatibility by re-exporting the refactored
audio pipeline components from the audio_pipeline package.

The actual implementation has been modularized into:
- audio_pipeline/transcription_stage.py: Audio transcription
- audio_pipeline/translation_stage.py: Translation + TTS
- audio_pipeline/audio_message_pipeline.py: Orchestrator

This file serves as the public API entry point for existing code.
"""

# Import helpers pour compatibilité des tests
from utils.performance import get_performance_optimizer
from services.transcription_service import get_transcription_service
from services.voice_clone_service import get_voice_clone_service
from services.tts_service import get_tts_service

# Re-export all public API from the modular package
from .audio_pipeline import (
    AudioMessagePipeline,
    get_audio_pipeline,
    AudioMessageResult,
    OriginalAudio,
    NewVoiceProfileData,
    AudioMessageMetadata,
    TranscriptionStage,
    TranscriptionStageResult,
    TranslationStage,
    TranslatedAudioVersion,
    create_transcription_stage,
    create_translation_stage,
)

# Re-export for backward compatibility
__all__ = [
    # Main API
    "AudioMessagePipeline",
    "get_audio_pipeline",
    "AudioMessageResult",
    "OriginalAudio",
    "NewVoiceProfileData",
    "AudioMessageMetadata",

    # Stages (for advanced usage)
    "TranscriptionStage",
    "TranscriptionStageResult",
    "TranslationStage",
    "TranslatedAudioVersion",
    "create_transcription_stage",
    "create_translation_stage",

    # Helpers pour compatibilité des tests
    "get_performance_optimizer",
    "get_transcription_service",
    "get_voice_clone_service",
    "get_tts_service",
]
