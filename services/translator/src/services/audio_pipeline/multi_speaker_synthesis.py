"""
Multi-Speaker Audio Synthesis
==============================

Gère la synthèse audio multi-locuteurs avec préservation des voix
et des timings naturels.

Fonctionnalités:
- Mapping speaker_id → voice_model
- Groupement des segments par speaker
- Synthèse TTS par segment avec la voix appropriée
- Concaténation avec préservation des silences
- Support pour audio mono-speaker (fallback)
"""

import os
import logging
import time
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass
from pathlib import Path

from .audio_silence_manager import (
    AudioSilenceManager,
    AudioSegmentWithSilence,
    create_silence_manager
)

logger = logging.getLogger(__name__)


@dataclass
class SpeakerVoiceMap:
    """Mapping d'un speaker vers son modèle vocal"""
    speaker_id: str
    voice_model: Any  # VoiceModel
    segment_count: int
    total_duration_ms: int
    audio_reference_path: Optional[str] = None


@dataclass
class SegmentSynthesisResult:
    """Résultat de la synthèse d'un segment"""
    segment_index: int
    speaker_id: str
    text: str
    audio_path: str
    duration_ms: int
    silence_before_ms: int
    silence_after_ms: int
    success: bool
    error_message: Optional[str] = None


class MultiSpeakerSynthesizer:
    """
    Synthétiseur audio multi-locuteurs.

    Architecture:
    1. Analyse des segments pour identifier les speakers
    2. Création des voice models pour chaque speaker
    3. Synthèse TTS par segment avec la bonne voix
    4. Concaténation avec préservation des silences
    """

    def __init__(
        self,
        tts_service,
        voice_clone_service,
        silence_manager: Optional[AudioSilenceManager] = None,
        temp_dir: str = "/tmp/multi_speaker_tts"
    ):
        """
        Initialise le synthétiseur multi-speakers.

        Args:
            tts_service: Service TTS
            voice_clone_service: Service de clonage vocal
            silence_manager: Gestionnaire de silences (créé si None)
            temp_dir: Répertoire temporaire pour les fichiers audio
        """
        self.tts_service = tts_service
        self.voice_clone_service = voice_clone_service
        self.silence_manager = silence_manager or create_silence_manager()
        self.temp_dir = temp_dir

        # Créer le répertoire temporaire
        os.makedirs(temp_dir, exist_ok=True)

        logger.info(
            f"[MULTI_SPEAKER_SYNTH] Initialisé: "
            f"temp_dir={temp_dir}, "
            f"preserve_silences={self.silence_manager.preserve_silences}"
        )

    async def create_speaker_voice_maps(
        self,
        segments: List[Dict[str, Any]],
        source_audio_path: str,
        diarization_result: Optional[Any] = None,
        user_voice_model: Optional[Any] = None
    ) -> Dict[str, SpeakerVoiceMap]:
        """
        Crée les mappings speaker → voice model.

        Args:
            segments: Segments de transcription avec speaker_id
            source_audio_path: Chemin de l'audio source
            diarization_result: Résultat de la diarisation (optionnel)
            user_voice_model: Modèle vocal de l'utilisateur (optionnel)

        Returns:
            Dict mapping speaker_id → SpeakerVoiceMap
        """
        logger.info("[MULTI_SPEAKER_SYNTH] 🎤 Création des voice models par speaker...")

        speaker_maps = {}

        # Analyser les segments pour identifier les speakers uniques
        speaker_stats = {}
        for seg in segments:
            speaker_id = seg.get('speaker_id', seg.get('speakerId', 'unknown'))

            if speaker_id not in speaker_stats:
                speaker_stats[speaker_id] = {
                    'count': 0,
                    'total_duration_ms': 0,
                    'segments': []
                }

            speaker_stats[speaker_id]['count'] += 1
            speaker_stats[speaker_id]['total_duration_ms'] += (
                seg.get('end_ms', seg.get('endMs', 0)) -
                seg.get('start_ms', seg.get('startMs', 0))
            )
            speaker_stats[speaker_id]['segments'].append(seg)

        # Calculer la durée totale pour les pourcentages
        total_duration_ms = sum(stats['total_duration_ms'] for stats in speaker_stats.values())

        logger.info("=" * 80)
        logger.info(f"[MULTI_SPEAKER_SYNTH] 🎭 PROFIL DES SPEAKERS DÉTECTÉS")
        logger.info(f"[MULTI_SPEAKER_SYNTH] Nombre de speakers: {len(speaker_stats)}")
        logger.info(f"[MULTI_SPEAKER_SYNTH] Durée totale: {total_duration_ms}ms ({total_duration_ms/1000:.1f}s)")
        logger.info("=" * 80)

        # Afficher le profil de chaque speaker
        for speaker_id, stats in sorted(speaker_stats.items(), key=lambda x: x[1]['total_duration_ms'], reverse=True):
            percentage = (stats['total_duration_ms'] / total_duration_ms * 100) if total_duration_ms > 0 else 0
            is_main = percentage > 50

            logger.info(f"[MULTI_SPEAKER_SYNTH] 👤 Speaker '{speaker_id}' {'(PRINCIPAL)' if is_main else '(secondaire)'}:")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    ├─ Segments: {stats['count']}")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    ├─ Durée de parole: {stats['total_duration_ms']}ms ({stats['total_duration_ms']/1000:.1f}s)")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    ├─ Pourcentage: {percentage:.1f}%")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    └─ Durée moyenne/segment: {stats['total_duration_ms']/stats['count']:.0f}ms")

        logger.info("=" * 80)

        # Créer un voice model pour chaque speaker
        for speaker_id, stats in speaker_stats.items():
            try:
                # Si c'est l'utilisateur et qu'on a son modèle, l'utiliser
                if user_voice_model and self._is_user_speaker(speaker_id, diarization_result):
                    logger.info(
                        f"[MULTI_SPEAKER_SYNTH]   • {speaker_id}: "
                        f"utilisation du modèle utilisateur existant"
                    )
                    speaker_maps[speaker_id] = SpeakerVoiceMap(
                        speaker_id=speaker_id,
                        voice_model=user_voice_model,
                        segment_count=stats['count'],
                        total_duration_ms=stats['total_duration_ms'],
                        audio_reference_path=source_audio_path
                    )
                    continue

                # Sinon, créer un modèle temporaire depuis l'audio source
                logger.info(
                    f"[MULTI_SPEAKER_SYNTH]   • {speaker_id}: "
                    f"création modèle temporaire ({stats['count']} segments, "
                    f"{stats['total_duration_ms']}ms)"
                )

                # Pour l'instant, utiliser l'audio source complet
                # TODO: Extraire uniquement les segments de ce speaker
                voice_model = await self._create_temp_voice_model(
                    speaker_id=speaker_id,
                    audio_path=source_audio_path,
                    segments=stats['segments']
                )

                if voice_model:
                    speaker_maps[speaker_id] = SpeakerVoiceMap(
                        speaker_id=speaker_id,
                        voice_model=voice_model,
                        segment_count=stats['count'],
                        total_duration_ms=stats['total_duration_ms'],
                        audio_reference_path=source_audio_path
                    )
                else:
                    logger.warning(
                        f"[MULTI_SPEAKER_SYNTH] ⚠️ Impossible de créer le modèle pour {speaker_id}, "
                        f"utilisation de voix générique"
                    )

            except Exception as e:
                logger.error(f"[MULTI_SPEAKER_SYNTH] Erreur création modèle {speaker_id}: {e}")

        logger.info(
            f"[MULTI_SPEAKER_SYNTH] ✅ Voice models créés: "
            f"{len(speaker_maps)}/{len(speaker_stats)} speakers"
        )

        return speaker_maps

    def _is_user_speaker(
        self,
        speaker_id: str,
        diarization_result: Optional[Any]
    ) -> bool:
        """
        Vérifie si un speaker_id correspond à l'utilisateur.

        Args:
            speaker_id: ID du speaker à vérifier
            diarization_result: Dictionnaire speaker_analysis ou objet DiarizationResult

        Returns:
            True si le speaker correspond à l'utilisateur identifié
        """
        if not diarization_result:
            return False

        # Gérer à la fois les dictionnaires (speaker_analysis) et les objets (DiarizationResult)
        if isinstance(diarization_result, dict):
            sender_identified = diarization_result.get('senderIdentified', False)
            sender_speaker_id = diarization_result.get('senderSpeakerId')
            return sender_identified and sender_speaker_id == speaker_id
        else:
            # Objet DiarizationResult
            return (
                hasattr(diarization_result, 'sender_identified') and
                diarization_result.sender_identified and
                hasattr(diarization_result, 'sender_speaker_id') and
                diarization_result.sender_speaker_id == speaker_id
            )

    async def _extract_speaker_audio(
        self,
        speaker_id: str,
        audio_path: str,
        segments: List[Dict[str, Any]]
    ) -> Optional[str]:
        """
        Extrait et concatène les segments audio d'un speaker spécifique.
        Applique une normalisation audio pour améliorer la qualité du clonage vocal.

        Args:
            speaker_id: ID du speaker
            audio_path: Chemin de l'audio source
            segments: Segments de ce speaker

        Returns:
            Chemin du fichier audio concaténé ou None
        """
        try:
            import soundfile as sf
            import numpy as np
            from pathlib import Path

            # Lire l'audio source
            audio_data, sample_rate = sf.read(audio_path)

            # Extraire les segments du speaker
            speaker_audio_chunks = []
            total_extracted_ms = 0

            for seg in segments:
                start_ms = seg.get('start_ms', seg.get('startMs', 0))
                end_ms = seg.get('end_ms', seg.get('endMs', 0))

                # Convertir ms en samples
                start_sample = int(start_ms * sample_rate / 1000)
                end_sample = int(end_ms * sample_rate / 1000)

                # Extraire le chunk
                if start_sample < len(audio_data) and end_sample <= len(audio_data):
                    chunk = audio_data[start_sample:end_sample]
                    speaker_audio_chunks.append(chunk)
                    total_extracted_ms += (end_ms - start_ms)

            if not speaker_audio_chunks:
                logger.warning(f"[MULTI_SPEAKER_SYNTH] Aucun segment audio extrait pour {speaker_id}")
                return None

            # Concaténer tous les chunks avec de courts silences entre eux
            # pour éviter les artefacts audio aux jonctions
            silence_samples = int(0.05 * sample_rate)  # 50ms de silence
            silence = np.zeros(silence_samples, dtype=audio_data.dtype)

            audio_with_gaps = []
            for i, chunk in enumerate(speaker_audio_chunks):
                audio_with_gaps.append(chunk)
                if i < len(speaker_audio_chunks) - 1:
                    audio_with_gaps.append(silence)

            concatenated_audio = np.concatenate(audio_with_gaps)

            # ═══════════════════════════════════════════════════════════════════
            # NORMALISATION AUDIO
            # Améliore la qualité du clonage vocal en normalisant le volume
            # ═══════════════════════════════════════════════════════════════════
            concatenated_audio = self._normalize_audio(concatenated_audio)

            # Sauvegarder dans un fichier temporaire
            output_path = os.path.join(
                self.temp_dir,
                f"speaker_{speaker_id}_{os.path.basename(audio_path)}"
            )

            sf.write(output_path, concatenated_audio, sample_rate)

            logger.info(
                f"[MULTI_SPEAKER_SYNTH] ✅ Audio extrait pour {speaker_id}: "
                f"{len(speaker_audio_chunks)} segments, "
                f"{total_extracted_ms}ms (normalisé), "
                f"fichier: {output_path}"
            )

            return output_path

        except Exception as e:
            logger.error(f"[MULTI_SPEAKER_SYNTH] Erreur extraction audio {speaker_id}: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _normalize_audio(self, audio: 'np.ndarray', target_db: float = -3.0) -> 'np.ndarray':
        """
        Normalise l'audio au niveau cible en dB.

        Args:
            audio: Array audio numpy
            target_db: Niveau cible en dB (défaut: -3.0 dB)

        Returns:
            Audio normalisé
        """
        import numpy as np

        # Éviter la division par zéro
        max_val = np.max(np.abs(audio))
        if max_val < 1e-10:
            return audio

        # Calculer le gain nécessaire
        current_db = 20 * np.log10(max_val)
        gain_db = target_db - current_db
        gain_linear = 10 ** (gain_db / 20)

        # Appliquer le gain avec clipping doux
        normalized = audio * gain_linear

        # Clipping doux pour éviter la saturation
        normalized = np.clip(normalized, -0.99, 0.99)

        logger.debug(
            f"[MULTI_SPEAKER_SYNTH] Normalisation: {current_db:.1f}dB → {target_db:.1f}dB "
            f"(gain: {gain_db:.1f}dB)"
        )

        return normalized

    async def _create_temp_voice_model(
        self,
        speaker_id: str,
        audio_path: str,
        segments: List[Dict[str, Any]]
    ) -> Optional[Any]:
        """
        Crée un modèle vocal temporaire pour un speaker.

        Args:
            speaker_id: ID du speaker
            audio_path: Chemin de l'audio source
            segments: Segments de ce speaker

        Returns:
            VoiceModel ou None
        """
        try:
            # Créer un ID temporaire pour ce speaker
            temp_user_id = f"temp_speaker_{speaker_id}"

            # Extraire l'audio spécifique de ce speaker
            speaker_audio_path = await self._extract_speaker_audio(
                speaker_id=speaker_id,
                audio_path=audio_path,
                segments=segments
            )

            # Si l'extraction a échoué, utiliser l'audio complet en fallback
            if not speaker_audio_path:
                logger.warning(
                    f"[MULTI_SPEAKER_SYNTH] Extraction audio échouée pour {speaker_id}, "
                    f"fallback sur audio complet"
                )
                speaker_audio_path = audio_path

            # Calculer la durée totale des segments
            total_duration_ms = sum(
                seg.get('end_ms', seg.get('endMs', 0)) -
                seg.get('start_ms', seg.get('startMs', 0))
                for seg in segments
            )

            # Créer le voice model depuis l'audio extrait
            voice_model = await self.voice_clone_service.get_or_create_voice_model(
                user_id=temp_user_id,
                current_audio_path=speaker_audio_path,
                current_audio_duration_ms=total_duration_ms
            )

            return voice_model

        except Exception as e:
            logger.error(f"[MULTI_SPEAKER_SYNTH] Erreur création modèle temp: {e}")
            return None

    async def synthesize_full_text_with_cloning(
        self,
        full_text: str,
        speaker_audio_path: str,
        target_language: str,
        output_path: str,
        message_id: str = "unknown"
    ) -> Optional[Tuple[str, int]]:
        """
        Synthétise TOUT le texte en UNE FOIS avec clonage vocal (comme le script de test).

        Cette approche garantit que:
        - Tout le texte est synthétisé (pas de segments manquants)
        - La voix est cohérente sur toute la durée
        - Les intonations naturelles sont préservées

        Args:
            full_text: Texte complet à synthétiser
            speaker_audio_path: Audio de référence pour le clonage
            target_language: Langue cible
            output_path: Chemin du fichier de sortie
            message_id: ID du message (pour logging)

        Returns:
            Tuple (audio_path, duration_ms) ou None
        """
        try:
            logger.info("=" * 80)
            logger.info(f"[MULTI_SPEAKER_SYNTH] 🎙️ SYNTHÈSE COMPLÈTE DU TEXTE")
            logger.info(f"[MULTI_SPEAKER_SYNTH] Texte: {len(full_text)} caractères")
            logger.info(f"[MULTI_SPEAKER_SYNTH] Langue: {target_language}")
            logger.info(f"[MULTI_SPEAKER_SYNTH] Audio référence: {speaker_audio_path}")
            logger.info("=" * 80)

            synth_start = time.time()

            # Synthétiser TOUT le texte en UNE fois
            tts_result = await self.tts_service.synthesize_with_voice(
                text=full_text,
                speaker_audio_path=speaker_audio_path,
                target_language=target_language,
                output_format="mp3",
                message_id=message_id
            )

            if not tts_result or not tts_result.audio_path:
                logger.error("[MULTI_SPEAKER_SYNTH] ❌ Synthèse complète échouée")
                return None

            synth_time = int((time.time() - synth_start) * 1000)

            import shutil
            shutil.copy(tts_result.audio_path, output_path)

            logger.info("=" * 80)
            logger.info(f"[MULTI_SPEAKER_SYNTH] ✅ SYNTHÈSE COMPLÈTE RÉUSSIE")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    ├─ Durée de génération: {synth_time}ms")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    ├─ Durée audio: {tts_result.duration_ms}ms ({tts_result.duration_ms/1000:.1f}s)")
            logger.info(f"[MULTI_SPEAKER_SYNTH]    └─ Fichier: {output_path}")
            logger.info("=" * 80)

            return (output_path, tts_result.duration_ms)

        except Exception as e:
            logger.error(f"[MULTI_SPEAKER_SYNTH] ❌ Erreur synthèse complète: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def synthesize_multi_speaker(
        self,
        segments: List[Dict[str, Any]],
        translated_segments: List[Dict[str, Any]],
        speaker_voice_maps: Dict[str, SpeakerVoiceMap],
        target_language: str,
        output_path: str,
        message_id: str = "unknown"
    ) -> Optional[Tuple[str, int, List[SegmentSynthesisResult]]]:
        """
        Synthétise un audio multi-speakers avec préservation des voix et silences.

        Pipeline:
        1. Détecter les silences entre segments
        2. Enrichir les segments avec info de silence
        3. Synthétiser chaque segment avec la bonne voix
        4. Concaténer avec les silences

        Args:
            segments: Segments source (pour timing et silences)
            translated_segments: Segments traduits (texte à synthétiser)
            speaker_voice_maps: Mapping speaker_id → voice model
            target_language: Langue cible
            output_path: Chemin du fichier de sortie
            message_id: ID du message (pour logging)

        Returns:
            Tuple (audio_path, duration_ms, synthesis_results) ou None
        """
        synthesis_start = time.time()

        logger.info(
            f"[MULTI_SPEAKER_SYNTH] 🎙️ Synthèse multi-speaker: "
            f"{len(translated_segments)} segments, "
            f"{len(speaker_voice_maps)} speakers"
        )

        try:
            # 1. Détecter les silences
            silences = self.silence_manager.detect_silences_from_segments(segments)

            # 2. Enrichir les segments avec les silences
            enriched_segments = self.silence_manager.create_segments_with_silence(
                segments=translated_segments,
                silences=silences
            )

            # 3. Synthétiser chaque segment
            synthesis_results = await self._synthesize_segments(
                enriched_segments=enriched_segments,
                speaker_voice_maps=speaker_voice_maps,
                target_language=target_language,
                message_id=message_id
            )

            # 4. Concaténer les audios
            audio_files = []
            silences_ms = []

            for result in synthesis_results:
                if result.success and result.audio_path:
                    # Ajouter le silence avant (sauf pour le premier segment)
                    if audio_files and result.silence_before_ms > 0:
                        silences_ms.append(result.silence_before_ms)
                    elif audio_files:
                        silences_ms.append(0)

                    audio_files.append(result.audio_path)

            if not audio_files:
                logger.error("[MULTI_SPEAKER_SYNTH] ❌ Aucun audio synthétisé avec succès")
                return None

            # Concaténer
            logger.info(
                f"[MULTI_SPEAKER_SYNTH] 🔗 Concaténation: "
                f"{len(audio_files)} audios, {len(silences_ms)} silences"
            )

            final_audio = await self.silence_manager.concatenate_audio_with_silences(
                audio_files=audio_files,
                silences_ms=silences_ms,
                output_path=output_path,
                format="mp3"
            )

            if not final_audio:
                logger.error("[MULTI_SPEAKER_SYNTH] ❌ Échec de la concaténation")
                return None

            # Calculer la durée totale
            total_duration_ms = sum(r.duration_ms for r in synthesis_results if r.success)
            total_duration_ms += sum(silences_ms)

            synthesis_time = int((time.time() - synthesis_start) * 1000)

            logger.info(
                f"[MULTI_SPEAKER_SYNTH] ✅ Synthèse multi-speaker terminée: "
                f"{final_audio} (durée: {total_duration_ms}ms, temps: {synthesis_time}ms)"
            )

            return (final_audio, total_duration_ms, synthesis_results)

        except Exception as e:
            logger.error(f"[MULTI_SPEAKER_SYNTH] ❌ Erreur synthèse multi-speaker: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def _synthesize_segments(
        self,
        enriched_segments: List[AudioSegmentWithSilence],
        speaker_voice_maps: Dict[str, SpeakerVoiceMap],
        target_language: str,
        message_id: str
    ) -> List[SegmentSynthesisResult]:
        """
        Synthétise tous les segments avec leurs voix respectives.

        OPTIMISATION: Synthèse PARALLÈLE de tous les segments pour réduire le temps total.

        Args:
            enriched_segments: Segments enrichis avec info de silence
            speaker_voice_maps: Mapping speaker → voice model
            target_language: Langue cible
            message_id: ID du message

        Returns:
            Liste des résultats de synthèse (ordonnés par index)
        """
        import asyncio

        logger.info(
            f"[MULTI_SPEAKER_SYNTH] ⚡ PARALLÉLISATION: {len(enriched_segments)} segments"
        )

        async def synthesize_single_segment(i: int, seg: AudioSegmentWithSilence) -> SegmentSynthesisResult:
            """Synthétise un segment individuel (pour parallélisation)"""
            try:
                # Récupérer le voice model pour ce speaker
                speaker_map = speaker_voice_maps.get(seg.speaker_id)

                if not speaker_map:
                    logger.debug(
                        f"[MULTI_SPEAKER_SYNTH] Segment {i}: voix générique pour {seg.speaker_id}"
                    )

                # Synthétiser
                if speaker_map and speaker_map.voice_model:
                    tts_result = await self.tts_service.synthesize_with_voice(
                        text=seg.text,
                        speaker_audio_path=speaker_map.audio_reference_path,
                        target_language=target_language,
                        output_format="mp3",
                        message_id=f"{message_id}_seg_{i}"
                    )
                else:
                    # Voix générique
                    tts_result = await self.tts_service.synthesize(
                        text=seg.text,
                        language=target_language,
                        output_format="mp3"
                    )

                if tts_result and tts_result.audio_path:
                    return SegmentSynthesisResult(
                        segment_index=i,
                        speaker_id=seg.speaker_id,
                        text=seg.text,
                        audio_path=tts_result.audio_path,
                        duration_ms=tts_result.duration_ms,
                        silence_before_ms=seg.silence_before_ms,
                        silence_after_ms=seg.silence_after_ms,
                        success=True
                    )
                else:
                    raise Exception("TTS result is None or missing audio_path")

            except Exception as e:
                logger.error(f"[MULTI_SPEAKER_SYNTH] ❌ Segment {i}: {e}")
                return SegmentSynthesisResult(
                    segment_index=i,
                    speaker_id=seg.speaker_id,
                    text=seg.text,
                    audio_path="",
                    duration_ms=0,
                    silence_before_ms=seg.silence_before_ms,
                    silence_after_ms=seg.silence_after_ms,
                    success=False,
                    error_message=str(e)
                )

        # ═══════════════════════════════════════════════════════════════════
        # SYNTHÈSE PARALLÈLE avec asyncio.gather()
        # Tous les segments sont synthétisés en même temps!
        # ═══════════════════════════════════════════════════════════════════
        tasks = [
            synthesize_single_segment(i, seg)
            for i, seg in enumerate(enriched_segments)
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filtrer les exceptions et convertir en SegmentSynthesisResult
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"[MULTI_SPEAKER_SYNTH] Exception segment {i}: {result}")
                final_results.append(SegmentSynthesisResult(
                    segment_index=i,
                    speaker_id=enriched_segments[i].speaker_id,
                    text=enriched_segments[i].text,
                    audio_path="",
                    duration_ms=0,
                    silence_before_ms=enriched_segments[i].silence_before_ms,
                    silence_after_ms=enriched_segments[i].silence_after_ms,
                    success=False,
                    error_message=str(result)
                ))
            else:
                final_results.append(result)

        # Trier par index pour maintenir l'ordre
        final_results.sort(key=lambda x: x.segment_index)

        success_count = sum(1 for r in final_results if r.success)
        logger.info(
            f"[MULTI_SPEAKER_SYNTH] ✅ Synthèse PARALLÈLE: "
            f"{success_count}/{len(enriched_segments)} réussis"
        )

        return final_results

    async def cleanup_temp_files(self, synthesis_results: List[SegmentSynthesisResult]):
        """
        Nettoie les fichiers temporaires de synthèse.

        Args:
            synthesis_results: Résultats de synthèse contenant les chemins
        """
        for result in synthesis_results:
            if result.success and result.audio_path and os.path.exists(result.audio_path):
                try:
                    os.remove(result.audio_path)
                    logger.debug(f"[MULTI_SPEAKER_SYNTH] Nettoyage: {result.audio_path}")
                except Exception as e:
                    logger.warning(f"[MULTI_SPEAKER_SYNTH] Erreur nettoyage {result.audio_path}: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du synthétiseur"""
        return {
            "temp_dir": self.temp_dir,
            "silence_manager": self.silence_manager.get_stats()
        }


# Factory function
def create_multi_speaker_synthesizer(
    tts_service,
    voice_clone_service,
    preserve_silences: bool = True,
    temp_dir: str = "/tmp/multi_speaker_tts"
) -> MultiSpeakerSynthesizer:
    """
    Crée une instance de MultiSpeakerSynthesizer.

    Args:
        tts_service: Service TTS
        voice_clone_service: Service de clonage vocal
        preserve_silences: Préserver les silences naturels
        temp_dir: Répertoire temporaire

    Returns:
        Instance de MultiSpeakerSynthesizer
    """
    silence_manager = create_silence_manager(preserve_silences=preserve_silences)

    return MultiSpeakerSynthesizer(
        tts_service=tts_service,
        voice_clone_service=voice_clone_service,
        silence_manager=silence_manager,
        temp_dir=temp_dir
    )
