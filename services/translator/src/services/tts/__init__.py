"""
TTS Module - Service TTS unifié refactorisé
============================================

Module TTS avec architecture modulaire (~300-400L par module):
- models.py: Définitions des modèles et métadonnées (~200L)
- model_manager.py: Gestion des modèles (~300L)
- language_router.py: Sélection automatique du backend (~200L)
- synthesizer.py: Synthèse TTS et conversion audio (~300L)
- tts_service.py: Façade orchestrateur (~250L)
- backends/: Backends TTS (Chatterbox, MMS, VITS, XTTS, Higgs)

Usage:
    from services.tts import TTSService, get_tts_service

    # Obtenir le service singleton
    tts_service = get_tts_service()

    # Initialiser le service
    await tts_service.initialize()

    # Synthétiser avec clonage vocal
    result = await tts_service.synthesize_with_voice(
        text="Hello world",
        speaker_audio_path="/path/to/voice.wav",
        target_language="en"
    )
"""

# Backends (base)
from .base import BaseTTSBackend
from .backends import (
    ChatterboxBackend,
    MMSBackend,
    VITSBackend,
    XTTSBackend,
    HiggsAudioBackend,
)

# Service principal et composants
from .tts_service import (
    UnifiedTTSService,
    TTSService,
    get_tts_service,
    get_unified_tts_service,
    check_license_compliance,
)

# Types et modèles
from .models import (
    TTSModel,
    TTSModelInfo,
    TTS_MODEL_INFO,
)

# Résultats de synthèse
from .synthesizer import (
    UnifiedTTSResult,
    TTSResult,
)

# Statuts de modèles
from .model_manager import ModelStatus

__all__ = [
    # Backends
    "BaseTTSBackend",
    "ChatterboxBackend",
    "MMSBackend",
    "VITSBackend",
    "XTTSBackend",
    "HiggsAudioBackend",
    # Service principal
    "TTSService",
    "UnifiedTTSService",
    "get_tts_service",
    "get_unified_tts_service",
    # Résultats
    "TTSResult",
    "UnifiedTTSResult",
    # Enums et types
    "TTSModel",
    "TTSModelInfo",
    "ModelStatus",
    "TTS_MODEL_INFO",
    # Fonctions
    "check_license_compliance",
]
