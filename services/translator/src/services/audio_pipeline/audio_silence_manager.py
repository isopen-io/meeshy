"""
Audio Silence Manager
=====================

Gère la détection, la préservation et la génération de silences audio
pour maintenir le timing naturel lors de la synthèse multi-speakers.

Fonctionnalités:
- Détection des silences entre segments
- Génération de fichiers de silence
- Calcul des durées de silence naturelles
- Support pour l'option de suppression des silences (future)
"""

import os
import logging
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Flags de disponibilité
PYDUB_AVAILABLE = False
try:
    from pydub import AudioSegment
    from pydub.silence import detect_silence
    PYDUB_AVAILABLE = True
    logger.info("✅ [SILENCE_MANAGER] pydub disponible")
except ImportError:
    logger.warning("⚠️ [SILENCE_MANAGER] pydub non disponible - fonctionnalités limitées")


@dataclass
class SilenceSegment:
    """Représente un segment de silence entre deux segments de parole"""
    start_ms: int
    end_ms: int
    duration_ms: int
    before_segment_index: int  # Index du segment précédent
    after_segment_index: int   # Index du segment suivant


@dataclass
class AudioSegmentWithSilence:
    """Représente un segment audio avec ses silences avant/après"""
    segment_index: int
    text: str
    speaker_id: str
    start_ms: int
    end_ms: int
    duration_ms: int
    silence_before_ms: int
    silence_after_ms: int
    is_last: bool


class AudioSilenceManager:
    """
    Gestionnaire de silences audio pour la synthèse multi-speakers.

    Responsabilités:
    - Analyser les silences dans l'audio source
    - Générer des fichiers de silence aux bonnes durées
    - Calculer les timing naturels pour la concaténation
    - Gérer l'option de préservation/suppression des silences
    """

    def __init__(
        self,
        preserve_silences: bool = True,
        min_silence_ms: int = 100,
        max_silence_ms: int = 3000,
        silence_threshold_db: int = -40
    ):
        """
        Initialise le gestionnaire de silences.

        Args:
            preserve_silences: Préserver les silences naturels (True) ou les supprimer (False)
            min_silence_ms: Durée minimale pour considérer un silence
            max_silence_ms: Durée maximale d'un silence (capping)
            silence_threshold_db: Seuil en dB pour détecter un silence
        """
        self.preserve_silences = preserve_silences
        self.min_silence_ms = min_silence_ms
        self.max_silence_ms = max_silence_ms
        self.silence_threshold_db = silence_threshold_db

        logger.info(
            f"[SILENCE_MANAGER] Initialisé: "
            f"preserve={preserve_silences}, "
            f"min={min_silence_ms}ms, "
            f"max={max_silence_ms}ms"
        )

    def detect_silences_from_segments(
        self,
        segments: List[Dict[str, Any]]
    ) -> List[SilenceSegment]:
        """
        Détecte les silences entre les segments de transcription.

        Args:
            segments: Liste des segments avec start_ms et end_ms

        Returns:
            Liste des silences détectés entre les segments
        """
        if not segments:
            return []

        silences = []

        for i in range(len(segments) - 1):
            current_seg = segments[i]
            next_seg = segments[i + 1]

            # Calculer le gap entre la fin du segment actuel et le début du suivant
            silence_start = current_seg.get('end_ms', current_seg.get('endMs', 0))
            silence_end = next_seg.get('start_ms', next_seg.get('startMs', 0))
            silence_duration = silence_end - silence_start

            # Ne garder que les silences significatifs
            if silence_duration >= self.min_silence_ms:
                # Capper à la durée max
                if silence_duration > self.max_silence_ms:
                    logger.debug(
                        f"[SILENCE_MANAGER] Silence trop long détecté: "
                        f"{silence_duration}ms → cappé à {self.max_silence_ms}ms"
                    )
                    silence_duration = self.max_silence_ms
                    silence_end = silence_start + silence_duration

                silences.append(SilenceSegment(
                    start_ms=silence_start,
                    end_ms=silence_end,
                    duration_ms=silence_duration,
                    before_segment_index=i,
                    after_segment_index=i + 1
                ))

        logger.info(
            f"[SILENCE_MANAGER] Silences détectés: {len(silences)} "
            f"(durée totale: {sum(s.duration_ms for s in silences)}ms)"
        )

        return silences

    def create_segments_with_silence(
        self,
        segments: List[Dict[str, Any]],
        silences: List[SilenceSegment]
    ) -> List[AudioSegmentWithSilence]:
        """
        Crée une liste de segments enrichis avec leurs silences avant/après.

        Args:
            segments: Segments de transcription
            silences: Silences détectés

        Returns:
            Liste de segments avec informations de silence
        """
        if not segments:
            return []

        # Créer un dict pour accès rapide aux silences
        silence_before = {}  # segment_index → silence_duration_ms
        silence_after = {}   # segment_index → silence_duration_ms

        for silence in silences:
            silence_after[silence.before_segment_index] = silence.duration_ms
            silence_before[silence.after_segment_index] = silence.duration_ms

        # Construire les segments enrichis
        enriched_segments = []
        for i, seg in enumerate(segments):
            # Si l'option preserve_silences est False, mettre les silences à 0
            silence_before_ms = silence_before.get(i, 0) if self.preserve_silences else 0
            silence_after_ms = silence_after.get(i, 0) if self.preserve_silences else 0

            enriched_segments.append(AudioSegmentWithSilence(
                segment_index=i,
                text=seg.get('text', ''),
                speaker_id=seg.get('speaker_id', seg.get('speakerId', 'unknown')),
                start_ms=seg.get('start_ms', seg.get('startMs', 0)),
                end_ms=seg.get('end_ms', seg.get('endMs', 0)),
                duration_ms=(seg.get('end_ms', seg.get('endMs', 0)) -
                           seg.get('start_ms', seg.get('startMs', 0))),
                silence_before_ms=silence_before_ms,
                silence_after_ms=silence_after_ms,
                is_last=(i == len(segments) - 1)
            ))

        logger.info(
            f"[SILENCE_MANAGER] Segments enrichis: {len(enriched_segments)}, "
            f"preserve_silences={self.preserve_silences}"
        )

        return enriched_segments

    async def generate_silence_audio(
        self,
        duration_ms: int,
        output_path: str,
        sample_rate: int = 24000,
        format: str = "mp3"
    ) -> Optional[str]:
        """
        Génère un fichier audio de silence.

        Args:
            duration_ms: Durée du silence en millisecondes
            output_path: Chemin de sortie du fichier
            sample_rate: Taux d'échantillonnage
            format: Format audio (mp3, wav)

        Returns:
            Chemin du fichier généré ou None en cas d'erreur
        """
        if not PYDUB_AVAILABLE:
            logger.warning("[SILENCE_MANAGER] pydub non disponible, impossible de générer le silence")
            return None

        try:
            # Créer un segment silencieux
            silence = AudioSegment.silent(duration=duration_ms, frame_rate=sample_rate)

            # Créer le répertoire si nécessaire
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            # Exporter
            silence.export(output_path, format=format)

            logger.debug(f"[SILENCE_MANAGER] Silence généré: {duration_ms}ms → {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"[SILENCE_MANAGER] Erreur génération silence: {e}")
            return None

    async def concatenate_audio_with_silences(
        self,
        audio_files: List[str],
        silences_ms: List[int],
        output_path: str,
        format: str = "mp3"
    ) -> Optional[str]:
        """
        Concatène plusieurs fichiers audio avec des silences entre eux.

        Args:
            audio_files: Liste des fichiers audio à concaténer
            silences_ms: Liste des durées de silence (len = len(audio_files) - 1)
            output_path: Chemin du fichier de sortie
            format: Format de sortie

        Returns:
            Chemin du fichier concaténé ou None en cas d'erreur
        """
        if not PYDUB_AVAILABLE:
            logger.warning("[SILENCE_MANAGER] pydub non disponible, impossible de concaténer")
            return None

        if not audio_files:
            logger.warning("[SILENCE_MANAGER] Aucun fichier audio à concaténer")
            return None

        try:
            logger.info(
                f"[SILENCE_MANAGER] Concaténation: {len(audio_files)} fichiers, "
                f"{len(silences_ms)} silences"
            )

            # Charger le premier fichier
            combined = AudioSegment.from_file(audio_files[0])

            # Ajouter les fichiers suivants avec silences
            for i in range(1, len(audio_files)):
                # Ajouter le silence si spécifié
                if i - 1 < len(silences_ms) and silences_ms[i - 1] > 0:
                    silence_duration = silences_ms[i - 1]
                    silence = AudioSegment.silent(
                        duration=silence_duration,
                        frame_rate=combined.frame_rate
                    )
                    combined += silence
                    logger.debug(f"[SILENCE_MANAGER] Ajout silence: {silence_duration}ms")

                # Ajouter le fichier audio
                audio = AudioSegment.from_file(audio_files[i])
                combined += audio
                logger.debug(f"[SILENCE_MANAGER] Ajout audio: {audio_files[i]}")

            # Créer le répertoire si nécessaire
            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            # Exporter
            combined.export(output_path, format=format)

            total_duration = len(combined)
            logger.info(
                f"[SILENCE_MANAGER] ✅ Concaténation terminée: "
                f"{output_path} (durée: {total_duration}ms)"
            )

            return output_path

        except Exception as e:
            logger.error(f"[SILENCE_MANAGER] Erreur concaténation: {e}")
            import traceback
            traceback.print_exc()
            return None

    def get_total_silence_duration(self, silences: List[SilenceSegment]) -> int:
        """Calcule la durée totale des silences"""
        return sum(s.duration_ms for s in silences)

    def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du gestionnaire"""
        return {
            "preserve_silences": self.preserve_silences,
            "min_silence_ms": self.min_silence_ms,
            "max_silence_ms": self.max_silence_ms,
            "silence_threshold_db": self.silence_threshold_db,
            "pydub_available": PYDUB_AVAILABLE
        }


# Factory function
def create_silence_manager(
    preserve_silences: bool = True,
    min_silence_ms: int = 100,
    max_silence_ms: int = 3000,
    silence_threshold_db: int = -40
) -> AudioSilenceManager:
    """
    Crée une instance de AudioSilenceManager.

    Args:
        preserve_silences: Préserver les silences naturels
        min_silence_ms: Durée minimale d'un silence
        max_silence_ms: Durée maximale d'un silence
        silence_threshold_db: Seuil de détection

    Returns:
        Instance de AudioSilenceManager
    """
    return AudioSilenceManager(
        preserve_silences=preserve_silences,
        min_silence_ms=min_silence_ms,
        max_silence_ms=max_silence_ms,
        silence_threshold_db=silence_threshold_db
    )
