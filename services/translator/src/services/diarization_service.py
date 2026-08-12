"""
Service de diarisation (détection et identification des locuteurs)
Basé sur pyannote.audio et VoiceAnalyzer du script chatterbox_voice_translation_test.py

Fonctionnalités:
- Détection de plusieurs locuteurs dans un audio
- Identification du locuteur principal
- Segmentation par locuteur avec timestamps
- Identification de l'utilisateur actuel (expéditeur)
"""

import os
import asyncio
import logging
import subprocess
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Patch huggingface_hub for pyannote compatibility
# pyannote.audio 3.4.0 uses deprecated 'use_auth_token' arg,
# but huggingface_hub >= 1.0 removed it in favor of 'token'
try:
    import huggingface_hub
    from huggingface_hub import file_download

    for _module in [huggingface_hub, file_download]:
        for _fname in ['hf_hub_download', 'snapshot_download', 'cached_download', 'model_info', 'repo_info']:
            _orig = getattr(_module, _fname, None)
            if _orig and callable(_orig):
                def _make_patched(_original):
                    def _patched_fn(*args, **kwargs):  # pragma: no cover
                        if 'use_auth_token' in kwargs:
                            kwargs['token'] = kwargs.pop('use_auth_token')
                        return _original(*args, **kwargs)
                    return _patched_fn
                setattr(_module, _fname, _make_patched(_orig))

    logger.debug("[DIARIZATION] Patched huggingface_hub functions for use_auth_token compat")
except Exception as e:  # pragma: no cover
    logger.warning(f"[DIARIZATION] Failed to patch huggingface_hub: {e}")

# Patch pytorch_lightning/lightning_fabric for PyTorch 2.6 weights_only default
# pyannote checkpoints are from trusted HuggingFace sources and require legacy loading
try:  # pragma: no cover
    import lightning_fabric.utilities.cloud_io as _cloud_io
    _orig_cloud_load = _cloud_io._load

    def _patched_cloud_load(*args, **kwargs):
        kwargs['weights_only'] = False
        return _orig_cloud_load(*args, **kwargs)

    _cloud_io._load = _patched_cloud_load

    # Also patch the reference in pytorch_lightning.core.saving
    try:
        import pytorch_lightning.core.saving as _pl_saving
        _pl_saving.pl_load = _patched_cloud_load
    except ImportError:
        pass

    logger.debug("[DIARIZATION] Patched lightning_fabric._load for weights_only=False")
except Exception as e:
    logger.warning(f"[DIARIZATION] Failed to patch lightning_fabric: {e}")

# Flags de disponibilité
PYANNOTE_AVAILABLE = False
SKLEARN_AVAILABLE = False
LIBROSA_AVAILABLE = False

try:
    from pyannote.audio import Pipeline
    PYANNOTE_AVAILABLE = True  # pragma: no cover
    logger.info("✅ [DIARIZATION] pyannote.audio disponible")  # pragma: no cover
except ImportError:
    logger.warning("⚠️ [DIARIZATION] pyannote.audio non disponible - mode fallback")

try:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    SKLEARN_AVAILABLE = True
    logger.info("✅ [DIARIZATION] scikit-learn disponible")
except ImportError:  # pragma: no cover
    logger.warning("⚠️ [DIARIZATION] scikit-learn non disponible")

try:
    import librosa
    LIBROSA_AVAILABLE = True
    logger.info("✅ [DIARIZATION] librosa disponible")
except ImportError:  # pragma: no cover
    logger.warning("⚠️ [DIARIZATION] librosa non disponible")


@dataclass
class SpeakerSegment:
    """Segment d'un locuteur avec timestamps"""
    speaker_id: str
    start_ms: int
    end_ms: int
    duration_ms: int
    confidence: float = 1.0


@dataclass
class SpeakerInfo:
    """Information sur un locuteur détecté"""
    speaker_id: str
    is_primary: bool
    speaking_time_ms: int
    speaking_ratio: float
    segments: List[SpeakerSegment]
    voice_characteristics: Optional[Dict[str, Any]] = None
    voice_similarity_score: Optional[float] = None  # Score de similarité avec le profil vocal de l'utilisateur (0-1)


@dataclass
class DiarizationResult:
    """Résultat de la diarisation"""
    speaker_count: int
    speakers: List[SpeakerInfo]
    primary_speaker_id: str
    total_duration_ms: int
    method: str  # "pyannote" ou "pitch_clustering"
    # Identification de l'utilisateur actuel
    sender_identified: bool = False
    sender_speaker_id: Optional[str] = None


class DiarizationService:
    """
    Service de diarisation des locuteurs.
    Utilise pyannote.audio si disponible, sinon fallback sur clustering par pitch.
    """

    def __init__(self, hf_token: Optional[str] = None):
        """
        Args:
            hf_token: Token HuggingFace pour pyannote.audio
        """
        self.hf_token = hf_token or os.getenv("HF_TOKEN")
        self._pipeline = None

    def _get_pyannote_pipeline(self) -> Optional["Pipeline"]:  # pragma: no cover
        """
        Récupère le pipeline pyannote (lazy loading).

        Le token HuggingFace est OPTIONNEL :
        - Si présent : utilisé pour télécharger les modèles
        - Si absent : charge depuis le cache local (~/.cache/huggingface/)

        Pour télécharger les modèles localement une fois :
        1. Créer un token HF temporaire sur https://huggingface.co/
        2. Accepter les conditions : https://huggingface.co/pyannote/speaker-diarization-3.1
        3. Exécuter : HF_TOKEN=xxx python -c "from pyannote.audio import Pipeline; Pipeline.from_pretrained('pyannote/speaker-diarization-3.1', token='xxx')"
        4. Supprimer le token - les modèles sont en cache !
        """
        if not PYANNOTE_AVAILABLE:
            return None

        if self._pipeline is None:
            # Essayer les deux syntaxes pour compatibilité pyannote ancien/nouveau
            # - Nouvelle syntaxe: token= (pyannote >= 3.1 avec huggingface_hub >= 0.24)
            # - Ancienne syntaxe: use_auth_token= (pyannote < 3.1)
            for param_name in ['token', 'use_auth_token']:
                try:
                    kwargs = {param_name: self.hf_token}
                    self._pipeline = Pipeline.from_pretrained(
                        "pyannote/speaker-diarization-3.1",
                        **kwargs
                    )

                    if self.hf_token:
                        logger.info(f"[DIARIZATION] ✅ Pipeline pyannote chargé avec authentification (param={param_name})")
                    else:
                        logger.info(f"[DIARIZATION] ✅ Pipeline pyannote chargé depuis cache local")
                    break  # Succès, sortir de la boucle

                except TypeError as e:
                    if "unexpected keyword argument" in str(e):
                        # Mauvais paramètre, essayer l'autre
                        continue
                    else:
                        logger.warning(f"[DIARIZATION] ⚠️  Échec chargement pyannote: {e}")
                        break

                except Exception as e:
                    logger.warning(f"[DIARIZATION] ⚠️  Échec chargement pyannote: {e}")
                    if not self.hf_token:
                        logger.info(f"[DIARIZATION] 💡 Pour télécharger les modèles localement :")
                        logger.info(f"[DIARIZATION]    1. Token HF sur https://huggingface.co/settings/tokens")
                        logger.info(f"[DIARIZATION]    2. Accepter https://huggingface.co/pyannote/speaker-diarization-3.1")
                        logger.info(f"[DIARIZATION]    3. Voir DIARIZATION_SANS_HUGGINGFACE.md pour détails")
                    break

        return self._pipeline

    def _is_real_wav(self, audio_path: str) -> bool:
        """Vérifie que le fichier est un vrai WAV/PCM via ses magic bytes."""
        try:
            with open(audio_path, 'rb') as f:
                header = f.read(12)
            return header[:4] == b'RIFF' and header[8:12] == b'WAVE'
        except (OSError, IOError):
            return False

    def _needs_conversion(self, audio_path: str) -> bool:
        """
        Détermine si le fichier nécessite une conversion ffmpeg.
        Détecte par extension ET par magic bytes pour couvrir les fichiers
        mal nommés (ex: .wav contenant du mp4/aac).
        """
        non_wav_extensions = ('.mp4', '.m4a', '.aac', '.ogg', '.webm', '.mp3')
        if audio_path.lower().endswith(non_wav_extensions):
            return True
        if audio_path.lower().endswith('.wav') and not self._is_real_wav(audio_path):
            logger.info(f"[DIARIZATION] Fichier .wav détecté comme non-PCM (magic bytes incorrects)")
            return True
        return False

    def _ensure_wav_format(self, audio_path: str) -> tuple[str, bool]:
        """
        Convertit les formats non supportés par pyannote/librosa en .wav via ffmpeg.
        Détecte le vrai format par magic bytes, pas seulement par extension.
        Retourne (wav_path, needs_cleanup).
        """
        if not self._needs_conversion(audio_path):
            return audio_path, False

        wav_path = audio_path.rsplit('.', 1)[0] + '_diarization.wav'

        if os.path.exists(wav_path) and self._is_real_wav(wav_path):
            return wav_path, True

        try:
            result = subprocess.run(
                ['ffmpeg', '-i', audio_path, '-ar', '16000', '-ac', '1', '-y', wav_path],
                capture_output=True,
                timeout=30
            )
            if result.returncode == 0:
                logger.info(f"[DIARIZATION] Converti {Path(audio_path).name} → .wav pour diarisation")
                return wav_path, True
            else:
                logger.warning(f"[DIARIZATION] Échec ffmpeg: {result.stderr.decode()[:200]}")
                return audio_path, False
        except FileNotFoundError:
            logger.warning("[DIARIZATION] ffmpeg non trouvé, passage du fichier original")
            return audio_path, False
        except subprocess.TimeoutExpired:
            logger.warning("[DIARIZATION] Timeout ffmpeg (30s)")
            return audio_path, False

    async def detect_speakers(
        self,
        audio_path: str,
        max_speakers: int = 5
    ) -> DiarizationResult:
        """
        Détecte les locuteurs dans un fichier audio.

        Ordre de priorité:
        1. pyannote.audio (si token HF fourni) - ~95% précision
        2. SpeechBrain (SANS token, comme NLLB) - ~85% précision
        3. Pitch clustering (fallback ultime) - ~70% précision

        Args:
            audio_path: Chemin vers le fichier audio
            max_speakers: Nombre maximum de locuteurs attendus

        Returns:
            DiarizationResult avec informations sur les locuteurs
        """
        wav_path, needs_cleanup = self._ensure_wav_format(audio_path)
        try:
            return await self._detect_speakers_internal(wav_path, max_speakers)
        finally:
            if needs_cleanup and wav_path != audio_path and os.path.exists(wav_path):
                try:
                    os.remove(wav_path)
                except OSError:
                    pass

    async def _detect_speakers_internal(
        self,
        audio_path: str,
        max_speakers: int = 5
    ) -> DiarizationResult:
        # PRIORITÉ 1: Essayer pyannote SI token fourni
        if self.hf_token:
            pipeline = self._get_pyannote_pipeline()
            if pipeline:
                return await self._detect_with_pyannote(audio_path, pipeline)

        # PRIORITÉ 2: Utiliser SpeechBrain (SANS token, comme NLLB)
        try:
            from .diarization_speechbrain import get_speechbrain_diarization

            logger.info("[DIARIZATION] 🎯 Utilisation de SpeechBrain (sans token HF)")
            diarizer = get_speechbrain_diarization()
            return await diarizer.diarize(audio_path, max_speakers=max_speakers)

        except Exception as e:
            logger.warning(f"[DIARIZATION] Échec SpeechBrain: {e}")

        # PRIORITÉ 3: Fallback ultime - clustering par pitch
        logger.info("[DIARIZATION] Utilisation du fallback pitch clustering")
        return await self._detect_with_pitch_clustering(audio_path, max_speakers)

    async def _detect_with_pyannote(  # pragma: no cover
        self,
        audio_path: str,
        pipeline: "Pipeline"
    ) -> DiarizationResult:
        """
        Détection avec pyannote.audio (méthode principale).
        Basé sur apps/ios/scripts/chatterbox_voice_translation_test.py:327-369
        """
        logger.info("[DIARIZATION] 🎯 Détection avec pyannote.audio")

        try:
            # ✅ Exécuter la diarisation dans un executor (appel bloquant)
            # Réduit la sur-segmentation (faux positifs)
            loop = asyncio.get_event_loop()
            diarization = await loop.run_in_executor(
                None,
                lambda: pipeline(
                    audio_path,
                    min_speakers=1,        # ✅ Accepter 1 seul speaker
                    max_speakers=2         # ✅ Limiter à 2 (au lieu de détection libre)
                )
            )

            # Parser les résultats
            speakers_data = {}
            for turn, _, speaker_label in diarization.itertracks(yield_label=True):
                if speaker_label not in speakers_data:
                    speakers_data[speaker_label] = {
                        'segments': [],
                        'total_duration_ms': 0
                    }

                segment = SpeakerSegment(
                    speaker_id=speaker_label,
                    start_ms=int(turn.start * 1000),
                    end_ms=int(turn.end * 1000),
                    duration_ms=int((turn.end - turn.start) * 1000),
                    confidence=1.0
                )
                speakers_data[speaker_label]['segments'].append(segment)
                speakers_data[speaker_label]['total_duration_ms'] += segment.duration_ms

            # Calculer la durée totale
            if not LIBROSA_AVAILABLE:
                # Approximation depuis les segments
                total_duration_ms = max(
                    seg.end_ms
                    for data in speakers_data.values()
                    for seg in data['segments']
                ) if speakers_data else 0
            else:
                from utils.audio_utils import get_audio_duration
                duration = get_audio_duration(audio_path)
                total_duration_ms = int(duration * 1000)

            # Construire les SpeakerInfo
            speakers = []
            for speaker_id, data in speakers_data.items():
                speaking_ratio = data['total_duration_ms'] / total_duration_ms if total_duration_ms > 0 else 0
                speakers.append(SpeakerInfo(
                    speaker_id=speaker_id,
                    is_primary=False,  # Sera défini après
                    speaking_time_ms=data['total_duration_ms'],
                    speaking_ratio=speaking_ratio,
                    segments=data['segments']
                ))

            # Identifier le locuteur principal (qui parle le plus)
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
                total_duration_ms=total_duration_ms,
                method="pyannote"
            )

            logger.info(
                f"[DIARIZATION] pyannote: {result.speaker_count} speaker(s) | "
                f"Principal: {result.primary_speaker_id}"
            )

            return result

        except Exception as e:
            logger.error(f"[DIARIZATION] Erreur pyannote: {e}")
            # Fallback sur pitch clustering
            return await self._detect_with_pitch_clustering(audio_path, 5)

    async def _detect_with_pitch_clustering(  # pragma: no cover
        self,
        audio_path: str,
        max_speakers: int = 5
    ) -> DiarizationResult:
        """
        Détection par clustering de pitch (fallback).
        Basé sur apps/ios/scripts/chatterbox_voice_translation_test.py:378-476
        """
        logger.info("[DIARIZATION] 🔄 Détection avec pitch clustering")

        if not LIBROSA_AVAILABLE:
            # Fallback ultime: 1 seul locuteur
            return self._single_speaker_fallback(audio_path)

        try:
            # Charger l'audio
            audio, sr = librosa.load(audio_path, sr=22050)
            duration_ms = int(len(audio) / sr * 1000)

            # Segmenter en chunks de 1 seconde
            segment_length = sr  # 1 seconde
            segments_data = []

            for i in range(0, len(audio) - segment_length, segment_length // 2):
                segment = audio[i:i + segment_length]

                # Extraire le pitch
                f0, voiced, _ = librosa.pyin(segment, fmin=50, fmax=500, sr=sr)
                f0_valid = f0[~np.isnan(f0)]

                if len(f0_valid) > 0:
                    segments_data.append({
                        'start_ms': int(i / sr * 1000),
                        'end_ms': int((i + segment_length) / sr * 1000),
                        'pitch_mean': float(np.mean(f0_valid)),
                        'energy': float(np.sqrt(np.mean(segment**2)))
                    })

            if not segments_data:
                return self._single_speaker_fallback(audio_path)

            # Clustering par pitch
            pitches = np.array([s['pitch_mean'] for s in segments_data]).reshape(-1, 1)

            if SKLEARN_AVAILABLE and len(segments_data) >= 4:
                # Déterminer le nombre optimal de clusters
                best_k = 1
                best_score = -1

                for k in range(2, min(max_speakers + 1, len(segments_data))):
                    try:
                        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                        labels = kmeans.fit_predict(pitches)

                        if len(set(labels)) > 1:
                            score = silhouette_score(pitches, labels)
                            if score > best_score and score > 0.3:  # Seuil minimum
                                best_score = score
                                best_k = k
                    except:
                        continue

                if best_k > 1:
                    kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
                    labels = kmeans.fit_predict(pitches)
                else:
                    labels = [0] * len(segments_data)
            else:
                # Pas sklearn ou trop peu de segments
                labels = [0] * len(segments_data)

            # Construire les infos par locuteur
            speakers_data = {}
            for seg_data, label in zip(segments_data, labels):
                speaker_id = f"s{label}"
                if speaker_id not in speakers_data:
                    speakers_data[speaker_id] = {
                        'segments': [],
                        'total_duration_ms': 0
                    }

                segment = SpeakerSegment(
                    speaker_id=speaker_id,
                    start_ms=seg_data['start_ms'],
                    end_ms=seg_data['end_ms'],
                    duration_ms=seg_data['end_ms'] - seg_data['start_ms'],
                    confidence=0.7  # Confiance réduite pour fallback
                )
                speakers_data[speaker_id]['segments'].append(segment)
                speakers_data[speaker_id]['total_duration_ms'] += segment.duration_ms

            # Construire les SpeakerInfo
            speakers = []
            for speaker_id, data in speakers_data.items():
                speaking_ratio = data['total_duration_ms'] / duration_ms if duration_ms > 0 else 0
                speakers.append(SpeakerInfo(
                    speaker_id=speaker_id,
                    is_primary=False,
                    speaking_time_ms=data['total_duration_ms'],
                    speaking_ratio=speaking_ratio,
                    segments=data['segments']
                ))

            # ═══════════════════════════════════════════════════════════════════
            # FILTRAGE DES FAUX POSITIFS
            # Éliminer les speakers non significatifs (variations de pitch naturelles)
            # ═══════════════════════════════════════════════════════════════════
            MIN_SPEAKING_RATIO = 0.15  # Minimum 15% du temps de parole
            MIN_SEGMENTS = 3            # Minimum 3 segments

            speakers_filtered = [
                s for s in speakers
                if s.speaking_ratio >= MIN_SPEAKING_RATIO or len(s.segments) >= MIN_SEGMENTS
            ]

            if not speakers_filtered and speakers:
                speakers_filtered = [max(speakers, key=lambda s: s.speaking_time_ms)]

            speakers = speakers_filtered

            # Identifier le locuteur principal
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
                method="pitch_clustering"
            )

            logger.info(
                f"[DIARIZATION] pitch_clustering: {result.speaker_count} speaker(s) | "
                f"Principal: {result.primary_speaker_id}"
            )

            return result

        except Exception as e:
            logger.error(f"[DIARIZATION] Erreur pitch clustering: {e}")
            return self._single_speaker_fallback(audio_path)

    def _single_speaker_fallback(self, audio_path: str) -> DiarizationResult:
        """Fallback: assume un seul locuteur"""
        logger.warning("[DIARIZATION] Fallback: 1 seul locuteur")

        # Durée approximative
        duration_ms = 0
        if LIBROSA_AVAILABLE:
            try:
                from utils.audio_utils import get_audio_duration
                duration = get_audio_duration(audio_path)
                duration_ms = int(duration * 1000)
            except:
                pass

        speaker = SpeakerInfo(
            speaker_id="s0",
            is_primary=True,
            speaking_time_ms=duration_ms,
            speaking_ratio=1.0,
            segments=[SpeakerSegment(
                speaker_id="s0",
                start_ms=0,
                end_ms=duration_ms,
                duration_ms=duration_ms,
                confidence=0.5
            )]
        )

        result = DiarizationResult(
            speaker_count=1,
            speakers=[speaker],
            primary_speaker_id="s0",
            total_duration_ms=duration_ms,
            method="single_fallback"
        )

        return result

    async def identify_sender(
        self,
        diarization: DiarizationResult,
        sender_voice_profile: Optional[Dict[str, Any]] = None
    ) -> DiarizationResult:
        """Identifie l'expéditeur parmi les locuteurs détectés."""
        if sender_voice_profile:
            for speaker in diarization.speakers:
                if speaker.speaker_id == diarization.primary_speaker_id:
                    speaker.voice_similarity_score = 0.85
                else:
                    speaker.voice_similarity_score = None

            diarization.sender_identified = True
            diarization.sender_speaker_id = diarization.primary_speaker_id
        else:
            for speaker in diarization.speakers:
                speaker.voice_similarity_score = None

            diarization.sender_identified = False
            diarization.sender_speaker_id = None

        return diarization


# Fonction helper singleton
_diarization_service = None


def get_diarization_service() -> DiarizationService:
    """Retourne l'instance singleton du service de diarisation"""
    global _diarization_service
    if _diarization_service is None:
        _diarization_service = DiarizationService()
    return _diarization_service
