"""
Configuration pour le clonage vocal - Paramètres utilisateur
============================================================

Ce module centralise tous les paramètres configurables pour le clonage vocal.
Ces paramètres peuvent être définis:
1. Par défaut dans ce fichier
2. Par l'utilisateur via son profil vocal
3. Par requête (override temporaire)

Basé sur les meilleures pratiques du script iOS voice_cloning_test.py.
"""

import os
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum


class TTSEngine(str, Enum):
    """Moteurs TTS disponibles"""
    CHATTERBOX = "chatterbox"           # Recommandé - 23 langues avec clonage
    CHATTERBOX_TURBO = "chatterbox-turbo"  # Plus rapide, qualité légèrement réduite
    HIGGS_AUDIO_V2 = "higgs-audio-v2"   # Haute qualité - Licence limitée
    XTTS_V2 = "xtts-v2"                 # Legacy - Non-commercial
    MMS = "mms"                         # Meta MMS - 1100+ langues (sans clonage)
    VITS = "vits"                       # VITS - Langues africaines spécifiques


class VoiceType(str, Enum):
    """Types de voix détectés"""
    HIGH_FEMALE = "high_female"
    MEDIUM_FEMALE = "medium_female"
    LOW_FEMALE = "low_female"
    HIGH_MALE = "high_male"
    MEDIUM_MALE = "medium_male"
    LOW_MALE = "low_male"
    CHILD = "child"
    UNKNOWN = "unknown"


class EstimatedGender(str, Enum):
    """Genre estimé de la voix"""
    MALE = "male"
    FEMALE = "female"
    CHILD = "child"
    UNKNOWN = "unknown"


@dataclass
class VoiceCloningParameters:
    """
    Paramètres de synthèse vocale pour le clonage.

    Ces paramètres contrôlent la qualité et le style du clonage vocal.
    L'utilisateur peut les personnaliser dans son profil.

    Attributes:
        exaggeration: Contrôle l'exagération des caractéristiques vocales (0.0-1.0)
                      - 0.0 = voix très naturelle, proche de l'original
                      - 0.5 = équilibre (défaut recommandé)
                      - 1.0 = caractéristiques vocales très prononcées

        cfg_weight: Poids CFG (Classifier-Free Guidance) pour la génération (0.0-1.0)
                    - Pour langues non-anglaises: 0.0 réduit le transfert d'accent
                    - 0.5 = équilibre (défaut pour anglais)
                    - 1.0 = forte adhésion au conditionnement

        temperature: Contrôle la variabilité de la génération (0.1-2.0)
                     - 0.5 = plus déterministe, moins de variation
                     - 1.0 = défaut
                     - 1.5 = plus de variation créative

        top_p: Nucleus sampling - probabilité cumulée (0.0-1.0)
               - 0.9 = défaut, bon équilibre
               - 1.0 = considère tous les tokens

        repetition_penalty: Pénalité de répétition (1.0-2.0)
                            - 1.0 = pas de pénalité
                            - 1.2 = défaut, évite les répétitions
    """
    # Paramètres principaux (Chatterbox)
    exaggeration: float = 0.5
    cfg_weight: float = 0.5

    # Paramètres avancés (optionnels selon le moteur)
    temperature: float = 1.0
    top_p: float = 0.9
    repetition_penalty: float = 1.2

    # Qualité audio
    sample_rate: int = 22050
    audio_format: str = "mp3"
    audio_bitrate: str = "192k"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "exaggeration": self.exaggeration,
            "cfg_weight": self.cfg_weight,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "repetition_penalty": self.repetition_penalty,
            "sample_rate": self.sample_rate,
            "audio_format": self.audio_format,
            "audio_bitrate": self.audio_bitrate
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceCloningParameters':
        return cls(
            exaggeration=data.get("exaggeration", 0.5),
            cfg_weight=data.get("cfg_weight", 0.5),
            temperature=data.get("temperature", 1.0),
            top_p=data.get("top_p", 0.9),
            repetition_penalty=data.get("repetition_penalty", 1.2),
            sample_rate=data.get("sample_rate", 22050),
            audio_format=data.get("audio_format", "mp3"),
            audio_bitrate=data.get("audio_bitrate", "192k")
        )

    @classmethod
    def for_language(cls, language: str, base_params: 'VoiceCloningParameters' = None) -> 'VoiceCloningParameters':
        """
        Retourne les paramètres optimaux pour une langue donnée.

        Pour les langues non-anglaises, cfg_weight=0.0 est recommandé
        pour réduire le transfert d'accent.
        """
        params = base_params or cls()
        lang_code = language.lower().split('-')[0]

        # Pour les langues non-anglaises, réduire cfg_weight pour éviter l'accent anglais
        if lang_code != 'en':
            return cls(
                exaggeration=params.exaggeration,
                cfg_weight=0.0,  # Réduit le transfert d'accent
                temperature=params.temperature,
                top_p=params.top_p,
                repetition_penalty=params.repetition_penalty,
                sample_rate=params.sample_rate,
                audio_format=params.audio_format,
                audio_bitrate=params.audio_bitrate
            )

        return params


@dataclass
class PerformanceConfig:
    """
    Configuration des performances pour le traitement audio.

    Attributes:
        parallel_processing: Active le traitement parallèle des langues
        max_workers: Nombre maximum de workers parallèles
        use_process_pool: Utilise ProcessPoolExecutor au lieu de ThreadPoolExecutor
                          (bypass le GIL pour les opérations CPU-bound)
        enable_torch_compile: Active torch.compile() pour optimiser les modèles
        use_fp16: Utilise la précision mixte FP16 (plus rapide, moins de mémoire)
        warmup_model: Fait un warmup du modèle au chargement
        batch_size: Taille des batchs pour le traitement groupé
        inference_timeout_seconds: Timeout pour chaque inférence
    """
    parallel_processing: bool = True
    max_workers: int = 4
    use_process_pool: bool = False  # ProcessPoolExecutor pour bypass GIL
    enable_torch_compile: bool = False  # torch.compile() (peut être lent au démarrage)
    use_fp16: bool = False  # Mixed precision
    warmup_model: bool = True
    batch_size: int = 8
    inference_timeout_seconds: int = 60

    # Gestion mémoire GPU
    gpu_memory_fraction: float = 0.8
    enable_memory_cleanup: bool = True
    cleanup_interval_requests: int = 100

    def to_dict(self) -> Dict[str, Any]:
        return {
            "parallel_processing": self.parallel_processing,
            "max_workers": self.max_workers,
            "use_process_pool": self.use_process_pool,
            "enable_torch_compile": self.enable_torch_compile,
            "use_fp16": self.use_fp16,
            "warmup_model": self.warmup_model,
            "batch_size": self.batch_size,
            "inference_timeout_seconds": self.inference_timeout_seconds,
            "gpu_memory_fraction": self.gpu_memory_fraction,
            "enable_memory_cleanup": self.enable_memory_cleanup,
            "cleanup_interval_requests": self.cleanup_interval_requests
        }


@dataclass
class UserVoiceProfileSettings:
    """
    Paramètres de profil vocal spécifiques à l'utilisateur.

    Ces paramètres sont sauvegardés avec le profil vocal de l'utilisateur
    et peuvent être modifiés via les paramètres de l'application.

    Attributes:
        preferred_engine: Moteur TTS préféré
        cloning_params: Paramètres de clonage vocal personnalisés
        preferred_languages: Langues préférées pour la traduction
        voice_enhancement: Active l'amélioration vocale
        noise_reduction: Niveau de réduction du bruit (0.0-1.0)
        auto_adjust_pitch: Ajuste automatiquement le pitch pour les langues cibles
    """
    user_id: str = ""
    preferred_engine: TTSEngine = TTSEngine.CHATTERBOX
    cloning_params: VoiceCloningParameters = field(default_factory=VoiceCloningParameters)
    preferred_languages: List[str] = field(default_factory=lambda: ['en', 'fr', 'es'])

    # Options d'amélioration
    voice_enhancement: bool = True
    noise_reduction: float = 0.3
    auto_adjust_pitch: bool = False

    # Qualité vs vitesse
    quality_preset: str = "balanced"  # "fast", "balanced", "high_quality"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "preferred_engine": self.preferred_engine.value,
            "cloning_params": self.cloning_params.to_dict(),
            "preferred_languages": self.preferred_languages,
            "voice_enhancement": self.voice_enhancement,
            "noise_reduction": self.noise_reduction,
            "auto_adjust_pitch": self.auto_adjust_pitch,
            "quality_preset": self.quality_preset
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'UserVoiceProfileSettings':
        cloning_params = VoiceCloningParameters.from_dict(
            data.get("cloning_params", {})
        )

        engine = data.get("preferred_engine", "chatterbox")
        try:
            preferred_engine = TTSEngine(engine)
        except ValueError:
            preferred_engine = TTSEngine.CHATTERBOX

        return cls(
            user_id=data.get("user_id", ""),
            preferred_engine=preferred_engine,
            cloning_params=cloning_params,
            preferred_languages=data.get("preferred_languages", ['en', 'fr', 'es']),
            voice_enhancement=data.get("voice_enhancement", True),
            noise_reduction=data.get("noise_reduction", 0.3),
            auto_adjust_pitch=data.get("auto_adjust_pitch", False),
            quality_preset=data.get("quality_preset", "balanced")
        )

    def get_params_for_language(self, language: str) -> VoiceCloningParameters:
        """Retourne les paramètres optimisés pour une langue spécifique"""
        return VoiceCloningParameters.for_language(language, self.cloning_params)


@dataclass
class VoiceCloningRequest:
    """
    Requête complète de clonage vocal avec tous les paramètres.

    Cette structure est utilisée pour passer les paramètres de clonage
    depuis la Gateway vers le Translator via ZMQ.
    """
    # Identifiants
    message_id: str
    attachment_id: str
    sender_id: str
    conversation_id: str

    # Audio source
    audio_path: str
    audio_url: str
    audio_duration_ms: int = 0

    # Langues
    source_language: Optional[str] = None
    target_languages: List[str] = field(default_factory=list)

    # Paramètres de clonage (peuvent être overrides par l'utilisateur)
    cloning_params: Optional[VoiceCloningParameters] = None

    # Options
    generate_voice_clone: bool = True
    use_existing_voice_profile: bool = True
    original_sender_id: Optional[str] = None  # Pour les messages transférés

    # Métadonnées mobile
    mobile_transcription: Optional[str] = None
    mobile_transcription_confidence: Optional[float] = None
    mobile_transcription_source: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message_id": self.message_id,
            "attachment_id": self.attachment_id,
            "sender_id": self.sender_id,
            "conversation_id": self.conversation_id,
            "audio_path": self.audio_path,
            "audio_url": self.audio_url,
            "audio_duration_ms": self.audio_duration_ms,
            "source_language": self.source_language,
            "target_languages": self.target_languages,
            "cloning_params": self.cloning_params.to_dict() if self.cloning_params else None,
            "generate_voice_clone": self.generate_voice_clone,
            "use_existing_voice_profile": self.use_existing_voice_profile,
            "original_sender_id": self.original_sender_id,
            "mobile_transcription": self.mobile_transcription,
            "mobile_transcription_confidence": self.mobile_transcription_confidence,
            "mobile_transcription_source": self.mobile_transcription_source
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceCloningRequest':
        cloning_params = None
        if data.get("cloning_params"):
            cloning_params = VoiceCloningParameters.from_dict(data["cloning_params"])

        return cls(
            message_id=data.get("message_id", ""),
            attachment_id=data.get("attachment_id", ""),
            sender_id=data.get("sender_id", ""),
            conversation_id=data.get("conversation_id", ""),
            audio_path=data.get("audio_path", ""),
            audio_url=data.get("audio_url", ""),
            audio_duration_ms=data.get("audio_duration_ms", 0),
            source_language=data.get("source_language"),
            target_languages=data.get("target_languages", []),
            cloning_params=cloning_params,
            generate_voice_clone=data.get("generate_voice_clone", True),
            use_existing_voice_profile=data.get("use_existing_voice_profile", True),
            original_sender_id=data.get("original_sender_id"),
            mobile_transcription=data.get("mobile_transcription"),
            mobile_transcription_confidence=data.get("mobile_transcription_confidence"),
            mobile_transcription_source=data.get("mobile_transcription_source")
        )


# ─────────────────────────────────────────────────────────────────────────────
# Valeurs par défaut et presets
# ─────────────────────────────────────────────────────────────────────────────

# Presets de qualité
QUALITY_PRESETS = {
    "fast": VoiceCloningParameters(
        exaggeration=0.4,
        cfg_weight=0.4,
        temperature=0.8,
    ),
    "balanced": VoiceCloningParameters(
        exaggeration=0.5,
        cfg_weight=0.5,
        temperature=1.0,
    ),
    "high_quality": VoiceCloningParameters(
        exaggeration=0.6,
        cfg_weight=0.6,
        temperature=1.0,
    ),
}

# Configuration par défaut depuis les variables d'environnement
DEFAULT_PERFORMANCE_CONFIG = PerformanceConfig(
    parallel_processing=os.getenv("VOICE_PARALLEL_PROCESSING", "true").lower() == "true",
    max_workers=int(os.getenv("VOICE_MAX_WORKERS", "4")),
    use_process_pool=os.getenv("VOICE_USE_PROCESS_POOL", "false").lower() == "true",
    enable_torch_compile=os.getenv("VOICE_TORCH_COMPILE", "false").lower() == "true",
    use_fp16=os.getenv("VOICE_USE_FP16", "false").lower() == "true",
    warmup_model=os.getenv("VOICE_WARMUP_MODEL", "true").lower() == "true",
    batch_size=int(os.getenv("VOICE_BATCH_SIZE", "8")),
    inference_timeout_seconds=int(os.getenv("VOICE_INFERENCE_TIMEOUT", "60")),
    gpu_memory_fraction=float(os.getenv("GPU_MEMORY_FRACTION", "0.8")),
)

DEFAULT_CLONING_PARAMS = VoiceCloningParameters(
    exaggeration=float(os.getenv("VOICE_EXAGGERATION", "0.5")),
    cfg_weight=float(os.getenv("VOICE_CFG_WEIGHT", "0.5")),
    temperature=float(os.getenv("VOICE_TEMPERATURE", "1.0")),
)


def get_default_cloning_params() -> VoiceCloningParameters:
    """Retourne les paramètres de clonage par défaut"""
    return DEFAULT_CLONING_PARAMS


def get_performance_config() -> PerformanceConfig:
    """Retourne la configuration de performance"""
    return DEFAULT_PERFORMANCE_CONFIG


def get_quality_preset(preset_name: str) -> VoiceCloningParameters:
    """Retourne un preset de qualité par nom"""
    return QUALITY_PRESETS.get(preset_name, QUALITY_PRESETS["balanced"])
