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

# Import unified voice characteristics model
from services.voice_clone.voice_metadata import VoiceCharacteristics

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
    Diarisation des locuteurs avec SpeechBrain + nettoyage automatique
    Fonctionne SANS token HuggingFace (comme NLLB)
    """

    def __init__(self, models_dir: Optional[str] = None, enable_cleaning: bool = True):
        """
        Args:
            models_dir: Répertoire pour stocker les modèles (optionnel)
            enable_cleaning: Activer le nettoyage post-diarisation (défaut: True)
        """
        self.models_dir = models_dir or str(
            Path(__file__).parent.parent.parent / "models" / "speechbrain"
        )
        self._encoder = None
        self.enable_cleaning = enable_cleaning

        # ✨ Initialiser le nettoyeur de diarisation
        if self.enable_cleaning:
            try:
                from services.audio_processing.diarization_cleaner import (
                    DiarizationCleaner,
                    merge_consecutive_same_speaker
                )
                # Configuration pour monologue/dialogue (cas typique)
                self._cleaner = DiarizationCleaner(
                    similarity_threshold=0.85,      # Fusion si similarité > 85%
                    min_speaker_percentage=0.15,    # Fusion si < 15% du temps
                    max_sentence_gap=0.5,           # Continuité phrase < 0.5s
                    min_transition_gap=0.3          # Transition anormale < 0.3s
                )
                self._merge_consecutive = merge_consecutive_same_speaker
                logger.info("[SPEECHBRAIN] ✅ Nettoyeur de diarisation activé")
            except ImportError as e:
                logger.warning(f"[SPEECHBRAIN] ⚠️ Nettoyeur non disponible: {e}")
                self.enable_cleaning = False
                self._cleaner = None

        # Initialiser le service d'analyse vocale
        from services.voice_analyzer_service import VoiceAnalyzerService
        self._voice_analyzer = VoiceAnalyzerService()

    def _get_encoder(self) -> "EncoderClassifier":
        """Charge le modèle d'embedding (lazy loading)"""
        if not SPEECHBRAIN_AVAILABLE:
            raise RuntimeError("SpeechBrain non disponible - pip install speechbrain")

        if self._encoder is None:
            logger.info("[SPEECHBRAIN] Chargement modèle ECAPA-TDNN...")
            self._encoder = EncoderClassifier.from_hparams(
                source="speechbrain/spkrec-ecapa-voxceleb",
                savedir=self.models_dir,
                run_opts={"device": "cpu"}
            )

        return self._encoder

    async def _analyze_voice_characteristics(
        self,
        audio_path: str,
        segments: List[SpeakerSegment]
    ) -> Optional[VoiceCharacteristics]:
        """
        Analyse les caractéristiques vocales d'un speaker en utilisant VoiceAnalyzerService.

        Args:
            audio_path: Chemin de l'audio source
            segments: Segments du speaker à analyser

        Returns:
            VoiceCharacteristics complètes ou None si échec
        """
        import tempfile
        import soundfile as sf

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

            # Créer un fichier temporaire avec l'audio du speaker
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                temp_audio_path = tmp_file.name
                sf.write(temp_audio_path, speaker_audio, sr)

            try:
                # Initialiser le service d'analyse vocale si nécessaire
                if not self._voice_analyzer.is_initialized:
                    await self._voice_analyzer.initialize()

                # Utiliser VoiceAnalyzerService pour l'analyse complète
                characteristics = await self._voice_analyzer.analyze(
                    audio_path=temp_audio_path,
                    use_cache=False  # Ne pas mettre en cache les fichiers temporaires
                )

                return characteristics

            finally:
                # Supprimer le fichier temporaire
                import os
                if os.path.exists(temp_audio_path):
                    os.unlink(temp_audio_path)

        except Exception as e:
            logger.warning(f"[SPEECHBRAIN] ⚠️ Erreur analyse caractéristiques vocales: {e}")
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def _get_gender_label(chars: VoiceCharacteristics) -> str:
        """Extract gender label from VoiceCharacteristics (English)"""
        gender = chars.estimated_gender
        if gender == "child":
            return "child"
        elif gender == "female":
            return "female"
        elif gender == "male":
            return "male"
        return "unknown"

    @staticmethod
    def _get_pitch_level_label(chars: VoiceCharacteristics) -> str:
        """Extract pitch level from VoiceCharacteristics (English)"""
        pitch = chars.pitch_mean
        if pitch > 250:
            return "very_high"
        elif pitch > 200:
            return "high"
        elif pitch > 120:
            return "medium"
        elif pitch > 90:
            return "low"
        else:
            return "very_low"

    @staticmethod
    def _get_age_label(chars: VoiceCharacteristics) -> str:
        """Extract age group from VoiceCharacteristics (English)"""
        age = chars.estimated_age_range
        if "child" in age:
            return "child"
        elif "teen" in age or "young" in age:
            return "teen"
        elif "senior" in age:
            return "senior"
        return "adult"

    @staticmethod
    def _get_tone_label(chars: VoiceCharacteristics) -> str:
        """Extract tone/expressiveness from VoiceCharacteristics (English)"""
        variance = chars.pitch_std
        if variance > 40:
            return "very_expressive"
        elif variance > 20:
            return "expressive"
        else:
            return "monotone"

    @staticmethod
    def _get_speech_rate_label(chars: VoiceCharacteristics) -> str:
        """Extrait la rapidité de parole depuis VoiceCharacteristics"""
        # Convertir speech_rate_wpm en syllabes/sec (approximation: 1 mot ≈ 2 syllabes)
        wpm = chars.speech_rate_wpm
        syl_per_sec = (wpm * 2) / 60 if wpm > 0 else 0

        if syl_per_sec > 6:
            return "rapide"
        elif syl_per_sec > 3:
            return "normal"
        else:
            return "lent"

    async def diarize(
        self,
        audio_path: str,
        window_size_ms: int = 1500,  # Fenêtre de 1.5s (détecte tours courts)
        hop_size_ms: int = 1000,      # Hop de 1s (réduit micro-segments)
        max_speakers: int = 3,        # Augmenté à 3 pour détecter plus de tours
        num_speakers: Optional[int] = None  # ✅ NOUVEAU: Forcer nombre exact
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

        # Clustering des embeddings
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn requis pour le clustering")

        # Trouver le nombre optimal de clusters
        best_n_clusters = 1
        best_score = -1

        if len(embeddings) >= 4:
            max_clusters_to_test = min(max_speakers + 1, len(embeddings) // 3, 3)

            for n in range(2, max_clusters_to_test):
                clustering = AgglomerativeClustering(
                    n_clusters=n,
                    metric='cosine',
                    linkage='average'
                )
                labels = clustering.fit_predict(embeddings)
                score = silhouette_score(embeddings, labels, metric='cosine')

                if score > best_score and score > 0.40:
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
        else:
            labels = np.zeros(len(embeddings), dtype=int)

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

        # Filtrer les faux positifs: speakers avec très peu d'audio
        # Critères ADAPTATIFS selon la durée totale de l'audio:
        # 1. Durée minimale absolue: 500ms (segment significatif)
        # 2. Ratio minimum adaptatif:
        #    - Audio < 15s : ratio minimum 20% (modéré pour conversations courtes)
        #    - Audio ≥ 15s : ratio minimum 25% (strict pour longs audios)
        MIN_DURATION_MS = 500  # Durée minimale absolue (augmenté de 300)
        AUDIO_THRESHOLD_MS = 15000  # Seuil pour changer de critère (15 secondes)
        MIN_RATIO_SHORT_AUDIO = 0.20  # 20% pour audios < 15s (augmenté de 16%)
        MIN_RATIO_LONG_AUDIO = 0.25   # 25% pour audios ≥ 15s (augmenté de 20%)

        # Déterminer le ratio minimum selon la durée totale
        min_ratio_threshold = MIN_RATIO_SHORT_AUDIO if duration_ms < AUDIO_THRESHOLD_MS else MIN_RATIO_LONG_AUDIO

        speakers_filtered = {}
        for speaker_id, data in speakers_data.items():
            speaking_ratio = data['total_duration_ms'] / duration_ms if duration_ms > 0 else 0
            speaker_duration = data['total_duration_ms']

            # Filtrer les faux positifs
            if speaker_duration < MIN_DURATION_MS or speaking_ratio < min_ratio_threshold:
                continue

            speakers_filtered[speaker_id] = data

        speakers_data = speakers_filtered

        # NETTOYAGE AUTOMATIQUE (si activé)
        cleaning_stats = None
        if self.enable_cleaning and self._cleaner and len(speakers_data) > 0:
            initial_speaker_count = len(speakers_data)

            segments_for_cleaner = []
            for speaker_id, data in speakers_data.items():
                for seg in data['segments']:
                    segments_for_cleaner.append({
                        'speaker_id': speaker_id,
                        'start': seg.start_ms / 1000,
                        'end': seg.end_ms / 1000,
                        'duration': seg.duration_ms / 1000,
                        'confidence': seg.confidence
                    })

            speaker_embeddings = {}
            for i, (label, _) in enumerate(zip(labels, timestamps)):
                speaker_id = f"s{label}"
                if speaker_id not in speaker_embeddings:
                    speaker_embeddings[speaker_id] = []
                if i < len(embeddings):
                    speaker_embeddings[speaker_id].append(embeddings[i])

            speaker_embeddings_avg = {}
            for speaker_id, embs in speaker_embeddings.items():
                if embs and speaker_id in speakers_data:
                    speaker_embeddings_avg[speaker_id] = np.mean(embs, axis=0)

            try:
                cleaned_segments, cleaning_stats = self._cleaner.clean_diarization(
                    segments=segments_for_cleaner,
                    embeddings=speaker_embeddings_avg if speaker_embeddings_avg else None,
                    transcripts=None
                )

                cleaned_segments = self._merge_consecutive(cleaned_segments)

                speakers_data_cleaned = {}
                for seg in cleaned_segments:
                    speaker_id = seg['speaker_id']
                    if speaker_id not in speakers_data_cleaned:
                        speakers_data_cleaned[speaker_id] = {
                            'segments': [],
                            'total_duration_ms': 0
                        }

                    cleaned_seg = SpeakerSegment(
                        speaker_id=speaker_id,
                        start_ms=int(seg['start'] * 1000),
                        end_ms=int(seg['end'] * 1000),
                        duration_ms=int(seg['duration'] * 1000),
                        confidence=seg.get('confidence', 1.0)
                    )
                    speakers_data_cleaned[speaker_id]['segments'].append(cleaned_seg)
                    speakers_data_cleaned[speaker_id]['total_duration_ms'] += cleaned_seg.duration_ms

                speakers_data = speakers_data_cleaned

            except Exception as e:
                logger.warning(f"[SPEECHBRAIN] Erreur nettoyage: {e}")

        # Créer SpeakerInfo avec analyse des caractéristiques vocales
        speakers = []
        for speaker_id, data in speakers_data.items():
            speaking_ratio = data['total_duration_ms'] / duration_ms if duration_ms > 0 else 0

            voice_chars = await self._analyze_voice_characteristics(
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

        # Fusionner les speakers avec caractéristiques vocales très similaires
        if len(speakers) > 1:
            speakers = self._merge_similar_speakers_by_characteristics(speakers)

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
            method="speechbrain" + ("_cleaned" if self.enable_cleaning and cleaning_stats else "")
        )

        if cleaning_stats:
            result.cleaning_stats = cleaning_stats

        # Log résumé
        speaker_summary = ", ".join([
            f"{s.speaker_id}:{s.speaking_ratio*100:.0f}%"
            for s in result.speakers
        ])
        logger.info(
            f"[SPEECHBRAIN] 🎭 Diarisation: {result.speaker_count} speaker(s) | "
            f"Principal: {result.primary_speaker_id} | "
            f"Répartition: {speaker_summary}"
        )

        return result

    def _merge_similar_speakers_by_characteristics(
        self,
        speakers: List[SpeakerInfo]
    ) -> List[SpeakerInfo]:
        """
        Fusionne les speakers avec des caractéristiques vocales très similaires.

        Critères de similarité:
        - Même genre (male/female/child)
        - Pitch similaire (±20Hz)
        - Âge similaire (même catégorie)

        Args:
            speakers: Liste des SpeakerInfo à analyser

        Returns:
            Liste fusionnée des SpeakerInfo
        """
        if len(speakers) <= 1:
            return speakers

        # Créer des groupes de speakers similaires
        merged_groups = []
        used_indices = set()

        for i, speaker1 in enumerate(speakers):
            if i in used_indices:
                continue

            # Créer un nouveau groupe avec ce speaker
            group = [speaker1]
            used_indices.add(i)

            # Comparer avec les autres speakers
            for j, speaker2 in enumerate(speakers[i+1:], start=i+1):
                if j in used_indices:
                    continue

                if self._are_speakers_similar(speaker1, speaker2):
                    group.append(speaker2)
                    used_indices.add(j)

            merged_groups.append(group)

        # Créer des SpeakerInfo fusionnés pour chaque groupe
        merged_speakers = []
        for group_idx, group in enumerate(merged_groups):
            if len(group) == 1:
                merged_speakers.append(group[0])
            else:
                merged_speaker = self._merge_speaker_group(group, group_idx)
                merged_speakers.append(merged_speaker)

        return merged_speakers

    @staticmethod
    def _are_speakers_similar(
        speaker1: SpeakerInfo,
        speaker2: SpeakerInfo,
        pitch_tolerance_hz: float = 25.0
    ) -> bool:
        """Compare deux speakers pour déterminer s'ils sont similaires."""
        chars1 = speaker1.voice_characteristics
        chars2 = speaker2.voice_characteristics

        if not chars1 or not chars2:
            return False

        # Critères: même genre, pitch proche, même âge
        if chars1.estimated_gender != chars2.estimated_gender:
            return False

        pitch_diff = abs(chars1.pitch_mean - chars2.pitch_mean)
        if pitch_diff > pitch_tolerance_hz:
            return False

        if chars1.estimated_age_range != chars2.estimated_age_range:
            return False

        return True

    @staticmethod
    def _merge_speaker_group(
        group: List[SpeakerInfo],
        group_idx: int
    ) -> SpeakerInfo:
        """
        Fusionne un groupe de speakers similaires en un seul SpeakerInfo.

        Args:
            group: Groupe de speakers à fusionner
            group_idx: Index du groupe (pour l'ID)

        Returns:
            SpeakerInfo fusionné
        """
        # Prendre le speaker dominant (qui parle le plus) comme base
        primary = max(group, key=lambda s: s.speaking_time_ms)

        # Fusionner les segments de tous les speakers
        all_segments = []
        total_speaking_time = 0
        total_speaking_ratio = 0.0

        for speaker in group:
            all_segments.extend(speaker.segments)
            total_speaking_time += speaker.speaking_time_ms
            total_speaking_ratio += speaker.speaking_ratio

        # Trier les segments par start_ms
        all_segments = sorted(all_segments, key=lambda s: s.start_ms)

        # Créer le speaker fusionné avec les caractéristiques du dominant
        merged_speaker = SpeakerInfo(
            speaker_id=f"merged_s{group_idx}",
            is_primary=primary.is_primary,
            speaking_time_ms=total_speaking_time,
            speaking_ratio=total_speaking_ratio,
            segments=all_segments,
            voice_characteristics=primary.voice_characteristics,
            voice_similarity_score=primary.voice_similarity_score
        )

        return merged_speaker


# Singleton global
_diarizer = None

def get_speechbrain_diarization() -> SpeechBrainDiarization:
    """Retourne l'instance singleton"""
    global _diarizer
    if _diarizer is None:
        # ✅ DÉSACTIVÉ TEMPORAIREMENT pour debug (éviter fusion des segments)
        _diarizer = SpeechBrainDiarization(enable_cleaning=False)
    return _diarizer
