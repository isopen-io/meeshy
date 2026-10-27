"""
Nettoyage et post-traitement de la diarisation de locuteurs
Corrige les faux positifs et fusionne les speakers similaires
"""

import logging
import numpy as np
from typing import List, Dict, Any, Tuple
from sklearn.metrics.pairwise import cosine_similarity
from services.task_privacy import shown

logger = logging.getLogger(__name__)


class DiarizationCleaner:
    """
    Nettoyeur de diarisation pour corriger les sur-segmentations

    Fonctionnalités:
    - Fusion de speakers similaires (embeddings)
    - Règle de majorité temporelle
    - Correction de phrases coupées
    - Détection de transitions anormales
    """

    def __init__(
        self,
        similarity_threshold: float = 0.85,
        min_speaker_percentage: float = 0.10,
        max_sentence_gap: float = 0.5,
        min_transition_gap: float = 0.3
    ):
        """
        Args:
            similarity_threshold: Seuil similarité embeddings (0.85 = très similaire)
            min_speaker_percentage: % minimum temps de parole pour garder speaker (10%)
            max_sentence_gap: Gap max pour continuité phrase (0.5s)
            min_transition_gap: Transition min normale entre speakers (0.3s)
        """
        self.similarity_threshold = similarity_threshold
        self.min_speaker_percentage = min_speaker_percentage
        self.max_sentence_gap = max_sentence_gap
        self.min_transition_gap = min_transition_gap

    def clean_diarization(
        self,
        segments: List[Dict[str, Any]],
        embeddings: Dict[str, np.ndarray] = None,
        transcripts: List[str] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Pipeline complet de nettoyage de diarisation

        Args:
            segments: Liste segments avec speaker_id, start, end
            embeddings: Embeddings de voix par speaker_id (optionnel)
            transcripts: Textes transcrits par segment (optionnel)

        Returns:
            (segments_nettoyés, stats_nettoyage)
        """
        if not segments:
            return segments, {}

        logger.info(f"🧹 Début nettoyage diarisation: {len(segments)} segments")

        initial_speakers = len(set(seg['speaker_id'] for seg in segments))
        stats = {
            'initial_speakers': initial_speakers,
            'initial_segments': len(segments),
            'merges_performed': [],
            'abnormal_transitions': False
        }

        # Étape 1: Détection transitions anormales
        if self._detect_abnormal_transitions(segments):
            stats['abnormal_transitions'] = True
            logger.warning("⚠️ Transitions anormalement rapides détectées → Probable sur-segmentation")

        # Étape 2: Fusion par similarité d'embeddings (si disponibles)
        if embeddings:
            segments, merge_info = self._merge_similar_speakers(segments, embeddings)
            stats['merges_performed'].extend(merge_info)

        # Étape 3: Règle de majorité temporelle
        segments, minority_merges = self._merge_minority_speaker(segments)
        stats['merges_performed'].extend(minority_merges)

        # Étape 4: Correction phrases coupées (si transcripts disponibles)
        if transcripts and len(transcripts) == len(segments):
            segments, phrase_merges = self._merge_interrupted_sentences(segments, transcripts)
            stats['merges_performed'].extend(phrase_merges)

        # Statistiques finales
        final_speakers = len(set(seg['speaker_id'] for seg in segments))
        stats['final_speakers'] = final_speakers
        stats['final_segments'] = len(segments)
        stats['speakers_merged'] = initial_speakers - final_speakers

        logger.info(f"✅ Nettoyage terminé: {initial_speakers} → {final_speakers} speakers")
        logger.info(f"   {len(stats['merges_performed'])} fusion(s) effectuée(s)")

        return segments, stats

    def _merge_similar_speakers(
        self,
        segments: List[Dict[str, Any]],
        embeddings: Dict[str, np.ndarray]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Fusionne speakers avec embeddings similaires"""
        merge_info = []
        speaker_ids = list(embeddings.keys())

        if len(speaker_ids) <= 1:
            return segments, merge_info

        # Matrice de similarité
        emb_matrix = np.array([embeddings[spk] for spk in speaker_ids])
        similarity_matrix = cosine_similarity(emb_matrix)

        # Trouver paires à fusionner
        merge_map = {}
        for i, spk_i in enumerate(speaker_ids):
            for j, spk_j in enumerate(speaker_ids):
                if i < j and similarity_matrix[i][j] > self.similarity_threshold:
                    merge_map[spk_j] = spk_i
                    msg = f"Fusion embeddings: {spk_j} → {spk_i} (sim: {similarity_matrix[i][j]:.3f})"
                    merge_info.append(msg)
                    logger.info(f"🔄 {msg}")

        # Appliquer fusions
        for segment in segments:
            if segment['speaker_id'] in merge_map:
                segment['speaker_id'] = merge_map[segment['speaker_id']]

        return segments, merge_info

    def _merge_minority_speaker(
        self,
        segments: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Fusionne speakers minoritaires (< min_percentage du temps)"""
        merge_info = []

        # Calculer durées par speaker
        speaker_durations = {}
        total_duration = 0

        for seg in segments:
            duration = seg['end'] - seg['start']
            speaker_id = seg['speaker_id']
            speaker_durations[speaker_id] = speaker_durations.get(speaker_id, 0) + duration
            total_duration += duration

        if total_duration == 0:
            return segments, merge_info

        # Speaker majoritaire
        majority_speaker = max(speaker_durations.items(), key=lambda x: x[1])[0]

        # Fusionner minoritaires
        for speaker_id, duration in list(speaker_durations.items()):
            percentage = duration / total_duration

            if speaker_id != majority_speaker and percentage < self.min_speaker_percentage:
                msg = f"Fusion minoritaire: {speaker_id} ({percentage*100:.1f}%) → {majority_speaker}"
                merge_info.append(msg)
                logger.info(f"🎯 {msg}")

                # Appliquer fusion
                for seg in segments:
                    if seg['speaker_id'] == speaker_id:
                        seg['speaker_id'] = majority_speaker

        return segments, merge_info

    def _merge_interrupted_sentences(
        self,
        segments: List[Dict[str, Any]],
        transcripts: List[str]
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Fusionne segments qui coupent des phrases"""
        merge_info = []

        for i in range(1, len(segments)):
            seg = segments[i]
            prev_seg = segments[i-1]

            current_text = transcripts[i].strip()
            prev_text = transcripts[i-1].strip()

            # Gap temporel
            gap = seg['start'] - prev_seg['end']

            # Détection continuité
            is_continuation = (
                gap < self.max_sentence_gap and
                prev_text and not prev_text.endswith(('.', '!', '?', '...', ',')) and
                current_text and len(current_text) > 0 and current_text[0].islower()
            )

            if is_continuation and seg['speaker_id'] != prev_seg['speaker_id']:
                msg = f"Fusion phrase coupée: {seg['speaker_id']} → {prev_seg['speaker_id']}"
                merge_info.append(msg)
                logger.info(f"📝 {msg}")
                logger.debug(f"   '{shown(prev_text)}' → '{shown(current_text)}'")

                seg['speaker_id'] = prev_seg['speaker_id']

        return segments, merge_info

    def _detect_abnormal_transitions(self, segments: List[Dict[str, Any]]) -> bool:
        """Détecte transitions anormalement rapides (faux positif probable)"""
        if len(segments) < 2:
            return False

        transitions = []
        for i in range(1, len(segments)):
            if segments[i]['speaker_id'] != segments[i-1]['speaker_id']:
                gap = segments[i]['start'] - segments[i-1]['end']
                transitions.append(gap)

        if not transitions:
            return False

        avg_transition = np.mean(transitions)

        # Transitions trop rapides = probable faux positif
        if avg_transition < self.min_transition_gap:
            logger.warning(
                f"⚠️ Transitions trop rapides: {avg_transition:.2f}s en moyenne "
                f"({len(transitions)} transitions)"
            )
            return True

        return False

    def get_speaker_statistics(self, segments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Retourne statistiques détaillées par speaker"""
        stats = {}

        for seg in segments:
            speaker_id = seg['speaker_id']
            duration = seg['end'] - seg['start']

            if speaker_id not in stats:
                stats[speaker_id] = {
                    'total_duration': 0,
                    'segment_count': 0,
                    'avg_segment_duration': 0
                }

            stats[speaker_id]['total_duration'] += duration
            stats[speaker_id]['segment_count'] += 1

        # Calculer moyennes
        for speaker_id, data in stats.items():
            data['avg_segment_duration'] = data['total_duration'] / data['segment_count']

        return stats


def merge_consecutive_same_speaker(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Fusionne les segments consécutifs du même speaker (optimisation finale)

    Args:
        segments: Segments nettoyés

    Returns:
        Segments fusionnés
    """
    if not segments:
        return segments

    merged = [segments[0].copy()]

    for seg in segments[1:]:
        last = merged[-1]

        # Même speaker ET consécutif (gap < 1s) ?
        if seg['speaker_id'] == last['speaker_id'] and (seg['start'] - last['end']) < 1.0:
            # Fusionner : étendre le dernier segment
            last['end'] = seg['end']

            # Fusionner les textes si présents
            if 'text' in last and 'text' in seg:
                last['text'] = f"{last['text']} {seg['text']}"

            logger.debug(f"🔗 Fusion consécutive: {last['start']:.1f}s - {last['end']:.1f}s")
        else:
            merged.append(seg.copy())

    logger.info(f"🔗 Fusion consécutive: {len(segments)} → {len(merged)} segments")
    return merged
