"""
Voice Parameters Analyzer
=========================

Analyse un échantillon vocal pour calculer automatiquement
les paramètres optimaux de clonage (exaggeration, cfg_weight).

Métriques analysées:
- Pitch variance: Variation de la hauteur de voix
- Energy dynamics: Variation de l'intensité
- Speaking rate: Débit de parole
- Voice stability: Stabilité/régularité vocale
"""

import numpy as np
import logging
from dataclasses import dataclass
from typing import Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class VoiceAnalysisResult:
    """Résultat de l'analyse vocale"""
    # Métriques brutes
    pitch_mean: float
    pitch_std: float
    pitch_range: float
    energy_mean: float
    energy_std: float
    energy_dynamics: float
    speaking_rate: float  # syllabes/seconde estimé
    voice_stability: float  # 0-1, 1 = très stable
    duration_seconds: float

    # Scores normalisés (0-1)
    expressiveness_score: float  # Basé sur pitch + energy variance
    clarity_score: float  # Basé sur stabilité + énergie

    # Paramètres recommandés
    recommended_exaggeration: float
    recommended_cfg_weight: float

    # Confiance de la recommandation
    confidence: float

    def __str__(self):
        return f"""
╔══════════════════════════════════════════════════════════════╗
║  ANALYSE VOCALE - PARAMÈTRES RECOMMANDÉS                     ║
╠══════════════════════════════════════════════════════════════╣
║  Durée audio: {self.duration_seconds:.1f}s
║
║  📊 MÉTRIQUES VOCALES:
║  ├─ Pitch moyen: {self.pitch_mean:.1f} Hz (±{self.pitch_std:.1f})
║  ├─ Plage pitch: {self.pitch_range:.1f} Hz
║  ├─ Dynamique énergie: {self.energy_dynamics:.2f}
║  ├─ Stabilité vocale: {self.voice_stability:.2f}
║  └─ Débit estimé: {self.speaking_rate:.1f} syll/s
║
║  📈 SCORES:
║  ├─ Expressivité: {self.expressiveness_score:.2f}
║  └─ Clarté: {self.clarity_score:.2f}
║
║  🎯 PARAMÈTRES RECOMMANDÉS:
║  ├─ exaggeration: {self.recommended_exaggeration:.2f}
║  ├─ cfg_weight: {self.recommended_cfg_weight:.2f}
║  └─ Confiance: {self.confidence:.0%}
╚══════════════════════════════════════════════════════════════╝
"""


class VoiceParamsAnalyzer:
    """
    Analyseur de paramètres vocaux pour optimiser le clonage.

    Calcule les paramètres optimaux basés sur les caractéristiques
    de la voix source.
    """

    def __init__(self):
        self._librosa = None
        self._scipy = None

    def _load_dependencies(self):
        """Charge les dépendances à la demande"""
        if self._librosa is None:
            try:
                import librosa
                import scipy.signal
                self._librosa = librosa
                self._scipy = scipy
            except ImportError as e:
                raise ImportError(f"librosa et scipy requis: {e}")

    def analyze(self, audio_path: str) -> VoiceAnalysisResult:
        """
        Analyse un fichier audio et retourne les paramètres recommandés.

        Args:
            audio_path: Chemin vers le fichier audio (WAV, MP3, etc.)

        Returns:
            VoiceAnalysisResult avec métriques et paramètres recommandés
        """
        self._load_dependencies()
        librosa = self._librosa

        logger.info(f"🔍 Analyse vocale: {Path(audio_path).name}")

        # Charger l'audio
        y, sr = librosa.load(audio_path, sr=None)
        duration = len(y) / sr

        # 1. Analyse du pitch (F0)
        pitch_mean, pitch_std, pitch_range = self._analyze_pitch(y, sr)

        # 2. Analyse de l'énergie
        energy_mean, energy_std, energy_dynamics = self._analyze_energy(y, sr)

        # 3. Estimation du débit de parole
        speaking_rate = self._estimate_speaking_rate(y, sr)

        # 4. Analyse de la stabilité vocale
        voice_stability = self._analyze_stability(y, sr)

        # 5. Calculer les scores normalisés
        expressiveness_score = self._calculate_expressiveness(
            pitch_std, pitch_range, energy_dynamics
        )
        clarity_score = self._calculate_clarity(
            voice_stability, energy_mean, speaking_rate
        )

        # 6. Calculer les paramètres recommandés
        exaggeration, cfg_weight, confidence = self._calculate_optimal_params(
            expressiveness_score, clarity_score, voice_stability, duration
        )

        result = VoiceAnalysisResult(
            pitch_mean=pitch_mean,
            pitch_std=pitch_std,
            pitch_range=pitch_range,
            energy_mean=energy_mean,
            energy_std=energy_std,
            energy_dynamics=energy_dynamics,
            speaking_rate=speaking_rate,
            voice_stability=voice_stability,
            duration_seconds=duration,
            expressiveness_score=expressiveness_score,
            clarity_score=clarity_score,
            recommended_exaggeration=exaggeration,
            recommended_cfg_weight=cfg_weight,
            confidence=confidence
        )

        logger.info(f"✅ Analyse terminée: exp={exaggeration:.2f}, cfg={cfg_weight:.2f}")
        return result

    def _analyze_pitch(self, y: np.ndarray, sr: int) -> Tuple[float, float, float]:
        """Analyse le pitch (F0) de l'audio"""
        librosa = self._librosa

        # Extraire F0 avec pyin (plus précis que yin)
        f0, voiced_flag, voiced_probs = librosa.pyin(
            y,
            fmin=librosa.note_to_hz('C2'),  # ~65 Hz
            fmax=librosa.note_to_hz('C7'),  # ~2093 Hz
            sr=sr
        )

        # Filtrer les valeurs non-voisées (NaN)
        f0_voiced = f0[~np.isnan(f0)]

        if len(f0_voiced) < 10:
            # Pas assez de données vocales
            return 150.0, 30.0, 100.0

        pitch_mean = np.mean(f0_voiced)
        pitch_std = np.std(f0_voiced)
        pitch_range = np.percentile(f0_voiced, 95) - np.percentile(f0_voiced, 5)

        return pitch_mean, pitch_std, pitch_range

    def _analyze_energy(self, y: np.ndarray, sr: int) -> Tuple[float, float, float]:
        """Analyse l'énergie/intensité de l'audio"""
        librosa = self._librosa

        # RMS energy par frame
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]

        # Convertir en dB
        rms_db = librosa.amplitude_to_db(rms, ref=np.max)

        # Filtrer les silences (< -40 dB)
        rms_voiced = rms_db[rms_db > -40]

        if len(rms_voiced) < 10:
            return -20.0, 5.0, 0.5

        energy_mean = np.mean(rms_voiced)
        energy_std = np.std(rms_voiced)

        # Dynamique normalisée (0-1)
        # Plus la variance est grande, plus la voix est dynamique
        energy_dynamics = min(1.0, energy_std / 15.0)

        return energy_mean, energy_std, energy_dynamics

    def _estimate_speaking_rate(self, y: np.ndarray, sr: int) -> float:
        """Estime le débit de parole en syllabes/seconde"""
        librosa = self._librosa

        # Onset detection pour estimer les syllabes
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onsets = librosa.onset.onset_detect(
            onset_envelope=onset_env,
            sr=sr,
            units='time'
        )

        duration = len(y) / sr

        if duration < 1:
            return 4.0  # Valeur par défaut

        # Nombre d'onsets / durée ≈ syllabes/seconde
        # Facteur de correction car tous les onsets ne sont pas des syllabes
        speaking_rate = len(onsets) / duration * 0.7

        # Borner entre 2 et 8 syllabes/seconde (plage normale)
        return np.clip(speaking_rate, 2.0, 8.0)

    def _analyze_stability(self, y: np.ndarray, sr: int) -> float:
        """
        Analyse la stabilité vocale (régularité du pitch et de l'énergie).

        Retourne un score 0-1 où 1 = très stable.
        """
        librosa = self._librosa

        # 1. Stabilité du pitch
        f0, _, _ = librosa.pyin(
            y,
            fmin=librosa.note_to_hz('C2'),
            fmax=librosa.note_to_hz('C7'),
            sr=sr
        )
        f0_voiced = f0[~np.isnan(f0)]

        if len(f0_voiced) < 10:
            return 0.5

        # Coefficient de variation du pitch (plus bas = plus stable)
        pitch_cv = np.std(f0_voiced) / np.mean(f0_voiced) if np.mean(f0_voiced) > 0 else 0.5
        pitch_stability = 1.0 - min(1.0, pitch_cv * 2)

        # 2. Stabilité de l'énergie
        rms = librosa.feature.rms(y=y)[0]
        rms_nonzero = rms[rms > 0.01]

        if len(rms_nonzero) < 10:
            return pitch_stability

        energy_cv = np.std(rms_nonzero) / np.mean(rms_nonzero)
        energy_stability = 1.0 - min(1.0, energy_cv)

        # Score combiné
        stability = (pitch_stability * 0.6 + energy_stability * 0.4)

        return np.clip(stability, 0.0, 1.0)

    def _calculate_expressiveness(
        self,
        pitch_std: float,
        pitch_range: float,
        energy_dynamics: float
    ) -> float:
        """
        Calcule un score d'expressivité (0-1).

        Voix expressive = grande variation de pitch + énergie dynamique
        """
        # Normaliser pitch_std (typiquement 20-80 Hz pour voix expressive)
        pitch_score = min(1.0, pitch_std / 60.0)

        # Normaliser pitch_range (typiquement 50-200 Hz)
        range_score = min(1.0, pitch_range / 150.0)

        # Combiner les scores
        expressiveness = (
            pitch_score * 0.35 +
            range_score * 0.35 +
            energy_dynamics * 0.30
        )

        return np.clip(expressiveness, 0.0, 1.0)

    def _calculate_clarity(
        self,
        stability: float,
        energy_mean: float,
        speaking_rate: float
    ) -> float:
        """
        Calcule un score de clarté (0-1).

        Voix claire = stable + bonne énergie + débit modéré
        """
        # Normaliser l'énergie (-30 à -5 dB typique)
        energy_score = min(1.0, max(0.0, (energy_mean + 30) / 25))

        # Débit optimal autour de 4-5 syllabes/seconde
        rate_score = 1.0 - abs(speaking_rate - 4.5) / 4.0
        rate_score = max(0.0, rate_score)

        clarity = (
            stability * 0.50 +
            energy_score * 0.30 +
            rate_score * 0.20
        )

        return np.clip(clarity, 0.0, 1.0)

    def _calculate_optimal_params(
        self,
        expressiveness: float,
        clarity: float,
        stability: float,
        duration: float
    ) -> Tuple[float, float, float]:
        """
        Calcule les paramètres optimaux basés sur l'analyse.

        Returns:
            (exaggeration, cfg_weight, confidence)
        """
        # ═══════════════════════════════════════════════════════════════
        # EXAGGERATION: Basé sur l'expressivité de la voix source
        # ═══════════════════════════════════════════════════════════════
        #
        # - Voix expressive (score élevé) → exaggeration plus bas
        #   (la voix est déjà expressive, pas besoin d'amplifier)
        # - Voix monotone (score bas) → exaggeration plus haut
        #   (ajouter de l'expressivité)
        #
        # Plage cible: 0.3 - 0.7

        if expressiveness > 0.7:
            # Voix très expressive → garder exaggeration bas
            exaggeration = 0.3 + (1.0 - expressiveness) * 0.2
        elif expressiveness < 0.3:
            # Voix monotone → augmenter exaggeration
            exaggeration = 0.5 + (0.3 - expressiveness) * 0.5
        else:
            # Voix normale → valeur médiane
            exaggeration = 0.4 + expressiveness * 0.2

        # ═══════════════════════════════════════════════════════════════
        # CFG_WEIGHT: Basé sur la clarté et stabilité
        # ═══════════════════════════════════════════════════════════════
        #
        # - Voix claire et stable → cfg plus bas (plus de liberté)
        # - Voix instable ou peu claire → cfg plus haut (plus de guidance)
        #
        # Plage cible: 0.3 - 0.7

        combined_quality = (clarity * 0.5 + stability * 0.5)

        if combined_quality > 0.7:
            # Bonne qualité → cfg plus bas
            cfg_weight = 0.35 + (1.0 - combined_quality) * 0.3
        elif combined_quality < 0.4:
            # Qualité faible → cfg plus haut
            cfg_weight = 0.55 + (0.4 - combined_quality) * 0.4
        else:
            # Qualité moyenne
            cfg_weight = 0.45 + (0.5 - combined_quality) * 0.2

        # ═══════════════════════════════════════════════════════════════
        # CONFIANCE: Basée sur la durée et la qualité de l'analyse
        # ═══════════════════════════════════════════════════════════════

        # Plus l'audio est long, plus l'analyse est fiable
        duration_confidence = min(1.0, duration / 30.0)

        # Plus la voix est stable, plus l'analyse est fiable
        stability_confidence = stability

        confidence = (duration_confidence * 0.6 + stability_confidence * 0.4)

        # Borner les valeurs
        exaggeration = np.clip(exaggeration, 0.25, 0.75)
        cfg_weight = np.clip(cfg_weight, 0.25, 0.75)
        confidence = np.clip(confidence, 0.3, 0.95)

        return exaggeration, cfg_weight, confidence


# ═══════════════════════════════════════════════════════════════════════════
# QUALITY VERIFICATION (optionnel - pour évaluer le résultat)
# ═══════════════════════════════════════════════════════════════════════════

class VoiceCloneQualityChecker:
    """
    Vérifie la qualité d'un clone vocal en comparant avec l'original.

    Métriques:
    - Speaker embedding similarity (similarité cosinus)
    - F0 correlation (corrélation de pitch)
    - Energy profile similarity
    """

    def __init__(self):
        self._librosa = None

    def _load_dependencies(self):
        if self._librosa is None:
            import librosa
            self._librosa = librosa

    def compare(
        self,
        original_path: str,
        cloned_path: str
    ) -> dict:
        """
        Compare un audio cloné avec l'original.

        Returns:
            dict avec scores de similarité
        """
        self._load_dependencies()
        librosa = self._librosa

        # Charger les audios
        y_orig, sr_orig = librosa.load(original_path, sr=22050)
        y_clone, sr_clone = librosa.load(cloned_path, sr=22050)

        # 1. Similarité MFCC (timbre)
        mfcc_orig = librosa.feature.mfcc(y=y_orig, sr=sr_orig, n_mfcc=13)
        mfcc_clone = librosa.feature.mfcc(y=y_clone, sr=sr_clone, n_mfcc=13)

        # Moyenne des MFCCs
        mfcc_orig_mean = np.mean(mfcc_orig, axis=1)
        mfcc_clone_mean = np.mean(mfcc_clone, axis=1)

        # Similarité cosinus
        mfcc_similarity = np.dot(mfcc_orig_mean, mfcc_clone_mean) / (
            np.linalg.norm(mfcc_orig_mean) * np.linalg.norm(mfcc_clone_mean)
        )

        # 2. Corrélation F0
        f0_orig, _, _ = librosa.pyin(y_orig, fmin=65, fmax=2000, sr=sr_orig)
        f0_clone, _, _ = librosa.pyin(y_clone, fmin=65, fmax=2000, sr=sr_clone)

        # Aligner les longueurs
        min_len = min(len(f0_orig), len(f0_clone))
        f0_orig = f0_orig[:min_len]
        f0_clone = f0_clone[:min_len]

        # Masquer les NaN
        valid_mask = ~(np.isnan(f0_orig) | np.isnan(f0_clone))
        if np.sum(valid_mask) > 10:
            f0_correlation = np.corrcoef(
                f0_orig[valid_mask],
                f0_clone[valid_mask]
            )[0, 1]
        else:
            f0_correlation = 0.0

        # 3. Similarité de l'enveloppe d'énergie
        rms_orig = librosa.feature.rms(y=y_orig)[0]
        rms_clone = librosa.feature.rms(y=y_clone)[0]

        # Normaliser et comparer
        rms_orig_norm = rms_orig / (np.max(rms_orig) + 1e-8)
        rms_clone_norm = rms_clone / (np.max(rms_clone) + 1e-8)

        min_len = min(len(rms_orig_norm), len(rms_clone_norm))
        energy_correlation = np.corrcoef(
            rms_orig_norm[:min_len],
            rms_clone_norm[:min_len]
        )[0, 1]

        # Score global
        overall_score = (
            mfcc_similarity * 0.5 +
            max(0, f0_correlation) * 0.3 +
            max(0, energy_correlation) * 0.2
        )

        return {
            "mfcc_similarity": float(mfcc_similarity),
            "f0_correlation": float(f0_correlation) if not np.isnan(f0_correlation) else 0.0,
            "energy_correlation": float(energy_correlation) if not np.isnan(energy_correlation) else 0.0,
            "overall_score": float(overall_score),
            "quality_rating": self._get_rating(overall_score)
        }

    def _get_rating(self, score: float) -> str:
        """Convertit le score en rating lisible"""
        if score >= 0.85:
            return "⭐⭐⭐⭐⭐ Excellent"
        elif score >= 0.75:
            return "⭐⭐⭐⭐ Très bon"
        elif score >= 0.65:
            return "⭐⭐⭐ Bon"
        elif score >= 0.50:
            return "⭐⭐ Acceptable"
        else:
            return "⭐ À améliorer"


# Fonctions utilitaires
def get_voice_params_analyzer() -> VoiceParamsAnalyzer:
    """Factory pour obtenir l'analyseur"""
    return VoiceParamsAnalyzer()


def get_voice_quality_checker() -> VoiceCloneQualityChecker:
    """Factory pour obtenir le vérificateur de qualité"""
    return VoiceCloneQualityChecker()


# Test CLI
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python voice_params_analyzer.py <audio_file>")
        print("       python voice_params_analyzer.py <original> <cloned>  # Compare")
        sys.exit(1)

    if len(sys.argv) == 2:
        # Analyse seule
        analyzer = VoiceParamsAnalyzer()
        result = analyzer.analyze(sys.argv[1])
        print(result)
    else:
        # Comparaison
        checker = VoiceCloneQualityChecker()
        comparison = checker.compare(sys.argv[1], sys.argv[2])
        print("\n📊 COMPARAISON QUALITÉ CLONE:")
        print(f"   MFCC Similarity: {comparison['mfcc_similarity']:.3f}")
        print(f"   F0 Correlation: {comparison['f0_correlation']:.3f}")
        print(f"   Energy Correlation: {comparison['energy_correlation']:.3f}")
        print(f"   Overall Score: {comparison['overall_score']:.3f}")
        print(f"   Rating: {comparison['quality_rating']}")
