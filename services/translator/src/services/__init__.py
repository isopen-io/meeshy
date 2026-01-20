"""
Meeshy Translation Services Module
Contient les services essentiels du système de traduction

✅ Migration terminée : QuantizedMLService actif
✅ Audio Pipeline: Transcription, Voice Clone, TTS
✅ Voice API: VoiceAnalyzer, TranslationPipeline, Analytics
"""

# ZMQ Server (optional - requires pyzmq)
ZMQ_AVAILABLE = False
try:
    from .zmq_server import ZMQTranslationServer
    ZMQ_AVAILABLE = True
except ImportError:
    ZMQTranslationServer = None

# Audio processing services (lazy loading to avoid import errors if dependencies missing)
AUDIO_SERVICES_AVAILABLE = False
try:
    from .transcription_service import TranscriptionService, get_transcription_service
    from .voice_clone_service import VoiceCloneService, VoiceModel, get_voice_clone_service
    # TTS Service: tts_service.py est le point d'entrée principal
    from .tts_service import TTSService, get_tts_service
    from .audio_message_pipeline import AudioMessagePipeline, get_audio_pipeline
    AUDIO_SERVICES_AVAILABLE = True
except ImportError as e:
    # Provide stubs for type hints
    TranscriptionService = None
    VoiceCloneService = None
    VoiceModel = None
    TTSService = None
    AudioMessagePipeline = None
    get_transcription_service = None
    get_voice_clone_service = None
    get_tts_service = None
    get_audio_pipeline = None

# Voice API services (production-ready)
VOICE_API_AVAILABLE = False
try:
    from .voice_analyzer_service import VoiceAnalyzerService, get_voice_analyzer_service
    from .translation_pipeline_service import TranslationPipelineService, get_translation_pipeline_service
    from .analytics_service import AnalyticsService, get_analytics_service
    VOICE_API_AVAILABLE = True
except ImportError as e:
    # Provide stubs for type hints
    VoiceAnalyzerService = None
    TranslationPipelineService = None
    AnalyticsService = None
    get_voice_analyzer_service = None
    get_translation_pipeline_service = None
    get_analytics_service = None

# Voice Profile Handler (for voice profile requests)
VOICE_PROFILE_HANDLER_AVAILABLE = False
try:
    from .zmq_voice_handler import VOICE_PROFILE_HANDLER_AVAILABLE
except ImportError:
    pass

__all__ = [
    "ZMQTranslationServer",
    "ZMQ_AVAILABLE",
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
    "AUDIO_SERVICES_AVAILABLE",
    # Voice API services
    "VoiceAnalyzerService",
    "TranslationPipelineService",
    "AnalyticsService",
    "get_voice_analyzer_service",
    "get_translation_pipeline_service",
    "get_analytics_service",
    "VOICE_API_AVAILABLE",
    "VOICE_PROFILE_HANDLER_AVAILABLE"
]
