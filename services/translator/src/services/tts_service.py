"""
Service TTS - Point d'entrée principal (Compatibilité)
======================================================

Fichier de compatibilité qui réexporte depuis le nouveau module refactorisé.

ANCIENNE ARCHITECTURE (1097 lignes - God Object):
- Tout dans un seul fichier tts_service.py

NOUVELLE ARCHITECTURE (Modulaire ~300-400L par module):
- tts/models.py: Définitions des modèles et métadonnées
- tts/model_manager.py: Gestion des modèles (chargement, téléchargement, cache)
- tts/language_router.py: Sélection automatique du backend selon la langue
- tts/synthesizer.py: Synthèse TTS et conversion audio
- tts/tts_service.py: Façade orchestrateur (API publique)

Ce fichier maintient la compatibilité avec les imports existants:
    from services.tts_service import TTSService, get_tts_service
"""

# Réexporter tout depuis le nouveau module refactorisé
from .tts.tts_service import (
    UnifiedTTSService,
    TTSService,
    get_tts_service,
    get_unified_tts_service,
    check_license_compliance,
)

from .tts.models import (
    TTSModel,
    TTSModelInfo,
    TTS_MODEL_INFO,
)

from .tts.synthesizer import (
    UnifiedTTSResult,
)

from .tts.model_manager import (
    ModelStatus,
)

# Backends (réexportés depuis tts/)
from .tts import (
    BaseTTSBackend,
    ChatterboxBackend,
    MMSBackend,
    VITSBackend,
    XTTSBackend,
    HiggsAudioBackend,
)

# Alias pour compatibilité
TTSResult = UnifiedTTSResult

__all__ = [
    # Service principal
    "TTSService",
    "UnifiedTTSService",
    "TTSResult",
    "UnifiedTTSResult",
    "get_tts_service",
    "get_unified_tts_service",
    # Enums et types
    "TTSModel",
    "TTSModelInfo",
    "ModelStatus",
    "TTS_MODEL_INFO",
    # Fonctions
    "check_license_compliance",
    # Backends (réexportés depuis tts/)
    "BaseTTSBackend",
    "ChatterboxBackend",
    "MMSBackend",
    "VITSBackend",
    "XTTSBackend",
    "HiggsAudioBackend",
]
