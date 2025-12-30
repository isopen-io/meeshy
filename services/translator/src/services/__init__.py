"""
Meeshy Translation Services Module
Contient les services essentiels du système de traduction

✅ Migration terminée : QuantizedMLService actif
✅ Audio Pipeline: Transcription, Voice Clone, TTS
"""

from .zmq_server import ZMQTranslationServer

# Audio processing services (lazy loading to avoid import errors if dependencies missing)
try:
    from .transcription_service import TranscriptionService, get_transcription_service
    from .voice_clone_service import VoiceCloneService, VoiceModel, get_voice_clone_service
    from .tts_service import TTSService, get_tts_service
    from .audio_message_pipeline import AudioMessagePipeline, get_audio_pipeline
    AUDIO_SERVICES_AVAILABLE = True
except ImportError:
    AUDIO_SERVICES_AVAILABLE = False

__all__ = [
    "ZMQTranslationServer",
    # Audio services (conditional)
    "TranscriptionService",
    "VoiceCloneService",
    "VoiceModel",
    "TTSService",
    "AudioMessagePipeline",
    "get_transcription_service",
    "get_voice_clone_service",
    "get_tts_service",
    "get_audio_pipeline",
    "AUDIO_SERVICES_AVAILABLE"
]
