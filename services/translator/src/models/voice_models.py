"""
Models unifiés pour les caractéristiques vocales.

Ce module centralise les types liés à l'analyse et au clonage vocal
pour éviter la duplication et assurer la cohérence.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class VoiceCharacteristics:
    """
    Caractéristiques vocales unifiées extraites de l'audio.

    Combine les attributs nécessaires pour:
    - L'analyse vocale (VoiceAnalyzerService)
    - Le clonage vocal (VoiceCloneService)
    - La sérialisation vers Gateway/MongoDB
    """

    # ═══════════════════════════════════════════════════════════════
    # PITCH (Fréquence fondamentale)
    # ═══════════════════════════════════════════════════════════════
    pitch_mean: float = 0.0             # Pitch moyen en Hz
    pitch_std: float = 0.0              # Écart-type du pitch
    pitch_min: float = 0.0              # Pitch minimum
    pitch_max: float = 0.0              # Pitch maximum
    pitch_range: float = 0.0            # Étendue (max - min)

    # Alias pour compatibilité (noms longs)
    @property
    def pitch_mean_hz(self) -> float:
        return self.pitch_mean

    @property
    def pitch_std_hz(self) -> float:
        return self.pitch_std

    @property
    def pitch_min_hz(self) -> float:
        return self.pitch_min

    @property
    def pitch_max_hz(self) -> float:
        return self.pitch_max

    @property
    def pitch_range_hz(self) -> float:
        return self.pitch_range

    # ═══════════════════════════════════════════════════════════════
    # CLASSIFICATION VOCALE
    # ═══════════════════════════════════════════════════════════════
    voice_type: str = "unknown"          # Classification: high_female, medium_male, etc.
    estimated_gender: str = "unknown"    # male, female, child, unknown
    estimated_age_range: str = "unknown" # child, teen, adult, senior

    # Alias pour compatibilité
    @property
    def gender_estimate(self) -> str:
        return self.estimated_gender

    @property
    def age_range(self) -> str:
        return self.estimated_age_range

    # ═══════════════════════════════════════════════════════════════
    # CARACTÉRISTIQUES SPECTRALES
    # ═══════════════════════════════════════════════════════════════
    spectral_centroid: float = 0.0      # "Brillance" du son (Hz)
    spectral_bandwidth: float = 0.0     # Largeur spectrale (Hz)
    spectral_rolloff: float = 0.0       # Fréquence rolloff 85% (Hz)
    spectral_flatness: float = 0.0      # 0-1: tonal vs bruit

    # Descripteurs perceptuels
    brightness: float = 0.0             # Luminosité (alias centroid)
    warmth: float = 0.0                 # Énergie basses fréquences
    breathiness: float = 0.0            # Niveau de souffle
    nasality: float = 0.0               # Niveau de nasalité

    # Alias pour compatibilité (noms longs)
    @property
    def spectral_centroid_hz(self) -> float:
        return self.spectral_centroid

    @property
    def spectral_bandwidth_hz(self) -> float:
        return self.spectral_bandwidth

    @property
    def spectral_rolloff_hz(self) -> float:
        return self.spectral_rolloff

    # ═══════════════════════════════════════════════════════════════
    # ÉNERGIE ET DYNAMIQUE
    # ═══════════════════════════════════════════════════════════════
    rms_energy: float = 0.0             # Énergie RMS moyenne
    energy_std: float = 0.0             # Variation d'énergie
    dynamic_range: float = 0.0          # Dynamique en dB
    silence_ratio: float = 0.0          # Ratio de silence (0-1)

    # Alias pour compatibilité (noms longs)
    @property
    def energy_mean(self) -> float:
        return self.rms_energy

    @property
    def dynamic_range_db(self) -> float:
        return self.dynamic_range

    # ═══════════════════════════════════════════════════════════════
    # QUALITÉ VOCALE
    # ═══════════════════════════════════════════════════════════════
    harmonics_to_noise: float = 0.0     # Ratio harmoniques/bruit (HNR)
    jitter: float = 0.0                 # Variation cycle à cycle du pitch
    shimmer: float = 0.0                # Variation amplitude cycle à cycle

    # ═══════════════════════════════════════════════════════════════
    # PROSODIE
    # ═══════════════════════════════════════════════════════════════
    speech_rate_wpm: float = 0.0        # Mots par minute estimés

    # Alias pour compatibilité
    @property
    def speaking_rate_wpm(self) -> float:
        return self.speech_rate_wpm

    # ═══════════════════════════════════════════════════════════════
    # MFCC (Mel-Frequency Cepstral Coefficients)
    # ═══════════════════════════════════════════════════════════════
    mfcc_mean: List[float] = field(default_factory=list)  # 13 coefficients moyens
    mfcc_std: List[float] = field(default_factory=list)   # 13 coefficients écart-type

    # ═══════════════════════════════════════════════════════════════
    # MÉTADONNÉES TECHNIQUES
    # ═══════════════════════════════════════════════════════════════
    sample_rate: int = 0                # Taux d'échantillonnage (Hz)
    bit_depth: int = 0                  # Profondeur de bits
    channels: int = 1                   # Nombre de canaux
    codec: str = ""                     # Codec audio détecté
    duration_seconds: float = 0.0       # Durée de l'audio analysé
    analysis_time_ms: int = 0           # Temps d'analyse (ms)
    confidence: float = 0.0             # Confiance de l'analyse (0-1)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceCharacteristics':
        """
        Crée une instance depuis un dictionnaire avec support des alias legacy.

        Gère automatiquement les anciens noms de paramètres pour compatibilité:
        - gender_estimate → estimated_gender
        - age_range → estimated_age_range
        """
        # Copier les données pour ne pas modifier l'original
        normalized_data = data.copy()

        # Convertir les alias legacy
        if 'gender_estimate' in normalized_data:
            normalized_data['estimated_gender'] = normalized_data.pop('gender_estimate')
        if 'age_range' in normalized_data and 'estimated_age_range' not in normalized_data:
            normalized_data['estimated_age_range'] = normalized_data.pop('age_range')

        # Filtrer seulement les champs valides du dataclass
        valid_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered_data = {k: v for k, v in normalized_data.items() if k in valid_fields}

        return cls(**filtered_data)

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation JSON/MongoDB"""
        return {
            "pitch": {
                "mean_hz": round(self.pitch_mean_hz, 2),
                "std_hz": round(self.pitch_std_hz, 2),
                "min_hz": round(self.pitch_min_hz, 2),
                "max_hz": round(self.pitch_max_hz, 2),
                "range_hz": round(self.pitch_range_hz, 2)
            },
            "classification": {
                "voice_type": self.voice_type,
                "estimated_gender": self.estimated_gender,
                "estimated_age_range": self.estimated_age_range
            },
            "spectral": {
                "centroid_hz": round(self.spectral_centroid_hz, 2),
                "bandwidth_hz": round(self.spectral_bandwidth_hz, 2),
                "rolloff_hz": round(self.spectral_rolloff_hz, 2),
                "flatness": round(self.spectral_flatness, 4),
                "brightness": round(self.brightness, 2),
                "warmth": round(self.warmth, 2),
                "breathiness": round(self.breathiness, 2),
                "nasality": round(self.nasality, 2)
            },
            "energy": {
                "mean": round(self.energy_mean, 4),
                "std": round(self.energy_std, 4),
                "dynamic_range_db": round(self.dynamic_range_db, 2),
                "silence_ratio": round(self.silence_ratio, 3)
            },
            "quality": {
                "harmonics_to_noise": round(self.harmonics_to_noise, 2),
                "jitter": round(self.jitter, 4),
                "shimmer": round(self.shimmer, 4)
            },
            "prosody": {
                "speech_rate_wpm": round(self.speech_rate_wpm, 1)
            },
            "mfcc": {
                "mean": [round(m, 4) for m in self.mfcc_mean] if self.mfcc_mean else [],
                "std": [round(s, 4) for s in self.mfcc_std] if self.mfcc_std else []
            },
            "metadata": {
                "sample_rate": self.sample_rate,
                "bit_depth": self.bit_depth,
                "channels": self.channels,
                "codec": self.codec,
                "duration_seconds": round(self.duration_seconds, 2),
                "analysis_time_ms": self.analysis_time_ms,
                "confidence": round(self.confidence, 2)
            }
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceCharacteristics':
        """Crée une instance depuis un dictionnaire"""
        pitch = data.get("pitch", {})
        classification = data.get("classification", {})
        spectral = data.get("spectral", {})
        energy = data.get("energy", {})
        quality = data.get("quality", {})
        prosody = data.get("prosody", {})
        mfcc = data.get("mfcc", {})
        metadata = data.get("metadata", {})

        return cls(
            # Pitch
            pitch_mean=pitch.get("mean_hz", 0.0),
            pitch_std=pitch.get("std_hz", 0.0),
            pitch_min=pitch.get("min_hz", 0.0),
            pitch_max=pitch.get("max_hz", 0.0),
            pitch_range=pitch.get("range_hz", 0.0),
            # Classification
            voice_type=classification.get("voice_type", "unknown"),
            estimated_gender=classification.get("estimated_gender", "unknown"),
            estimated_age_range=classification.get("estimated_age_range", "unknown"),
            # Spectral
            spectral_centroid=spectral.get("centroid_hz", 0.0),
            spectral_bandwidth=spectral.get("bandwidth_hz", 0.0),
            spectral_rolloff=spectral.get("rolloff_hz", 0.0),
            spectral_flatness=spectral.get("flatness", 0.0),
            brightness=spectral.get("brightness", 0.0),
            warmth=spectral.get("warmth", 0.0),
            breathiness=spectral.get("breathiness", 0.0),
            nasality=spectral.get("nasality", 0.0),
            # Energy
            rms_energy=energy.get("mean", 0.0),
            energy_std=energy.get("std", 0.0),
            dynamic_range=energy.get("dynamic_range_db", 0.0),
            silence_ratio=energy.get("silence_ratio", 0.0),
            # Quality
            harmonics_to_noise=quality.get("harmonics_to_noise", 0.0),
            jitter=quality.get("jitter", 0.0),
            shimmer=quality.get("shimmer", 0.0),
            # Prosody
            speech_rate_wpm=prosody.get("speech_rate_wpm", 0.0),
            # MFCC
            mfcc_mean=mfcc.get("mean", []),
            mfcc_std=mfcc.get("std", []),
            # Metadata
            sample_rate=metadata.get("sample_rate", 0),
            bit_depth=metadata.get("bit_depth", 0),
            channels=metadata.get("channels", 1),
            codec=metadata.get("codec", ""),
            duration_seconds=metadata.get("duration_seconds", 0.0),
            analysis_time_ms=metadata.get("analysis_time_ms", 0),
            confidence=metadata.get("confidence", 0.0)
        )

