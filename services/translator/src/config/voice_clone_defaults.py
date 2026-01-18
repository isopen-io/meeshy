"""
Configuration par défaut des paramètres de clonage vocal
========================================================

Définit les valeurs par défaut et les ranges acceptables pour tous les
paramètres de clonage vocal exposés du script iOS.

Architecture:
- ChatterboxParams: Paramètres TTS (expressivité, sampling)
- PerformanceParams: Paramètres de performance (parallélisme, optimisation)
- QualityParams: Paramètres de qualité (validation, retry)

Usage:
    from config.voice_clone_defaults import get_default_params, validate_params

    # Obtenir les défauts
    defaults = get_default_params()

    # Valider et fusionner avec des paramètres utilisateur
    validated = validate_params(user_params)
"""

import os
from dataclasses import dataclass, field
from typing import Optional, Dict, Any


# ═══════════════════════════════════════════════════════════════════════════
# CHATTERBOX TTS PARAMETERS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ChatterboxParams:
    """
    Paramètres Chatterbox TTS pour contrôle fin de la génération vocale.

    Ces paramètres permettent d'ajuster la qualité, l'expressivité et
    les performances du clonage vocal selon les besoins de l'utilisateur.
    """

    # Expressivité vocale (prosodie, intonation)
    # Range: 0.0-1.0, Défaut: 0.5
    exaggeration: float = 0.5

    # Guidance du modèle (Classifier-Free Guidance)
    # Range: 0.0-1.0, Défaut: 0.5 (anglais), 0.0 (autres langues - auto-ajusté)
    # NOTE: Pour langues non-anglaises, utiliser 0.0 pour meilleure qualité
    cfg_weight: float = 0.5

    # Température de sampling (créativité vs stabilité)
    # Range: 0.1-2.0, Défaut: 1.0
    temperature: float = 1.0

    # Nucleus sampling (Top-P) - Filtre les tokens peu probables
    # Range: 0.0-1.0, Défaut: 0.9
    top_p: float = 0.9

    # Probabilité minimum (Min-P) - Seuil de probabilité absolue
    # Range: 0.0-1.0, Défaut: 0.05
    min_p: float = 0.05

    # Pénalité de répétition - Évite les boucles vocales
    # Range: 1.0-3.0, Défaut: 1.2 (mono), 2.0 (multi) - auto-ajusté
    repetition_penalty: float = 1.2

    # Active l'auto-optimisation basée sur analyse vocale
    # Défaut: True (recommandé)
    auto_optimize: bool = True

    # Ranges de validation
    EXAGGERATION_RANGE = (0.0, 1.0)
    CFG_WEIGHT_RANGE = (0.0, 1.0)
    TEMPERATURE_RANGE = (0.1, 2.0)
    TOP_P_RANGE = (0.0, 1.0)
    MIN_P_RANGE = (0.0, 1.0)
    REPETITION_PENALTY_RANGE = (1.0, 3.0)

    def validate(self) -> None:
        """Valide les paramètres et les limite aux ranges acceptables"""
        self.exaggeration = clamp(self.exaggeration, *self.EXAGGERATION_RANGE)
        self.cfg_weight = clamp(self.cfg_weight, *self.CFG_WEIGHT_RANGE)
        self.temperature = clamp(self.temperature, *self.TEMPERATURE_RANGE)
        self.top_p = clamp(self.top_p, *self.TOP_P_RANGE)
        self.min_p = clamp(self.min_p, *self.MIN_P_RANGE)
        self.repetition_penalty = clamp(self.repetition_penalty, *self.REPETITION_PENALTY_RANGE)

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        return {
            'exaggeration': self.exaggeration,
            'cfg_weight': self.cfg_weight,
            'temperature': self.temperature,
            'top_p': self.top_p,
            'min_p': self.min_p,
            'repetition_penalty': self.repetition_penalty,
            'auto_optimize': self.auto_optimize
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> 'ChatterboxParams':
        """Crée une instance depuis un dictionnaire"""
        if not data:
            return cls()

        return cls(
            exaggeration=data.get('exaggeration', 0.5),
            cfg_weight=data.get('cfgWeight', data.get('cfg_weight', 0.5)),  # Support camelCase
            temperature=data.get('temperature', 1.0),
            top_p=data.get('topP', data.get('top_p', 0.9)),  # Support camelCase
            min_p=data.get('minP', data.get('min_p', 0.05)),  # Support camelCase
            repetition_penalty=data.get('repetitionPenalty', data.get('repetition_penalty', 1.2)),  # Support camelCase
            auto_optimize=data.get('autoOptimize', data.get('auto_optimize', True))  # Support camelCase
        )


# ═══════════════════════════════════════════════════════════════════════════
# PERFORMANCE PARAMETERS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class PerformanceParams:
    """Paramètres de performance pour le traitement audio"""

    # Traiter les langues en parallèle
    # Défaut: True (recommandé sauf si contraintes mémoire)
    parallel: bool = True

    # Nombre max de workers parallèles
    # Range: 1-8, Défaut: 2
    max_workers: int = 2

    # Optimiser le modèle en mémoire (quantization)
    # Défaut: True (recommandé)
    optimize_model: bool = True

    # Utiliser FP16 (half-precision) pour inférence
    # Défaut: False (qualité maximale)
    use_fp16: bool = False

    # Préchauffer le modèle au démarrage
    # Défaut: True (recommandé)
    warmup: bool = True

    # Ranges de validation
    MAX_WORKERS_RANGE = (1, 8)

    def validate(self) -> None:
        """Valide les paramètres"""
        self.max_workers = clamp(self.max_workers, *self.MAX_WORKERS_RANGE)

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        return {
            'parallel': self.parallel,
            'max_workers': self.max_workers,
            'optimize_model': self.optimize_model,
            'use_fp16': self.use_fp16,
            'warmup': self.warmup
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> 'PerformanceParams':
        """Crée une instance depuis un dictionnaire"""
        if not data:
            return cls()

        return cls(
            parallel=data.get('parallel', True),
            max_workers=data.get('maxWorkers', data.get('max_workers', 2)),  # Support camelCase
            optimize_model=data.get('optimizeModel', data.get('optimize_model', True)),  # Support camelCase
            use_fp16=data.get('useFp16', data.get('use_fp16', False)),  # Support camelCase
            warmup=data.get('warmup', True)
        )


# ═══════════════════════════════════════════════════════════════════════════
# QUALITY PARAMETERS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class QualityParams:
    """Paramètres de qualité et validation"""

    # Seuil minimum de similarité vocale
    # Range: 0.0-1.0, Défaut: 0.70
    min_similarity_threshold: float = 0.70

    # Réessayer automatiquement si similarité faible
    # Défaut: True (recommandé)
    auto_retry_on_low_similarity: bool = True

    # Nombre max de retentatives
    # Range: 0-5, Défaut: 2
    max_retries: int = 2

    # Ranges de validation
    MIN_SIMILARITY_RANGE = (0.0, 1.0)
    MAX_RETRIES_RANGE = (0, 5)

    def validate(self) -> None:
        """Valide les paramètres"""
        self.min_similarity_threshold = clamp(self.min_similarity_threshold, *self.MIN_SIMILARITY_RANGE)
        self.max_retries = clamp(self.max_retries, *self.MAX_RETRIES_RANGE)

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        return {
            'min_similarity_threshold': self.min_similarity_threshold,
            'auto_retry_on_low_similarity': self.auto_retry_on_low_similarity,
            'max_retries': self.max_retries
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> 'QualityParams':
        """Crée une instance depuis un dictionnaire"""
        if not data:
            return cls()

        return cls(
            min_similarity_threshold=data.get('minSimilarityThreshold', data.get('min_similarity_threshold', 0.70)),  # Support camelCase
            auto_retry_on_low_similarity=data.get('autoRetryOnLowSimilarity', data.get('auto_retry_on_low_similarity', True)),  # Support camelCase
            max_retries=data.get('maxRetries', data.get('max_retries', 2))  # Support camelCase
        )


# ═══════════════════════════════════════════════════════════════════════════
# COMBINED CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class VoiceCloneConfig:
    """Configuration complète des paramètres de clonage vocal"""

    chatterbox: ChatterboxParams = field(default_factory=ChatterboxParams)
    performance: PerformanceParams = field(default_factory=PerformanceParams)
    quality: QualityParams = field(default_factory=QualityParams)

    def validate(self) -> None:
        """Valide tous les paramètres"""
        self.chatterbox.validate()
        self.performance.validate()
        self.quality.validate()

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        return {
            'chatterbox': self.chatterbox.to_dict(),
            'performance': self.performance.to_dict(),
            'quality': self.quality.to_dict()
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> 'VoiceCloneConfig':
        """Crée une instance depuis un dictionnaire (Gateway → Translator)"""
        if not data:
            return cls()

        return cls(
            chatterbox=ChatterboxParams.from_dict(data.get('chatterbox')),
            performance=PerformanceParams.from_dict(data.get('performance')),
            quality=QualityParams.from_dict(data.get('quality'))
        )


# ═══════════════════════════════════════════════════════════════════════════
# PRESETS - Configurations pré-définies
# ═══════════════════════════════════════════════════════════════════════════

PRESET_FAST = VoiceCloneConfig(
    chatterbox=ChatterboxParams(
        exaggeration=0.4,
        temperature=0.9,
        top_p=0.85,
        auto_optimize=False
    ),
    performance=PerformanceParams(
        parallel=True,
        max_workers=4,
        optimize_model=True,
        use_fp16=True,
        warmup=True
    ),
    quality=QualityParams(
        min_similarity_threshold=0.65,
        auto_retry_on_low_similarity=False,
        max_retries=0
    )
)

PRESET_BALANCED = VoiceCloneConfig(
    chatterbox=ChatterboxParams(
        exaggeration=0.5,
        temperature=1.0,
        top_p=0.9,
        auto_optimize=True
    ),
    performance=PerformanceParams(
        parallel=True,
        max_workers=2,
        optimize_model=True,
        use_fp16=False,
        warmup=True
    ),
    quality=QualityParams(
        min_similarity_threshold=0.70,
        auto_retry_on_low_similarity=True,
        max_retries=2
    )
)

PRESET_HIGH_QUALITY = VoiceCloneConfig(
    chatterbox=ChatterboxParams(
        exaggeration=0.6,
        temperature=0.95,
        top_p=0.95,
        min_p=0.02,
        auto_optimize=True
    ),
    performance=PerformanceParams(
        parallel=False,
        max_workers=1,
        optimize_model=False,
        use_fp16=False,
        warmup=True
    ),
    quality=QualityParams(
        min_similarity_threshold=0.80,
        auto_retry_on_low_similarity=True,
        max_retries=3
    )
)

PRESET_CONVERSATIONAL = VoiceCloneConfig(
    chatterbox=ChatterboxParams(
        exaggeration=0.7,
        temperature=1.1,
        top_p=0.92,
        repetition_penalty=1.5,
        auto_optimize=True
    ),
    performance=PerformanceParams(
        parallel=True,
        max_workers=2,
        optimize_model=True,
        use_fp16=False,
        warmup=True
    ),
    quality=QualityParams(
        min_similarity_threshold=0.70,
        auto_retry_on_low_similarity=True,
        max_retries=2
    )
)

PRESET_LOW_RESOURCE = VoiceCloneConfig(
    chatterbox=ChatterboxParams(
        exaggeration=0.4,
        temperature=0.9,
        auto_optimize=False
    ),
    performance=PerformanceParams(
        parallel=False,
        max_workers=1,
        optimize_model=True,
        use_fp16=True,
        warmup=False
    ),
    quality=QualityParams(
        min_similarity_threshold=0.65,
        auto_retry_on_low_similarity=False,
        max_retries=0
    )
)

PRESETS = {
    'fast': PRESET_FAST,
    'balanced': PRESET_BALANCED,
    'high_quality': PRESET_HIGH_QUALITY,
    'conversational': PRESET_CONVERSATIONAL,
    'low_resource': PRESET_LOW_RESOURCE
}


# ═══════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═══════════════════════════════════════════════════════════════════════════

def get_default_params() -> VoiceCloneConfig:
    """
    Retourne la configuration par défaut (balanced).

    Returns:
        VoiceCloneConfig avec paramètres par défaut équilibrés
    """
    return VoiceCloneConfig()


def get_preset(preset_name: str) -> VoiceCloneConfig:
    """
    Retourne un preset nommé.

    Args:
        preset_name: Nom du preset ('fast', 'balanced', 'high_quality', etc.)

    Returns:
        VoiceCloneConfig correspondant au preset

    Raises:
        ValueError: Si le preset n'existe pas
    """
    if preset_name not in PRESETS:
        raise ValueError(
            f"Preset inconnu: {preset_name}. "
            f"Presets disponibles: {list(PRESETS.keys())}"
        )

    return PRESETS[preset_name]


def validate_params(user_params: Optional[Dict[str, Any]]) -> VoiceCloneConfig:
    """
    Valide et fusionne les paramètres utilisateur avec les défauts.

    Args:
        user_params: Paramètres fournis par l'utilisateur (partiels ou None)

    Returns:
        VoiceCloneConfig validé avec défauts appliqués

    Example:
        >>> user = {'chatterbox': {'exaggeration': 0.7}}
        >>> config = validate_params(user)
        >>> config.chatterbox.exaggeration
        0.7
        >>> config.chatterbox.temperature  # Défaut appliqué
        1.0
    """
    config = VoiceCloneConfig.from_dict(user_params)
    config.validate()
    return config


def apply_language_optimizations(
    config: VoiceCloneConfig,
    target_language: str
) -> VoiceCloneConfig:
    """
    Applique les optimisations spécifiques à la langue.

    Args:
        config: Configuration de base
        target_language: Code langue (ex: 'en', 'fr', 'es')

    Returns:
        Configuration optimisée pour la langue

    Optimizations:
        - cfg_weight = 0.0 pour langues non-anglaises (meilleure qualité)
        - repetition_penalty ajusté selon contexte
    """
    # Copier la config pour ne pas modifier l'originale
    import copy
    optimized = copy.deepcopy(config)

    # Optimisation cfg_weight pour langues non-anglaises
    if target_language != 'en':
        optimized.chatterbox.cfg_weight = 0.0

    return optimized


# ═══════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════

def clamp(value: float, min_val: float, max_val: float) -> float:
    """Limite une valeur entre min et max"""
    return max(min_val, min(max_val, value))


# ═══════════════════════════════════════════════════════════════════════════
# ENVIRONMENT VARIABLE OVERRIDES (optionnel)
# ═══════════════════════════════════════════════════════════════════════════

def load_from_env() -> VoiceCloneConfig:
    """
    Charge la configuration depuis les variables d'environnement.

    Variables supportées:
        - VOICE_CLONE_EXAGGERATION
        - VOICE_CLONE_CFG_WEIGHT
        - VOICE_CLONE_TEMPERATURE
        - VOICE_CLONE_TOP_P
        - VOICE_CLONE_MIN_P
        - VOICE_CLONE_REPETITION_PENALTY
        - VOICE_CLONE_PARALLEL
        - VOICE_CLONE_MAX_WORKERS
        - VOICE_CLONE_MIN_SIMILARITY

    Returns:
        VoiceCloneConfig avec valeurs d'environnement appliquées
    """
    config = get_default_params()

    # Chatterbox params
    if exag := os.getenv('VOICE_CLONE_EXAGGERATION'):
        config.chatterbox.exaggeration = float(exag)
    if cfg := os.getenv('VOICE_CLONE_CFG_WEIGHT'):
        config.chatterbox.cfg_weight = float(cfg)
    if temp := os.getenv('VOICE_CLONE_TEMPERATURE'):
        config.chatterbox.temperature = float(temp)
    if top_p := os.getenv('VOICE_CLONE_TOP_P'):
        config.chatterbox.top_p = float(top_p)
    if min_p := os.getenv('VOICE_CLONE_MIN_P'):
        config.chatterbox.min_p = float(min_p)
    if rep_pen := os.getenv('VOICE_CLONE_REPETITION_PENALTY'):
        config.chatterbox.repetition_penalty = float(rep_pen)

    # Performance params
    if parallel := os.getenv('VOICE_CLONE_PARALLEL'):
        config.performance.parallel = parallel.lower() == 'true'
    if workers := os.getenv('VOICE_CLONE_MAX_WORKERS'):
        config.performance.max_workers = int(workers)
    if fp16 := os.getenv('VOICE_CLONE_USE_FP16'):
        config.performance.use_fp16 = fp16.lower() == 'true'

    # Quality params
    if threshold := os.getenv('VOICE_CLONE_MIN_SIMILARITY'):
        config.quality.min_similarity_threshold = float(threshold)
    if retries := os.getenv('VOICE_CLONE_MAX_RETRIES'):
        config.quality.max_retries = int(retries)

    config.validate()
    return config
