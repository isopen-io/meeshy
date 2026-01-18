"""
Classes de métadonnées pour les modèles de voix et l'analyse audio.
Contient les structures de données pour les informations sur les locuteurs,
la qualité audio, et les profils vocaux temporaires.
"""

import hashlib
import numpy as np
from typing import Optional, List, Dict, Any, Tuple, TYPE_CHECKING
from dataclasses import dataclass, field
from datetime import datetime

from .voice_fingerprint import VoiceFingerprint

if TYPE_CHECKING:
    from models.voice_models import VoiceCharacteristics


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
            from models.voice_models import VoiceCharacteristics
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
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceModel':
        """Crée depuis un dictionnaire"""
        from models.voice_models import VoiceCharacteristics

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
