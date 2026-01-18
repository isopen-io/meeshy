"""
Module de clonage vocal - Architecture modulaire.

Ce module fournit les fonctionnalités de clonage vocal avec :
- Extraction d'empreintes vocales uniques
- Analyse audio et détection de locuteurs
- Gestion de modèles de voix persistants
- Support multi-locuteurs pour traduction

Modules:
- voice_fingerprint: Empreintes vocales et signatures cryptographiques
- voice_metadata: Classes de métadonnées pour audios et profils
- voice_analyzer: Analyse audio et extraction de caractéristiques
- voice_clone_service: Service principal de clonage vocal
"""

# Exports publics
from .voice_fingerprint import VoiceFingerprint
from .voice_metadata import (
    SpeakerInfo,
    RecordingMetadata,
    AudioQualityMetadata,
    VoiceModel,
    TemporaryVoiceProfile,
    MultiSpeakerTranslationContext
)
from .voice_analyzer import VoiceAnalyzer, get_voice_analyzer

# VoiceCloneService sera importé du fichier original pour l'instant
# TODO: Refactoriser VoiceCloneService en modules plus petits

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

    # Analyseur
    "VoiceAnalyzer",
    "get_voice_analyzer",
]
