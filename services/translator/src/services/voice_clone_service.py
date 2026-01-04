"""
Service de clonage vocal - Singleton
Gère les modèles de voix des utilisateurs avec cache et amélioration continue.
Architecture: OpenVoice V2 pour extraction d'embedding, cache fichier pour persistance.
"""

import os
import logging
import time
import asyncio
import threading
import pickle
import json
import hashlib
import struct
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path

# Configuration du logging
logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
OPENVOICE_AVAILABLE = False
AUDIO_PROCESSING_AVAILABLE = False

try:
    from openvoice import se_extractor
    from openvoice.api import ToneColorConverter
    OPENVOICE_AVAILABLE = True
    logger.info("✅ [VOICE_CLONE] OpenVoice disponible")
except ImportError:
    logger.warning("⚠️ [VOICE_CLONE] OpenVoice non disponible - clonage vocal désactivé")

try:
    import numpy as np
    from pydub import AudioSegment
    import soundfile as sf
    AUDIO_PROCESSING_AVAILABLE = True
    logger.info("✅ [VOICE_CLONE] Audio processing disponible")
except ImportError:
    logger.warning("⚠️ [VOICE_CLONE] numpy/pydub/soundfile non disponibles")
    import numpy as np  # numpy should be available


@dataclass
class VoiceFingerprint:
    """
    Empreinte vocale unique pour identification et vérification.
    Génère une signature cryptographique basée sur les caractéristiques vocales.
    """
    # Identifiants
    fingerprint_id: str = ""              # ID unique de l'empreinte (hash court)
    version: str = "1.0"                  # Version de l'algorithme de fingerprint

    # Signature principale (SHA-256)
    signature: str = ""                   # Hash SHA-256 des caractéristiques
    signature_short: str = ""             # Hash court (12 caractères) pour affichage

    # Composants du fingerprint (pour matching partiel)
    pitch_hash: str = ""                  # Hash du profil de pitch
    spectral_hash: str = ""               # Hash des caractéristiques spectrales
    prosody_hash: str = ""                # Hash de la prosodie

    # Vecteur d'embedding pour similarité
    embedding_vector: List[float] = field(default_factory=list)  # Vecteur normalisé

    # Métadonnées
    created_at: datetime = field(default_factory=datetime.now)
    audio_duration_ms: int = 0
    sample_count: int = 1                 # Nombre d'échantillons utilisés

    # Checksum de vérification
    checksum: str = ""                    # CRC32 pour vérification d'intégrité

    @staticmethod
    def generate_from_characteristics(
        chars: 'VoiceCharacteristics',
        audio_duration_ms: int = 0,
        embedding: np.ndarray = None
    ) -> 'VoiceFingerprint':
        """
        Génère une empreinte vocale à partir des caractéristiques.

        L'algorithme combine:
        1. Pitch profile (F0 stats)
        2. Spectral features (brightness, warmth)
        3. Prosodic features (energy, silence)
        4. Optional: embedding vector from voice model
        """
        fp = VoiceFingerprint()
        fp.audio_duration_ms = audio_duration_ms
        fp.created_at = datetime.now()

        # 1. Créer le hash du pitch
        pitch_data = struct.pack(
            'ffff',
            chars.pitch_mean_hz,
            chars.pitch_std_hz,
            chars.pitch_min_hz,
            chars.pitch_max_hz
        )
        fp.pitch_hash = hashlib.sha256(pitch_data).hexdigest()[:16]

        # 2. Créer le hash spectral
        spectral_data = struct.pack(
            'ffff',
            chars.brightness,
            chars.warmth,
            chars.breathiness,
            chars.nasality
        )
        fp.spectral_hash = hashlib.sha256(spectral_data).hexdigest()[:16]

        # 3. Créer le hash prosodique
        prosody_data = struct.pack(
            'ffff',
            chars.energy_mean,
            chars.energy_std,
            chars.silence_ratio,
            chars.speech_rate_wpm
        )
        fp.prosody_hash = hashlib.sha256(prosody_data).hexdigest()[:16]

        # 4. Signature principale (combinaison de tous les composants)
        combined = f"{fp.pitch_hash}{fp.spectral_hash}{fp.prosody_hash}"
        combined += f"{chars.voice_type}{chars.estimated_gender}"
        fp.signature = hashlib.sha256(combined.encode()).hexdigest()
        fp.signature_short = fp.signature[:12]
        fp.fingerprint_id = f"vfp_{fp.signature_short}"

        # 5. Créer le vecteur d'embedding normalisé
        fp.embedding_vector = [
            chars.pitch_mean_hz / 500.0,      # Normalize pitch (0-500 Hz -> 0-1)
            chars.pitch_std_hz / 100.0,       # Normalize std
            chars.brightness / 5000.0,         # Normalize brightness
            chars.warmth / 10.0,               # Normalize warmth
            chars.energy_mean * 100,           # Scale energy
            chars.silence_ratio,               # Already 0-1
            1.0 if chars.estimated_gender == "male" else 0.0,
            1.0 if chars.estimated_gender == "female" else 0.0,
            1.0 if chars.estimated_gender == "child" else 0.0,
        ]

        # Ajouter l'embedding du modèle si disponible
        if embedding is not None and len(embedding) > 0:
            # Prendre les 16 premières valeurs de l'embedding
            embed_normalized = embedding.flatten()[:16]
            embed_normalized = embed_normalized / (np.linalg.norm(embed_normalized) + 1e-10)
            fp.embedding_vector.extend(embed_normalized.tolist())

        # 6. Calculer le checksum CRC32
        checksum_data = f"{fp.signature}{fp.pitch_hash}{fp.spectral_hash}{fp.prosody_hash}"
        fp.checksum = format(
            abs(hash(checksum_data)) % (2**32),
            '08x'
        )

        return fp

    def verify_checksum(self) -> bool:
        """Vérifie l'intégrité de l'empreinte"""
        expected_data = f"{self.signature}{self.pitch_hash}{self.spectral_hash}{self.prosody_hash}"
        expected_checksum = format(
            abs(hash(expected_data)) % (2**32),
            '08x'
        )
        return self.checksum == expected_checksum

    def similarity_score(self, other: 'VoiceFingerprint') -> float:
        """
        Calcule la similarité entre deux empreintes vocales.
        Retourne un score entre 0 (différent) et 1 (identique).
        """
        score = 0.0
        weights_total = 0.0

        # 1. Comparaison des hashes (match exact = 1.0, sinon 0)
        if self.pitch_hash == other.pitch_hash:
            score += 0.3
        weights_total += 0.3

        if self.spectral_hash == other.spectral_hash:
            score += 0.2
        weights_total += 0.2

        if self.prosody_hash == other.prosody_hash:
            score += 0.1
        weights_total += 0.1

        # 2. Comparaison des vecteurs d'embedding (cosine similarity)
        if self.embedding_vector and other.embedding_vector:
            min_len = min(len(self.embedding_vector), len(other.embedding_vector))
            v1 = np.array(self.embedding_vector[:min_len])
            v2 = np.array(other.embedding_vector[:min_len])

            norm1 = np.linalg.norm(v1)
            norm2 = np.linalg.norm(v2)

            if norm1 > 0 and norm2 > 0:
                cosine_sim = np.dot(v1, v2) / (norm1 * norm2)
                # Convert from [-1, 1] to [0, 1]
                cosine_sim = (cosine_sim + 1) / 2
                score += cosine_sim * 0.4
            weights_total += 0.4

        return score / weights_total if weights_total > 0 else 0.0

    def matches(self, other: 'VoiceFingerprint', threshold: float = 0.85) -> bool:
        """Vérifie si deux empreintes correspondent (même personne)"""
        return self.similarity_score(other) >= threshold

    def to_dict(self, include_embedding: bool = False) -> Dict[str, Any]:
        """
        Sérialise le fingerprint pour stockage.

        NOTE: L'embedding_vector n'est PAS inclus par défaut car :
        - Il est volumineux (256+ floats)
        - Il est déjà stocké dans le fichier .pkl binaire
        - Pour la recherche vectorielle à grande échelle, utiliser une BD vectorielle

        Args:
            include_embedding: Si True, inclut l'embedding (pour debug/export uniquement)
        """
        result = {
            "fingerprint_id": self.fingerprint_id,
            "version": self.version,
            "signature": self.signature,
            "signature_short": self.signature_short,
            "components": {
                "pitch_hash": self.pitch_hash,
                "spectral_hash": self.spectral_hash,
                "prosody_hash": self.prosody_hash
            },
            "checksum": self.checksum,
            "metadata": {
                "created_at": self.created_at.isoformat(),
                "audio_duration_ms": self.audio_duration_ms,
                "sample_count": self.sample_count,
                "embedding_dimensions": len(self.embedding_vector)
            },
            "integrity_valid": self.verify_checksum()
        }

        # Inclure l'embedding uniquement si demandé (debug/export)
        if include_embedding and self.embedding_vector:
            result["embedding_vector"] = self.embedding_vector

        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'VoiceFingerprint':
        """
        Reconstruit depuis un dictionnaire (stockage DB).

        NOTE: L'embedding_vector n'est généralement PAS inclus dans le dict
        car il est stocké séparément en binaire. Pour la comparaison de similarité,
        l'embedding doit être chargé depuis le fichier .pkl.
        """
        fp = cls()
        fp.fingerprint_id = data.get("fingerprint_id", "")
        fp.version = data.get("version", "1.0")
        fp.signature = data.get("signature", "")
        fp.signature_short = data.get("signature_short", "")

        components = data.get("components", {})
        fp.pitch_hash = components.get("pitch_hash", "")
        fp.spectral_hash = components.get("spectral_hash", "")
        fp.prosody_hash = components.get("prosody_hash", "")

        # L'embedding_vector n'est pas stocké en DB par défaut (trop volumineux)
        # Il sera vide sauf si explicitement inclus (debug/export)
        fp.embedding_vector = data.get("embedding_vector", [])
        fp.checksum = data.get("checksum", "")

        metadata = data.get("metadata", {})
        if metadata.get("created_at"):
            fp.created_at = datetime.fromisoformat(metadata["created_at"])
        fp.audio_duration_ms = metadata.get("audio_duration_ms", 0)
        fp.sample_count = metadata.get("sample_count", 1)

        return fp

    def can_compute_similarity(self) -> bool:
        """Vérifie si le fingerprint peut calculer la similarité (embedding chargé)"""
        return len(self.embedding_vector) > 0


@dataclass
class VoiceCharacteristics:
    """Caractéristiques détaillées d'une voix extraites de l'audio"""
    # Pitch (fréquence fondamentale)
    pitch_mean_hz: float = 0.0          # Pitch moyen en Hz
    pitch_std_hz: float = 0.0           # Écart-type du pitch
    pitch_min_hz: float = 0.0           # Pitch minimum
    pitch_max_hz: float = 0.0           # Pitch maximum

    # Classification vocale
    voice_type: str = "unknown"          # "high_female", "medium_female", "low_female", "high_male", "medium_male", "low_male", "child"
    estimated_gender: str = "unknown"    # "male", "female", "child", "unknown"
    estimated_age_range: str = "unknown" # "child", "teen", "adult", "senior"

    # Caractéristiques spectrales
    brightness: float = 0.0             # Centroïde spectral moyen (Hz)
    warmth: float = 0.0                 # Énergie basses fréquences
    breathiness: float = 0.0            # Niveau de souffle dans la voix
    nasality: float = 0.0               # Niveau de nasalité

    # Prosodie
    speech_rate_wpm: float = 0.0        # Mots par minute estimés
    energy_mean: float = 0.0            # Énergie moyenne (volume)
    energy_std: float = 0.0             # Variation d'énergie
    silence_ratio: float = 0.0          # Ratio de silence

    # Qualité technique
    sample_rate: int = 0                # Taux d'échantillonnage
    bit_depth: int = 0                  # Profondeur de bits
    channels: int = 1                   # Nombre de canaux
    codec: str = ""                     # Codec audio détecté

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pitch": {
                "mean_hz": round(self.pitch_mean_hz, 2),
                "std_hz": round(self.pitch_std_hz, 2),
                "min_hz": round(self.pitch_min_hz, 2),
                "max_hz": round(self.pitch_max_hz, 2)
            },
            "classification": {
                "voice_type": self.voice_type,
                "estimated_gender": self.estimated_gender,
                "estimated_age_range": self.estimated_age_range
            },
            "spectral": {
                "brightness": round(self.brightness, 2),
                "warmth": round(self.warmth, 2),
                "breathiness": round(self.breathiness, 2),
                "nasality": round(self.nasality, 2)
            },
            "prosody": {
                "speech_rate_wpm": round(self.speech_rate_wpm, 1),
                "energy_mean": round(self.energy_mean, 4),
                "energy_std": round(self.energy_std, 4),
                "silence_ratio": round(self.silence_ratio, 3)
            },
            "technical": {
                "sample_rate": self.sample_rate,
                "bit_depth": self.bit_depth,
                "channels": self.channels,
                "codec": self.codec
            }
        }

    def generate_fingerprint(
        self,
        audio_duration_ms: int = 0,
        embedding: np.ndarray = None
    ) -> 'VoiceFingerprint':
        """
        Génère une empreinte vocale unique à partir de ces caractéristiques.

        Args:
            audio_duration_ms: Durée de l'audio source en millisecondes
            embedding: Vecteur d'embedding optionnel (OpenVoice)

        Returns:
            VoiceFingerprint: Empreinte vocale unique avec signature et checksum
        """
        return VoiceFingerprint.generate_from_characteristics(
            self,
            audio_duration_ms=audio_duration_ms,
            embedding=embedding
        )


@dataclass
class SpeakerInfo:
    """Informations sur un locuteur détecté dans l'audio"""
    speaker_id: str                     # ID unique du locuteur (speaker_0, speaker_1, etc.)
    is_primary: bool = False            # True si c'est le locuteur principal
    speaking_time_ms: int = 0           # Temps de parole en ms
    speaking_ratio: float = 0.0         # Ratio du temps de parole total
    voice_characteristics: VoiceCharacteristics = field(default_factory=VoiceCharacteristics)

    # Segments temporels où ce locuteur parle
    segments: List[Dict[str, float]] = field(default_factory=list)  # [{"start": 0.0, "end": 2.5}, ...]

    # Empreinte vocale unique du locuteur
    fingerprint: Optional[VoiceFingerprint] = None

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
    primary_voice: Optional[VoiceCharacteristics] = None

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
    voice_characteristics: Optional[VoiceCharacteristics] = None
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


class VoiceAnalyzer:
    """
    Analyseur de voix pour extraction de caractéristiques détaillées.
    Utilise librosa pour l'analyse audio et pyannote (optionnel) pour la diarisation.
    """

    # Seuils de classification vocale par pitch
    PITCH_THRESHOLDS = {
        "child": (250, 500),      # Enfant: 250-500 Hz
        "high_female": (200, 350),
        "medium_female": (165, 250),
        "low_female": (140, 200),
        "high_male": (130, 180),
        "medium_male": (100, 150),
        "low_male": (65, 120),
    }

    def __init__(self):
        self._pyannote_available = False
        self._librosa_available = False

        try:
            import librosa
            self._librosa_available = True
        except ImportError:
            logger.warning("[VOICE_ANALYZER] librosa non disponible")

        try:
            from pyannote.audio import Pipeline
            self._pyannote_available = True
        except ImportError:
            logger.debug("[VOICE_ANALYZER] pyannote non disponible - diarisation désactivée")

    async def analyze_audio(self, audio_path: str) -> RecordingMetadata:
        """
        Analyse complète d'un fichier audio.
        Extrait les caractéristiques vocales, détecte les locuteurs, évalue la qualité.
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio non trouvé: {audio_path}")

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._analyze_audio_sync, audio_path)

    def _analyze_audio_sync(self, audio_path: str) -> RecordingMetadata:
        """Analyse synchrone de l'audio (exécutée dans un thread)"""
        import librosa

        # Charger l'audio
        audio, sr = librosa.load(audio_path, sr=22050)
        duration_ms = int(len(audio) / sr * 1000)

        # Informations fichier
        file_size = os.path.getsize(audio_path)
        file_format = os.path.splitext(audio_path)[1].lstrip('.')

        # Créer les métadonnées de base
        metadata = RecordingMetadata(
            file_path=audio_path,
            duration_ms=duration_ms,
            file_size_bytes=file_size,
            format=file_format,
            analyzed_at=datetime.now()
        )

        # Analyse de qualité
        metadata.noise_level = self._estimate_noise_level(audio, sr)
        metadata.snr_db = self._estimate_snr(audio, sr)
        metadata.clarity_score = self._calculate_clarity(audio, sr)
        metadata.clipping_detected = self._detect_clipping(audio)
        metadata.reverb_level = self._estimate_reverb(audio, sr)
        metadata.room_size_estimate = self._estimate_room_size(metadata.reverb_level)

        # Analyse des locuteurs (simplifiée sans pyannote)
        speakers = self._analyze_speakers(audio, sr)
        metadata.speaker_count = len(speakers)
        metadata.speakers = speakers
        metadata.primary_speaker = self._identify_primary_speaker(speakers)

        if metadata.speaker_count > 1:
            logger.info(f"[VOICE_ANALYZER] {metadata.speaker_count} locuteurs détectés")

        return metadata

    def _estimate_noise_level(self, audio: np.ndarray, sr: int) -> float:
        """Estime le niveau de bruit (0 = propre, 1 = très bruité)"""
        try:
            import librosa

            # Calculer le spectre
            stft = np.abs(librosa.stft(audio))

            # Estimer le plancher de bruit (percentile bas)
            noise_floor = np.percentile(stft, 10)
            signal_level = np.percentile(stft, 90)

            if signal_level == 0:
                return 0.5

            # Ratio bruit/signal normalisé
            noise_ratio = noise_floor / (signal_level + 1e-10)
            return min(1.0, noise_ratio * 2)

        except Exception as e:
            logger.warning(f"[VOICE_ANALYZER] Erreur estimation bruit: {e}")
            return 0.0

    def _estimate_snr(self, audio: np.ndarray, sr: int) -> float:
        """Estime le rapport signal/bruit en dB"""
        try:
            # Énergie du signal
            signal_power = np.mean(audio ** 2)

            # Estimer le bruit (segments silencieux)
            frame_length = int(sr * 0.02)  # 20ms frames
            hop_length = int(sr * 0.01)    # 10ms hop

            frames = librosa.util.frame(audio, frame_length=frame_length, hop_length=hop_length)
            frame_energy = np.sum(frames ** 2, axis=0)

            # Bruit = énergie des 10% frames les plus silencieux
            noise_power = np.percentile(frame_energy, 10) / frame_length

            if noise_power == 0:
                return 40.0  # Très propre

            snr = 10 * np.log10(signal_power / (noise_power + 1e-10))
            return max(-10, min(60, snr))

        except Exception as e:
            logger.warning(f"[VOICE_ANALYZER] Erreur estimation SNR: {e}")
            return 20.0

    def _calculate_clarity(self, audio: np.ndarray, sr: int) -> float:
        """Calcule un score de clarté vocale (0-1)"""
        try:
            import librosa

            # Centroïde spectral (indicateur de clarté)
            centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            mean_centroid = np.mean(centroid)

            # Clarté optimale entre 1000-3000 Hz pour la voix
            if 1000 <= mean_centroid <= 3000:
                clarity = 1.0
            elif mean_centroid < 1000:
                clarity = mean_centroid / 1000
            else:
                clarity = max(0, 1 - (mean_centroid - 3000) / 3000)

            # Ajuster par la variance spectrale (trop de variance = moins clair)
            spectral_bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
            bandwidth_penalty = min(0.3, np.std(spectral_bandwidth) / 1000)

            return max(0, min(1, clarity - bandwidth_penalty))

        except Exception as e:
            logger.warning(f"[VOICE_ANALYZER] Erreur calcul clarté: {e}")
            return 0.5

    def _detect_clipping(self, audio: np.ndarray) -> bool:
        """Détecte la saturation audio"""
        threshold = 0.99
        clipped_samples = np.sum(np.abs(audio) >= threshold)
        clip_ratio = clipped_samples / len(audio)
        return clip_ratio > 0.001  # Plus de 0.1% de samples saturés

    def _estimate_reverb(self, audio: np.ndarray, sr: int) -> float:
        """Estime le niveau de réverbération (0-1)"""
        try:
            import librosa

            # Utiliser la décroissance de l'enveloppe
            envelope = np.abs(librosa.onset.onset_strength(y=audio, sr=sr))

            # Calculer le temps de décroissance
            if len(envelope) < 10:
                return 0.0

            # Autocorrélation pour détecter les échos
            autocorr = np.correlate(envelope, envelope, mode='full')
            autocorr = autocorr[len(autocorr)//2:]

            # Normaliser
            if autocorr[0] != 0:
                autocorr = autocorr / autocorr[0]

            # Chercher les pics secondaires (échos)
            peaks = []
            for i in range(1, min(len(autocorr), 50)):
                if autocorr[i] > 0.3:
                    peaks.append(autocorr[i])

            if not peaks:
                return 0.0

            return min(1.0, np.mean(peaks))

        except Exception as e:
            logger.warning(f"[VOICE_ANALYZER] Erreur estimation reverb: {e}")
            return 0.0

    def _estimate_room_size(self, reverb_level: float) -> str:
        """Estime la taille de la pièce basée sur la réverbération"""
        if reverb_level < 0.1:
            return "small"  # Proche du micro, peu de réverb
        elif reverb_level < 0.3:
            return "medium"
        elif reverb_level < 0.6:
            return "large"
        else:
            return "outdoor"  # Beaucoup de réverb/écho

    def _analyze_speakers(self, audio: np.ndarray, sr: int) -> List[SpeakerInfo]:
        """
        Analyse les locuteurs dans l'audio.
        Utilise pyannote si disponible, sinon une analyse simplifiée.
        """
        if self._pyannote_available:
            return self._analyze_speakers_pyannote(audio, sr)
        else:
            return self._analyze_speakers_simple(audio, sr)

    def _analyze_speakers_simple(self, audio: np.ndarray, sr: int) -> List[SpeakerInfo]:
        """
        Analyse simplifiée des locuteurs sans diarisation.
        Suppose un seul locuteur principal et extrait ses caractéristiques.
        """
        try:
            import librosa

            # Extraire les caractéristiques vocales
            voice_chars = self._extract_voice_characteristics(audio, sr)

            # Calculer le temps de parole (segments non-silencieux)
            rms = librosa.feature.rms(y=audio)[0]
            speech_frames = np.sum(rms > np.percentile(rms, 20))
            total_frames = len(rms)
            speaking_ratio = speech_frames / total_frames if total_frames > 0 else 1.0
            speaking_time_ms = int(len(audio) / sr * 1000 * speaking_ratio)

            # Créer le locuteur principal
            primary_speaker = SpeakerInfo(
                speaker_id="speaker_0",
                is_primary=True,
                speaking_time_ms=speaking_time_ms,
                speaking_ratio=speaking_ratio,
                voice_characteristics=voice_chars,
                segments=[{"start": 0.0, "end": len(audio) / sr}]
            )

            return [primary_speaker]

        except Exception as e:
            logger.warning(f"[VOICE_ANALYZER] Erreur analyse locuteurs: {e}")
            return [SpeakerInfo(speaker_id="speaker_0", is_primary=True)]

    def _analyze_speakers_pyannote(self, audio: np.ndarray, sr: int) -> List[SpeakerInfo]:
        """Analyse des locuteurs avec pyannote (diarisation)"""
        # TODO: Implémenter avec pyannote.audio quand disponible
        # Pour l'instant, fallback sur l'analyse simple
        return self._analyze_speakers_simple(audio, sr)

    def _extract_voice_characteristics(self, audio: np.ndarray, sr: int) -> VoiceCharacteristics:
        """Extrait les caractéristiques détaillées d'une voix"""
        try:
            import librosa

            chars = VoiceCharacteristics()
            chars.sample_rate = sr

            # Analyse du pitch (F0)
            f0, voiced_flag, voiced_probs = librosa.pyin(
                audio,
                fmin=librosa.note_to_hz('C2'),  # ~65 Hz
                fmax=librosa.note_to_hz('C7'),  # ~2093 Hz
                sr=sr
            )

            # Filtrer les valeurs NaN
            f0_valid = f0[~np.isnan(f0)]

            if len(f0_valid) > 0:
                chars.pitch_mean_hz = float(np.mean(f0_valid))
                chars.pitch_std_hz = float(np.std(f0_valid))
                chars.pitch_min_hz = float(np.min(f0_valid))
                chars.pitch_max_hz = float(np.max(f0_valid))

                # Classification vocale
                chars.voice_type, chars.estimated_gender = self._classify_voice(chars.pitch_mean_hz)
                chars.estimated_age_range = self._estimate_age(chars.pitch_mean_hz, chars.pitch_std_hz)

            # Caractéristiques spectrales
            # Brightness (centroïde spectral)
            centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
            chars.brightness = float(np.mean(centroid))

            # Warmth (énergie basses fréquences)
            spec = np.abs(librosa.stft(audio))
            low_freq_bins = int(500 / (sr / 2) * spec.shape[0])  # Jusqu'à 500 Hz
            chars.warmth = float(np.mean(spec[:low_freq_bins, :]))

            # Énergie
            rms = librosa.feature.rms(y=audio)[0]
            chars.energy_mean = float(np.mean(rms))
            chars.energy_std = float(np.std(rms))

            # Ratio de silence
            silence_threshold = np.percentile(rms, 10)
            chars.silence_ratio = float(np.sum(rms < silence_threshold) / len(rms))

            return chars

        except Exception as e:
            logger.warning(f"[VOICE_ANALYZER] Erreur extraction caractéristiques: {e}")
            return VoiceCharacteristics()

    def _classify_voice(self, pitch_hz: float) -> tuple:
        """Classifie le type de voix basé sur le pitch"""
        if pitch_hz >= 250:
            return ("child", "child")
        elif pitch_hz >= 200:
            return ("high_female", "female")
        elif pitch_hz >= 165:
            return ("medium_female", "female")
        elif pitch_hz >= 140:
            return ("low_female", "female")
        elif pitch_hz >= 130:
            return ("high_male", "male")
        elif pitch_hz >= 100:
            return ("medium_male", "male")
        else:
            return ("low_male", "male")

    def _estimate_age(self, pitch_hz: float, pitch_std: float) -> str:
        """Estime la tranche d'âge basée sur le pitch"""
        if pitch_hz >= 250:
            return "child"
        elif pitch_hz >= 200 and pitch_std > 30:
            return "teen"
        elif pitch_hz < 90:
            return "senior"
        else:
            return "adult"

    def _identify_primary_speaker(self, speakers: List[SpeakerInfo]) -> Optional[SpeakerInfo]:
        """Identifie le locuteur principal (celui qui parle le plus)"""
        if not speakers:
            return None

        # Trier par temps de parole décroissant
        sorted_speakers = sorted(speakers, key=lambda s: s.speaking_time_ms, reverse=True)

        # Marquer le premier comme principal
        primary = sorted_speakers[0]
        primary.is_primary = True

        return primary

    async def extract_primary_speaker_audio(
        self,
        audio_path: str,
        output_path: Optional[str] = None,
        min_segment_duration_ms: int = 100
    ) -> Tuple[str, RecordingMetadata]:
        """
        Extrait uniquement l'audio du locuteur principal.

        Analyse l'audio, identifie le locuteur principal (celui qui parle le plus),
        et extrait uniquement ses segments de parole pour le clonage vocal.

        Args:
            audio_path: Chemin vers le fichier audio source
            output_path: Chemin de sortie (optionnel, généré automatiquement si None)
            min_segment_duration_ms: Durée minimum d'un segment à conserver

        Returns:
            Tuple[str, RecordingMetadata]: (chemin audio extrait, métadonnées complètes)
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio non trouvé: {audio_path}")

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._extract_primary_speaker_sync,
            audio_path,
            output_path,
            min_segment_duration_ms
        )

    def _extract_primary_speaker_sync(
        self,
        audio_path: str,
        output_path: Optional[str],
        min_segment_duration_ms: int
    ) -> Tuple[str, RecordingMetadata]:
        """Extraction synchrone du locuteur principal"""
        import librosa
        import soundfile as sf

        # Analyser l'audio complet
        metadata = self._analyze_audio_sync(audio_path)

        if not metadata.primary_speaker:
            logger.warning("[VOICE_ANALYZER] Aucun locuteur principal détecté")
            return audio_path, metadata

        primary = metadata.primary_speaker
        segments = primary.segments

        if not segments:
            logger.warning("[VOICE_ANALYZER] Aucun segment pour le locuteur principal")
            return audio_path, metadata

        # Charger l'audio
        audio, sr = librosa.load(audio_path, sr=22050)

        # Filtrer les segments trop courts
        min_samples = int(min_segment_duration_ms * sr / 1000)
        valid_segments = []
        for seg in segments:
            start_sample = int(seg["start"] * sr)
            end_sample = int(seg["end"] * sr)
            if (end_sample - start_sample) >= min_samples:
                valid_segments.append((start_sample, end_sample))

        if not valid_segments:
            logger.warning("[VOICE_ANALYZER] Aucun segment valide après filtrage")
            return audio_path, metadata

        # Extraire et concaténer les segments du locuteur principal
        extracted_audio = []
        for start, end in valid_segments:
            extracted_audio.append(audio[start:end])

        primary_audio = np.concatenate(extracted_audio)

        # Générer le chemin de sortie si non fourni
        if output_path is None:
            base_name = os.path.splitext(audio_path)[0]
            output_path = f"{base_name}_primary_speaker.wav"

        # Sauvegarder l'audio extrait
        sf.write(output_path, primary_audio, sr)

        # Mettre à jour les métadonnées
        extracted_duration_ms = int(len(primary_audio) / sr * 1000)
        logger.info(
            f"[VOICE_ANALYZER] Audio du locuteur principal extrait: "
            f"{len(valid_segments)} segments, {extracted_duration_ms}ms "
            f"(original: {metadata.duration_ms}ms)"
        )

        # Créer de nouvelles métadonnées pour l'audio extrait
        extracted_metadata = RecordingMetadata(
            file_path=output_path,
            duration_ms=extracted_duration_ms,
            file_size_bytes=os.path.getsize(output_path),
            format="wav",
            noise_level=metadata.noise_level,
            snr_db=metadata.snr_db,
            clarity_score=metadata.clarity_score,
            clipping_detected=metadata.clipping_detected,
            speaker_count=1,  # Maintenant un seul locuteur
            speakers=[primary],
            primary_speaker=primary,
            analyzed_at=datetime.now()
        )

        return output_path, extracted_metadata

    async def extract_all_speakers_audio(
        self,
        audio_path: str,
        output_dir: str,
        min_segment_duration_ms: int = 100
    ) -> Dict[str, Tuple[str, SpeakerInfo]]:
        """
        Extrait l'audio de CHAQUE locuteur séparément.

        Pour la traduction multi-voix: chaque locuteur obtient son propre
        fichier audio pour permettre un clonage vocal individuel.

        Args:
            audio_path: Chemin vers le fichier audio source
            output_dir: Répertoire de sortie pour les fichiers extraits
            min_segment_duration_ms: Durée minimum d'un segment

        Returns:
            Dict[speaker_id, (audio_path, SpeakerInfo)]: Audio et info par locuteur
        """
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio non trouvé: {audio_path}")

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._extract_all_speakers_sync,
            audio_path,
            output_dir,
            min_segment_duration_ms
        )

    def _extract_all_speakers_sync(
        self,
        audio_path: str,
        output_dir: str,
        min_segment_duration_ms: int
    ) -> Dict[str, Tuple[str, SpeakerInfo]]:
        """Extraction synchrone de tous les locuteurs"""
        import librosa
        import soundfile as sf

        os.makedirs(output_dir, exist_ok=True)

        # Analyser l'audio complet
        metadata = self._analyze_audio_sync(audio_path)

        if not metadata.speakers:
            logger.warning("[VOICE_ANALYZER] Aucun locuteur détecté")
            return {}

        # Charger l'audio
        audio, sr = librosa.load(audio_path, sr=22050)
        min_samples = int(min_segment_duration_ms * sr / 1000)

        result = {}
        base_name = os.path.splitext(os.path.basename(audio_path))[0]

        for speaker in metadata.speakers:
            segments = speaker.segments
            if not segments:
                continue

            # Filtrer les segments trop courts
            valid_segments = []
            for seg in segments:
                start_sample = int(seg["start"] * sr)
                end_sample = int(seg["end"] * sr)
                if (end_sample - start_sample) >= min_samples:
                    valid_segments.append((start_sample, end_sample))

            if not valid_segments:
                continue

            # Extraire et concaténer les segments
            extracted_audio = []
            for start, end in valid_segments:
                extracted_audio.append(audio[start:end])

            speaker_audio = np.concatenate(extracted_audio)

            # Sauvegarder
            output_path = os.path.join(output_dir, f"{base_name}_{speaker.speaker_id}.wav")
            sf.write(output_path, speaker_audio, sr)

            # Générer l'empreinte vocale pour ce locuteur
            speaker.generate_fingerprint()

            # Mettre à jour la durée
            speaker.speaking_time_ms = int(len(speaker_audio) / sr * 1000)

            result[speaker.speaker_id] = (output_path, speaker)
            logger.info(
                f"[VOICE_ANALYZER] Locuteur {speaker.speaker_id} extrait: "
                f"{speaker.speaking_time_ms}ms, {len(valid_segments)} segments"
            )

        return result

    def identify_user_speaker(
        self,
        speakers: List[SpeakerInfo],
        user_fingerprint: VoiceFingerprint,
        similarity_threshold: float = 0.75
    ) -> Optional[SpeakerInfo]:
        """
        Identifie quel locuteur correspond à un profil utilisateur existant.

        Compare les empreintes vocales de chaque locuteur avec celle de
        l'utilisateur pour trouver une correspondance.

        Args:
            speakers: Liste des locuteurs détectés
            user_fingerprint: Empreinte vocale de l'utilisateur
            similarity_threshold: Seuil de similarité (0-1)

        Returns:
            SpeakerInfo du locuteur correspondant, ou None si aucune correspondance
        """
        if not speakers or not user_fingerprint:
            return None

        best_match = None
        best_score = 0.0

        for speaker in speakers:
            # Générer l'empreinte si pas encore fait
            if not speaker.fingerprint:
                speaker.generate_fingerprint()

            if not speaker.fingerprint:
                continue

            # Calculer la similarité
            score = user_fingerprint.similarity_score(speaker.fingerprint)

            logger.debug(
                f"[VOICE_ANALYZER] Similarité {speaker.speaker_id} <-> utilisateur: {score:.3f}"
            )

            if score > best_score and score >= similarity_threshold:
                best_score = score
                best_match = speaker

        if best_match:
            logger.info(
                f"[VOICE_ANALYZER] Utilisateur identifié: {best_match.speaker_id} "
                f"(similarité: {best_score:.3f})"
            )

        return best_match

    def can_create_user_profile(self, metadata: RecordingMetadata) -> Tuple[bool, str]:
        """
        Vérifie si on peut créer un profil utilisateur à partir de cet audio.

        Règles:
        - Un seul locuteur principal clairement identifiable
        - Qualité audio suffisante
        - Durée minimum de parole

        Args:
            metadata: Métadonnées de l'enregistrement analysé

        Returns:
            Tuple[bool, str]: (peut créer, raison)
        """
        # Vérifier le nombre de locuteurs
        if metadata.speaker_count > 1:
            # Vérifier si le locuteur principal domine clairement
            if metadata.primary_speaker:
                primary_ratio = metadata.primary_speaker.speaking_ratio
                if primary_ratio < 0.7:
                    return False, f"Locuteur principal ne domine pas assez ({primary_ratio:.0%})"
            else:
                return False, "Plusieurs locuteurs sans dominant clair"

        # Vérifier la qualité
        if metadata.clarity_score < 0.5:
            return False, f"Qualité audio insuffisante ({metadata.clarity_score:.0%})"

        # Vérifier la durée
        if metadata.primary_speaker:
            if metadata.primary_speaker.speaking_time_ms < 5000:
                return False, f"Durée de parole insuffisante ({metadata.primary_speaker.speaking_time_ms}ms)"

        return True, "OK"

    def can_update_user_profile(
        self,
        metadata: RecordingMetadata,
        existing_fingerprint: VoiceFingerprint,
        similarity_threshold: float = 0.80
    ) -> Tuple[bool, str, Optional[SpeakerInfo]]:
        """
        Vérifie si on peut mettre à jour un profil utilisateur existant.

        Règles:
        - Le locuteur principal doit avoir une signature similaire au profil existant
        - Qualité audio suffisante

        Args:
            metadata: Métadonnées de l'enregistrement
            existing_fingerprint: Empreinte du profil existant
            similarity_threshold: Seuil de similarité requis

        Returns:
            Tuple[bool, str, Optional[SpeakerInfo]]: (peut màj, raison, locuteur correspondant)
        """
        if not metadata.primary_speaker:
            return False, "Aucun locuteur principal détecté", None

        # Générer l'empreinte du locuteur principal
        primary = metadata.primary_speaker
        if not primary.fingerprint:
            primary.generate_fingerprint()

        if not primary.fingerprint:
            return False, "Impossible de générer l'empreinte vocale", None

        # Comparer avec le profil existant
        similarity = existing_fingerprint.similarity_score(primary.fingerprint)

        if similarity < similarity_threshold:
            return False, f"Signature vocale différente ({similarity:.0%} < {similarity_threshold:.0%})", None

        # Vérifier la qualité
        if metadata.clarity_score < 0.5:
            return False, f"Qualité audio insuffisante ({metadata.clarity_score:.0%})", None

        return True, f"Signature correspondante ({similarity:.0%})", primary

    async def compare_voices(
        self,
        original_path: str,
        cloned_path: str
    ) -> Dict[str, Any]:
        """Compare une voix originale et clonée pour mesurer la similarité"""
        original_meta = await self.analyze_audio(original_path)
        cloned_meta = await self.analyze_audio(cloned_path)

        if not original_meta.primary_speaker or not cloned_meta.primary_speaker:
            return {"similarity": 0.0, "error": "Locuteur principal non détecté"}

        orig_voice = original_meta.primary_speaker.voice_characteristics
        clone_voice = cloned_meta.primary_speaker.voice_characteristics

        # Similarité du pitch
        if orig_voice.pitch_mean_hz > 0 and clone_voice.pitch_mean_hz > 0:
            pitch_diff = abs(orig_voice.pitch_mean_hz - clone_voice.pitch_mean_hz)
            pitch_sim = max(0, 1 - pitch_diff / orig_voice.pitch_mean_hz)
        else:
            pitch_sim = 0.0

        # Similarité de la brillance
        if orig_voice.brightness > 0:
            bright_diff = abs(orig_voice.brightness - clone_voice.brightness)
            bright_sim = max(0, 1 - bright_diff / orig_voice.brightness)
        else:
            bright_sim = 0.0

        # Similarité de l'énergie
        if orig_voice.energy_mean > 0:
            energy_diff = abs(orig_voice.energy_mean - clone_voice.energy_mean)
            energy_sim = max(0, 1 - energy_diff / orig_voice.energy_mean)
        else:
            energy_sim = 0.0

        # Score global
        overall = (pitch_sim * 0.4 + bright_sim * 0.3 + energy_sim * 0.3)

        return {
            "pitch_similarity": round(pitch_sim, 3),
            "brightness_similarity": round(bright_sim, 3),
            "energy_similarity": round(energy_sim, 3),
            "overall_similarity": round(overall, 3),
            "original_voice": orig_voice.to_dict(),
            "cloned_voice": clone_voice.to_dict()
        }


# Instance singleton de l'analyseur
_voice_analyzer_instance: Optional[VoiceAnalyzer] = None


def get_voice_analyzer() -> VoiceAnalyzer:
    """Retourne l'instance singleton de l'analyseur vocal"""
    global _voice_analyzer_instance
    if _voice_analyzer_instance is None:
        _voice_analyzer_instance = VoiceAnalyzer()
    return _voice_analyzer_instance


class VoiceCloneService:
    """
    Service de clonage vocal - Singleton

    Fonctionnalités:
    - Création de modèles de voix à partir d'audios
    - Cache des modèles (90 jours / 3 mois)
    - Agrégation d'audios si durée insuffisante
    - Amélioration continue des modèles
    - Recalibration trimestrielle
    - Sélection du meilleur audio (le plus long, le plus clair, sans bruit)
    """

    _instance = None
    _lock = threading.Lock()

    # Configuration
    MIN_AUDIO_DURATION_MS = 10_000  # 10 secondes minimum pour clonage de qualité
    VOICE_MODEL_MAX_AGE_DAYS = 90   # Recalibration trimestrielle (3 mois)
    MAX_AUDIO_HISTORY = 20          # Nombre max d'audios à agréger
    IMPROVEMENT_WEIGHT_OLD = 0.7    # Poids de l'ancien embedding
    IMPROVEMENT_WEIGHT_NEW = 0.3    # Poids du nouveau

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        voice_cache_dir: Optional[str] = None,
        device: str = "cpu",
        database_service = None
    ):
        if self._initialized:
            return

        # Configuration
        self.voice_cache_dir = Path(voice_cache_dir or os.getenv('VOICE_MODEL_CACHE_DIR', '/app/voice_models'))
        self.device = os.getenv('VOICE_CLONE_DEVICE', device)
        self.database_service = database_service

        # OpenVoice components
        self.tone_color_converter = None
        self.se_extractor_module = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Créer le répertoire de cache
        self.voice_cache_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"[VOICE_CLONE] Service créé: cache_dir={self.voice_cache_dir}, device={self.device}")
        self._initialized = True

    def set_database_service(self, database_service):
        """Injecte le service de base de données"""
        self.database_service = database_service

    async def initialize(self) -> bool:
        """Initialise OpenVoice pour le clonage vocal"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            if not OPENVOICE_AVAILABLE:
                logger.warning("[VOICE_CLONE] OpenVoice non disponible - mode dégradé")
                self.is_initialized = True
                return True

            try:
                start_time = time.time()
                logger.info("[VOICE_CLONE] 🔄 Initialisation d'OpenVoice...")

                # Charger dans un thread pour ne pas bloquer
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, self._load_openvoice)

                load_time = time.time() - start_time
                logger.info(f"[VOICE_CLONE] ✅ OpenVoice initialisé en {load_time:.2f}s")

                self.is_initialized = True
                return True

            except Exception as e:
                logger.error(f"[VOICE_CLONE] ❌ Erreur initialisation OpenVoice: {e}")
                import traceback
                traceback.print_exc()
                self.is_initialized = True  # Mode dégradé
                return True

    def _load_openvoice(self):
        """Charge OpenVoice (appelé dans un thread)"""
        checkpoints_dir = os.getenv('OPENVOICE_CHECKPOINTS', 'checkpoints/converter')
        self.tone_color_converter = ToneColorConverter(
            checkpoints_dir,
            device=self.device
        )
        self.se_extractor_module = se_extractor

    async def get_or_create_voice_model(
        self,
        user_id: str,
        current_audio_path: Optional[str] = None,
        current_audio_duration_ms: int = 0
    ) -> VoiceModel:
        """
        Récupère ou crée un modèle de voix pour un utilisateur.

        Logique:
        1. Si modèle en cache et récent → utiliser
        2. Si modèle en cache mais ancien → améliorer avec nouvel audio
        3. Si pas de modèle et audio trop court → agréger historique
        4. Créer nouveau modèle

        Args:
            user_id: ID de l'utilisateur
            current_audio_path: Audio actuel pour le clonage (optionnel)
            current_audio_duration_ms: Durée de l'audio actuel

        Returns:
            VoiceModel prêt à l'emploi
        """
        # 1. Vérifier le cache
        cached_model = await self._load_cached_model(user_id)

        if cached_model:
            age_days = (datetime.now() - cached_model.updated_at).days

            # Modèle récent → utiliser directement
            if age_days < self.VOICE_MODEL_MAX_AGE_DAYS:
                logger.info(f"[VOICE_CLONE] 📦 Modèle en cache pour {user_id} (age: {age_days}j)")

                # Charger l'embedding si pas en mémoire
                if cached_model.embedding is None:
                    cached_model = await self._load_embedding(cached_model)

                return cached_model

            # Modèle ancien → améliorer si on a un nouvel audio
            if current_audio_path:
                logger.info(f"[VOICE_CLONE] 🔄 Modèle obsolète pour {user_id}, amélioration...")
                return await self._improve_model(cached_model, current_audio_path)

            # Sinon utiliser l'ancien modèle
            logger.info(f"[VOICE_CLONE] ⚠️ Modèle obsolète pour {user_id} mais pas de nouvel audio")
            if cached_model.embedding is None:
                cached_model = await self._load_embedding(cached_model)
            return cached_model

        # 2. Pas de modèle → créer
        if not current_audio_path:
            # Essayer de récupérer l'historique audio
            audio_paths = await self._get_user_audio_history(user_id)
            if not audio_paths:
                raise ValueError(f"Aucun audio disponible pour créer le modèle de voix de {user_id}")
            current_audio_path = audio_paths[0]
            current_audio_duration_ms = await self._get_audio_duration_ms(current_audio_path)

        audio_paths = [current_audio_path]
        total_duration = current_audio_duration_ms

        # Si audio trop court, chercher l'historique
        if total_duration < self.MIN_AUDIO_DURATION_MS:
            logger.info(f"[VOICE_CLONE] ⚠️ Audio trop court ({total_duration}ms), agrégation historique...")
            historical_audios = await self._get_user_audio_history(user_id, exclude=[current_audio_path])
            audio_paths.extend(historical_audios)
            total_duration = await self._calculate_total_duration(audio_paths)

            logger.info(f"[VOICE_CLONE] 📚 {len(audio_paths)} audios agrégés, total: {total_duration}ms")

        # Créer le modèle avec ce qu'on a
        return await self._create_voice_model(user_id, audio_paths, total_duration)

    async def _create_voice_model(
        self,
        user_id: str,
        audio_paths: List[str],
        total_duration_ms: int
    ) -> VoiceModel:
        """
        Crée un nouveau modèle de voix à partir des audios.

        IMPORTANT: Extrait uniquement les segments du locuteur principal
        pour garantir que le clonage ne concerne que sa voix.
        """
        import uuid as uuid_module
        start_time = time.time()
        logger.info(f"[VOICE_CLONE] 🎤 Création modèle pour {user_id} ({len(audio_paths)} audios)")

        # Filtrer les audios valides
        valid_paths = [p for p in audio_paths if os.path.exists(p)]
        if not valid_paths:
            raise ValueError("Aucun fichier audio valide trouvé")

        # Créer le dossier utilisateur: {voice_cache_dir}/{user_id}/
        user_dir = self.voice_cache_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)

        # =====================================================================
        # EXTRACTION DU LOCUTEUR PRINCIPAL UNIQUEMENT
        # Pour chaque audio, extraire uniquement les segments du locuteur principal
        # =====================================================================
        voice_analyzer = get_voice_analyzer()
        extracted_paths = []
        primary_voice_chars = None
        recording_metadata = None

        for audio_path in valid_paths:
            try:
                # Extraire uniquement les segments du locuteur principal
                extracted_path, metadata = await voice_analyzer.extract_primary_speaker_audio(
                    audio_path,
                    output_path=str(user_dir / f"primary_{os.path.basename(audio_path)}"),
                    min_segment_duration_ms=100
                )
                extracted_paths.append(extracted_path)

                # Conserver les caractéristiques vocales du premier locuteur principal
                if primary_voice_chars is None and metadata.primary_speaker:
                    primary_voice_chars = metadata.primary_speaker.voice_characteristics
                    recording_metadata = metadata
                    logger.info(
                        f"[VOICE_CLONE] Locuteur principal détecté: "
                        f"gender={primary_voice_chars.estimated_gender}, "
                        f"pitch={primary_voice_chars.pitch_mean_hz:.1f}Hz"
                    )

            except Exception as e:
                logger.warning(f"[VOICE_CLONE] Erreur extraction locuteur principal: {e}")
                # Fallback: utiliser l'audio complet
                extracted_paths.append(audio_path)

        # Recalculer la durée totale après extraction
        extracted_duration_ms = 0
        for path in extracted_paths:
            extracted_duration_ms += await self._get_audio_duration_ms(path)

        logger.info(
            f"[VOICE_CLONE] Audio extrait: {extracted_duration_ms}ms "
            f"(original: {total_duration_ms}ms, {len(extracted_paths)} fichiers)"
        )

        # Concaténer les audios extraits si multiples
        if len(extracted_paths) > 1:
            combined_audio = await self._concatenate_audios(extracted_paths, user_id)
        else:
            combined_audio = extracted_paths[0]

        # Générer un profile_id unique
        profile_id = uuid_module.uuid4().hex[:12]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Extraire l'embedding de voix (du locuteur principal uniquement)
        embedding = await self._extract_voice_embedding(combined_audio, user_dir)

        # Calculer score de qualité
        quality_score = self._calculate_quality_score(extracted_duration_ms, len(valid_paths))

        # Chemin de l'embedding avec nouvelle convention: {userId}_{profileId}_{timestamp}.pkl
        embedding_filename = f"{user_id}_{profile_id}_{timestamp}.pkl"
        embedding_path = str(user_dir / embedding_filename)

        # Créer le modèle avec les caractéristiques vocales du locuteur principal
        model = VoiceModel(
            user_id=user_id,
            embedding_path=embedding_path,
            audio_count=len(valid_paths),
            total_duration_ms=extracted_duration_ms,  # Durée extraite, pas originale
            quality_score=quality_score,
            profile_id=profile_id,
            version=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            next_recalibration_at=datetime.now() + timedelta(days=self.VOICE_MODEL_MAX_AGE_DAYS),
            embedding=embedding,
            voice_characteristics=primary_voice_chars  # Caractéristiques du locuteur principal
        )

        # Générer l'empreinte vocale unique
        if model.voice_characteristics or model.embedding is not None:
            fingerprint = model.generate_fingerprint()
            if fingerprint:
                logger.info(f"[VOICE_CLONE] Empreinte vocale: {fingerprint.fingerprint_id}")

        # Sauvegarder
        await self._save_model_to_cache(model)

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(f"[VOICE_CLONE] ✅ Modèle créé pour {user_id}: quality={quality_score:.2f}, time={processing_time}ms")

        return model

    async def _improve_model(
        self,
        existing_model: VoiceModel,
        new_audio_path: str
    ) -> VoiceModel:
        """
        Améliore un modèle existant avec un nouvel audio.

        RÈGLE: La mise à jour n'est effectuée QUE si la signature vocale
        du nouvel audio correspond au profil existant (similarité > 80%).
        """
        logger.info(f"[VOICE_CLONE] 🔄 Vérification amélioration modèle pour {existing_model.user_id}")

        voice_analyzer = get_voice_analyzer()

        # Charger l'embedding existant si nécessaire
        if existing_model.embedding is None:
            existing_model = await self._load_embedding(existing_model)

        # Vérifier si la signature correspond avant mise à jour
        if existing_model.fingerprint:
            metadata = await voice_analyzer.analyze_audio(new_audio_path)
            can_update, reason, matched_speaker = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=0.80
            )

            if not can_update:
                logger.warning(
                    f"[VOICE_CLONE] ⚠️ Mise à jour refusée pour {existing_model.user_id}: {reason}"
                )
                # Retourner le modèle existant sans modification
                return existing_model

            logger.info(f"[VOICE_CLONE] ✅ Signature vocale vérifiée: {reason}")

        # Extraire embedding du nouvel audio
        user_dir = self.voice_cache_dir / existing_model.user_id / "temp"
        user_dir.mkdir(parents=True, exist_ok=True)

        new_embedding = await self._extract_voice_embedding(new_audio_path, user_dir)

        if existing_model.embedding is not None and new_embedding is not None:
            # Moyenne pondérée (plus de poids aux anciens pour stabilité)
            improved_embedding = (
                self.IMPROVEMENT_WEIGHT_OLD * existing_model.embedding +
                self.IMPROVEMENT_WEIGHT_NEW * new_embedding
            )
        else:
            improved_embedding = new_embedding if new_embedding is not None else existing_model.embedding

        # Mettre à jour le modèle
        existing_model.embedding = improved_embedding
        existing_model.updated_at = datetime.now()
        existing_model.audio_count += 1
        existing_model.quality_score = min(1.0, existing_model.quality_score + 0.05)
        existing_model.version += 1
        existing_model.next_recalibration_at = datetime.now() + timedelta(days=self.VOICE_MODEL_MAX_AGE_DAYS)

        # Régénérer l'empreinte vocale avec le nouvel embedding
        if existing_model.voice_characteristics:
            existing_model.generate_fingerprint()

        # Sauvegarder
        await self._save_model_to_cache(existing_model)

        logger.info(f"[VOICE_CLONE] ✅ Modèle amélioré pour {existing_model.user_id} (v{existing_model.version})")
        return existing_model

    async def _extract_voice_embedding(self, audio_path: str, target_dir: Path) -> Optional[np.ndarray]:
        """Extrait l'embedding de voix d'un fichier audio"""
        if not OPENVOICE_AVAILABLE or self.se_extractor_module is None:
            logger.warning("[VOICE_CLONE] OpenVoice non disponible, embedding factice")
            return np.zeros(256)  # Embedding factice

        try:
            loop = asyncio.get_event_loop()
            embedding = await loop.run_in_executor(
                None,
                lambda: self.se_extractor_module.get_se(
                    audio_path,
                    self.tone_color_converter,
                    target_dir=str(target_dir)
                )
            )
            return embedding
        except Exception as e:
            logger.error(f"[VOICE_CLONE] ❌ Erreur extraction embedding: {e}")
            return np.zeros(256)

    async def _concatenate_audios(self, audio_paths: List[str], user_id: str) -> str:
        """Concatène plusieurs fichiers audio en un seul"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return audio_paths[0]  # Retourner le premier si pas de processing

        try:
            combined = AudioSegment.empty()
            for path in audio_paths:
                try:
                    audio = AudioSegment.from_file(path)
                    combined += audio
                except Exception as e:
                    logger.warning(f"[VOICE_CLONE] Impossible de lire {path}: {e}")

            # Sauvegarder le fichier combiné
            output_path = self.voice_cache_dir / user_id / "combined_audio.wav"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            combined.export(str(output_path), format="wav")

            return str(output_path)

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur concaténation: {e}")
            return audio_paths[0]

    async def _get_user_audio_history(
        self,
        user_id: str,
        exclude: Optional[List[str]] = None,
        limit: int = None
    ) -> List[str]:
        """
        Récupère l'historique des messages audio d'un utilisateur.
        Utilise la base de données pour trouver les attachements audio.
        """
        limit = limit or self.MAX_AUDIO_HISTORY
        exclude = exclude or []

        if not self.database_service:
            logger.warning("[VOICE_CLONE] Database service non disponible")
            return []

        try:
            # Requête pour récupérer les audios de l'utilisateur
            attachments = await self.database_service.prisma.messageattachment.find_many(
                where={
                    "message": {
                        "senderId": user_id
                    },
                    "mimeType": {
                        "startswith": "audio/"
                    }
                },
                order={"createdAt": "desc"},
                take=limit
            )

            # Filtrer les fichiers existants
            audio_paths = []
            for att in attachments:
                if att.filePath and att.filePath not in exclude and os.path.exists(att.filePath):
                    audio_paths.append(att.filePath)

            logger.info(f"[VOICE_CLONE] 📚 {len(audio_paths)} audios historiques trouvés pour {user_id}")
            return audio_paths

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur récupération historique: {e}")
            return []

    async def _get_best_audio_for_cloning(
        self,
        user_id: str,
        limit: int = 10
    ) -> Optional[AudioQualityMetadata]:
        """
        Sélectionne le meilleur audio pour le clonage vocal.
        Critères (par ordre de priorité):
        1. Le plus long
        2. Le plus clair (sans bruit)
        3. Sans autres locuteurs
        4. Le plus récent

        Returns:
            AudioQualityMetadata du meilleur audio, ou None si aucun audio trouvé
        """
        if not self.database_service:
            logger.warning("[VOICE_CLONE] Database service non disponible")
            return None

        try:
            # Requête pour récupérer les audios avec métadonnées de qualité
            attachments = await self.database_service.prisma.messageattachment.find_many(
                where={
                    "message": {
                        "senderId": user_id
                    },
                    "mimeType": {
                        "startswith": "audio/"
                    }
                },
                order={"createdAt": "desc"},
                take=limit
            )

            if not attachments:
                return None

            # Convertir en AudioQualityMetadata et calculer les scores
            quality_audios: List[AudioQualityMetadata] = []
            for att in attachments:
                if att.filePath and os.path.exists(att.filePath):
                    duration_ms = await self._get_audio_duration_ms(att.filePath)

                    # Extraire les métadonnées de qualité si disponibles
                    # Ces champs doivent être ajoutés au schéma Prisma de MessageAttachment
                    noise_level = getattr(att, 'noiseLevel', 0.0) or 0.0
                    clarity_score = getattr(att, 'clarityScore', 1.0) or 1.0
                    has_other_speakers = getattr(att, 'hasOtherSpeakers', False) or False

                    audio_meta = AudioQualityMetadata(
                        attachment_id=att.id,
                        file_path=att.filePath,
                        duration_ms=duration_ms,
                        noise_level=noise_level,
                        clarity_score=clarity_score,
                        has_other_speakers=has_other_speakers,
                        created_at=att.createdAt if hasattr(att, 'createdAt') else datetime.now()
                    )
                    audio_meta.calculate_overall_score()
                    quality_audios.append(audio_meta)

            if not quality_audios:
                return None

            # Trier par score décroissant et retourner le meilleur
            quality_audios.sort(key=lambda x: x.overall_score, reverse=True)
            best_audio = quality_audios[0]

            logger.info(
                f"[VOICE_CLONE] 🎯 Meilleur audio sélectionné pour {user_id}: "
                f"id={best_audio.attachment_id}, duration={best_audio.duration_ms}ms, "
                f"score={best_audio.overall_score:.2f}"
            )
            return best_audio

        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur sélection meilleur audio: {e}")
            return None

    async def _calculate_total_duration(self, audio_paths: List[str]) -> int:
        """Calcule la durée totale de plusieurs fichiers audio"""
        total = 0
        for path in audio_paths:
            duration = await self._get_audio_duration_ms(path)
            total += duration
        return total

    async def _get_audio_duration_ms(self, audio_path: str) -> int:
        """Récupère la durée d'un fichier audio en millisecondes"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return 0

        try:
            import librosa
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            return int(duration * 1000)
        except Exception as e:
            logger.warning(f"[VOICE_CLONE] Impossible de lire la durée de {audio_path}: {e}")
            return 0

    def _calculate_quality_score(self, duration_ms: int, audio_count: int) -> float:
        """
        Calcule un score de qualité basé sur la durée et le nombre d'audios.

        - 0-10s: 0.3 (faible)
        - 10-30s: 0.5 (moyen)
        - 30-60s: 0.7 (bon)
        - 60s+: 0.9 (excellent)
        - Bonus: +0.05 par audio supplémentaire (max +0.1)
        """
        if duration_ms < 10_000:
            base_score = 0.3
        elif duration_ms < 30_000:
            base_score = 0.5
        elif duration_ms < 60_000:
            base_score = 0.7
        else:
            base_score = 0.9

        audio_bonus = min(0.1, (audio_count - 1) * 0.05)
        return min(1.0, base_score + audio_bonus)

    async def _load_cached_model(self, user_id: str) -> Optional[VoiceModel]:
        """Charge un modèle depuis le cache fichier: {voice_cache_dir}/{user_id}/metadata.json"""
        metadata_path = self.voice_cache_dir / user_id / "metadata.json"

        if not metadata_path.exists():
            return None

        try:
            with open(metadata_path, 'r') as f:
                data = json.load(f)
            return VoiceModel.from_dict(data)
        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur chargement cache {user_id}: {e}")
            return None

    async def _load_embedding(self, model: VoiceModel) -> VoiceModel:
        """Charge l'embedding d'un modèle depuis le fichier pickle"""
        try:
            with open(model.embedding_path, 'rb') as f:
                model.embedding = pickle.load(f)
        except Exception as e:
            logger.error(f"[VOICE_CLONE] Erreur chargement embedding: {e}")
            model.embedding = np.zeros(256)
        return model

    async def _save_model_to_cache(self, model: VoiceModel):
        """Sauvegarde un modèle dans le cache fichier: {voice_cache_dir}/{user_id}/"""
        user_dir = self.voice_cache_dir / model.user_id
        user_dir.mkdir(parents=True, exist_ok=True)

        # Sauvegarder les métadonnées: {user_id}/metadata.json
        metadata_path = user_dir / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(model.to_dict(), f, indent=2)

        # Sauvegarder l'embedding: {user_id}/{userId}_{profileId}_{timestamp}.pkl
        if model.embedding is not None:
            with open(model.embedding_path, 'wb') as f:
                pickle.dump(model.embedding, f)

        logger.info(f"[VOICE_CLONE] 💾 Modèle sauvegardé: {user_dir}")

    async def schedule_quarterly_recalibration(self):
        """
        Tâche planifiée pour recalibrer les modèles de voix trimestriellement (tous les 3 mois).
        À exécuter via un cron job ou un scheduler.
        Sélectionne le meilleur audio: le plus long, le plus clair, sans bruit, le plus récent.
        """
        logger.info("[VOICE_CLONE] 🔄 Démarrage recalibration trimestrielle...")

        # Lister tous les modèles en cache
        all_models = await self._list_all_cached_models()

        recalibrated = 0
        for model in all_models:
            if model.next_recalibration_at and datetime.now() >= model.next_recalibration_at:
                logger.info(f"[VOICE_CLONE] 🔄 Recalibration pour {model.user_id}")

                # Sélectionner le meilleur audio basé sur les critères de qualité
                best_audio = await self._get_best_audio_for_cloning(model.user_id)

                if best_audio:
                    # Utiliser le meilleur audio pour régénérer le modèle
                    await self._create_voice_model(
                        model.user_id,
                        [best_audio.file_path],
                        best_audio.duration_ms
                    )
                    recalibrated += 1
                    logger.info(
                        f"[VOICE_CLONE] ✅ Modèle recalibré pour {model.user_id} "
                        f"avec audio {best_audio.attachment_id} (score: {best_audio.overall_score:.2f})"
                    )
                else:
                    # Fallback: utiliser l'historique audio classique
                    recent_audios = await self._get_user_audio_history(model.user_id)
                    if recent_audios:
                        total_duration = await self._calculate_total_duration(recent_audios)
                        await self._create_voice_model(
                            model.user_id,
                            recent_audios,
                            total_duration
                        )
                        recalibrated += 1

        logger.info(f"[VOICE_CLONE] ✅ Recalibration trimestrielle terminée: {recalibrated} modèles mis à jour")

    async def _list_all_cached_models(self) -> List[VoiceModel]:
        """Liste tous les modèles en cache: parcourt {voice_cache_dir}/{user_id}/"""
        models = []
        for user_dir in self.voice_cache_dir.iterdir():
            if user_dir.is_dir():
                model = await self._load_cached_model(user_dir.name)
                if model:
                    models.append(model)
        return models

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        all_models = await self._list_all_cached_models()
        return {
            "service": "VoiceCloneService",
            "initialized": self.is_initialized,
            "openvoice_available": OPENVOICE_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "cache_dir": str(self.voice_cache_dir),
            "device": self.device,
            "cached_models_count": len(all_models),
            "min_audio_duration_ms": self.MIN_AUDIO_DURATION_MS,
            "max_age_days": self.VOICE_MODEL_MAX_AGE_DAYS
        }

    # =========================================================================
    # TRADUCTION MULTI-VOIX
    # =========================================================================

    async def prepare_multi_speaker_translation(
        self,
        audio_path: str,
        user_id: str,
        temp_dir: str
    ) -> MultiSpeakerTranslationContext:
        """
        Prépare le contexte pour une traduction audio multi-locuteurs.

        Cette méthode:
        1. Analyse l'audio pour détecter tous les locuteurs
        2. Extrait l'audio de chaque locuteur séparément
        3. Crée des profils temporaires (non cachés)
        4. Si l'utilisateur a un profil existant, identifie sa voix

        Args:
            audio_path: Chemin vers l'audio source
            user_id: ID de l'utilisateur émetteur
            temp_dir: Répertoire pour les fichiers temporaires

        Returns:
            MultiSpeakerTranslationContext avec tous les profils prêts
        """
        logger.info(f"[VOICE_CLONE] 🎭 Préparation traduction multi-voix: {audio_path}")

        voice_analyzer = get_voice_analyzer()

        # 1. Extraire l'audio de chaque locuteur
        speakers_audio = await voice_analyzer.extract_all_speakers_audio(
            audio_path,
            temp_dir,
            min_segment_duration_ms=100
        )

        if not speakers_audio:
            raise ValueError("Aucun locuteur détecté dans l'audio")

        # 2. Récupérer le profil utilisateur existant (si disponible)
        user_model = await self._load_cached_model(user_id)
        user_fingerprint = user_model.fingerprint if user_model else None

        # 3. Créer les profils temporaires
        profiles: List[TemporaryVoiceProfile] = []
        user_profile: Optional[TemporaryVoiceProfile] = None

        # Récupérer la durée totale
        total_duration_ms = await self._get_audio_duration_ms(audio_path)

        for speaker_id, (speaker_audio_path, speaker_info) in speakers_audio.items():
            # Extraire l'embedding temporaire
            temp_embedding = await self._extract_voice_embedding(
                speaker_audio_path,
                Path(temp_dir)
            )

            profile = TemporaryVoiceProfile(
                speaker_id=speaker_id,
                speaker_info=speaker_info,
                audio_path=speaker_audio_path,
                embedding=temp_embedding,
                original_segments=speaker_info.segments
            )

            # Vérifier si ce locuteur correspond à l'utilisateur
            if user_fingerprint and speaker_info.fingerprint:
                similarity = user_fingerprint.similarity_score(speaker_info.fingerprint)
                if similarity >= 0.75:
                    profile.matched_user_id = user_id
                    profile.is_user_match = True
                    user_profile = profile
                    logger.info(
                        f"[VOICE_CLONE] 🎯 Utilisateur {user_id} identifié: "
                        f"{speaker_id} (similarité: {similarity:.0%})"
                    )

            profiles.append(profile)

        # 4. Créer le contexte
        context = MultiSpeakerTranslationContext(
            source_audio_path=audio_path,
            source_duration_ms=total_duration_ms,
            speaker_count=len(profiles),
            profiles=profiles,
            user_profile=user_profile
        )

        logger.info(
            f"[VOICE_CLONE] ✅ Contexte multi-voix prêt: "
            f"{len(profiles)} locuteurs, utilisateur identifié: {user_profile is not None}"
        )

        return context

    async def should_update_user_profile(
        self,
        user_id: str,
        audio_path: str
    ) -> Tuple[bool, str]:
        """
        Détermine si le profil utilisateur doit être mis à jour avec cet audio.

        Règles:
        - Création: Un seul locuteur principal (>70% du temps de parole)
        - Mise à jour: Signature vocale doit correspondre au profil existant (>80%)

        Args:
            user_id: ID de l'utilisateur
            audio_path: Chemin vers l'audio

        Returns:
            Tuple[bool, str]: (doit mettre à jour, raison)
        """
        voice_analyzer = get_voice_analyzer()

        # Analyser l'audio
        metadata = await voice_analyzer.analyze_audio(audio_path)

        # Charger le profil existant
        existing_model = await self._load_cached_model(user_id)

        if existing_model and existing_model.fingerprint:
            # Vérifier si on peut METTRE À JOUR
            can_update, reason, _ = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=0.80
            )
            if can_update:
                return True, f"Mise à jour possible: {reason}"
            else:
                return False, f"Mise à jour impossible: {reason}"
        else:
            # Vérifier si on peut CRÉER
            can_create, reason = voice_analyzer.can_create_user_profile(metadata)
            if can_create:
                return True, f"Création possible: {reason}"
            else:
                return False, f"Création impossible: {reason}"

    async def cleanup_temp_profiles(self, context: MultiSpeakerTranslationContext):
        """
        Nettoie les fichiers temporaires d'une traduction multi-voix.

        Args:
            context: Contexte de traduction à nettoyer
        """
        for profile in context.profiles:
            try:
                if os.path.exists(profile.audio_path):
                    os.remove(profile.audio_path)
                    logger.debug(f"[VOICE_CLONE] Nettoyage: {profile.audio_path}")
            except Exception as e:
                logger.warning(f"[VOICE_CLONE] Erreur nettoyage {profile.audio_path}: {e}")

    async def close(self):
        """Libère les ressources"""
        logger.info("[VOICE_CLONE] 🛑 Fermeture du service")
        self.tone_color_converter = None
        self.se_extractor_module = None
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_voice_clone_service() -> VoiceCloneService:
    """Retourne l'instance singleton du service de clonage vocal"""
    return VoiceCloneService()
