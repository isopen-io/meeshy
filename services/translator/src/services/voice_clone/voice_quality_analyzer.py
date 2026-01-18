"""
Voice Quality Analyzer - Audio Feature Extraction & Comparison
Porté depuis iOS voice_cloning_test.py pour analyse de qualité vocale

Fonctionnalités:
- Extraction de features audio: pitch, MFCC, spectral centroid
- Détection automatique du type de voix (High/Medium/Low)
- Comparaison multi-métrique (pitch 30%, brightness 30%, MFCC 40%)
- Calcul de similarité globale entre deux audios
- Support async/await pour intégration pipeline

Architecture:
- Basé sur librosa pour extraction de features
- Métriques scientifiques pour analyse vocale
- Compatible avec le service de clonage vocal existant
- Logs détaillés pour traçage de qualité

Utilisé par:
- VoiceCloneService: validation de qualité avant clonage
- AudioMessagePipeline: analyse post-TTS pour métriques
- Tests de qualité vocale automatisés
"""

import logging
import asyncio
import time
from typing import Dict, Any, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
LIBROSA_AVAILABLE = False
NUMPY_AVAILABLE = False

try:
    import librosa
    import numpy as np
    LIBROSA_AVAILABLE = True
    NUMPY_AVAILABLE = True
    logger.info("✅ [VOICE_QUALITY] librosa et numpy disponibles")
except ImportError as e:
    logger.warning(f"⚠️ [VOICE_QUALITY] librosa/numpy non disponibles: {e}")
    import numpy as np  # numpy devrait toujours être disponible
    NUMPY_AVAILABLE = True


@dataclass
class VoiceQualityMetrics:
    """
    Métriques de qualité vocale extraites d'un audio.
    Compatible avec le format du script iOS.
    """
    # Pitch (fundamental frequency)
    pitch_mean_hz: float = 0.0
    pitch_std_hz: float = 0.0
    pitch_min_hz: float = 0.0
    pitch_max_hz: float = 0.0

    # Voice type classification
    voice_type: str = "unknown"  # "High (female/child)", "Medium", "Low (male)"

    # Spectral features
    spectral_centroid_mean_hz: float = 0.0
    brightness: float = 0.0  # Alias pour spectral_centroid

    # MFCC coefficients (13 coefficients)
    mfcc_coefficients: Optional[list] = None

    # Audio metadata
    duration_seconds: float = 0.0
    sample_rate: int = 22050

    # Legacy fields (compatibilité iOS)
    pitch_hz: float = 0.0  # Alias pour pitch_mean_hz
    pitch_std: float = 0.0  # Alias pour pitch_std_hz
    duration: float = 0.0  # Alias pour duration_seconds

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation (format iOS compatible)"""
        return {
            "pitch": {
                "mean_hz": self.pitch_mean_hz,
                "std_hz": self.pitch_std_hz,
                "min_hz": self.pitch_min_hz,
                "max_hz": self.pitch_max_hz
            },
            "voice_type": self.voice_type,
            "spectral": {
                "centroid_mean_hz": self.spectral_centroid_mean_hz,
                "brightness": self.brightness
            },
            "mfcc": {
                "coefficients": self.mfcc_coefficients if self.mfcc_coefficients else []
            } if self.mfcc_coefficients else None,
            "duration_seconds": self.duration_seconds,
            "sample_rate": self.sample_rate,
            # Legacy fields pour compatibilité iOS
            "pitch_hz": self.pitch_mean_hz,
            "pitch_std": self.pitch_std_hz,
            "brightness": self.brightness,
            "duration": self.duration_seconds
        }


@dataclass
class VoiceSimilarityResult:
    """
    Résultat de comparaison de similarité entre deux audios.
    Multi-métrique: pitch + brightness + MFCC.
    """
    pitch_similarity: float = 0.0
    brightness_similarity: float = 0.0
    mfcc_similarity: float = 0.0
    overall_similarity: float = 0.0  # Moyenne pondérée: 30% pitch + 30% brightness + 40% MFCC

    # Détails optionnels
    original_metrics: Optional[VoiceQualityMetrics] = None
    cloned_metrics: Optional[VoiceQualityMetrics] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        result = {
            "pitch_similarity": self.pitch_similarity,
            "brightness_similarity": self.brightness_similarity,
            "mfcc_similarity": self.mfcc_similarity,
            "overall": self.overall_similarity,
            "overall_similarity": self.overall_similarity
        }

        if self.original_metrics:
            result["original_metrics"] = self.original_metrics.to_dict()
        if self.cloned_metrics:
            result["cloned_metrics"] = self.cloned_metrics.to_dict()

        return result


class VoiceQualityAnalyzer:
    """
    Analyseur de qualité vocale - extraction de features et comparaison.

    Fonctionnalités:
    - analyze(): Extrait pitch, MFCC, spectral centroid d'un audio
    - compare(): Compare deux audios avec similarité multi-métrique
    - Voice type detection automatique (High/Medium/Low)
    - Support async pour intégration pipeline

    Basé sur le VoiceAnalyzer du script iOS voice_cloning_test.py (lignes 389-477).
    """

    def __init__(self):
        """Initialise l'analyseur de qualité vocale"""
        self.sample_rate = 22050  # Sample rate par défaut (même que iOS)
        self.pitch_fmin = 50  # Hz minimum pour pitch detection
        self.pitch_fmax = 500  # Hz maximum pour pitch detection
        self.n_mfcc = 13  # Nombre de coefficients MFCC (standard)

        logger.info(
            f"[VOICE_QUALITY] Analyseur initialisé: "
            f"sr={self.sample_rate}Hz, pitch_range=[{self.pitch_fmin}-{self.pitch_fmax}Hz], "
            f"n_mfcc={self.n_mfcc}"
        )

    async def analyze(
        self,
        audio_path: str,
        detailed: bool = False
    ) -> VoiceQualityMetrics:
        """
        Analyse complète d'un fichier audio.

        Extrait:
        - Pitch (fundamental frequency) avec stats (mean, std, min, max)
        - Voice type detection (High/Medium/Low basé sur pitch)
        - Spectral centroid (brightness)
        - MFCC coefficients (13 coeffs) si detailed=True

        Args:
            audio_path: Chemin vers le fichier audio
            detailed: Si True, extrait les MFCC (plus lent mais plus précis)

        Returns:
            VoiceQualityMetrics avec toutes les features extraites

        Raises:
            FileNotFoundError: Si le fichier audio n'existe pas
            RuntimeError: Si librosa n'est pas disponible
        """
        if not LIBROSA_AVAILABLE:
            logger.error("[VOICE_QUALITY] ❌ librosa non disponible - analyse impossible")
            raise RuntimeError("librosa requis pour analyse vocale")

        if not Path(audio_path).exists():
            raise FileNotFoundError(f"Audio non trouvé: {audio_path}")

        start_time = time.time()
        logger.info(f"[VOICE_QUALITY] 🔍 Analyse audio: {audio_path} (detailed={detailed})")

        # Charger l'audio dans un thread pour ne pas bloquer
        loop = asyncio.get_event_loop()
        audio, sr = await loop.run_in_executor(
            None,
            lambda: librosa.load(audio_path, sr=self.sample_rate)
        )

        metrics = VoiceQualityMetrics()
        metrics.sample_rate = sr
        metrics.duration_seconds = float(len(audio) / sr)
        metrics.duration = metrics.duration_seconds  # Legacy alias

        # ═══════════════════════════════════════════════════════════════════
        # PITCH ANALYSIS (Fundamental Frequency)
        # ═══════════════════════════════════════════════════════════════════
        logger.debug(f"[VOICE_QUALITY] Extraction pitch (fmin={self.pitch_fmin}, fmax={self.pitch_fmax})")

        try:
            f0, voiced_flag, voiced_probs = await loop.run_in_executor(
                None,
                lambda: librosa.pyin(
                    audio,
                    fmin=self.pitch_fmin,
                    fmax=self.pitch_fmax,
                    sr=sr
                )
            )

            # Filtrer les valeurs NaN (silences)
            f0_valid = f0[~np.isnan(f0)]

            if len(f0_valid) > 0:
                metrics.pitch_mean_hz = float(np.mean(f0_valid))
                metrics.pitch_std_hz = float(np.std(f0_valid))
                metrics.pitch_min_hz = float(np.min(f0_valid))
                metrics.pitch_max_hz = float(np.max(f0_valid))

                # Legacy aliases
                metrics.pitch_hz = metrics.pitch_mean_hz
                metrics.pitch_std = metrics.pitch_std_hz

                logger.debug(
                    f"[VOICE_QUALITY] Pitch: mean={metrics.pitch_mean_hz:.1f}Hz, "
                    f"std={metrics.pitch_std_hz:.1f}Hz, "
                    f"range=[{metrics.pitch_min_hz:.1f}-{metrics.pitch_max_hz:.1f}Hz]"
                )
            else:
                logger.warning("[VOICE_QUALITY] ⚠️ Aucun pitch détecté (audio silencieux?)")
                metrics.pitch_mean_hz = 0.0
                metrics.pitch_std_hz = 0.0
                metrics.pitch_min_hz = 0.0
                metrics.pitch_max_hz = 0.0
                metrics.pitch_hz = 0.0
                metrics.pitch_std = 0.0

        except Exception as e:
            logger.warning(f"[VOICE_QUALITY] ⚠️ Erreur extraction pitch: {e}")
            metrics.pitch_mean_hz = 0.0
            metrics.pitch_std_hz = 0.0
            metrics.pitch_hz = 0.0
            metrics.pitch_std = 0.0

        # ═══════════════════════════════════════════════════════════════════
        # VOICE TYPE DETECTION (basé sur pitch)
        # ═══════════════════════════════════════════════════════════════════
        pitch_mean = metrics.pitch_mean_hz
        if pitch_mean > 200:
            metrics.voice_type = "High (female/child)"
        elif pitch_mean > 140:
            metrics.voice_type = "Medium"
        elif pitch_mean > 0:
            metrics.voice_type = "Low (male)"
        else:
            metrics.voice_type = "unknown"

        logger.debug(f"[VOICE_QUALITY] Voice type détecté: {metrics.voice_type}")

        # ═══════════════════════════════════════════════════════════════════
        # SPECTRAL CENTROID (Brightness)
        # ═══════════════════════════════════════════════════════════════════
        logger.debug("[VOICE_QUALITY] Extraction spectral centroid")

        try:
            centroid = await loop.run_in_executor(
                None,
                lambda: librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            )

            metrics.spectral_centroid_mean_hz = float(np.mean(centroid))
            metrics.brightness = metrics.spectral_centroid_mean_hz  # Legacy alias

            logger.debug(f"[VOICE_QUALITY] Spectral centroid: {metrics.spectral_centroid_mean_hz:.1f}Hz")

        except Exception as e:
            logger.warning(f"[VOICE_QUALITY] ⚠️ Erreur extraction spectral centroid: {e}")
            metrics.spectral_centroid_mean_hz = 0.0
            metrics.brightness = 0.0

        # ═══════════════════════════════════════════════════════════════════
        # MFCC COEFFICIENTS (Mel-Frequency Cepstral Coefficients)
        # Utilisé pour comparaison de similarité vocale
        # ═══════════════════════════════════════════════════════════════════
        if detailed:
            logger.debug(f"[VOICE_QUALITY] Extraction MFCC ({self.n_mfcc} coefficients)")

            try:
                mfccs = await loop.run_in_executor(
                    None,
                    lambda: librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=self.n_mfcc)
                )

                # Moyenne de chaque coefficient sur toute la durée de l'audio
                metrics.mfcc_coefficients = [
                    float(np.mean(mfccs[i])) for i in range(self.n_mfcc)
                ]

                logger.debug(
                    f"[VOICE_QUALITY] MFCC extraits: {len(metrics.mfcc_coefficients)} coeffs, "
                    f"sample=[{metrics.mfcc_coefficients[0]:.2f}, {metrics.mfcc_coefficients[1]:.2f}, ...]"
                )

            except Exception as e:
                logger.warning(f"[VOICE_QUALITY] ⚠️ Erreur extraction MFCC: {e}")
                metrics.mfcc_coefficients = None

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(
            f"[VOICE_QUALITY] ✅ Analyse terminée: "
            f"voice_type={metrics.voice_type}, pitch={metrics.pitch_mean_hz:.1f}Hz, "
            f"brightness={metrics.brightness:.1f}Hz, duration={metrics.duration_seconds:.2f}s, "
            f"time={processing_time}ms"
        )

        return metrics

    async def compare(
        self,
        original_audio_path: str,
        cloned_audio_path: str
    ) -> VoiceSimilarityResult:
        """
        Compare deux audios et calcule la similarité vocale.

        Métriques de similarité:
        - Pitch similarity (30% du score global)
        - Brightness similarity (30% du score global)
        - MFCC similarity (40% du score global)
        - Overall similarity (moyenne pondérée)

        Formules:
        - Pitch: 1 - |diff| / original (normalisé 0-1)
        - Brightness: 1 - |diff| / original (normalisé 0-1)
        - MFCC: Cosine similarity entre vecteurs (normalisé 0-1)

        Args:
            original_audio_path: Chemin vers l'audio original
            cloned_audio_path: Chemin vers l'audio cloné

        Returns:
            VoiceSimilarityResult avec toutes les métriques de similarité
        """
        logger.info(
            f"[VOICE_QUALITY] 🔬 Comparaison similarité: "
            f"original={original_audio_path}, cloned={cloned_audio_path}"
        )

        start_time = time.time()

        # Analyser les deux audios (avec MFCC pour comparaison complète)
        orig_metrics, clone_metrics = await asyncio.gather(
            self.analyze(original_audio_path, detailed=True),
            self.analyze(cloned_audio_path, detailed=True)
        )

        result = VoiceSimilarityResult(
            original_metrics=orig_metrics,
            cloned_metrics=clone_metrics
        )

        # ═══════════════════════════════════════════════════════════════════
        # PITCH SIMILARITY (30% du score)
        # ═══════════════════════════════════════════════════════════════════
        if orig_metrics.pitch_mean_hz > 0 and clone_metrics.pitch_mean_hz > 0:
            pitch_diff = abs(orig_metrics.pitch_mean_hz - clone_metrics.pitch_mean_hz)
            result.pitch_similarity = max(0.0, 1.0 - pitch_diff / orig_metrics.pitch_mean_hz)
        else:
            result.pitch_similarity = 0.0

        logger.debug(
            f"[VOICE_QUALITY] Pitch similarity: {result.pitch_similarity:.2%} "
            f"(orig={orig_metrics.pitch_mean_hz:.1f}Hz, clone={clone_metrics.pitch_mean_hz:.1f}Hz)"
        )

        # ═══════════════════════════════════════════════════════════════════
        # BRIGHTNESS SIMILARITY (30% du score)
        # ═══════════════════════════════════════════════════════════════════
        if orig_metrics.brightness > 0:
            bright_diff = abs(orig_metrics.brightness - clone_metrics.brightness)
            result.brightness_similarity = max(0.0, 1.0 - bright_diff / max(orig_metrics.brightness, 1))
        else:
            result.brightness_similarity = 0.0

        logger.debug(
            f"[VOICE_QUALITY] Brightness similarity: {result.brightness_similarity:.2%} "
            f"(orig={orig_metrics.brightness:.1f}Hz, clone={clone_metrics.brightness:.1f}Hz)"
        )

        # ═══════════════════════════════════════════════════════════════════
        # MFCC SIMILARITY (40% du score)
        # Cosine similarity entre les vecteurs MFCC
        # ═══════════════════════════════════════════════════════════════════
        if (orig_metrics.mfcc_coefficients
            and clone_metrics.mfcc_coefficients
            and len(orig_metrics.mfcc_coefficients) == len(clone_metrics.mfcc_coefficients)):

            orig_mfcc = np.array(orig_metrics.mfcc_coefficients)
            clone_mfcc = np.array(clone_metrics.mfcc_coefficients)

            # Cosine similarity: (A·B) / (||A|| * ||B||)
            dot_product = np.dot(orig_mfcc, clone_mfcc)
            norm_product = np.linalg.norm(orig_mfcc) * np.linalg.norm(clone_mfcc) + 1e-10
            cosine_sim = dot_product / norm_product

            # Normaliser de [-1, 1] vers [0, 1]
            result.mfcc_similarity = float((cosine_sim + 1.0) / 2.0)

            logger.debug(
                f"[VOICE_QUALITY] MFCC similarity: {result.mfcc_similarity:.2%} "
                f"(cosine_sim={cosine_sim:.3f})"
            )
        else:
            # MFCC non disponibles, utiliser score neutre
            result.mfcc_similarity = 0.5
            logger.warning("[VOICE_QUALITY] ⚠️ MFCC non disponibles, score neutre 0.5")

        # ═══════════════════════════════════════════════════════════════════
        # OVERALL SIMILARITY (moyenne pondérée)
        # 30% pitch + 30% brightness + 40% MFCC
        # ═══════════════════════════════════════════════════════════════════
        result.overall_similarity = (
            result.pitch_similarity * 0.3 +
            result.brightness_similarity * 0.3 +
            result.mfcc_similarity * 0.4
        )

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(
            f"[VOICE_QUALITY] ✅ Comparaison terminée: "
            f"overall={result.overall_similarity:.2%} "
            f"(pitch={result.pitch_similarity:.2%}, "
            f"brightness={result.brightness_similarity:.2%}, "
            f"mfcc={result.mfcc_similarity:.2%}), "
            f"time={processing_time}ms"
        )

        return result

    async def analyze_batch(
        self,
        audio_paths: list,
        detailed: bool = False
    ) -> Dict[str, VoiceQualityMetrics]:
        """
        Analyse plusieurs fichiers audio en parallèle.

        Args:
            audio_paths: Liste de chemins vers les fichiers audio
            detailed: Si True, extrait les MFCC pour chaque audio

        Returns:
            Dict[audio_path, VoiceQualityMetrics] avec les métriques pour chaque audio
        """
        logger.info(f"[VOICE_QUALITY] 📊 Analyse batch: {len(audio_paths)} audios")

        start_time = time.time()

        # Analyser en parallèle
        results = await asyncio.gather(
            *[self.analyze(path, detailed=detailed) for path in audio_paths],
            return_exceptions=True
        )

        # Collecter les résultats réussis
        metrics_dict = {}
        for path, result in zip(audio_paths, results):
            if isinstance(result, Exception):
                logger.error(f"[VOICE_QUALITY] ❌ Erreur analyse {path}: {result}")
            else:
                metrics_dict[path] = result

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(
            f"[VOICE_QUALITY] ✅ Analyse batch terminée: "
            f"{len(metrics_dict)}/{len(audio_paths)} réussis, time={processing_time}ms"
        )

        return metrics_dict

    def is_available(self) -> bool:
        """Vérifie si l'analyseur est disponible (dépend de librosa)"""
        return LIBROSA_AVAILABLE and NUMPY_AVAILABLE


# ═══════════════════════════════════════════════════════════════════════════
# Singleton instance
# ═══════════════════════════════════════════════════════════════════════════

_voice_quality_analyzer_instance: Optional[VoiceQualityAnalyzer] = None


def get_voice_quality_analyzer() -> VoiceQualityAnalyzer:
    """
    Retourne l'instance singleton de VoiceQualityAnalyzer.

    Returns:
        Instance partagée de VoiceQualityAnalyzer
    """
    global _voice_quality_analyzer_instance

    if _voice_quality_analyzer_instance is None:
        _voice_quality_analyzer_instance = VoiceQualityAnalyzer()

    return _voice_quality_analyzer_instance
