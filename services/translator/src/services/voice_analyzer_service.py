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

# Import de la classe unifiée
from models.voice_models import VoiceCharacteristics

# Re-export pour compatibilité
__all__ = ['VoiceCharacteristics', 'VoiceSimilarityResult', 'VoiceAnalyzerService']


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

    def get_optimal_clone_params(
        self,
        characteristics: VoiceCharacteristics,
        target_language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calcule les paramètres optimaux de clonage vocal basés sur l'analyse.

        Args:
            characteristics: Caractéristiques vocales analysées
            target_language: Langue cible (optionnel, pour ajustements)

        Returns:
            Dict avec tous les paramètres Chatterbox optimisés:
            - exaggeration: Expressivité (0.0-1.0)
            - cfg_weight: Guidance (0.0-1.0)
            - temperature: Créativité (0.0-2.0)
            - repetition_penalty: Pénalité répétition (1.0-3.0)
            - min_p: Probabilité minimum (0.0-1.0)
            - top_p: Nucleus sampling (0.0-1.0)
        """
        # ═══════════════════════════════════════════════════════════════════
        # CALCUL DE L'EXPRESSIVITÉ (basé sur variation pitch + énergie)
        # ═══════════════════════════════════════════════════════════════════
        # Coefficient de variation du pitch
        pitch_cv = characteristics.pitch_std / characteristics.pitch_mean if characteristics.pitch_mean > 0 else 0.15

        # Normaliser (CV typique: 0.05-0.30)
        pitch_expressiveness = min(1.0, pitch_cv / 0.25)

        # Expressivité de l'énergie (basée sur dynamic_range)
        # Dynamic range typique: 10-40 dB
        energy_expressiveness = min(1.0, characteristics.dynamic_range / 30.0)

        # Score d'expressivité combiné
        expressiveness_score = (pitch_expressiveness * 0.6 + energy_expressiveness * 0.4)

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL DE LA STABILITÉ (basé sur jitter, shimmer, spectral_flatness)
        # ═══════════════════════════════════════════════════════════════════
        # Jitter typique: 0.01-0.05 (plus bas = plus stable)
        jitter_stability = 1.0 - min(1.0, characteristics.jitter / 0.05)

        # Shimmer typique: 0.02-0.10
        shimmer_stability = 1.0 - min(1.0, characteristics.shimmer / 0.10)

        # Spectral flatness: 0 = tonal (stable), 1 = bruit (instable)
        spectral_stability = 1.0 - characteristics.spectral_flatness

        # Score de stabilité combiné
        stability_score = (
            jitter_stability * 0.35 +
            shimmer_stability * 0.35 +
            spectral_stability * 0.30
        )

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL EXAGGERATION (inversement proportionnel à l'expressivité)
        # ═══════════════════════════════════════════════════════════════════
        # Voix expressive → exaggeration bas (pas besoin d'amplifier)
        # Voix monotone → exaggeration plus élevé
        if expressiveness_score > 0.6:
            exaggeration = 0.30 + (1.0 - expressiveness_score) * 0.20
        elif expressiveness_score < 0.3:
            exaggeration = 0.50 + (0.3 - expressiveness_score) * 0.50
        else:
            exaggeration = 0.40 + (0.5 - expressiveness_score) * 0.30

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL CFG_WEIGHT (proportionnel à l'instabilité)
        # ═══════════════════════════════════════════════════════════════════
        # Voix stable → cfg bas (plus de liberté créative)
        # Voix instable → cfg haut (plus de guidance)
        if stability_score > 0.7:
            cfg_weight = 0.35 + (1.0 - stability_score) * 0.20
        elif stability_score < 0.4:
            cfg_weight = 0.55 + (0.4 - stability_score) * 0.35
        else:
            cfg_weight = 0.45 + (0.5 - stability_score) * 0.20

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL TEMPERATURE (basé sur variabilité naturelle)
        # ═══════════════════════════════════════════════════════════════════
        # Voix très expressive → temperature plus basse (préserver les variations naturelles)
        # Voix monotone → temperature plus haute (ajouter de la variété)
        # Base: 0.8, range: 0.6-1.0
        if expressiveness_score > 0.6:
            temperature = 0.65 + (1.0 - expressiveness_score) * 0.15
        elif expressiveness_score < 0.3:
            temperature = 0.85 + (0.3 - expressiveness_score) * 0.15
        else:
            temperature = 0.75 + (0.5 - expressiveness_score) * 0.15

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL REPETITION_PENALTY (basé sur clarté et régularité)
        # ═══════════════════════════════════════════════════════════════════
        # Voix avec beaucoup de variations → pénalité plus basse
        # Voix monotone/régulière → pénalité plus haute pour éviter répétitions
        # Base mono: 1.2, multi: 2.0
        # Ajuster légèrement basé sur le jitter (variation naturelle du pitch)
        jitter_factor = min(1.0, characteristics.jitter / 0.03)  # Normaliser jitter

        # Plus de jitter = plus de variations naturelles = moins besoin de pénaliser
        repetition_penalty = 1.5 - jitter_factor * 0.3  # Range: 1.2-1.5

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL MIN_P (basé sur clarté du signal)
        # ═══════════════════════════════════════════════════════════════════
        # Voix claire (HNR élevé) → min_p plus bas (plus de liberté)
        # Voix bruiteuse → min_p plus haut (filtrer les artefacts)
        # Base: 0.05, range: 0.03-0.10
        hnr = characteristics.harmonics_to_noise
        if hnr > 0.8:  # Très clair
            min_p = 0.03
        elif hnr < 0.5:  # Bruité
            min_p = 0.08 + (0.5 - hnr) * 0.04
        else:
            min_p = 0.05

        # ═══════════════════════════════════════════════════════════════════
        # CALCUL TOP_P (nucleus sampling - basé sur complexité vocale)
        # ═══════════════════════════════════════════════════════════════════
        # Voix complexe (large bandwidth) → top_p plus haut
        # Voix simple → top_p peut être plus bas
        # En général, garder proche de 1.0 pour qualité
        bandwidth_normalized = min(1.0, characteristics.spectral_bandwidth / 3000.0)
        top_p = 0.92 + bandwidth_normalized * 0.08  # Range: 0.92-1.0

        # ═══════════════════════════════════════════════════════════════════
        # AJUSTEMENTS PAR LANGUE CIBLE
        # ═══════════════════════════════════════════════════════════════════
        language_adjustments = {
            # Langues romanes: préfèrent cfg plus haut, temperature stable
            "fr": {"cfg_weight": +0.05, "temperature": -0.02},
            "es": {"cfg_weight": +0.03, "exaggeration": +0.02},
            "it": {"cfg_weight": +0.03, "exaggeration": +0.02},
            "pt": {"cfg_weight": +0.03},
            # Langues germaniques: plus expressives
            "en": {"exaggeration": +0.05, "cfg_weight": -0.05, "temperature": +0.02},
            "de": {"exaggeration": +0.03, "cfg_weight": -0.02},
            # Langues asiatiques: plus de guidance, moins de variations
            "zh": {"cfg_weight": +0.08, "temperature": -0.05, "repetition_penalty": +0.2},
            "ja": {"cfg_weight": +0.08, "temperature": -0.05, "repetition_penalty": +0.2},
            "ko": {"cfg_weight": +0.05, "temperature": -0.03},
            # Langues arabes: rythme particulier
            "ar": {"cfg_weight": +0.05, "exaggeration": +0.03},
        }

        if target_language and target_language.lower() in language_adjustments:
            adj = language_adjustments[target_language.lower()]
            exaggeration += adj.get("exaggeration", 0)
            cfg_weight += adj.get("cfg_weight", 0)
            temperature += adj.get("temperature", 0)
            repetition_penalty += adj.get("repetition_penalty", 0)

        # ═══════════════════════════════════════════════════════════════════
        # BORNER TOUTES LES VALEURS
        # ═══════════════════════════════════════════════════════════════════
        exaggeration = float(np.clip(exaggeration, 0.25, 0.75))
        cfg_weight = float(np.clip(cfg_weight, 0.25, 0.75))
        temperature = float(np.clip(temperature, 0.5, 1.2))
        repetition_penalty = float(np.clip(repetition_penalty, 1.0, 2.5))
        min_p = float(np.clip(min_p, 0.02, 0.15))
        top_p = float(np.clip(top_p, 0.85, 1.0))

        # Confiance basée sur la qualité de l'analyse
        confidence = characteristics.confidence * (0.5 + stability_score * 0.5)

        return {
            # Paramètres principaux de clonage
            "exaggeration": round(exaggeration, 2),
            "cfg_weight": round(cfg_weight, 2),
            # Paramètres de génération
            "temperature": round(temperature, 2),
            "repetition_penalty": round(repetition_penalty, 2),
            "min_p": round(min_p, 3),
            "top_p": round(top_p, 2),
            # Métadonnées
            "confidence": round(confidence, 2),
            "analysis": {
                "expressiveness_score": round(expressiveness_score, 3),
                "stability_score": round(stability_score, 3),
                "pitch_cv": round(pitch_cv, 3),
                "harmonics_to_noise": round(characteristics.harmonics_to_noise, 3),
                "spectral_bandwidth": round(characteristics.spectral_bandwidth, 1),
                "voice_type": characteristics.voice_type,
                "gender": characteristics.gender_estimate
            },
            "explanation": self._explain_params(exaggeration, cfg_weight, expressiveness_score, stability_score)
        }

    def _explain_params(
        self,
        exaggeration: float,
        cfg_weight: float,
        expressiveness: float,
        stability: float
    ) -> str:
        """Génère une explication des paramètres choisis"""
        exp_desc = "neutre" if exaggeration < 0.4 else "modérée" if exaggeration < 0.55 else "expressive"
        cfg_desc = "créatif" if cfg_weight < 0.4 else "équilibré" if cfg_weight < 0.55 else "guidé"

        voice_desc = "expressive" if expressiveness > 0.5 else "neutre"
        stable_desc = "stable" if stability > 0.6 else "variable"

        return (
            f"Voix {voice_desc} et {stable_desc} → "
            f"expression {exp_desc} ({exaggeration:.2f}), "
            f"mode {cfg_desc} ({cfg_weight:.2f})"
        )

    async def close(self):
        """Libère les ressources"""
        logger.info("[VOICE_ANALYZER] 🛑 Fermeture du service")
        self._analysis_cache.clear()
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_voice_analyzer_service() -> VoiceAnalyzerService:
    """Retourne l'instance singleton du service d'analyse vocale"""
    return VoiceAnalyzerService()
