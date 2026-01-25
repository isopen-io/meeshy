"""
Classes de métadonnées pour les modèles de voix et l'analyse audio.
Contient les structures de données pour les informations sur les locuteurs,
la qualité audio, et les profils vocaux temporaires.
"""

import hashlib
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from .voice_fingerprint import VoiceFingerprint


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
        Crée une instance depuis un dictionnaire (format structuré ou plat).

        Supporte deux formats:
        1. Format structuré: {"pitch": {"mean_hz": 150}, "classification": {...}}
        2. Format plat: {"pitch_mean_hz": 150, "gender_estimate": "male"}

        Gère automatiquement les alias legacy:
        - pitch_mean_hz → pitch_mean
        - gender_estimate → estimated_gender
        - age_range → estimated_age_range
        - energy_mean → rms_energy
        """
        # Détecter le format (structuré vs plat)
        if "pitch" in data and isinstance(data["pitch"], dict):
            # Format structuré (from to_dict())
            return cls._from_dict_structured(data)
        else:
            # Format plat (from tests ou API)
            return cls._from_dict_flat(data)

    @classmethod
    def _from_dict_flat(cls, data: Dict[str, Any]) -> 'VoiceCharacteristics':
        """Crée depuis format plat avec support des alias"""
        normalized_data = data.copy()

        # Mapper les alias avec suffixes vers noms de champs
        alias_mapping = {
            'pitch_mean_hz': 'pitch_mean',
            'pitch_std_hz': 'pitch_std',
            'pitch_min_hz': 'pitch_min',
            'pitch_max_hz': 'pitch_max',
            'pitch_range_hz': 'pitch_range',
            'spectral_centroid_hz': 'spectral_centroid',
            'spectral_bandwidth_hz': 'spectral_bandwidth',
            'spectral_rolloff_hz': 'spectral_rolloff',
            'energy_mean': 'rms_energy',
            'dynamic_range_db': 'dynamic_range',
            'gender_estimate': 'estimated_gender',
            'age_range': 'estimated_age_range',
            'speaking_rate_wpm': 'speech_rate_wpm'
        }

        # Convertir les alias
        for alias, field_name in alias_mapping.items():
            if alias in normalized_data and field_name not in normalized_data:
                normalized_data[field_name] = normalized_data.pop(alias)

        # Filtrer seulement les champs valides
        valid_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered_data = {k: v for k, v in normalized_data.items() if k in valid_fields}

        return cls(**filtered_data)

    @classmethod
    def _from_dict_structured(cls, data: Dict[str, Any]) -> 'VoiceCharacteristics':
        """Crée depuis format structuré (from to_dict())"""
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

    def generate_fingerprint(
        self,
        audio_duration_ms: int = 0,
        embedding = None
    ):
        """
        Génère une empreinte vocale depuis ces caractéristiques.

        Helper pour compatibilité - délègue à VoiceFingerprint.generate_from_characteristics

        Args:
            audio_duration_ms: Durée de l'audio analysé (ms)
            embedding: Vecteur d'embedding optionnel (numpy array)

        Returns:
            VoiceFingerprint généré
        """
        return VoiceFingerprint.generate_from_characteristics(
            self,
            audio_duration_ms=audio_duration_ms,
            embedding=embedding
        )


# Wrapper __init__ pour supporter les alias de paramètres
_original_init = VoiceCharacteristics.__init__


def _init_with_aliases(self, **kwargs):
    """__init__ wrapper qui convertit les alias vers les vrais noms de champs"""
    # Mapper les alias vers les vrais noms
    alias_mapping = {
        'pitch_mean_hz': 'pitch_mean',
        'pitch_std_hz': 'pitch_std',
        'pitch_min_hz': 'pitch_min',
        'pitch_max_hz': 'pitch_max',
        'pitch_range_hz': 'pitch_range',
        'spectral_centroid_hz': 'spectral_centroid',
        'spectral_bandwidth_hz': 'spectral_bandwidth',
        'spectral_rolloff_hz': 'spectral_rolloff',
        'energy_mean': 'rms_energy',
        'dynamic_range_db': 'dynamic_range',
        'gender_estimate': 'estimated_gender',
        'age_range': 'estimated_age_range',
        'speaking_rate_wpm': 'speech_rate_wpm'
    }

    # Convertir les alias
    for alias, field_name in alias_mapping.items():
        if alias in kwargs:
            kwargs[field_name] = kwargs.pop(alias)

    # Appeler le __init__ original
    _original_init(self, **kwargs)


# Remplacer __init__ par la version avec support d'alias
VoiceCharacteristics.__init__ = _init_with_aliases


@dataclass
class SpeakerInfo:
    """Informations sur un locuteur détecté dans l'audio"""
    speaker_id: str                     # ID unique du locuteur (speaker_0, speaker_1, etc.)
    is_primary: bool = False            # True si c'est le locuteur principal
    speaking_time_ms: int = 0           # Temps de parole en ms
    speaking_ratio: float = 0.0         # Ratio du temps de parole total
    voice_characteristics: 'VoiceCharacteristics' = field(default=None)

    # Segments temporels où ce locuteur parle
    segments: List[Dict[str, float]] = field(default_factory=list)  # [{"start": 0.0, "end": 2.5}, ...]

    # Empreinte vocale unique du locuteur
    fingerprint: Optional[VoiceFingerprint] = None

    def __post_init__(self):
        """Initialiser voice_characteristics si None"""
        if self.voice_characteristics is None:
            self.voice_characteristics = VoiceCharacteristics()

    def generate_fingerprint(self, embedding: np.ndarray = None) -> VoiceFingerprint:
        """
        Génère l'empreinte vocale unique de ce locuteur.

        Args:
            embedding: Vecteur d'embedding optionnel (OpenVoice)

        Returns:
            VoiceFingerprint: Empreinte vocale unique
        """
        self.fingerprint = self.voice_characteristics.generate_fingerprint(
            audio_duration_ms=self.speaking_time_ms,
            embedding=embedding
        )
        return self.fingerprint

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "speaker_id": self.speaker_id,
            "is_primary": self.is_primary,
            "speaking_time_ms": self.speaking_time_ms,
            "speaking_ratio": round(self.speaking_ratio, 3),
            "voice_characteristics": self.voice_characteristics.to_dict(),
            "segments_count": len(self.segments),
            "segments": self.segments[:10]  # Limiter à 10 segments pour la sérialisation
        }
        if self.fingerprint:
            result["fingerprint"] = self.fingerprint.to_dict()
        return result


@dataclass
class RecordingMetadata:
    """Métadonnées complètes d'un enregistrement audio"""
    # Informations de base
    file_path: str
    duration_ms: int = 0
    file_size_bytes: int = 0
    format: str = ""                    # "wav", "mp3", "ogg", etc.

    # Qualité audio
    noise_level: float = 0.0            # 0 = pas de bruit, 1 = très bruité
    snr_db: float = 0.0                 # Signal-to-noise ratio en dB
    clarity_score: float = 1.0          # 0 = pas clair, 1 = très clair
    clipping_detected: bool = False     # True si saturation détectée
    background_music: bool = False      # True si musique de fond détectée

    # Environnement
    reverb_level: float = 0.0           # Niveau de réverbération (0-1)
    room_size_estimate: str = "unknown" # "small", "medium", "large", "outdoor"

    # Multi-locuteurs
    speaker_count: int = 1              # Nombre de locuteurs détectés
    speakers: List[SpeakerInfo] = field(default_factory=list)
    primary_speaker: Optional[SpeakerInfo] = None

    # Timestamps
    created_at: datetime = field(default_factory=datetime.now)
    analyzed_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file": {
                "path": self.file_path,
                "duration_ms": self.duration_ms,
                "size_bytes": self.file_size_bytes,
                "format": self.format
            },
            "quality": {
                "noise_level": round(self.noise_level, 3),
                "snr_db": round(self.snr_db, 2),
                "clarity_score": round(self.clarity_score, 3),
                "clipping_detected": self.clipping_detected,
                "background_music": self.background_music
            },
            "environment": {
                "reverb_level": round(self.reverb_level, 3),
                "room_size_estimate": self.room_size_estimate
            },
            "speakers": {
                "count": self.speaker_count,
                "speakers": [s.to_dict() for s in self.speakers],
                "primary_speaker_id": self.primary_speaker.speaker_id if self.primary_speaker else None
            },
            "timestamps": {
                "created_at": self.created_at.isoformat(),
                "analyzed_at": self.analyzed_at.isoformat()
            }
        }


@dataclass
class AudioQualityMetadata:
    """Métadonnées de qualité audio pour sélection du meilleur audio"""
    attachment_id: str
    file_path: str
    duration_ms: int = 0
    noise_level: float = 0.0            # 0 = pas de bruit, 1 = très bruité
    clarity_score: float = 1.0          # 0 = pas clair, 1 = très clair
    has_other_speakers: bool = False    # True si d'autres voix détectées
    speaker_count: int = 1              # Nombre de locuteurs
    created_at: datetime = field(default_factory=datetime.now)

    # Métadonnées étendues
    recording_metadata: Optional[RecordingMetadata] = None
    primary_voice: Optional['VoiceCharacteristics'] = None

    # Score global calculé pour tri
    overall_score: float = 0.0

    def calculate_overall_score(self) -> float:
        """
        Calcule un score global pour la sélection du meilleur audio.
        Critères (par ordre de priorité):
        1. Pas d'autres locuteurs (pénalité forte)
        2. Clarté élevée
        3. Bruit faible
        4. Durée longue (normalisée)
        5. Date récente (bonus léger)
        """
        score = 0.0

        # Pénalité forte si autres locuteurs détectés
        if self.has_other_speakers or self.speaker_count > 1:
            score -= 0.3 * (self.speaker_count - 1)

        # Score de clarté (0-0.3)
        score += self.clarity_score * 0.3

        # Score de bruit inversé (0-0.2)
        score += (1.0 - self.noise_level) * 0.2

        # Score de durée (normalisé, max 60s = 0.3)
        duration_score = min(self.duration_ms / 60000, 1.0) * 0.3
        score += duration_score

        # Bonus récence (max 0.1 pour les audios de moins de 7 jours)
        age_days = (datetime.now() - self.created_at).days
        recency_bonus = max(0, 0.1 - (age_days * 0.01))
        score += recency_bonus

        self.overall_score = score
        return score

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "attachment_id": self.attachment_id,
            "file_path": self.file_path,
            "duration_ms": self.duration_ms,
            "noise_level": self.noise_level,
            "clarity_score": self.clarity_score,
            "has_other_speakers": self.has_other_speakers,
            "speaker_count": self.speaker_count,
            "created_at": self.created_at.isoformat(),
            "overall_score": self.overall_score
        }
        if self.recording_metadata:
            result["recording_metadata"] = self.recording_metadata.to_dict()
        if self.primary_voice:
            result["primary_voice"] = self.primary_voice.to_dict()
        return result


@dataclass
class VoiceModel:
    """Modèle de voix cloné d'un utilisateur"""
    user_id: str
    embedding_path: str  # Chemin vers le fichier d'embedding
    audio_count: int
    total_duration_ms: int
    quality_score: float  # 0-1
    profile_id: str = ""  # ID unique du profil vocal
    version: int = 1
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    next_recalibration_at: Optional[datetime] = None
    # Audio utilisé pour la dernière génération
    source_audio_id: str = ""  # attachment_id de l'audio source

    # Profil vocal détaillé
    voice_characteristics: Optional['VoiceCharacteristics'] = None
    fingerprint: Optional[VoiceFingerprint] = None

    # Runtime only (not persisted)
    embedding: Optional[np.ndarray] = field(default=None, repr=False)

    # NOUVEAU: Conditionals Chatterbox pour clonage vocal (runtime only)
    # Contient: {'t3': T3Cond dict, 'gen': dict} quand préparé par Chatterbox
    chatterbox_conditionals: Optional[Dict[str, Any]] = field(default=None, repr=False)

    # NOUVEAU: Chemin vers l'audio de référence pour le clonage (runtime only)
    # Utilisé par Chatterbox pour préparer les conditionals à la volée
    reference_audio_path: Optional[str] = field(default=None, repr=False)

    # NOUVEAU: Conditionals sérialisés en bytes pour stockage/transmission
    chatterbox_conditionals_bytes: Optional[bytes] = field(default=None, repr=False)

    # NOUVEAU: ID de l'audio de référence utilisé
    reference_audio_id: Optional[str] = field(default=None)

    # NOUVEAU: URL de l'audio de référence
    reference_audio_url: Optional[str] = field(default=None)

    def generate_fingerprint(self) -> Optional[VoiceFingerprint]:
        """
        Génère l'empreinte vocale unique de ce modèle.
        Utilise les caractéristiques vocales et l'embedding si disponibles.

        Returns:
            VoiceFingerprint: Empreinte vocale unique, ou None si pas de données
        """
        if self.voice_characteristics:
            self.fingerprint = self.voice_characteristics.generate_fingerprint(
                audio_duration_ms=self.total_duration_ms,
                embedding=self.embedding
            )
            return self.fingerprint
        elif self.embedding is not None:
            # Générer une empreinte basique depuis l'embedding seul
            fp = VoiceFingerprint()
            fp.audio_duration_ms = self.total_duration_ms
            fp.created_at = datetime.now()

            # Hash de l'embedding
            embed_data = self.embedding.tobytes()
            fp.signature = hashlib.sha256(embed_data).hexdigest()
            fp.signature_short = fp.signature[:12]
            fp.fingerprint_id = f"vfp_{fp.signature_short}"

            # Vecteur normalisé
            embed_normalized = self.embedding.flatten()[:25]
            embed_normalized = embed_normalized / (np.linalg.norm(embed_normalized) + 1e-10)
            fp.embedding_vector = embed_normalized.tolist()

            # Checksum
            fp.checksum = format(abs(hash(fp.signature)) % (2**32), '08x')

            self.fingerprint = fp
            return self.fingerprint
        return None

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire (pour JSON)"""
        result = {
            "user_id": self.user_id,
            "profile_id": self.profile_id,
            "embedding_path": self.embedding_path,
            "audio_count": self.audio_count,
            "total_duration_ms": self.total_duration_ms,
            "quality_score": self.quality_score,
            "version": self.version,
            "source_audio_id": self.source_audio_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "next_recalibration_at": self.next_recalibration_at.isoformat() if self.next_recalibration_at else None
        }
        if self.voice_characteristics:
            result["voice_characteristics"] = self.voice_characteristics.to_dict()
        if self.fingerprint:
            result["fingerprint"] = self.fingerprint.to_dict()

        # Conditionals Chatterbox sérialisés (pour transmission au Gateway)
        if self.chatterbox_conditionals_bytes:
            import base64
            result["chatterbox_conditionals_base64"] = base64.b64encode(self.chatterbox_conditionals_bytes).decode('utf-8')

        # Audio de référence
        if self.reference_audio_id:
            result["reference_audio_id"] = self.reference_audio_id
        if self.reference_audio_url:
            result["reference_audio_url"] = self.reference_audio_url

        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceModel':
        """Crée depuis un dictionnaire"""
        model = cls(
            user_id=data["user_id"],
            embedding_path=data["embedding_path"],
            audio_count=data["audio_count"],
            total_duration_ms=data["total_duration_ms"],
            quality_score=data["quality_score"],
            profile_id=data.get("profile_id", ""),
            version=data.get("version", 1),
            source_audio_id=data.get("source_audio_id", ""),
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
            next_recalibration_at=datetime.fromisoformat(data["next_recalibration_at"]) if data.get("next_recalibration_at") else None
        )

        # Restaurer les caractéristiques vocales si présentes
        if data.get("voice_characteristics"):
            vc_data = data["voice_characteristics"]
            model.voice_characteristics = VoiceCharacteristics(
                pitch_mean_hz=vc_data.get("pitch", {}).get("mean_hz", 0),
                pitch_std_hz=vc_data.get("pitch", {}).get("std_hz", 0),
                pitch_min_hz=vc_data.get("pitch", {}).get("min_hz", 0),
                pitch_max_hz=vc_data.get("pitch", {}).get("max_hz", 0),
                voice_type=vc_data.get("classification", {}).get("voice_type", "unknown"),
                estimated_gender=vc_data.get("classification", {}).get("estimated_gender", "unknown"),
                estimated_age_range=vc_data.get("classification", {}).get("estimated_age_range", "unknown"),
                brightness=vc_data.get("spectral", {}).get("brightness", 0),
                warmth=vc_data.get("spectral", {}).get("warmth", 0),
                breathiness=vc_data.get("spectral", {}).get("breathiness", 0),
                nasality=vc_data.get("spectral", {}).get("nasality", 0),
                speech_rate_wpm=vc_data.get("prosody", {}).get("speech_rate_wpm", 0),
                energy_mean=vc_data.get("prosody", {}).get("energy_mean", 0),
                energy_std=vc_data.get("prosody", {}).get("energy_std", 0),
                silence_ratio=vc_data.get("prosody", {}).get("silence_ratio", 0),
                sample_rate=vc_data.get("technical", {}).get("sample_rate", 0),
                bit_depth=vc_data.get("technical", {}).get("bit_depth", 0),
                channels=vc_data.get("technical", {}).get("channels", 1),
                codec=vc_data.get("technical", {}).get("codec", "")
            )

        # Restaurer l'empreinte vocale si présente
        if data.get("fingerprint"):
            model.fingerprint = VoiceFingerprint.from_dict(data["fingerprint"])

        # Restaurer les conditionals sérialisés si présents
        if data.get("chatterbox_conditionals_base64"):
            import base64
            model.chatterbox_conditionals_bytes = base64.b64decode(data["chatterbox_conditionals_base64"])

        # Restaurer l'audio de référence
        model.reference_audio_id = data.get("reference_audio_id")
        model.reference_audio_url = data.get("reference_audio_url")

        return model


@dataclass
class TemporaryVoiceProfile:
    """
    Profil vocal temporaire pour la traduction multi-voix.

    Ces profils ne sont PAS sauvegardés en cache et sont utilisés uniquement
    pour la durée d'une traduction. Chaque locuteur dans l'audio original
    obtient un profil temporaire pour que la traduction conserve les voix distinctes.
    """
    speaker_id: str                     # ID du locuteur (speaker_0, speaker_1, etc.)
    speaker_info: SpeakerInfo           # Informations complètes du locuteur
    audio_path: str                     # Chemin vers l'audio extrait de ce locuteur
    embedding: Optional[np.ndarray] = field(default=None, repr=False)

    # Correspondance avec un utilisateur existant
    matched_user_id: Optional[str] = None
    is_user_match: bool = False         # True si ce locuteur correspond à l'utilisateur émetteur

    # Segments temporels originaux (pour reconstruction)
    original_segments: List[Dict[str, float]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "speaker_id": self.speaker_id,
            "speaker_info": self.speaker_info.to_dict(),
            "audio_path": self.audio_path,
            "matched_user_id": self.matched_user_id,
            "is_user_match": self.is_user_match,
            "segments_count": len(self.original_segments)
        }


@dataclass
class MultiSpeakerTranslationContext:
    """
    Contexte pour la traduction d'un audio multi-locuteurs.

    Contient tous les profils temporaires et les informations nécessaires
    pour reconstruire l'audio traduit avec les bonnes voix.
    """
    source_audio_path: str              # Audio original
    source_duration_ms: int             # Durée originale
    speaker_count: int                  # Nombre de locuteurs
    profiles: List[TemporaryVoiceProfile] = field(default_factory=list)
    user_profile: Optional[TemporaryVoiceProfile] = None  # Profil de l'utilisateur émetteur

    # Segments chronologiques pour reconstruction
    # Format: [(start_ms, end_ms, speaker_id, text_original, text_traduit), ...]
    segments_timeline: List[Tuple] = field(default_factory=list)

    def get_profile(self, speaker_id: str) -> Optional[TemporaryVoiceProfile]:
        """Récupère le profil d'un locuteur par son ID"""
        for profile in self.profiles:
            if profile.speaker_id == speaker_id:
                return profile
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_audio_path": self.source_audio_path,
            "source_duration_ms": self.source_duration_ms,
            "speaker_count": self.speaker_count,
            "profiles": [p.to_dict() for p in self.profiles],
            "user_speaker_id": self.user_profile.speaker_id if self.user_profile else None,
            "segments_count": len(self.segments_timeline)
        }
