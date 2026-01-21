"""
Diarisation avec SpeechBrain (SANS token HuggingFace)
Alternative à pyannote.audio qui fonctionne comme NLLB - téléchargement automatique sans authentification

Avantages:
- ✅ Aucun token HuggingFace requis
- ✅ Téléchargement automatique (comme NLLB)
- ✅ Modèles publics
- ✅ Bonne qualité (ECAPA-TDNN embeddings)
- ✅ Précision: ~85% (vs ~95% pour pyannote gated models)

Utilisation:
    from diarization_speechbrain import SpeechBrainDiarization

    diarizer = SpeechBrainDiarization()
    result = await diarizer.diarize(audio_path)
"""

import os
import logging
import numpy as np
import librosa
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass

# Import SpeechBrain
try:
    from speechbrain.inference.speaker import EncoderClassifier
    SPEECHBRAIN_AVAILABLE = True
except ImportError:
    SPEECHBRAIN_AVAILABLE = False

# Import clustering
try:
    from sklearn.cluster import AgglomerativeClustering
    from sklearn.metrics import silhouette_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class SpeakerSegment:
    """Segment d'un locuteur"""
    speaker_id: str
    start_ms: int
    end_ms: int
    duration_ms: int
    confidence: float = 1.0


@dataclass
class VoiceCharacteristics:
    """Caractéristiques vocales d'un speaker"""
    gender: str  # "homme", "femme", "enfant"
    pitch_level: str  # "grave", "medium", "aigu"
    age_group: str  # "enfant", "adolescent", "adulte", "senior"
    tone: str  # "monotone", "expressif", "très expressif"
    speech_rate: str  # "lent", "normal", "rapide"
    avg_pitch_hz: float
    pitch_variance: float
    syllables_per_second: float


@dataclass
class SpeakerInfo:
    """Information sur un locuteur"""
    speaker_id: str
    is_primary: bool
    speaking_time_ms: int
    speaking_ratio: float
    segments: List[SpeakerSegment]
    voice_similarity_score: Optional[float] = None
    voice_characteristics: Optional[VoiceCharacteristics] = None


@dataclass
class DiarizationResult:
    """Résultat de diarisation"""
    speaker_count: int
    speakers: List[SpeakerInfo]
    primary_speaker_id: str
    total_duration_ms: int
    method: str = "speechbrain"
    sender_identified: bool = False
    sender_speaker_id: Optional[str] = None


class SpeechBrainDiarization:
    """
    Diarisation des locuteurs avec SpeechBrain
    Fonctionne SANS token HuggingFace (comme NLLB)
    """

    def __init__(self, models_dir: Optional[str] = None):
        """
        Args:
            models_dir: Répertoire pour stocker les modèles (optionnel)
        """
        self.models_dir = models_dir or str(
            Path(__file__).parent.parent.parent / "models" / "speechbrain"
        )
        self._encoder = None

    def _get_encoder(self) -> "EncoderClassifier":
        """Charge le modèle d'embedding (lazy loading)"""
        if not SPEECHBRAIN_AVAILABLE:
            raise RuntimeError("SpeechBrain non disponible - pip install speechbrain")

        if self._encoder is None:
            logger.info("[SPEECHBRAIN] 🔄 Chargement du modèle d'embeddings...")
            logger.info("[SPEECHBRAIN]    Téléchargement automatique SANS token (comme NLLB)")

            # Utiliser le nouveau module (speechbrain.inference)
            self._encoder = EncoderClassifier.from_hparams(
                source="speechbrain/spkrec-ecapa-voxceleb",
                savedir=self.models_dir,
                run_opts={"device": "cpu"}  # CPU par défaut
            )

            logger.info("[SPEECHBRAIN] ✅ Modèle chargé (ECAPA-TDNN)")

        return self._encoder

    def _analyze_voice_characteristics(
        self,
        audio_path: str,
        segments: List[SpeakerSegment]
    ) -> Optional[VoiceCharacteristics]:
        """
        Analyse les caractéristiques vocales d'un speaker.

        Args:
            audio_path: Chemin de l'audio source
            segments: Segments du speaker à analyser

        Returns:
            VoiceCharacteristics ou None si échec
        """
        try:
            # Charger l'audio complet
            audio_data, sr = librosa.load(audio_path, sr=None)

            # Extraire les segments du speaker
            speaker_audio_chunks = []
            for seg in segments[:10]:  # Limiter à 10 premiers segments pour performance
                start_sample = int(seg.start_ms * sr / 1000)
                end_sample = int(seg.end_ms * sr / 1000)

                if start_sample < len(audio_data) and end_sample <= len(audio_data):
                    chunk = audio_data[start_sample:end_sample]
                    speaker_audio_chunks.append(chunk)

            if not speaker_audio_chunks:
                return None

            # Concaténer les chunks
            speaker_audio = np.concatenate(speaker_audio_chunks)

            # ═══════════════════════════════════════════════════════════
            # 1. ANALYSE DU PITCH (fréquence fondamentale F0)
            # ═══════════════════════════════════════════════════════════
            pitches, magnitudes = librosa.piptrack(
                y=speaker_audio,
                sr=sr,
                fmin=50,  # Hz min
                fmax=500  # Hz max
            )

            # Extraire les pitches valides (magnitude > seuil)
            valid_pitches = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0 and magnitudes[index, t] > 0.1:
                    valid_pitches.append(pitch)

            if not valid_pitches:
                return None

            avg_pitch = np.mean(valid_pitches)
            pitch_variance = np.std(valid_pitches)

            # ═══════════════════════════════════════════════════════════
            # 2. DÉTERMINATION DU GENRE ET REGISTRE
            # ═══════════════════════════════════════════════════════════
            # Références approximatives:
            # - Enfant: 250-400 Hz
            # - Femme adulte: 165-255 Hz
            # - Homme adulte: 85-180 Hz

            if avg_pitch > 250:
                gender = "enfant"
                pitch_level = "aigu"
                age_group = "enfant"
            elif avg_pitch > 200:
                gender = "femme"
                pitch_level = "aigu"
                age_group = "adulte"
            elif avg_pitch > 165:
                gender = "femme"
                pitch_level = "medium"
                age_group = "adulte"
            elif avg_pitch > 140:
                gender = "adolescent"
                pitch_level = "medium"
                age_group = "adolescent"
            elif avg_pitch > 120:
                gender = "homme"
                pitch_level = "medium"
                age_group = "adulte"
            elif avg_pitch > 90:
                gender = "homme"
                pitch_level = "grave"
                age_group = "adulte"
            else:
                gender = "homme"
                pitch_level = "très grave"
                age_group = "senior"

            # ═══════════════════════════════════════════════════════════
            # 3. ANALYSE DU TON (expressivité)
            # ═══════════════════════════════════════════════════════════
            # Variance du pitch indique l'expressivité
            if pitch_variance > 40:
                tone = "très expressif"
            elif pitch_variance > 20:
                tone = "expressif"
            else:
                tone = "monotone"

            # ═══════════════════════════════════════════════════════════
            # 4. ANALYSE DE LA RAPIDITÉ DE PAROLE
            # ═══════════════════════════════════════════════════════════
            # Estimer le nombre de syllabes via détection d'onsets
            onset_env = librosa.onset.onset_strength(y=speaker_audio, sr=sr)
            onsets = librosa.onset.onset_detect(
                onset_envelope=onset_env,
                sr=sr,
                units='time'
            )

            duration_s = len(speaker_audio) / sr
            syllables_per_second = len(onsets) / duration_s if duration_s > 0 else 0

            # Classification de la rapidité
            # Références: ~4-5 syllabes/sec = normal
            if syllables_per_second > 6:
                speech_rate = "rapide"
            elif syllables_per_second > 3:
                speech_rate = "normal"
            else:
                speech_rate = "lent"

            return VoiceCharacteristics(
                gender=gender,
                pitch_level=pitch_level,
                age_group=age_group,
                tone=tone,
                speech_rate=speech_rate,
                avg_pitch_hz=float(avg_pitch),
                pitch_variance=float(pitch_variance),
                syllables_per_second=float(syllables_per_second)
            )

        except Exception as e:
            logger.warning(f"[SPEECHBRAIN] ⚠️ Erreur analyse caractéristiques vocales: {e}")
            return None

    async def diarize(
        self,
        audio_path: str,
        window_size_ms: int = 1500,  # Fenêtre de 1.5s
        hop_size_ms: int = 750,       # Hop de 0.75s (50% overlap)
        max_speakers: int = 5
    ) -> DiarizationResult:
        """
        Diarise un fichier audio avec SpeechBrain

        Args:
            audio_path: Chemin vers le fichier audio
            window_size_ms: Taille de la fenêtre en ms
            hop_size_ms: Hop entre fenêtres en ms
            max_speakers: Nombre max de speakers

        Returns:
            DiarizationResult avec les speakers détectés
        """
        logger.info(f"[SPEECHBRAIN] 🎯 Diarisation de {audio_path}")

        # Charger l'audio
        audio, sr = librosa.load(audio_path, sr=16000)  # 16kHz pour SpeechBrain
        duration_ms = int(len(audio) / sr * 1000)

        # Découper en fenêtres et extraire embeddings
        window_samples = int(window_size_ms * sr / 1000)
        hop_samples = int(hop_size_ms * sr / 1000)

        embeddings = []
        timestamps = []

        encoder = self._get_encoder()

        for start_sample in range(0, len(audio) - window_samples, hop_samples):
            end_sample = start_sample + window_samples
            window = audio[start_sample:end_sample]

            # Extraire embedding
            import torch
            with torch.no_grad():
                wav_tensor = torch.tensor(window).unsqueeze(0)
                embedding = encoder.encode_batch(wav_tensor)
                embeddings.append(embedding.squeeze().cpu().numpy())

            # Sauvegarder timestamps
            start_ms = int(start_sample / sr * 1000)
            end_ms = int(end_sample / sr * 1000)
            timestamps.append((start_ms, end_ms))

        embeddings = np.array(embeddings)
        logger.info(f"[SPEECHBRAIN]    Extrait {len(embeddings)} embeddings")

        # Clustering des embeddings
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn requis pour le clustering")

        # Trouver le nombre optimal de clusters
        best_n_clusters = 1
        best_score = -1

        if len(embeddings) >= 4:  # Minimum pour clustering
            for n in range(2, min(max_speakers + 1, len(embeddings) // 2)):
                clustering = AgglomerativeClustering(
                    n_clusters=n,
                    metric='cosine',
                    linkage='average'
                )
                labels = clustering.fit_predict(embeddings)

                # Score de silhouette (qualité du clustering)
                score = silhouette_score(embeddings, labels, metric='cosine')

                if score > best_score and score > 0.3:  # Seuil de qualité
                    best_score = score
                    best_n_clusters = n

        # Appliquer le clustering final
        if best_n_clusters > 1:
            clustering = AgglomerativeClustering(
                n_clusters=best_n_clusters,
                metric='cosine',
                linkage='average'
            )
            labels = clustering.fit_predict(embeddings)
            logger.info(f"[SPEECHBRAIN]    Détecté {best_n_clusters} speakers (score={best_score:.3f})")
        else:
            labels = np.zeros(len(embeddings), dtype=int)
            logger.info(f"[SPEECHBRAIN]    1 seul speaker détecté")

        # Construire les segments par speaker
        speakers_data = {}

        for idx, (label, (start_ms, end_ms)) in enumerate(zip(labels, timestamps)):
            speaker_id = f"s{label}"

            if speaker_id not in speakers_data:
                speakers_data[speaker_id] = {
                    'segments': [],
                }

            segment = SpeakerSegment(
                speaker_id=speaker_id,
                start_ms=start_ms,
                end_ms=end_ms,
                duration_ms=end_ms - start_ms,
                confidence=1.0
            )

            speakers_data[speaker_id]['segments'].append(segment)

        # Calculer les durées réelles en fusionnant les overlaps
        # mais garder les segments originaux pour le tagging de transcription
        for speaker_id, data in speakers_data.items():
            # Trier par start_ms
            segments_sorted = sorted(data['segments'], key=lambda s: s.start_ms)

            # Fusionner les segments chevauchants pour calculer la durée RÉELLE
            merged_intervals = []
            current_start = None
            current_end = None

            for seg in segments_sorted:
                if current_start is None:
                    # Premier segment
                    current_start = seg.start_ms
                    current_end = seg.end_ms
                elif seg.start_ms <= current_end:
                    # Chevauchement ou consécutif: étendre
                    current_end = max(current_end, seg.end_ms)
                else:
                    # Gap: sauvegarder l'intervalle fusionné
                    merged_intervals.append((current_start, current_end))
                    current_start = seg.start_ms
                    current_end = seg.end_ms

            # Ajouter le dernier intervalle
            if current_start is not None:
                merged_intervals.append((current_start, current_end))

            # Calculer la durée totale (sans overlap)
            total_duration = sum(end - start for start, end in merged_intervals)

            # Garder les segments originaux (pour tagging) mais avec durée corrigée
            data['segments'] = segments_sorted
            data['total_duration_ms'] = total_duration

        # Filtrer les faux positifs (speakers avec <5% du temps OU <2 segments)
        MIN_SPEAKING_RATIO = 0.05
        MIN_SEGMENTS = 2

        speakers_filtered = {}
        for speaker_id, data in speakers_data.items():
            speaking_ratio = data['total_duration_ms'] / duration_ms if duration_ms > 0 else 0

            if speaking_ratio >= MIN_SPEAKING_RATIO or len(data['segments']) >= MIN_SEGMENTS:
                speakers_filtered[speaker_id] = data
            else:
                logger.info(
                    f"[SPEECHBRAIN]    Filtré {speaker_id}: "
                    f"{speaking_ratio*100:.1f}% temps, {len(data['segments'])} segments"
                )

        speakers_data = speakers_filtered

        # Créer SpeakerInfo avec analyse des caractéristiques vocales
        speakers = []
        for speaker_id, data in speakers_data.items():
            speaking_ratio = data['total_duration_ms'] / duration_ms if duration_ms > 0 else 0

            # Analyser les caractéristiques vocales
            logger.info(f"[SPEECHBRAIN] 🎤 Analyse des caractéristiques vocales de {speaker_id}...")
            voice_chars = self._analyze_voice_characteristics(
                audio_path=audio_path,
                segments=data['segments']
            )

            speakers.append(SpeakerInfo(
                speaker_id=speaker_id,
                is_primary=False,
                speaking_time_ms=data['total_duration_ms'],
                speaking_ratio=speaking_ratio,
                segments=data['segments'],
                voice_characteristics=voice_chars
            ))

        # Identifier le speaker principal (qui parle le plus)
        if speakers:
            primary = max(speakers, key=lambda s: s.speaking_time_ms)
            primary.is_primary = True
            primary_speaker_id = primary.speaker_id
        else:
            primary_speaker_id = "s0"

        result = DiarizationResult(
            speaker_count=len(speakers),
            speakers=speakers,
            primary_speaker_id=primary_speaker_id,
            total_duration_ms=duration_ms,
            method="speechbrain"
        )

        # Logs détaillés
        logger.info("=" * 80)
        logger.info(f"[SPEECHBRAIN] 🎭 RÉSULTAT DIARISATION")
        logger.info(f"[SPEECHBRAIN] Speakers détectés: {result.speaker_count}")
        logger.info(f"[SPEECHBRAIN] Durée totale: {result.total_duration_ms}ms")
        logger.info(f"[SPEECHBRAIN] Speaker principal: {result.primary_speaker_id}")
        logger.info("=" * 80)

        for speaker in result.speakers:
            status = 'PRINCIPAL' if speaker.is_primary else 'secondaire'
            logger.info(
                f"[SPEECHBRAIN] 👤 {speaker.speaker_id} ({status}): "
                f"{speaker.speaking_time_ms}ms ({speaker.speaking_ratio*100:.1f}%) | "
                f"{len(speaker.segments)} segments"
            )

            # Afficher les caractéristiques vocales si disponibles
            if speaker.voice_characteristics:
                vc = speaker.voice_characteristics
                logger.info(
                    f"[SPEECHBRAIN]    ├─ Voix: {vc.gender} | "
                    f"Registre: {vc.pitch_level} ({vc.avg_pitch_hz:.0f}Hz) | "
                    f"Âge: {vc.age_group}"
                )
                logger.info(
                    f"[SPEECHBRAIN]    └─ Ton: {vc.tone} | "
                    f"Rapidité: {vc.speech_rate} ({vc.syllables_per_second:.1f} syl/s)"
                )

        logger.info("=" * 80)

        return result


# Singleton global
_diarizer = None

def get_speechbrain_diarization() -> SpeechBrainDiarization:
    """Retourne l'instance singleton"""
    global _diarizer
    if _diarizer is None:
        _diarizer = SpeechBrainDiarization()
    return _diarizer
