"""
Service de transcription audio - Singleton
Supporte les transcriptions mobiles (metadata) et serveur (Whisper)
Architecture: Chargement non-bloquant, compatible avec le pattern du TranslationMLService

INTEGRATION: Ce service utilise le ModelManager centralisé pour:
- Gestion unifiée de la mémoire GPU/CPU
- Éviction LRU automatique des modèles peu utilisés
- Statistiques globales sur tous les modèles
- Chemins de stockage standardisés
"""

import os
import logging
import time
import asyncio
import threading
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from pathlib import Path

# Import du ModelManager centralisé
from .model_manager import (
    get_model_manager,
    get_model_paths,
    register_stt_model,
    get_stt_model,
    STTBackend,
    ModelType
)

# Configuration du logging
logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
WHISPER_AVAILABLE = False
AUDIO_PROCESSING_AVAILABLE = False

try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
    logger.info("✅ [TRANSCRIPTION] faster-whisper disponible")
except ImportError:
    logger.warning("⚠️ [TRANSCRIPTION] faster-whisper non disponible - transcription serveur désactivée")

try:
    import soundfile as sf
    import librosa
    AUDIO_PROCESSING_AVAILABLE = True
    logger.info("✅ [TRANSCRIPTION] soundfile/librosa disponibles")
except ImportError:
    logger.warning("⚠️ [TRANSCRIPTION] soundfile/librosa non disponibles")


@dataclass
class TranscriptionSegment:
    """Segment de transcription avec timestamps"""
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0


@dataclass
class TranscriptionResult:
    """Résultat d'une transcription"""
    text: str
    language: str
    confidence: float
    segments: List[TranscriptionSegment] = field(default_factory=list)
    duration_ms: int = 0
    source: str = "whisper"  # "mobile" ou "whisper"
    model: Optional[str] = None
    processing_time_ms: int = 0


class TranscriptionService:
    """
    Service de transcription audio - Singleton
    Supporte:
    - Transcription mobile (passthrough des métadonnées)
    - Transcription serveur via faster-whisper
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        """Singleton pattern pour garantir une seule instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        model_size: str = "large-v3",
        device: str = "cpu",
        compute_type: str = "int8",  # int8 pour CPU (float16 non supporté sur CPU Mac)
        models_path: Optional[str] = None
    ):
        if self._initialized:
            return

        # Configuration - utilise les chemins centralisés du ModelManager
        model_paths = get_model_paths()
        self.model_size = os.getenv('WHISPER_MODEL', model_size)
        self.device = os.getenv('WHISPER_DEVICE', device)
        self.compute_type = os.getenv('WHISPER_COMPUTE_TYPE', compute_type)
        # Utilise le chemin centralisé pour Whisper (peut être override)
        self.models_path = models_path or str(model_paths.stt_whisper)

        # NOTE: Le modèle est maintenant géré par le ModelManager centralisé
        # au lieu d'un attribut local. Cela permet:
        # - Gestion mémoire unifiée
        # - Éviction LRU automatique
        # - Statistiques globales

        # ID du modèle dans le ModelManager
        self._model_id = f"stt_whisper_{self.model_size.replace('-', '_')}"

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        logger.info(f"[TRANSCRIPTION] Service créé: model={self.model_size}, device={self.device}")
        self._initialized = True

    async def initialize(self) -> bool:
        """
        Charge le modèle Whisper de manière non-bloquante.
        Peut être appelé plusieurs fois sans effet (idempotent).
        """
        if self.is_initialized:
            return True

        async with self._init_lock:
            # Double-check après acquisition du lock
            if self.is_initialized:
                return True

            if not WHISPER_AVAILABLE:
                logger.warning("[TRANSCRIPTION] Whisper non disponible - mode mobile uniquement")
                self.is_initialized = True
                return True

            # Vérifier si déjà dans le ModelManager
            existing = get_stt_model(self._model_id)
            if existing is not None:
                logger.info(f"[TRANSCRIPTION] ✅ Modèle Whisper déjà chargé via ModelManager")
                self.is_initialized = True
                return True

            try:
                start_time = time.time()
                logger.info(f"[TRANSCRIPTION] 🔄 Chargement du modèle Whisper {self.model_size}...")

                # Charger le modèle dans un thread pour ne pas bloquer
                loop = asyncio.get_event_loop()
                model = await loop.run_in_executor(
                    None,
                    self._load_whisper_model
                )

                # Enregistrer dans le ModelManager centralisé
                # Priority 1 = haute (STT est critique, ne pas évicté)
                register_stt_model(
                    model_id=self._model_id,
                    model_object=model,
                    backend=STTBackend.WHISPER_LARGE.value if "large" in self.model_size else STTBackend.WHISPER.value,
                    model_name=f"Whisper-{self.model_size}",
                    priority=1  # Haute priorité - ne pas évicter
                )

                load_time = time.time() - start_time
                logger.info(f"[TRANSCRIPTION] ✅ Modèle Whisper chargé et enregistré en {load_time:.2f}s")

                self.is_initialized = True
                return True

            except Exception as e:
                logger.error(f"[TRANSCRIPTION] ❌ Erreur chargement Whisper: {e}")
                import traceback
                traceback.print_exc()
                # On considère quand même initialisé (mode mobile uniquement)
                self.is_initialized = True
                return True

    def _load_whisper_model(self):
        """Charge le modèle Whisper (appelé dans un thread)"""
        return WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            download_root=self.models_path
        )

    async def transcribe(
        self,
        audio_path: str,
        mobile_transcription: Optional[Dict[str, Any]] = None,
        return_timestamps: bool = True
    ) -> TranscriptionResult:
        """
        Transcrit un fichier audio.

        Si mobile_transcription est fourni, l'utilise directement (passthrough).
        Sinon, utilise Whisper pour transcrire.

        Args:
            audio_path: Chemin vers le fichier audio
            mobile_transcription: Transcription fournie par le client mobile
                Format: {
                    "text": str,
                    "language": str,
                    "confidence": float,
                    "source": str,  # "ios_speech", "android_speech", "whisperkit"
                    "segments": [{"text": str, "startMs": int, "endMs": int}, ...]
                }
            return_timestamps: Retourner les segments avec timestamps

        Returns:
            TranscriptionResult avec texte, langue, confiance et segments
        """
        start_time = time.time()

        # ─────────────────────────────────────────────────────
        # OPTION 1: Utiliser la transcription mobile si fournie
        # ─────────────────────────────────────────────────────
        if mobile_transcription and mobile_transcription.get('text'):
            logger.info(f"[TRANSCRIPTION] 📱 Utilisation de la transcription mobile")

            # Parser les segments si disponibles
            segments = []
            if mobile_transcription.get('segments'):
                for seg in mobile_transcription['segments']:
                    segments.append(TranscriptionSegment(
                        text=seg.get('text', ''),
                        start_ms=seg.get('startMs', 0),
                        end_ms=seg.get('endMs', 0),
                        confidence=seg.get('confidence', 0.9)
                    ))

            # Récupérer la durée audio
            duration_ms = await self._get_audio_duration_ms(audio_path)

            processing_time = int((time.time() - start_time) * 1000)

            return TranscriptionResult(
                text=mobile_transcription['text'],
                language=mobile_transcription.get('language', 'auto'),
                confidence=mobile_transcription.get('confidence', 0.85),
                segments=segments,
                duration_ms=duration_ms,
                source="mobile",
                model=mobile_transcription.get('source', 'mobile'),
                processing_time_ms=processing_time
            )

        # ─────────────────────────────────────────────────────
        # OPTION 2: Transcrire avec Whisper
        # ─────────────────────────────────────────────────────
        # Récupérer le modèle depuis le ModelManager
        model = get_stt_model(self._model_id)
        if model is None:
            if not WHISPER_AVAILABLE:
                raise RuntimeError(
                    "Whisper non disponible et pas de transcription mobile fournie"
                )
            # Initialiser si pas encore fait
            await self.initialize()
            model = get_stt_model(self._model_id)
            if model is None:
                raise RuntimeError("Échec de l'initialisation de Whisper")

        logger.info(f"[TRANSCRIPTION] 🎤 Transcription Whisper de: {audio_path}")

        try:
            # Transcrire dans un thread pour ne pas bloquer
            loop = asyncio.get_event_loop()
            segments_raw, info = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    audio_path,
                    beam_size=5,
                    word_timestamps=return_timestamps,
                    vad_filter=True  # Filtrer les silences
                )
            )

            # Convertir les segments
            segments_list = list(segments_raw)
            full_text = " ".join([s.text.strip() for s in segments_list])

            # Parser les segments
            segments = []
            if return_timestamps:
                for s in segments_list:
                    segments.append(TranscriptionSegment(
                        text=s.text.strip(),
                        start_ms=int(s.start * 1000),
                        end_ms=int(s.end * 1000),
                        confidence=getattr(s, 'avg_logprob', 0.0)
                    ))

            processing_time = int((time.time() - start_time) * 1000)

            logger.info(
                f"[TRANSCRIPTION] ✅ Transcrit: '{full_text[:50]}...' "
                f"(lang={info.language}, conf={info.language_probability:.2f}, "
                f"dur={int(info.duration)}s, time={processing_time}ms)"
            )

            return TranscriptionResult(
                text=full_text,
                language=info.language,
                confidence=info.language_probability,
                segments=segments,
                duration_ms=int(info.duration * 1000),
                source="whisper",
                model="whisper_boost",  # Nom canonique du modèle Whisper
                processing_time_ms=processing_time
            )

        except Exception as e:
            logger.error(f"[TRANSCRIPTION] ❌ Erreur transcription: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Échec de la transcription: {e}")

    async def _get_audio_duration_ms(self, audio_path: str) -> int:
        """Récupère la durée d'un fichier audio en millisecondes"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return 0

        try:
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            return int(duration * 1000)
        except Exception as e:
            logger.warning(f"[TRANSCRIPTION] Impossible de lire la durée audio: {e}")
            return 0

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        # Vérifier si le modèle est dans le ModelManager
        model = get_stt_model(self._model_id)
        model_info = get_model_manager().get_model_info(self._model_id)

        stats = {
            "service": "TranscriptionService",
            "initialized": self.is_initialized,
            "whisper_available": WHISPER_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "model_loaded": model is not None,
            "model_size": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "model_manager_integrated": True,
            "model_id": self._model_id
        }

        if model_info:
            stats["model_info"] = {
                "memory_mb": model_info.memory_bytes / 1024 / 1024,
                "use_count": model_info.use_count,
                "priority": model_info.priority
            }

        return stats

    async def close(self):
        """Libère les ressources"""
        logger.info("[TRANSCRIPTION] 🛑 Fermeture du service")
        # NOTE: Le modèle est géré par le ModelManager centralisé
        # On peut le décharger explicitement si besoin
        manager = get_model_manager()
        if manager.has_model(self._model_id):
            manager.unload_model(self._model_id)
            logger.info(f"[TRANSCRIPTION] Modèle {self._model_id} déchargé")
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_transcription_service() -> TranscriptionService:
    """Retourne l'instance singleton du service de transcription"""
    return TranscriptionService()
