"""
Service d'analyse vocale avancée - Singleton
Analyse: pitch, timbre, MFCC, énergie, clarté, classification
Comparaison multi-critères avec scoring pondéré
"""

import os
import logging
import time
import asyncio
import threading
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import hashlib

# Configuration du logging
logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
AUDIO_ANALYSIS_AVAILABLE = False
LIBROSA_AVAILABLE = False

try:
    import numpy as np
    import librosa
    import scipy.signal
    from scipy.stats import skew, kurtosis
    LIBROSA_AVAILABLE = True
    AUDIO_ANALYSIS_AVAILABLE = True
    logger.info("✅ [VOICE_ANALYZER] librosa + scipy disponibles")
except ImportError as e:
    logger.warning(f"⚠️ [VOICE_ANALYZER] Dépendances manquantes: {e}")
    import numpy as np  # numpy minimal


@dataclass
class VoiceCharacteristics:
    """Caractéristiques vocales extraites"""
    # Pitch analysis
    pitch_mean: float = 0.0          # Hz - fréquence moyenne
    pitch_std: float = 0.0           # Hz - variation du pitch
    pitch_min: float = 0.0           # Hz - pitch minimum
    pitch_max: float = 0.0           # Hz - pitch maximum
    pitch_range: float = 0.0         # Hz - étendue du pitch

    # Timbre analysis (spectral)
    spectral_centroid: float = 0.0   # Hz - "brillance" du son
    spectral_bandwidth: float = 0.0  # Hz - largeur spectrale
    spectral_rolloff: float = 0.0    # Hz - fréquence rolloff
    spectral_flatness: float = 0.0   # 0-1 - tonal vs bruit

    # Energy analysis
    rms_energy: float = 0.0          # Énergie RMS moyenne
    energy_std: float = 0.0          # Variation d'énergie
    dynamic_range: float = 0.0       # dB - dynamique

    # Voice quality
    harmonics_to_noise: float = 0.0  # Ratio harmoniques/bruit
    jitter: float = 0.0              # Variation cycle à cycle
    shimmer: float = 0.0             # Variation amplitude

    # MFCC features (13 coefficients)
    mfcc_mean: List[float] = field(default_factory=list)
    mfcc_std: List[float] = field(default_factory=list)

    # Classification
    voice_type: str = "unknown"      # Classification vocale
    gender_estimate: str = "unknown" # male/female/unknown
    age_range: str = "unknown"       # child/young/adult/senior

    # Metadata
    duration_seconds: float = 0.0
    sample_rate: int = 0
    analysis_time_ms: int = 0
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        return {
            "pitch": {
                "mean": self.pitch_mean,
                "std": self.pitch_std,
                "min": self.pitch_min,
                "max": self.pitch_max,
                "range": self.pitch_range
            },
            "spectral": {
                "centroid": self.spectral_centroid,
                "bandwidth": self.spectral_bandwidth,
                "rolloff": self.spectral_rolloff,
                "flatness": self.spectral_flatness
            },
            "energy": {
                "rms": self.rms_energy,
                "std": self.energy_std,
                "dynamic_range_db": self.dynamic_range
            },
            "quality": {
                "harmonics_to_noise": self.harmonics_to_noise,
                "jitter": self.jitter,
                "shimmer": self.shimmer
            },
            "mfcc": {
                "mean": self.mfcc_mean,
                "std": self.mfcc_std
            },
            "classification": {
                "voice_type": self.voice_type,
                "gender_estimate": self.gender_estimate,
                "age_range": self.age_range
            },
            "metadata": {
                "duration_seconds": self.duration_seconds,
                "sample_rate": self.sample_rate,
                "analysis_time_ms": self.analysis_time_ms,
                "confidence": self.confidence
            }
        }


@dataclass
class VoiceSimilarityResult:
    """Résultat de comparaison de deux voix"""
    overall_score: float = 0.0       # 0-1 score global
    pitch_similarity: float = 0.0    # 0-1
    timbre_similarity: float = 0.0   # 0-1
    mfcc_similarity: float = 0.0     # 0-1
    energy_similarity: float = 0.0   # 0-1

    # Détails
    is_likely_same_speaker: bool = False
    confidence: float = 0.0
    analysis_time_ms: int = 0

    # Breakdown
    details: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "overall_score": self.overall_score,
            "is_likely_same_speaker": self.is_likely_same_speaker,
            "confidence": self.confidence,
            "components": {
                "pitch_similarity": self.pitch_similarity,
                "timbre_similarity": self.timbre_similarity,
                "mfcc_similarity": self.mfcc_similarity,
                "energy_similarity": self.energy_similarity
            },
            "details": self.details,
            "analysis_time_ms": self.analysis_time_ms
        }


class VoiceAnalyzerService:
    """
    Service d'analyse vocale avancée - Singleton

    Fonctionnalités:
    - Extraction de caractéristiques vocales (pitch, timbre, MFCC)
    - Classification vocale (type, genre, âge)
    - Comparaison de similarité multi-critères
    - Cache intelligent des analyses
    """

    _instance = None
    _lock = threading.Lock()

    # Poids pour le score de similarité
    SIMILARITY_WEIGHTS = {
        "pitch": 0.20,
        "timbre": 0.25,
        "mfcc": 0.35,
        "energy": 0.20
    }

    # Seuils de classification vocale par pitch
    PITCH_THRESHOLDS = {
        "child": (250, 400),      # Enfant
        "high_female": (200, 280),
        "medium_female": (165, 220),
        "low_female": (140, 180),
        "high_male": (120, 160),
        "medium_male": (100, 130),
        "low_male": (75, 110)
    }

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self, cache_dir: Optional[str] = None):
        if self._initialized:
            return

        # Configuration
        self.cache_dir = Path(cache_dir or os.getenv('ANALYTICS_DATA_DIR', './analytics_data')) / 'voice_analysis'
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Cache en mémoire (LRU)
        self._analysis_cache: Dict[str, VoiceCharacteristics] = {}
        self._cache_max_size = 100

        # Stats
        self._stats = {
            "analyses_performed": 0,
            "comparisons_performed": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "total_analysis_time_ms": 0
        }

        logger.info(f"[VOICE_ANALYZER] Service créé: cache_dir={self.cache_dir}")
        self._initialized = True

    async def initialize(self) -> bool:
        """Initialise le service"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            logger.info("[VOICE_ANALYZER] 🔄 Initialisation...")

            if not AUDIO_ANALYSIS_AVAILABLE:
                logger.warning("[VOICE_ANALYZER] ⚠️ Mode dégradé - librosa non disponible")

            self.is_initialized = True
            logger.info("[VOICE_ANALYZER] ✅ Initialisé")
            return True

    async def analyze(
        self,
        audio_path: str,
        use_cache: bool = True
    ) -> VoiceCharacteristics:
        """
        Analyse complète des caractéristiques vocales d'un fichier audio.

        Args:
            audio_path: Chemin vers le fichier audio
            use_cache: Utiliser le cache si disponible

        Returns:
            VoiceCharacteristics avec toutes les métriques
        """
        start_time = time.time()

        # Générer clé de cache
        cache_key = self._get_cache_key(audio_path)

        # Vérifier cache
        if use_cache and cache_key in self._analysis_cache:
            self._stats["cache_hits"] += 1
            logger.debug(f"[VOICE_ANALYZER] Cache hit: {cache_key[:16]}")
            return self._analysis_cache[cache_key]

        self._stats["cache_misses"] += 1

        if not AUDIO_ANALYSIS_AVAILABLE:
            logger.warning("[VOICE_ANALYZER] Mode dégradé - analyse simplifiée")
            return self._create_dummy_analysis(audio_path, start_time)

        try:
            # Charger l'audio
            loop = asyncio.get_event_loop()
            characteristics = await loop.run_in_executor(
                None,
                self._perform_analysis,
                audio_path
            )

            # Calculer le temps d'analyse
            analysis_time = int((time.time() - start_time) * 1000)
            characteristics.analysis_time_ms = analysis_time

            # Mettre en cache
            self._add_to_cache(cache_key, characteristics)

            # Stats
            self._stats["analyses_performed"] += 1
            self._stats["total_analysis_time_ms"] += analysis_time

            logger.info(
                f"[VOICE_ANALYZER] ✅ Analyse: pitch={characteristics.pitch_mean:.1f}Hz, "
                f"type={characteristics.voice_type}, time={analysis_time}ms"
            )

            return characteristics

        except Exception as e:
            logger.error(f"[VOICE_ANALYZER] ❌ Erreur analyse: {e}")
            import traceback
            traceback.print_exc()
            return self._create_dummy_analysis(audio_path, start_time)

    def _perform_analysis(self, audio_path: str) -> VoiceCharacteristics:
        """Effectue l'analyse vocale (exécuté dans un thread)"""
        # Charger l'audio
        y, sr = librosa.load(audio_path, sr=22050)
        duration = librosa.get_duration(y=y, sr=sr)

        characteristics = VoiceCharacteristics(
            duration_seconds=duration,
            sample_rate=sr
        )

        # ═══════════════════════════════════════════════════════════════
        # ANALYSE DU PITCH (F0)
        # ═══════════════════════════════════════════════════════════════
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=librosa.note_to_hz('C2'),  # ~65 Hz
            fmax=librosa.note_to_hz('C7'),  # ~2093 Hz
            sr=sr
        )

        # Filtrer les valeurs valides
        f0_valid = f0[~np.isnan(f0)]

        if len(f0_valid) > 0:
            characteristics.pitch_mean = float(np.mean(f0_valid))
            characteristics.pitch_std = float(np.std(f0_valid))
            characteristics.pitch_min = float(np.min(f0_valid))
            characteristics.pitch_max = float(np.max(f0_valid))
            characteristics.pitch_range = characteristics.pitch_max - characteristics.pitch_min

        # ═══════════════════════════════════════════════════════════════
        # ANALYSE SPECTRALE (TIMBRE)
        # ═══════════════════════════════════════════════════════════════
        # Spectral centroid - "brillance"
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        characteristics.spectral_centroid = float(np.mean(spectral_centroids))

        # Spectral bandwidth
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        characteristics.spectral_bandwidth = float(np.mean(spectral_bandwidth))

        # Spectral rolloff
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.85)[0]
        characteristics.spectral_rolloff = float(np.mean(spectral_rolloff))

        # Spectral flatness (0 = tonal, 1 = bruit)
        spectral_flatness = librosa.feature.spectral_flatness(y=y)[0]
        characteristics.spectral_flatness = float(np.mean(spectral_flatness))

        # ═══════════════════════════════════════════════════════════════
        # ANALYSE DE L'ÉNERGIE
        # ═══════════════════════════════════════════════════════════════
        rms = librosa.feature.rms(y=y)[0]
        characteristics.rms_energy = float(np.mean(rms))
        characteristics.energy_std = float(np.std(rms))

        # Dynamic range en dB
        rms_db = librosa.amplitude_to_db(rms + 1e-10)
        characteristics.dynamic_range = float(np.max(rms_db) - np.min(rms_db))

        # ═══════════════════════════════════════════════════════════════
        # MFCC (Mel-Frequency Cepstral Coefficients)
        # ═══════════════════════════════════════════════════════════════
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        characteristics.mfcc_mean = [float(x) for x in np.mean(mfccs, axis=1)]
        characteristics.mfcc_std = [float(x) for x in np.std(mfccs, axis=1)]

        # ═══════════════════════════════════════════════════════════════
        # QUALITÉ VOCALE (simplifiée)
        # ═══════════════════════════════════════════════════════════════
        # Jitter (variation F0)
        if len(f0_valid) > 1:
            f0_diff = np.abs(np.diff(f0_valid))
            characteristics.jitter = float(np.mean(f0_diff) / (np.mean(f0_valid) + 1e-10))

        # Shimmer (variation amplitude) - approximation
        if len(rms) > 1:
            rms_diff = np.abs(np.diff(rms))
            characteristics.shimmer = float(np.mean(rms_diff) / (np.mean(rms) + 1e-10))

        # Harmonics-to-Noise Ratio (approximation via spectral flatness)
        characteristics.harmonics_to_noise = float(1.0 - characteristics.spectral_flatness)

        # ═══════════════════════════════════════════════════════════════
        # CLASSIFICATION
        # ═══════════════════════════════════════════════════════════════
        characteristics.voice_type = self._classify_voice_type(characteristics.pitch_mean)
        characteristics.gender_estimate = self._estimate_gender(characteristics.pitch_mean)
        characteristics.age_range = self._estimate_age_range(characteristics.pitch_mean)

        # Confidence basée sur la durée et la qualité
        voiced_ratio = np.sum(~np.isnan(f0)) / len(f0) if len(f0) > 0 else 0
        duration_factor = min(1.0, duration / 10.0)  # Max à 10s
        characteristics.confidence = float(voiced_ratio * duration_factor)

        return characteristics

    def _classify_voice_type(self, pitch: float) -> str:
        """Classifie le type de voix basé sur le pitch"""
        if pitch <= 0:
            return "unknown"

        for voice_type, (low, high) in self.PITCH_THRESHOLDS.items():
            if low <= pitch <= high:
                return voice_type

        if pitch > 280:
            return "very_high"
        elif pitch < 80:
            return "very_low"
        return "medium"

    def _estimate_gender(self, pitch: float) -> str:
        """Estime le genre basé sur le pitch"""
        if pitch <= 0:
            return "unknown"

        if pitch > 250:
            return "child"
        elif pitch > 155:
            return "female"
        elif pitch > 80:
            return "male"
        return "unknown"

    def _estimate_age_range(self, pitch: float) -> str:
        """Estime la tranche d'âge"""
        if pitch <= 0:
            return "unknown"

        if pitch > 250:
            return "child"
        elif pitch > 200:
            return "young_female"
        elif pitch > 160:
            return "adult_female"
        elif pitch > 130:
            return "young_male"
        elif pitch > 100:
            return "adult_male"
        else:
            return "senior_male"

    async def compare(
        self,
        audio_path_1: str,
        audio_path_2: str,
        detailed: bool = False
    ) -> VoiceSimilarityResult:
        """
        Compare deux voix et retourne un score de similarité.

        Args:
            audio_path_1: Premier fichier audio
            audio_path_2: Second fichier audio
            detailed: Inclure les détails de comparaison

        Returns:
            VoiceSimilarityResult avec scores de similarité
        """
        start_time = time.time()

        # Analyser les deux audios
        char1 = await self.analyze(audio_path_1)
        char2 = await self.analyze(audio_path_2)

        result = VoiceSimilarityResult()

        # ═══════════════════════════════════════════════════════════════
        # SIMILARITÉ DU PITCH
        # ═══════════════════════════════════════════════════════════════
        if char1.pitch_mean > 0 and char2.pitch_mean > 0:
            pitch_diff = abs(char1.pitch_mean - char2.pitch_mean)
            max_pitch = max(char1.pitch_mean, char2.pitch_mean)
            result.pitch_similarity = max(0, 1 - (pitch_diff / max_pitch))

        # ═══════════════════════════════════════════════════════════════
        # SIMILARITÉ DU TIMBRE
        # ═══════════════════════════════════════════════════════════════
        timbre_features = [
            (char1.spectral_centroid, char2.spectral_centroid),
            (char1.spectral_bandwidth, char2.spectral_bandwidth),
            (char1.spectral_rolloff, char2.spectral_rolloff)
        ]

        timbre_scores = []
        for v1, v2 in timbre_features:
            if v1 > 0 and v2 > 0:
                diff = abs(v1 - v2)
                max_val = max(v1, v2)
                timbre_scores.append(max(0, 1 - (diff / max_val)))

        result.timbre_similarity = np.mean(timbre_scores) if timbre_scores else 0.0

        # ═══════════════════════════════════════════════════════════════
        # SIMILARITÉ MFCC (la plus importante)
        # ═══════════════════════════════════════════════════════════════
        if char1.mfcc_mean and char2.mfcc_mean:
            mfcc1 = np.array(char1.mfcc_mean)
            mfcc2 = np.array(char2.mfcc_mean)

            # Distance cosinus
            dot_product = np.dot(mfcc1, mfcc2)
            norm1 = np.linalg.norm(mfcc1)
            norm2 = np.linalg.norm(mfcc2)

            if norm1 > 0 and norm2 > 0:
                cosine_sim = dot_product / (norm1 * norm2)
                result.mfcc_similarity = float((cosine_sim + 1) / 2)  # Normaliser à 0-1

        # ═══════════════════════════════════════════════════════════════
        # SIMILARITÉ DE L'ÉNERGIE
        # ═══════════════════════════════════════════════════════════════
        if char1.rms_energy > 0 and char2.rms_energy > 0:
            energy_diff = abs(char1.rms_energy - char2.rms_energy)
            max_energy = max(char1.rms_energy, char2.rms_energy)
            result.energy_similarity = max(0, 1 - (energy_diff / max_energy))

        # ═══════════════════════════════════════════════════════════════
        # SCORE GLOBAL PONDÉRÉ
        # ═══════════════════════════════════════════════════════════════
        result.overall_score = (
            self.SIMILARITY_WEIGHTS["pitch"] * result.pitch_similarity +
            self.SIMILARITY_WEIGHTS["timbre"] * result.timbre_similarity +
            self.SIMILARITY_WEIGHTS["mfcc"] * result.mfcc_similarity +
            self.SIMILARITY_WEIGHTS["energy"] * result.energy_similarity
        )

        # Déterminer si c'est le même locuteur
        result.is_likely_same_speaker = result.overall_score >= 0.75

        # Confidence basée sur la qualité des analyses
        result.confidence = (char1.confidence + char2.confidence) / 2

        # Détails supplémentaires si demandé
        if detailed:
            result.details = {
                "voice1_type": char1.voice_type,
                "voice2_type": char2.voice_type,
                "voice1_pitch": char1.pitch_mean,
                "voice2_pitch": char2.pitch_mean,
                "same_gender": char1.gender_estimate == char2.gender_estimate,
                "pitch_difference_hz": abs(char1.pitch_mean - char2.pitch_mean)
            }

        result.analysis_time_ms = int((time.time() - start_time) * 1000)

        # Stats
        self._stats["comparisons_performed"] += 1

        logger.info(
            f"[VOICE_ANALYZER] ✅ Comparaison: score={result.overall_score:.2f}, "
            f"same_speaker={result.is_likely_same_speaker}"
        )

        return result

    def _get_cache_key(self, audio_path: str) -> str:
        """Génère une clé de cache basée sur le fichier"""
        if os.path.exists(audio_path):
            stat = os.stat(audio_path)
            key_data = f"{audio_path}:{stat.st_size}:{stat.st_mtime}"
        else:
            key_data = audio_path
        return hashlib.sha256(key_data.encode()).hexdigest()[:32]

    def _add_to_cache(self, key: str, characteristics: VoiceCharacteristics):
        """Ajoute une analyse au cache avec LRU"""
        if len(self._analysis_cache) >= self._cache_max_size:
            # Supprimer la plus ancienne entrée
            oldest_key = next(iter(self._analysis_cache))
            del self._analysis_cache[oldest_key]

        self._analysis_cache[key] = characteristics

    def _create_dummy_analysis(self, audio_path: str, start_time: float) -> VoiceCharacteristics:
        """Crée une analyse vide pour le mode dégradé"""
        return VoiceCharacteristics(
            voice_type="unknown",
            gender_estimate="unknown",
            age_range="unknown",
            confidence=0.0,
            analysis_time_ms=int((time.time() - start_time) * 1000)
        )

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        return {
            "service": "VoiceAnalyzerService",
            "initialized": self.is_initialized,
            "librosa_available": LIBROSA_AVAILABLE,
            "cache_size": len(self._analysis_cache),
            "cache_max_size": self._cache_max_size,
            **self._stats
        }

    def clear_cache(self):
        """Vide le cache"""
        self._analysis_cache.clear()
        logger.info("[VOICE_ANALYZER] Cache vidé")

    async def close(self):
        """Libère les ressources"""
        logger.info("[VOICE_ANALYZER] 🛑 Fermeture du service")
        self._analysis_cache.clear()
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_voice_analyzer_service() -> VoiceAnalyzerService:
    """Retourne l'instance singleton du service d'analyse vocale"""
    return VoiceAnalyzerService()
