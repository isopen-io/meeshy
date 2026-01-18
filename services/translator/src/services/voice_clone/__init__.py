"""
Module de clonage vocal - Architecture modulaire complète.

Ce module fournit les fonctionnalités de clonage vocal avec :
- Extraction d'empreintes vocales uniques
- Analyse audio et détection de locuteurs
- Gestion de modèles de voix persistants
- Support multi-locuteurs pour traduction
- Cache Redis et stockage
- Création et amélioration de modèles

Architecture (12 modules, ~404 lignes/module) :
- voice_fingerprint.py (257L): Empreintes vocales et signatures cryptographiques
- voice_metadata.py (401L): Classes de métadonnées pour audios et profils
- voice_analyzer.py (784L): Analyse audio et extraction de caractéristiques
- voice_quality_analyzer.py (523L): Analyse de qualité et similarité vocale
- voice_clone_init.py (248L): Initialisation et configuration du service
- voice_clone_cache.py (390L): Gestion cache Redis et stockage
- voice_clone_audio.py (446L): Opérations audio (extraction, concaténation)
- voice_clone_multi_speaker.py (214L): Gestion multi-locuteurs pour traduction
- voice_clone_model_creation.py (581L): Création de nouveaux modèles vocaux
- voice_clone_model_improvement.py (291L): Amélioration progressive des modèles
- voice_clone_service.py (642L): Service principal orchestrateur
"""

# Exports publics - Métadonnées et structures de données
from .voice_fingerprint import VoiceFingerprint
from .voice_metadata import (
    SpeakerInfo,
    RecordingMetadata,
    AudioQualityMetadata,
    VoiceModel,
    TemporaryVoiceProfile,
    MultiSpeakerTranslationContext
)

# Exports publics - Analyseurs
from .voice_analyzer import VoiceAnalyzer, get_voice_analyzer
from .voice_quality_analyzer import (
    VoiceQualityAnalyzer,
    VoiceQualityMetrics,
    VoiceSimilarityResult,
    get_voice_quality_analyzer
)

# Exports publics - Modules fonctionnels
from .voice_clone_init import VoiceCloneInitializer, get_voice_clone_initializer
from .voice_clone_cache import VoiceCloneCacheManager
from .voice_clone_audio import VoiceCloneAudioProcessor
from .voice_clone_multi_speaker import VoiceCloneMultiSpeaker, get_voice_clone_multi_speaker
from .voice_clone_model_creation import VoiceCloneModelCreator
from .voice_clone_model_improvement import VoiceCloneModelImprover


__all__ = [
    # Empreintes vocales
    "VoiceFingerprint",

    # Métadonnées
    "SpeakerInfo",
    "RecordingMetadata",
    "AudioQualityMetadata",
    "VoiceModel",
    "TemporaryVoiceProfile",
    "MultiSpeakerTranslationContext",

    # Analyseurs
    "VoiceAnalyzer",
    "get_voice_analyzer",
    "VoiceQualityAnalyzer",
    "VoiceQualityMetrics",
    "VoiceSimilarityResult",
    "get_voice_quality_analyzer",

    # Modules fonctionnels
    "VoiceCloneInitializer",
    "get_voice_clone_initializer",
    "VoiceCloneCacheManager",
    "VoiceCloneAudioProcessor",
    "VoiceCloneMultiSpeaker",
    "get_voice_clone_multi_speaker",
    "VoiceCloneModelCreator",
    "VoiceCloneModelImprover",
]
