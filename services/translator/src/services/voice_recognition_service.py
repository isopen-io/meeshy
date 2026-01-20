"""
Service de reconnaissance vocale (Voice Recognition)
Extrait les embeddings vocaux et calcule la similarité avec des profils utilisateur

Utilise:
- pyannote.audio pour extraction d'embeddings (précis)
- Fallback sur calcul de caractéristiques spectrales si pyannote non disponible
"""

import os
import logging
import numpy as np
from typing import Optional, List, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Flags de disponibilité
PYANNOTE_AVAILABLE = False
LIBROSA_AVAILABLE = False

try:
    from pyannote.audio import Inference
    from pyannote.audio.pipelines.speaker_verification import PretrainedSpeakerEmbedding
    PYANNOTE_AVAILABLE = True
    logger.info("✅ [VOICE_RECOGNITION] pyannote.audio disponible")
except ImportError:
    logger.warning("⚠️ [VOICE_RECOGNITION] pyannote.audio non disponible - fallback sur caractéristiques spectrales")

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ [VOICE_RECOGNITION] librosa non disponible")


class VoiceRecognitionService:
    """
    Service de reconnaissance vocale par embeddings.
    Compare les embeddings vocaux des locuteurs avec le profil utilisateur.
    """

    def __init__(self, hf_token: Optional[str] = None):
        """
        Args:
            hf_token: Token HuggingFace pour pyannote.audio
        """
        self.hf_token = hf_token or os.getenv("HF_TOKEN")
        self._embedding_model = None

    def _get_embedding_model(self):
        """Récupère le modèle d'extraction d'embeddings (lazy loading)"""
        if not PYANNOTE_AVAILABLE:
            return None

        if self._embedding_model is None and self.hf_token:
            try:
                # Utiliser le modèle d'embeddings de pyannote
                self._embedding_model = PretrainedSpeakerEmbedding(
                    "pyannote/embedding",
                    use_auth_token=self.hf_token
                )
                logger.info("[VOICE_RECOGNITION] Modèle d'embeddings chargé")
            except Exception as e:
                logger.warning(f"[VOICE_RECOGNITION] Échec chargement modèle embeddings: {e}")
                return None

        return self._embedding_model

    def extract_speaker_embedding(
        self,
        audio_path: str,
        start_time: float,
        end_time: float
    ) -> Optional[np.ndarray]:
        """
        Extrait l'embedding vocal d'un segment audio.

        Args:
            audio_path: Chemin vers le fichier audio
            start_time: Début du segment (secondes)
            end_time: Fin du segment (secondes)

        Returns:
            Embedding vocal (vecteur numpy) ou None si échec
        """
        model = self._get_embedding_model()

        if model is not None:
            # Méthode principale: pyannote.audio
            return self._extract_embedding_pyannote(model, audio_path, start_time, end_time)
        elif LIBROSA_AVAILABLE:
            # Fallback: caractéristiques spectrales avec librosa
            return self._extract_features_librosa(audio_path, start_time, end_time)
        else:
            logger.warning("[VOICE_RECOGNITION] Aucune méthode d'extraction disponible")
            return None

    def _extract_embedding_pyannote(
        self,
        model,
        audio_path: str,
        start_time: float,
        end_time: float
    ) -> Optional[np.ndarray]:
        """Extrait l'embedding avec pyannote.audio"""
        try:
            from pyannote.core import Segment
            from pyannote.audio import Audio

            # Charger le segment audio
            audio = Audio(sample_rate=16000, mono=True)
            waveform, sample_rate = audio.crop(audio_path, Segment(start_time, end_time))

            # Extraire l'embedding
            embedding = model({"waveform": waveform, "sample_rate": sample_rate})

            # Convertir en numpy array
            if hasattr(embedding, 'numpy'):
                return embedding.numpy()
            elif hasattr(embedding, 'cpu'):
                return embedding.cpu().numpy()
            else:
                return np.array(embedding)

        except Exception as e:
            logger.error(f"[VOICE_RECOGNITION] Erreur extraction pyannote: {e}")
            return None

    def _extract_features_librosa(
        self,
        audio_path: str,
        start_time: float,
        end_time: float
    ) -> Optional[np.ndarray]:
        """
        Fallback: extrait des caractéristiques spectrales avec librosa.
        Moins précis que les embeddings mais fonctionne sans pyannote.
        """
        try:
            # Charger l'audio
            y, sr = librosa.load(audio_path, sr=22050)

            # Extraire le segment
            start_sample = int(start_time * sr)
            end_sample = int(end_time * sr)
            segment = y[start_sample:end_sample]

            if len(segment) < 1024:  # Segment trop court
                return None

            # Extraire MFCC (Mel-Frequency Cepstral Coefficients)
            mfcc = librosa.feature.mfcc(y=segment, sr=sr, n_mfcc=13)
            mfcc_mean = np.mean(mfcc, axis=1)

            # Extraire spectral features
            spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=segment, sr=sr))
            spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=segment, sr=sr))
            zero_crossing_rate = np.mean(librosa.feature.zero_crossing_rate(segment))

            # Combiner les features
            features = np.concatenate([
                mfcc_mean,
                [spectral_centroid, spectral_rolloff, zero_crossing_rate]
            ])

            return features

        except Exception as e:
            logger.error(f"[VOICE_RECOGNITION] Erreur extraction librosa: {e}")
            return None

    def compute_similarity(
        self,
        embedding1: np.ndarray,
        embedding2: np.ndarray
    ) -> float:
        """
        Calcule la similarité cosinus entre deux embeddings.

        Args:
            embedding1: Premier embedding
            embedding2: Deuxième embedding

        Returns:
            Score de similarité (0-1)
        """
        try:
            # Normaliser les vecteurs
            norm1 = np.linalg.norm(embedding1)
            norm2 = np.linalg.norm(embedding2)

            if norm1 == 0 or norm2 == 0:
                return 0.0

            # Similarité cosinus
            similarity = np.dot(embedding1, embedding2) / (norm1 * norm2)

            # Convertir de [-1, 1] à [0, 1]
            similarity = (similarity + 1.0) / 2.0

            # Clip entre 0 et 1
            return float(np.clip(similarity, 0.0, 1.0))

        except Exception as e:
            logger.error(f"[VOICE_RECOGNITION] Erreur calcul similarité: {e}")
            return 0.0

    def compute_speaker_similarity(
        self,
        audio_path: str,
        speaker_segments: List[Dict[str, Any]],
        user_voice_profile: Optional[Dict[str, Any]] = None
    ) -> Dict[str, float]:
        """
        Calcule le score de similarité entre chaque locuteur et le profil utilisateur.

        Args:
            audio_path: Chemin vers le fichier audio
            speaker_segments: Liste des segments par locuteur
                Format: [{"speaker_id": "speaker_0", "start_ms": 0, "end_ms": 1000, ...}]
            user_voice_profile: Profil vocal de l'utilisateur
                Format: {"embedding": [...], "characteristics": {...}}

        Returns:
            Dict mapping speaker_id -> score de similarité (0-1)
        """
        if not user_voice_profile or 'embedding' not in user_voice_profile:
            logger.warning("[VOICE_RECOGNITION] Pas de profil vocal utilisateur - impossible de calculer la similarité")
            return {}

        user_embedding = np.array(user_voice_profile['embedding'])
        similarity_scores = {}

        for speaker_segment in speaker_segments:
            speaker_id = speaker_segment.get('speaker_id')
            start_ms = speaker_segment.get('start_ms', 0)
            end_ms = speaker_segment.get('end_ms', 0)

            # Convertir ms en secondes
            start_time = start_ms / 1000.0
            end_time = end_ms / 1000.0

            # Extraire l'embedding du locuteur
            speaker_embedding = self.extract_speaker_embedding(
                audio_path,
                start_time,
                end_time
            )

            if speaker_embedding is not None:
                # Calculer la similarité
                similarity = self.compute_similarity(speaker_embedding, user_embedding)
                similarity_scores[speaker_id] = similarity

                logger.info(
                    f"[VOICE_RECOGNITION] {speaker_id}: similarité = {similarity:.3f}"
                )
            else:
                # Pas d'embedding → score par défaut
                similarity_scores[speaker_id] = 0.0
                logger.warning(f"[VOICE_RECOGNITION] {speaker_id}: impossible d'extraire l'embedding")

        return similarity_scores

    def identify_user_speaker(
        self,
        audio_path: str,
        speaker_segments: List[Dict[str, Any]],
        user_voice_profile: Optional[Dict[str, Any]] = None,
        threshold: float = 0.6
    ) -> tuple[Optional[str], Dict[str, float]]:
        """
        Identifie le locuteur qui correspond le mieux au profil utilisateur.

        Args:
            audio_path: Chemin vers le fichier audio
            speaker_segments: Liste des segments par locuteur
            user_voice_profile: Profil vocal de l'utilisateur
            threshold: Seuil minimum de similarité pour considérer une correspondance

        Returns:
            Tuple (speaker_id de l'utilisateur ou None, Dict de tous les scores)
        """
        scores = self.compute_speaker_similarity(
            audio_path,
            speaker_segments,
            user_voice_profile
        )

        if not scores:
            return None, {}

        # Trouver le locuteur avec le score le plus élevé
        best_speaker_id = max(scores, key=scores.get)
        best_score = scores[best_speaker_id]

        if best_score >= threshold:
            logger.info(
                f"[VOICE_RECOGNITION] Utilisateur identifié: {best_speaker_id} "
                f"(score: {best_score:.3f})"
            )
            return best_speaker_id, scores
        else:
            logger.info(
                f"[VOICE_RECOGNITION] Utilisateur non identifié "
                f"(meilleur score: {best_score:.3f} < seuil {threshold})"
            )
            return None, scores


# Fonction helper singleton
_voice_recognition_service = None


def get_voice_recognition_service() -> VoiceRecognitionService:
    """Retourne l'instance singleton du service de reconnaissance vocale"""
    global _voice_recognition_service
    if _voice_recognition_service is None:
        _voice_recognition_service = VoiceRecognitionService()
    return _voice_recognition_service
