"""
Analyseur de voix pour extraction de caractéristiques détaillées.
Utilise librosa pour l'analyse audio et pyannote (optionnel) pour la diarisation.
"""

import os
import logging
import asyncio
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime

from .voice_metadata import RecordingMetadata, SpeakerInfo
from .voice_fingerprint import VoiceFingerprint
from models.voice_models import VoiceCharacteristics

logger = logging.getLogger(__name__)


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
            import librosa

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
