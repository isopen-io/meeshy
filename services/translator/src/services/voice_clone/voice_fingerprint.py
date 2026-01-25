"""
Empreinte vocale unique pour identification et vérification de locuteurs.
Génère des signatures cryptographiques basées sur les caractéristiques vocales.
"""

import hashlib
import struct
import numpy as np
from typing import Dict, Any, TYPE_CHECKING
from dataclasses import dataclass, field
from datetime import datetime

if TYPE_CHECKING:
    from .voice_metadata import VoiceCharacteristics


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
    embedding_vector: list[float] = field(default_factory=list)  # Vecteur normalisé

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
