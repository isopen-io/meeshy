"""
ModelManager - Gestionnaire centralisé des modèles ML pour multi-utilisateurs

Ce module résout le problème critique de gestion mémoire GPU/CPU:
- Chaque service (TTS, Translation, etc.) chargeait les modèles indépendamment
- Risque d'OOM (Out Of Memory) quand plusieurs modèles sont chargés
- Pas de stratégie d'éviction des modèles peu utilisés

Solution:
- Registre centralisé de TOUS les modèles (Translation, TTS, STT, VoiceClone)
- Tracking de l'utilisation mémoire GPU/CPU
- Éviction LRU (Least Recently Used) quand la mémoire est faible
- Limites configurables par type de modèle
- Gestion centralisée des chemins de stockage des modèles
"""

import os
import gc
import time
import logging
import threading
from pathlib import Path
from typing import Dict, Optional, Any, List, Callable, Union
from dataclasses import dataclass, field
from enum import Enum
from collections import OrderedDict
from functools import wraps

logger = logging.getLogger(__name__)

# Vérifier si PyTorch est disponible
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch non disponible - ModelManager en mode limité")


class ModelType(Enum):
    """Types de modèles supportés"""
    TRANSLATION = "translation"  # NLLB, M2M100, etc.
    TTS = "tts"  # Chatterbox, XTTS, MMS-TTS, VITS
    STT = "stt"  # Whisper (faster-whisper)
    VOICE_CLONE = "voice_clone"  # OpenVoice, etc.
    EMBEDDING = "embedding"  # Modèles d'embedding vocal
    VOCODER = "vocoder"  # HiFi-GAN, etc.


class TTSBackend(Enum):
    """Backends TTS spécifiques"""
    CHATTERBOX = "chatterbox"
    CHATTERBOX_TURBO = "chatterbox_turbo"
    HIGGS_AUDIO = "higgs_audio"
    XTTS = "xtts"
    MMS = "mms"  # Meta MMS-TTS (1100+ langues)
    VITS = "vits"


class STTBackend(Enum):
    """Backends STT spécifiques"""
    WHISPER = "whisper"
    WHISPER_LARGE = "whisper_large_v3"
    WHISPER_MEDIUM = "whisper_medium"


class TranslationBackend(Enum):
    """Backends de traduction spécifiques"""
    NLLB_600M = "nllb_600m"
    NLLB_1_3B = "nllb_1_3b"
    M2M100 = "m2m100"


@dataclass
class ModelInfo:
    """Information sur un modèle chargé"""
    model_id: str  # Identifiant unique (ex: "translation_basic", "tts_chatterbox")
    model_type: ModelType
    model_name: str  # Nom HuggingFace ou chemin local
    model_object: Any  # L'objet modèle PyTorch/transformers
    memory_bytes: int  # Mémoire estimée en bytes
    device: str  # "cuda", "cpu", "mps"
    loaded_at: float = field(default_factory=time.time)
    last_used_at: float = field(default_factory=time.time)
    use_count: int = 0
    priority: int = 1  # 1=haute priorité (ne pas décharger), 2=normale, 3=basse
    # Métadonnées additionnelles
    backend: Optional[str] = None  # Ex: "chatterbox", "mms", "whisper_large_v3"
    language: Optional[str] = None  # Pour les modèles spécifiques à une langue (MMS)
    model_path: Optional[str] = None  # Chemin local du modèle
    extra_info: Dict[str, Any] = field(default_factory=dict)


@dataclass
class MemoryConfig:
    """Configuration des limites mémoire"""
    max_gpu_memory_fraction: float = 0.85  # Utiliser max 85% du GPU
    max_cpu_memory_gb: float = 16.0  # Limite RAM pour les modèles
    eviction_threshold: float = 0.80  # Commencer l'éviction à 80%
    min_free_gpu_mb: int = 1024  # Garder au moins 1GB libre sur GPU
    min_free_cpu_gb: float = 2.0  # Garder au moins 2GB libre sur CPU


@dataclass
class ModelPathsConfig:
    """Configuration centralisée des chemins de modèles"""
    base_path: str = field(default_factory=lambda: os.getenv("MODELS_PATH", "models"))

    @property
    def huggingface(self) -> Path:
        """Modèles HuggingFace (NLLB, Chatterbox, etc.)"""
        return Path(self.base_path) / "huggingface"

    @property
    def translation(self) -> Path:
        """Modèles de traduction NLLB"""
        return self.huggingface / "facebook"

    @property
    def tts_chatterbox(self) -> Path:
        """Modèles Chatterbox TTS"""
        return self.huggingface / "ResembleAI"

    @property
    def tts_mms(self) -> Path:
        """Modèles Meta MMS-TTS (langues africaines, etc.)"""
        return Path(self.base_path) / "mms"

    @property
    def tts_xtts(self) -> Path:
        """Modèles XTTS (Coqui)"""
        return Path(self.base_path) / "xtts"

    @property
    def tts_vits(self) -> Path:
        """Modèles VITS custom"""
        return Path(self.base_path) / "vits"

    @property
    def stt_whisper(self) -> Path:
        """Modèles Whisper (faster-whisper)"""
        return Path(self.base_path) / "whisper"

    @property
    def voice_clone(self) -> Path:
        """Modèles de clonage vocal (OpenVoice)"""
        return Path(self.base_path) / "openvoice"

    @property
    def voice_cache(self) -> Path:
        """Cache des profils vocaux utilisateurs"""
        return Path(self.base_path) / "voice_cache"

    @property
    def embeddings(self) -> Path:
        """Modèles d'embedding (sentence-transformers, etc.)"""
        return Path(self.base_path) / "embeddings"

    def ensure_all_exist(self):
        """Crée tous les dossiers s'ils n'existent pas"""
        for attr_name in dir(self):
            if not attr_name.startswith('_') and attr_name not in ['base_path', 'ensure_all_exist']:
                try:
                    path = getattr(self, attr_name)
                    if isinstance(path, Path):
                        path.mkdir(parents=True, exist_ok=True)
                except Exception as e:
                    logger.warning(f"Impossible de créer {attr_name}: {e}")

    def get_path_for_model(self, model_type: ModelType, backend: Optional[str] = None) -> Path:
        """Retourne le chemin approprié pour un type de modèle"""
        if model_type == ModelType.TRANSLATION:
            return self.translation
        elif model_type == ModelType.TTS:
            if backend == "mms":
                return self.tts_mms
            elif backend == "xtts":
                return self.tts_xtts
            elif backend == "vits":
                return self.tts_vits
            else:
                return self.tts_chatterbox
        elif model_type == ModelType.STT:
            return self.stt_whisper
        elif model_type == ModelType.VOICE_CLONE:
            return self.voice_clone
        elif model_type == ModelType.EMBEDDING:
            return self.embeddings
        else:
            return Path(self.base_path)


# Instance globale des chemins
_model_paths: Optional[ModelPathsConfig] = None


def get_model_paths() -> ModelPathsConfig:
    """Retourne la configuration des chemins de modèles"""
    global _model_paths
    if _model_paths is None:
        _model_paths = ModelPathsConfig()
        _model_paths.ensure_all_exist()
    return _model_paths


class ModelManager:
    """
    Gestionnaire centralisé des modèles ML - Singleton

    Responsabilités:
    1. Registre de tous les modèles chargés
    2. Tracking de la mémoire utilisée
    3. Éviction LRU quand mémoire faible
    4. API unifiée pour charger/décharger les modèles
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self, config: Optional[MemoryConfig] = None):
        if self._initialized:
            return

        self.config = config or MemoryConfig()

        # Registre des modèles chargés (OrderedDict pour LRU)
        self._models: OrderedDict[str, ModelInfo] = OrderedDict()
        self._models_lock = threading.RLock()

        # Callbacks pour les événements
        self._on_model_loaded: List[Callable] = []
        self._on_model_unloaded: List[Callable] = []
        self._on_memory_pressure: List[Callable] = []

        # Stats
        self._stats = {
            'models_loaded': 0,
            'models_unloaded': 0,
            'evictions_triggered': 0,
            'total_memory_freed_mb': 0
        }

        # Détection du device
        self._device = self._detect_device()

        self._initialized = True
        logger.info(f"✅ ModelManager initialisé (device: {self._device})")

    def _detect_device(self) -> str:
        """Détecte le meilleur device disponible"""
        if not TORCH_AVAILABLE:
            return "cpu"

        if torch.cuda.is_available():
            return "cuda"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    def register_model(
        self,
        model_id: str,
        model_type: ModelType,
        model_name: str,
        model_object: Any,
        memory_bytes: Optional[int] = None,
        priority: int = 2,
        backend: Optional[str] = None,
        language: Optional[str] = None,
        model_path: Optional[str] = None,
        extra_info: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Enregistre un modèle dans le gestionnaire centralisé.

        Args:
            model_id: Identifiant unique du modèle
            model_type: Type de modèle (TRANSLATION, TTS, etc.)
            model_name: Nom du modèle (pour logging)
            model_object: L'objet modèle PyTorch
            memory_bytes: Mémoire estimée (auto-détectée si None)
            priority: 1=haute (ne pas décharger), 2=normale, 3=basse
            backend: Sous-type (ex: "chatterbox", "mms", "whisper")
            language: Code langue pour modèles spécifiques (ex: "sw" pour MMS Swahili)
            model_path: Chemin local du modèle
            extra_info: Métadonnées additionnelles

        Returns:
            True si enregistré avec succès
        """
        with self._models_lock:
            # Vérifier si déjà enregistré
            if model_id in self._models:
                logger.debug(f"[ModelManager] Modèle {model_id} déjà enregistré, mise à jour LRU")
                self._models[model_id].last_used_at = time.time()
                self._models.move_to_end(model_id)
                return True

            # Vérifier si on a assez de mémoire
            if not self._check_memory_available(memory_bytes or 0):
                # Tenter une éviction
                self._evict_models_if_needed(memory_bytes or 0)

            # Estimer la mémoire si non fournie
            if memory_bytes is None:
                memory_bytes = self._estimate_model_memory(model_object)

            # Créer l'info du modèle
            model_info = ModelInfo(
                model_id=model_id,
                model_type=model_type,
                model_name=model_name,
                model_object=model_object,
                memory_bytes=memory_bytes,
                device=self._device,
                priority=priority,
                backend=backend,
                language=language,
                model_path=model_path,
                extra_info=extra_info or {}
            )

            # Enregistrer
            self._models[model_id] = model_info
            self._stats['models_loaded'] += 1

            # Stats par type
            type_key = f"{model_type.value}_{backend}" if backend else model_type.value
            if 'by_backend' not in self._stats:
                self._stats['by_backend'] = {}
            self._stats['by_backend'][type_key] = self._stats['by_backend'].get(type_key, 0) + 1

            logger.info(
                f"✅ [ModelManager] Modèle enregistré: {model_id} "
                f"({model_type.value}/{backend or 'default'}, {memory_bytes / 1024 / 1024:.0f}MB, priority={priority})"
            )

            # Callbacks
            for callback in self._on_model_loaded:
                try:
                    callback(model_info)
                except Exception as e:
                    logger.error(f"Erreur callback on_model_loaded: {e}")

            return True

    def get_model(self, model_id: str) -> Optional[Any]:
        """
        Récupère un modèle et met à jour son timestamp LRU.

        Args:
            model_id: Identifiant du modèle

        Returns:
            L'objet modèle ou None si non trouvé
        """
        with self._models_lock:
            if model_id not in self._models:
                return None

            model_info = self._models[model_id]
            model_info.last_used_at = time.time()
            model_info.use_count += 1

            # Déplacer à la fin pour LRU (modèle récemment utilisé)
            self._models.move_to_end(model_id)

            return model_info.model_object

    def unload_model(self, model_id: str) -> bool:
        """
        Décharge un modèle et libère sa mémoire.

        Args:
            model_id: Identifiant du modèle

        Returns:
            True si déchargé avec succès
        """
        with self._models_lock:
            if model_id not in self._models:
                logger.warning(f"[ModelManager] Modèle non trouvé: {model_id}")
                return False

            model_info = self._models.pop(model_id)
            memory_mb = model_info.memory_bytes / 1024 / 1024

            # Libérer la mémoire
            try:
                del model_info.model_object
            except Exception:
                pass

            self._cleanup_memory()

            self._stats['models_unloaded'] += 1
            self._stats['total_memory_freed_mb'] += memory_mb

            logger.info(f"🗑️ [ModelManager] Modèle déchargé: {model_id} ({memory_mb:.0f}MB libérés)")

            # Callbacks
            for callback in self._on_model_unloaded:
                try:
                    callback(model_info)
                except Exception as e:
                    logger.error(f"Erreur callback on_model_unloaded: {e}")

            return True

    def _check_memory_available(self, required_bytes: int) -> bool:
        """Vérifie si assez de mémoire est disponible"""
        if not TORCH_AVAILABLE:
            return True  # Pas de vérification possible

        try:
            if self._device == "cuda":
                # Vérifier la mémoire GPU
                total = torch.cuda.get_device_properties(0).total_memory
                allocated = torch.cuda.memory_allocated(0)
                free = total - allocated
                threshold = total * self.config.max_gpu_memory_fraction

                return (allocated + required_bytes) < threshold

            else:
                # Vérifier la mémoire CPU (approximatif)
                import psutil
                mem = psutil.virtual_memory()
                free_gb = mem.available / (1024 ** 3)

                return free_gb > self.config.min_free_cpu_gb

        except Exception as e:
            logger.warning(f"Erreur vérification mémoire: {e}")
            return True

    def _evict_models_if_needed(self, required_bytes: int) -> int:
        """
        Évicte les modèles LRU pour libérer de la mémoire.

        Returns:
            Nombre de modèles évictés
        """
        evicted = 0

        with self._models_lock:
            # Trier par priorité puis par last_used_at (LRU)
            candidates = sorted(
                [m for m in self._models.values() if m.priority > 1],  # Pas les priorité 1
                key=lambda m: (m.priority, m.last_used_at)  # Priorité basse + vieux = premier
            )

            bytes_freed = 0

            for model_info in candidates:
                if bytes_freed >= required_bytes:
                    break

                if self._check_memory_available(required_bytes - bytes_freed):
                    break

                # Éviction
                model_id = model_info.model_id
                memory = model_info.memory_bytes

                if self.unload_model(model_id):
                    bytes_freed += memory
                    evicted += 1
                    logger.warning(
                        f"⚠️ [ModelManager] Éviction LRU: {model_id} "
                        f"(last_used: {time.time() - model_info.last_used_at:.0f}s ago)"
                    )

        if evicted > 0:
            self._stats['evictions_triggered'] += 1
            # Callbacks
            for callback in self._on_memory_pressure:
                try:
                    callback(evicted, bytes_freed)
                except Exception:
                    pass

        return evicted

    def _estimate_model_memory(self, model: Any) -> int:
        """Estime la mémoire utilisée par un modèle"""
        if not TORCH_AVAILABLE:
            return 0

        try:
            if hasattr(model, 'parameters'):
                # Modèle PyTorch
                total_params = sum(p.numel() * p.element_size() for p in model.parameters())
                # Ajouter buffers
                total_buffers = sum(b.numel() * b.element_size() for b in model.buffers())
                return total_params + total_buffers

            elif hasattr(model, 'model') and hasattr(model.model, 'parameters'):
                # Pipeline Hugging Face
                return self._estimate_model_memory(model.model)

            else:
                # Fallback: estimer à 1GB
                return 1024 * 1024 * 1024

        except Exception:
            return 1024 * 1024 * 1024  # 1GB par défaut

    def _cleanup_memory(self):
        """Nettoie la mémoire GPU/CPU"""
        gc.collect()

        if TORCH_AVAILABLE:
            try:
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
            except Exception:
                pass

    def get_memory_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques mémoire"""
        stats = {
            'device': self._device,
            'models_count': len(self._models),
            'stats': self._stats.copy()
        }

        if TORCH_AVAILABLE and self._device == "cuda":
            try:
                stats['gpu'] = {
                    'total_mb': torch.cuda.get_device_properties(0).total_memory / 1024 / 1024,
                    'allocated_mb': torch.cuda.memory_allocated(0) / 1024 / 1024,
                    'cached_mb': torch.cuda.memory_reserved(0) / 1024 / 1024,
                    'free_mb': (torch.cuda.get_device_properties(0).total_memory -
                               torch.cuda.memory_allocated(0)) / 1024 / 1024
                }
            except Exception:
                pass

        # Stats par type de modèle
        with self._models_lock:
            by_type = {}
            for model_info in self._models.values():
                type_name = model_info.model_type.value
                if type_name not in by_type:
                    by_type[type_name] = {'count': 0, 'memory_mb': 0}
                by_type[type_name]['count'] += 1
                by_type[type_name]['memory_mb'] += model_info.memory_bytes / 1024 / 1024
            stats['by_type'] = by_type

        return stats

    def get_loaded_models(self) -> List[Dict[str, Any]]:
        """Retourne la liste des modèles chargés"""
        with self._models_lock:
            return [
                {
                    'model_id': m.model_id,
                    'model_type': m.model_type.value,
                    'model_name': m.model_name,
                    'memory_mb': m.memory_bytes / 1024 / 1024,
                    'device': m.device,
                    'use_count': m.use_count,
                    'last_used_ago_s': time.time() - m.last_used_at,
                    'priority': m.priority
                }
                for m in self._models.values()
            ]

    def has_model(self, model_id: str) -> bool:
        """Vérifie si un modèle est chargé"""
        with self._models_lock:
            return model_id in self._models

    def get_model_info(self, model_id: str) -> Optional[ModelInfo]:
        """Retourne les infos d'un modèle"""
        with self._models_lock:
            return self._models.get(model_id)

    def on_model_loaded(self, callback: Callable[[ModelInfo], None]):
        """Enregistre un callback appelé quand un modèle est chargé"""
        self._on_model_loaded.append(callback)

    def on_model_unloaded(self, callback: Callable[[ModelInfo], None]):
        """Enregistre un callback appelé quand un modèle est déchargé"""
        self._on_model_unloaded.append(callback)

    def on_memory_pressure(self, callback: Callable[[int, int], None]):
        """Enregistre un callback appelé lors d'une éviction (evicted_count, bytes_freed)"""
        self._on_memory_pressure.append(callback)

    def force_cleanup(self):
        """Force un nettoyage mémoire"""
        self._cleanup_memory()
        logger.info("🧹 [ModelManager] Nettoyage mémoire forcé")

    def shutdown(self):
        """Arrête le ModelManager et libère tous les modèles"""
        logger.info("🛑 [ModelManager] Arrêt et libération des modèles...")

        with self._models_lock:
            model_ids = list(self._models.keys())
            for model_id in model_ids:
                try:
                    self.unload_model(model_id)
                except Exception as e:
                    logger.error(f"Erreur déchargement {model_id}: {e}")

        self._cleanup_memory()
        logger.info("✅ [ModelManager] Arrêt terminé")


# Instance globale (Singleton)
_model_manager: Optional[ModelManager] = None


def get_model_manager(config: Optional[MemoryConfig] = None) -> ModelManager:
    """Retourne l'instance unique du ModelManager"""
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager(config)
    return _model_manager


# ═══════════════════════════════════════════════════════════════════════════
# MÉTHODES D'AIDE POUR L'INTÉGRATION DES SERVICES
# ═══════════════════════════════════════════════════════════════════════════

def register_tts_model(
    model_id: str,
    model_object: Any,
    backend: str,
    model_name: Optional[str] = None,
    memory_bytes: Optional[int] = None,
    language: Optional[str] = None,
    priority: int = 2
) -> bool:
    """
    Enregistre un modèle TTS dans le ModelManager.

    Args:
        model_id: ID unique (ex: "tts_mms_sw" pour MMS Swahili)
        model_object: L'objet modèle TTS
        backend: Backend utilisé (chatterbox, mms, xtts, vits)
        model_name: Nom du modèle
        memory_bytes: Mémoire estimée
        language: Code langue (pour MMS)
        priority: 1=haute, 2=normale, 3=basse

    Returns:
        True si enregistré
    """
    manager = get_model_manager()
    paths = get_model_paths()

    return manager.register_model(
        model_id=model_id,
        model_type=ModelType.TTS,
        model_name=model_name or f"TTS-{backend}",
        model_object=model_object,
        memory_bytes=memory_bytes,
        priority=priority,
        backend=backend,
        language=language,
        model_path=str(paths.get_path_for_model(ModelType.TTS, backend))
    )


def register_stt_model(
    model_id: str,
    model_object: Any,
    backend: str = "whisper",
    model_name: Optional[str] = None,
    memory_bytes: Optional[int] = None,
    priority: int = 1  # STT généralement haute priorité
) -> bool:
    """
    Enregistre un modèle STT (Whisper) dans le ModelManager.

    Args:
        model_id: ID unique (ex: "stt_whisper_large_v3")
        model_object: L'objet modèle Whisper
        backend: Backend utilisé (whisper)
        model_name: Nom du modèle
        memory_bytes: Mémoire estimée
        priority: 1=haute par défaut car STT est critique

    Returns:
        True si enregistré
    """
    manager = get_model_manager()
    paths = get_model_paths()

    return manager.register_model(
        model_id=model_id,
        model_type=ModelType.STT,
        model_name=model_name or f"STT-{backend}",
        model_object=model_object,
        memory_bytes=memory_bytes,
        priority=priority,
        backend=backend,
        model_path=str(paths.stt_whisper)
    )


def register_translation_model(
    model_id: str,
    model_object: Any,
    backend: str,
    model_name: Optional[str] = None,
    memory_bytes: Optional[int] = None,
    priority: int = 1  # Translation haute priorité
) -> bool:
    """
    Enregistre un modèle de traduction dans le ModelManager.

    Args:
        model_id: ID unique (ex: "translation_nllb_600m")
        model_object: L'objet modèle de traduction
        backend: Backend utilisé (nllb_600m, nllb_1_3b, m2m100)
        model_name: Nom du modèle
        memory_bytes: Mémoire estimée
        priority: 1=haute par défaut

    Returns:
        True si enregistré
    """
    manager = get_model_manager()
    paths = get_model_paths()

    return manager.register_model(
        model_id=model_id,
        model_type=ModelType.TRANSLATION,
        model_name=model_name or f"Translation-{backend}",
        model_object=model_object,
        memory_bytes=memory_bytes,
        priority=priority,
        backend=backend,
        model_path=str(paths.translation)
    )


def register_voice_clone_model(
    model_id: str,
    model_object: Any,
    backend: str = "openvoice",
    model_name: Optional[str] = None,
    memory_bytes: Optional[int] = None,
    priority: int = 2
) -> bool:
    """
    Enregistre un modèle de clonage vocal dans le ModelManager.

    Args:
        model_id: ID unique (ex: "voice_clone_openvoice_v2")
        model_object: L'objet modèle de clonage
        backend: Backend utilisé (openvoice)
        model_name: Nom du modèle
        memory_bytes: Mémoire estimée
        priority: 2=normale par défaut

    Returns:
        True si enregistré
    """
    manager = get_model_manager()
    paths = get_model_paths()

    return manager.register_model(
        model_id=model_id,
        model_type=ModelType.VOICE_CLONE,
        model_name=model_name or f"VoiceClone-{backend}",
        model_object=model_object,
        memory_bytes=memory_bytes,
        priority=priority,
        backend=backend,
        model_path=str(paths.voice_clone)
    )


def get_tts_model(model_id: str) -> Optional[Any]:
    """Récupère un modèle TTS par son ID"""
    return get_model_manager().get_model(model_id)


def get_stt_model(model_id: str) -> Optional[Any]:
    """Récupère un modèle STT par son ID"""
    return get_model_manager().get_model(model_id)


def get_models_by_type(model_type: ModelType, backend: Optional[str] = None) -> List[ModelInfo]:
    """
    Récupère tous les modèles d'un type donné.

    Args:
        model_type: Type de modèle
        backend: Filtrer par backend (optionnel)

    Returns:
        Liste des ModelInfo correspondants
    """
    manager = get_model_manager()
    with manager._models_lock:
        models = [m for m in manager._models.values() if m.model_type == model_type]
        if backend:
            models = [m for m in models if m.backend == backend]
        return models


def get_mms_model_for_language(language_code: str) -> Optional[Any]:
    """
    Récupère le modèle MMS-TTS pour une langue spécifique.

    Args:
        language_code: Code langue ISO (ex: "sw", "am", "ha")

    Returns:
        Modèle MMS ou None
    """
    model_id = f"tts_mms_{language_code}"
    return get_model_manager().get_model(model_id)


def unload_models_by_type(model_type: ModelType, keep_priority_1: bool = True) -> int:
    """
    Décharge tous les modèles d'un type donné.

    Args:
        model_type: Type de modèle à décharger
        keep_priority_1: Garder les modèles priorité 1

    Returns:
        Nombre de modèles déchargés
    """
    manager = get_model_manager()
    unloaded = 0

    with manager._models_lock:
        to_unload = [
            m.model_id for m in manager._models.values()
            if m.model_type == model_type and (not keep_priority_1 or m.priority > 1)
        ]

    for model_id in to_unload:
        if manager.unload_model(model_id):
            unloaded += 1

    return unloaded


def print_model_summary():
    """Affiche un résumé des modèles chargés"""
    manager = get_model_manager()
    stats = manager.get_memory_stats()

    logger.info("=" * 60)
    logger.info("📊 RÉSUMÉ DES MODÈLES CHARGÉS")
    logger.info("=" * 60)
    logger.info(f"Device: {stats['device']}")
    logger.info(f"Modèles chargés: {stats['models_count']}")

    if 'gpu' in stats:
        gpu = stats['gpu']
        logger.info(f"GPU: {gpu['allocated_mb']:.0f}MB / {gpu['total_mb']:.0f}MB utilisés")

    if 'by_type' in stats:
        logger.info("-" * 40)
        for type_name, info in stats['by_type'].items():
            logger.info(f"  {type_name}: {info['count']} modèles, {info['memory_mb']:.0f}MB")

    logger.info("=" * 60)
