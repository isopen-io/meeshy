"""
Service de transcription audio - Singleton
Supporte les transcriptions mobiles (metadata) et serveur (Whisper)
Architecture: Chargement non-bloquant, compatible avec le pattern du TranslationMLService

INTEGRATION: Ce service utilise le ModelManager centralisé pour:
- Gestion unifiée de la mémoire GPU/CPU
- Éviction LRU automatique des modèles peu utilisés
- Statistiques globales sur tous les modèles
- Chemins de stockage standardisés
"""

import os
import logging
import time
import asyncio
import threading
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from pathlib import Path

# Import du ModelManager centralisé
from .model_manager import (
    get_model_manager,
    get_model_paths,
    register_stt_model,
    get_stt_model,
    STTBackend,
    ModelType
)

# Import du smart segment merger pour fusionner intelligemment les mots courts
from utils.smart_segment_merger import merge_short_segments

# Configuration du logging
logger = logging.getLogger(__name__)

# Flags de disponibilité des dépendances
WHISPER_AVAILABLE = False
AUDIO_PROCESSING_AVAILABLE = False

try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
    logger.info("✅ [TRANSCRIPTION] faster-whisper disponible")
except ImportError:
    logger.warning("⚠️ [TRANSCRIPTION] faster-whisper non disponible - transcription serveur désactivée")

try:
    import soundfile as sf
    import librosa
    AUDIO_PROCESSING_AVAILABLE = True
    logger.info("✅ [TRANSCRIPTION] soundfile/librosa disponibles")
except ImportError:
    logger.warning("⚠️ [TRANSCRIPTION] soundfile/librosa non disponibles")


from utils.audio_utils import get_audio_duration as _get_librosa_duration


@dataclass
class TranscriptionSegment:
    """
    Segment de transcription avec timestamps et identification du locuteur.
    Aligné avec TypeScript shared/types/attachment-transcription.ts
    """
    text: str
    start_ms: int
    end_ms: int
    confidence: float = 0.0
    speaker_id: Optional[str] = None  # ID du locuteur (via diarisation)
    voice_similarity_score: Optional[float] = None  # Score de similarité vocale avec l utilisateur (0-1)
    language: Optional[str] = None  # Langue détectée du segment


@dataclass
class TranscriptionResult:
    """
    Résultat d'une transcription avec support de diarisation.
    Aligné avec TypeScript shared/types/audio-transcription.ts
    """
    text: str
    language: str
    confidence: float
    segments: List[TranscriptionSegment] = field(default_factory=list)
    duration_ms: int = 0
    source: str = "whisper"  # "mobile" ou "whisper"
    model: Optional[str] = None
    processing_time_ms: int = 0

    # === SPEAKER DIARIZATION (Multi-speaker support) ===
    speaker_count: Optional[int] = None  # Nombre de locuteurs détectés
    primary_speaker_id: Optional[str] = None  # ID du locuteur principal
    speaker_analysis: Optional[Dict[str, Any]] = None  # Métadonnées d'analyse
    sender_voice_identified: Optional[bool] = None  # L'expéditeur a été identifié
    sender_speaker_id: Optional[str] = None  # ID du locuteur expéditeur
    diarization_speakers: Optional[List[Any]] = None  # Segments de diarization bruts (pour clonage vocal propre)


class TranscriptionService:
    """
    Service de transcription audio - Singleton
    Supporte:
    - Transcription mobile (passthrough des métadonnées)
    - Transcription serveur via faster-whisper
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        """Singleton pattern pour garantir une seule instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        model_size: str = "large-v3",
        device: str = "cpu",
        compute_type: str = "int8",  # int8 pour CPU (float16 non supporté sur CPU Mac)
        models_path: Optional[str] = None
    ):
        if self._initialized:
            return

        # Configuration - utilise les chemins centralisés du ModelManager
        model_paths = get_model_paths()
        self.model_size = os.getenv('WHISPER_MODEL', model_size)
        self.device = os.getenv('WHISPER_DEVICE', device)
        self.compute_type = os.getenv('WHISPER_COMPUTE_TYPE', compute_type)
        # Utilise le chemin centralisé pour Whisper (peut être override)
        self.models_path = models_path or str(model_paths.stt_whisper)

        # NOTE: Le modèle est maintenant géré par le ModelManager centralisé
        # au lieu d'un attribut local. Cela permet:
        # - Gestion mémoire unifiée
        # - Éviction LRU automatique
        # - Statistiques globales

        # ID du modèle dans le ModelManager
        self._model_id = f"stt_whisper_{self.model_size.replace('-', '_')}"

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        logger.info(f"[TRANSCRIPTION] Service créé: model={self.model_size}, device={self.device}")
        self._initialized = True

    async def initialize(self) -> bool:
        """
        Charge le modèle Whisper de manière non-bloquante.
        Peut être appelé plusieurs fois sans effet (idempotent).
        """
        if self.is_initialized:
            return True

        async with self._init_lock:
            # Double-check après acquisition du lock
            if self.is_initialized:
                return True

            if not WHISPER_AVAILABLE:
                logger.warning("[TRANSCRIPTION] Whisper non disponible - mode mobile uniquement")
                self.is_initialized = True
                return True

            # Vérifier si déjà dans le ModelManager
            existing = get_stt_model(self._model_id)
            if existing is not None:
                logger.info(f"[TRANSCRIPTION] ✅ Modèle Whisper déjà chargé via ModelManager")
                self.is_initialized = True
                return True

            try:
                start_time = time.time()
                logger.info(f"[TRANSCRIPTION] 🔄 Chargement du modèle Whisper {self.model_size}...")

                # Charger le modèle dans un thread pour ne pas bloquer
                loop = asyncio.get_event_loop()
                model = await loop.run_in_executor(
                    None,
                    self._load_whisper_model
                )

                # Enregistrer dans le ModelManager centralisé
                # Priority 1 = haute (STT est critique, ne pas évicté)
                register_stt_model(
                    model_id=self._model_id,
                    model_object=model,
                    backend=STTBackend.WHISPER_LARGE.value if "large" in self.model_size else STTBackend.WHISPER.value,
                    model_name=f"Whisper-{self.model_size}",
                    priority=1  # Haute priorité - ne pas évicter
                )

                load_time = time.time() - start_time
                logger.info(f"[TRANSCRIPTION] ✅ Modèle Whisper chargé et enregistré en {load_time:.2f}s")

                # Log de l'état de la diarisation
                enable_diarization = os.getenv('ENABLE_DIARIZATION', 'true').lower() != 'false'
                if enable_diarization:
                    logger.info("[TRANSCRIPTION] 🎯 Diarisation des locuteurs ACTIVÉE (désactiver avec ENABLE_DIARIZATION=false)")
                else:
                    logger.info("[TRANSCRIPTION] ⚪ Diarisation des locuteurs DÉSACTIVÉE (activer avec ENABLE_DIARIZATION=true)")

                self.is_initialized = True
                return True

            except Exception as e:
                logger.error(f"[TRANSCRIPTION] ❌ Erreur chargement Whisper: {e}")
                import traceback
                traceback.print_exc()
                # On considère quand même initialisé (mode mobile uniquement)
                self.is_initialized = True
                return True

    def _load_whisper_model(self):
        """Charge le modèle Whisper (appelé dans un thread)"""
        return WhisperModel(
            self.model_size,
            device=self.device,
            compute_type=self.compute_type,
            download_root=self.models_path
        )

    def _is_whisper_hallucination(self, segment: TranscriptionSegment) -> bool:
        """
        Détecte les hallucinations communes de Whisper.

        Whisper a tendance à halluciner des phrases de fin de vidéo YouTube:
        - "Thanks for watching"
        - "Subscribe"
        - "Like and subscribe"
        - Etc.

        Ces hallucinations ont généralement:
        - Durée nulle ou très courte (startMs == endMs)
        - Confidence très basse (< 0.3)
        - Texte correspondant à des phrases communes
        """
        # Phrases d'hallucination communes (complètes) - multi-langue
        HALLUCINATION_PHRASES = {
            # English (YouTube endings)
            'thanks for watching',
            'thank you for watching',
            'thanks for watching!',
            'thank you for watching!',
            'subscribe',
            'subscribe!',
            'like and subscribe',
            'please subscribe',
            'don\'t forget to subscribe',
            'like comment subscribe',
            'smash that like button',
            'hit the bell',
            'turn on notifications',
            # Russian (very common Whisper hallucination)
            'продолжение следует',
            'продолжение следует...',
            # French (subtitle hallucinations)
            'sous-titres réalisés par la communauté d\'amara.org',
            'sous-titrage st\'501',
            'merci d\'avoir regardé',
            # Chinese
            '请订阅',
            '谢谢观看',
            # Spanish
            'gracias por ver',
            'suscríbete',
        }

        # Mots isolés suspects (souvent partie d'hallucinations)
        HALLUCINATION_WORDS = {
            'thanks', 'thank', 'watching', 'watching!',
            'subscribe', 'subscribe!', 'subscribed',
            'like', 'comment', 'share',
            'bell', 'notification', 'notifications',
            'smash', 'hit'
        }

        text_lower = segment.text.strip().lower()

        # 1. Durée nulle ou quasi-nulle (< 10ms) = hallucination très probable
        duration = segment.end_ms - segment.start_ms
        if duration < 10:
            # Si durée nulle/quasi-nulle ET mot suspect, c'est une hallucination
            if text_lower in HALLUCINATION_PHRASES or text_lower in HALLUCINATION_WORDS:
                return True
            # Aussi: mots très courts (conjonctions) avec durée nulle = probable hallucination
            if text_lower in {'for', 'and', 'the', 'you', 'your'}:
                return True

        # 2. Phrase exacte d'hallucination commune
        if text_lower in HALLUCINATION_PHRASES:
            return True

        # 3. Détection de script étranger (ex: cyrillique dans du français)
        # Si la langue détectée est latine mais le texte contient du cyrillique/chinois, c'est une hallucination
        if segment.language and segment.language in ('fr', 'en', 'es', 'pt', 'de', 'it', 'nl', 'pl', 'ro', 'sv'):
            import re
            if re.search(r'[\u0400-\u04FF]', segment.text):  # Cyrillique
                return True
            if re.search(r'[\u4e00-\u9fff]', segment.text):  # CJK
                return True

        # 4. Confidence très basse (< 0.2) + texte suspect
        if segment.confidence < 0.2:
            if text_lower in HALLUCINATION_WORDS:
                return True

        return False

    async def transcribe(
        self,
        audio_path: str,
        mobile_transcription: Optional[Dict[str, Any]] = None,
        return_timestamps: bool = True
    ) -> TranscriptionResult:
        """
        Transcrit un fichier audio.

        Si mobile_transcription est fourni, l'utilise directement (passthrough).
        Sinon, utilise Whisper pour transcrire.

        Args:
            audio_path: Chemin vers le fichier audio
            mobile_transcription: Transcription fournie par le client mobile
                Format: {
                    "text": str,
                    "language": str,
                    "confidence": float,
                    "source": str,  # "ios_speech", "android_speech", "whisperkit"
                    "segments": [{"text": str, "startMs": int, "endMs": int}, ...]
                }
            return_timestamps: Retourner les segments avec timestamps

        Returns:
            TranscriptionResult avec texte, langue, confiance et segments
        """
        start_time = time.time()

        # ─────────────────────────────────────────────────────
        # OPTION 1: Utiliser la transcription mobile si fournie
        # ─────────────────────────────────────────────────────
        if mobile_transcription and mobile_transcription.get('text'):
            logger.info(f"[TRANSCRIPTION] 📱 Utilisation de la transcription mobile")

            # Parser les segments si disponibles
            segments = []
            detected_language = mobile_transcription.get('language', 'auto')
            if mobile_transcription.get('segments'):
                for seg in mobile_transcription['segments']:
                    segments.append(TranscriptionSegment(
                        text=seg.get('text', ''),
                        start_ms=seg.get('startMs', 0),
                        end_ms=seg.get('endMs', 0),
                        confidence=seg.get('confidence', 0.9),
                        speaker_id=seg.get('speakerId'),
                        voice_similarity_score=seg.get('voiceSimilarityScore'),  # None si absent
                        language=seg.get('language', detected_language)  # Utiliser langue du segment ou langue globale
                    ))

            # Récupérer la durée audio
            duration_ms = await self._get_audio_duration_ms(audio_path)

            processing_time = int((time.time() - start_time) * 1000)

            result = TranscriptionResult(
                text=mobile_transcription['text'],
                language=mobile_transcription.get('language', 'auto'),
                confidence=mobile_transcription.get('confidence', 0.85),
                segments=segments,
                duration_ms=duration_ms,
                source="mobile",
                model=mobile_transcription.get('source', 'mobile'),
                processing_time_ms=processing_time
            )

            # Appliquer la diarisation si demandé (même pour transcriptions mobiles)
            enable_diarization = os.getenv('ENABLE_DIARIZATION', 'false').lower() == 'true'
            if enable_diarization and return_timestamps and segments:
                logger.info("[TRANSCRIPTION] 🎯 Application de la diarisation (transcription mobile)")
                result = await self._apply_diarization(audio_path, result)

            return result

        # ─────────────────────────────────────────────────────
        # OPTION 2: Transcrire avec Whisper
        # ─────────────────────────────────────────────────────
        # Récupérer le modèle depuis le ModelManager
        model = get_stt_model(self._model_id)
        if model is None:
            if not WHISPER_AVAILABLE:
                raise RuntimeError(
                    "Whisper non disponible et pas de transcription mobile fournie"
                )
            # Initialiser si pas encore fait
            await self.initialize()
            model = get_stt_model(self._model_id)
            if model is None:
                raise RuntimeError("Échec de l'initialisation de Whisper")

        logger.info(f"[TRANSCRIPTION] 🎤 Transcription Whisper de: {audio_path}")

        try:
            # Transcrire dans un thread pour ne pas bloquer
            loop = asyncio.get_event_loop()
            segments_raw, info = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    audio_path,
                    beam_size=1,  # Optimisé: 5→1 pour vitesse (greedy search)
                    best_of=1,     # Optimisé: génère une seule hypothèse
                    word_timestamps=return_timestamps,
                    condition_on_previous_text=False,  # ✅ Réduit les hallucinations en chaîne (texte russe/chinois parasite)
                    vad_filter=True,  # ✅ Réactivé pour détecter les pauses
                    vad_parameters={
                        'threshold': 0.3,      # Plus sensible (défaut: 0.5) - détecte voix douces
                        'min_speech_duration_ms': 100,  # Segments courts acceptés (défaut: 250)
                        'min_silence_duration_ms': 1000,  # Pause 1s pour séparer speakers (défaut: 2000)
                        'speech_pad_ms': 200   # Padding autour de la parole (défaut: 400)
                    }
                )
            )

            # Convertir les segments
            segments_list = list(segments_raw)
            full_text = " ".join([s.text.strip() for s in segments_list])

            # Parser les segments
            segments = []
            detected_language = info.language  # Langue détectée par Whisper
            if return_timestamps:
                # ✅ Utiliser les timestamps NATIFS au niveau des mots fournis par Whisper
                # Référence: CORRECTION_UTILISER_WHISPER_WORDS_NATIF.md
                for s in segments_list:
                    # Vérifier si le segment contient des words (timestamps par mot)
                    if hasattr(s, 'words') and s.words:
                        # ✅ Utiliser les mots individuels avec timestamps exacts
                        for word in s.words:
                            segments.append(TranscriptionSegment(
                                text=word.word.strip(),
                                start_ms=int(word.start * 1000),
                                end_ms=int(word.end * 1000),
                                confidence=getattr(word, 'probability', 0.0),
                                # speaker_id sera ajouté par la diarisation ultérieure
                                speaker_id=None,
                                voice_similarity_score=None,
                                language=detected_language
                            ))
                    else:
                        # Fallback : segment complet si pas de words
                        segments.append(TranscriptionSegment(
                            text=s.text.strip(),
                            start_ms=int(s.start * 1000),
                            end_ms=int(s.end * 1000),
                            confidence=getattr(s, 'avg_logprob', 0.0),
                            speaker_id=None,
                            voice_similarity_score=None,
                            language=detected_language
                        ))

                # ═══════════════════════════════════════════════════════════════
                # FILTRAGE DES HALLUCINATIONS WHISPER
                # ═══════════════════════════════════════════════════════════════
                # Whisper hallucine parfois des phrases comme "Thanks for watching!"
                # (entraîné sur beaucoup de vidéos YouTube avec ces fins)
                original_count = len(segments)
                filtered_segments = []
                hallucinations_removed = []

                for seg in segments:
                    if self._is_whisper_hallucination(seg):
                        hallucinations_removed.append(seg.text)
                    else:
                        filtered_segments.append(seg)

                segments = filtered_segments

                if hallucinations_removed:
                    logger.info(
                        f"[TRANSCRIPTION] 🧹 Filtré {len(hallucinations_removed)} hallucination(s) Whisper: "
                        f"{hallucinations_removed}"
                    )

                # Recalculer full_text après filtrage
                full_text = " ".join([seg.text for seg in segments])


            processing_time = int((time.time() - start_time) * 1000)

            logger.info(
                f"[TRANSCRIPTION] ✅ {len(segments)} segments | "
                f"lang={info.language} | dur={int(info.duration)}s | time={processing_time}ms"
            )

            result = TranscriptionResult(
                text=full_text,
                language=info.language,
                confidence=info.language_probability,
                segments=segments,
                duration_ms=int(info.duration * 1000),
                source="whisper",
                model="whisper_boost",  # Nom canonique du modèle Whisper
                processing_time_ms=processing_time
            )

            # Appliquer la diarisation si demandé (activé par défaut, désactiver avec ENABLE_DIARIZATION=false)
            enable_diarization = os.getenv('ENABLE_DIARIZATION', 'true').lower() != 'false'
            if enable_diarization and return_timestamps:
                logger.info("[TRANSCRIPTION] 🎯 Application de la diarisation")
                result = await self._apply_diarization(audio_path, result)

            return result

        except Exception as e:
            logger.error(f"[TRANSCRIPTION] ❌ Erreur transcription: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Échec de la transcription: {e}")

    async def _get_audio_duration_ms(self, audio_path: str) -> int:
        """Récupère la durée d'un fichier audio en millisecondes"""
        if not AUDIO_PROCESSING_AVAILABLE:
            return 0

        try:
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: _get_librosa_duration(audio_path)
            )
            return int(duration * 1000)
        except Exception as e:
            logger.warning(f"[TRANSCRIPTION] Impossible de lire la durée audio: {e}")
            return 0

    async def _apply_diarization(
        self,
        audio_path: str,
        transcription: TranscriptionResult,
        sender_voice_profile: Optional[Dict[str, Any]] = None
    ) -> TranscriptionResult:
        """
        Applique la diarisation aux segments transcrits.

        Args:
            audio_path: Chemin vers le fichier audio
            transcription: Résultat de transcription à enrichir
            sender_voice_profile: Profil vocal de l'expéditeur (optionnel)

        Returns:
            TranscriptionResult avec segments enrichis de speaker_id et is_current_user
        """
        try:
            from .diarization_service import get_diarization_service
            from utils.audio_format_converter import convert_to_wav_if_needed

            diarization_service = get_diarization_service()

            # Convertir en WAV si nécessaire (m4a/mp3 non supportés par pyannote/soundfile)
            try:
                wav_path = convert_to_wav_if_needed(audio_path)
                if wav_path != audio_path:
                    logger.info(f"[DIARIZATION] Converti {Path(audio_path).suffix} → WAV pour diarisation")
            except Exception as e:
                logger.warning(f"[DIARIZATION] Conversion WAV échouée, utilisation du fichier original: {e}")
                wav_path = audio_path

            # Détecter les locuteurs
            diarization = await diarization_service.detect_speakers(wav_path)

            # Identifier l'expéditeur
            diarization = await diarization_service.identify_sender(
                diarization,
                sender_voice_profile
            )

            logger.info(
                f"[TRANSCRIPTION] Détecté {diarization.speaker_count} locuteur(s), "
                f"principal={diarization.primary_speaker_id}"
            )

            # Fonction helper pour calculer le chevauchement temporel
            def calculate_overlap(seg_start: int, seg_end: int, speaker_start: int, speaker_end: int) -> int:
                """Calcule le chevauchement temporel en ms entre deux intervalles"""
                overlap_start = max(seg_start, speaker_start)
                overlap_end = min(seg_end, speaker_end)
                return max(0, overlap_end - overlap_start)

            # Calculer les trous dans la transcription (pour gap filler)
            whisper_segments_sorted = sorted(transcription.segments, key=lambda s: s.start_ms)

            gaps = []
            for idx in range(len(whisper_segments_sorted) - 1):
                current_end = whisper_segments_sorted[idx].end_ms
                next_start = whisper_segments_sorted[idx + 1].start_ms
                if next_start > current_end:
                    gap_duration = next_start - current_end
                    gaps.append({
                        'start': current_end,
                        'end': next_start,
                        'duration': gap_duration
                    })

            # Combler les trous de transcription si détectés
            if gaps and len(gaps) > 0:
                try:
                    from .transcribe_gap_filler import fill_transcription_gaps

                    new_segments = await fill_transcription_gaps(
                        audio_path=audio_path,
                        gaps=gaps,
                        diarization_speakers=diarization.speakers,
                        transcribe_func=self.transcribe
                    )

                    if new_segments:
                        transcription.segments.extend(new_segments)
                        transcription.segments.sort(key=lambda s: s.start_ms)
                        transcription.text = " ".join([seg.text for seg in transcription.segments])

                except Exception:
                    pass  # Continue avec transcription incomplète

            # Taguer les segments avec les speaker_id (OVERLAP-BASED)
            assigned_count = 0
            unassigned_count = 0

            for segment in transcription.segments:
                best_speaker = None
                max_overlap = 0

                # Trouver le speaker avec le meilleur chevauchement
                for speaker in diarization.speakers:
                    for speaker_seg in speaker.segments:
                        overlap = calculate_overlap(
                            segment.start_ms,
                            segment.end_ms,
                            speaker_seg.start_ms,
                            speaker_seg.end_ms
                        )
                        if overlap > max_overlap:
                            max_overlap = overlap
                            best_speaker = speaker

                # Assigner le meilleur speaker
                if best_speaker and max_overlap > 0:
                    segment.speaker_id = best_speaker.speaker_id
                    segment.voice_similarity_score = best_speaker.voice_similarity_score
                    assigned_count += 1
                else:
                    unassigned_count += 1

            # Log résumé seulement si problème
            if unassigned_count > 0:
                unassigned_ratio = unassigned_count / len(transcription.segments)
                if unassigned_ratio > 0.1:
                    logger.warning(
                        f"[TRANSCRIPTION] ⚠️ {unassigned_ratio:.0%} segments non assignés"
                    )

            # Enrichir le résultat de transcription
            transcription.speaker_count = diarization.speaker_count
            transcription.primary_speaker_id = diarization.primary_speaker_id
            transcription.sender_voice_identified = diarization.sender_identified
            transcription.sender_speaker_id = diarization.sender_speaker_id
            # Stocker les segments de diarization bruts pour le clonage vocal propre
            transcription.diarization_speakers = diarization.speakers

            # Construire speaker_analysis pour la base de données
            speakers_list = []
            for s in diarization.speakers:
                voice_chars = None
                if hasattr(s, 'voice_characteristics') and s.voice_characteristics:
                    try:
                        voice_chars = s.voice_characteristics.to_dict()
                    except Exception:
                        pass

                speakers_list.append({
                    'sid': s.speaker_id,
                    'isPrimary': s.is_primary,
                    'speakingTimeMs': s.speaking_time_ms,
                    'speakingRatio': s.speaking_ratio,
                    'voiceSimilarityScore': s.voice_similarity_score,
                    'voiceCharacteristics': voice_chars
                })

            transcription.speaker_analysis = {
                'speakerCount': diarization.speaker_count,
                'primarySpeakerId': diarization.primary_speaker_id,
                'senderIdentified': diarization.sender_identified,
                'senderSpeakerId': diarization.sender_speaker_id,
                'speakers': speakers_list,
                'totalDurationMs': diarization.total_duration_ms,
                'method': diarization.method
            }

            # Log résumé diarisation
            logger.info(
                f"[DIARIZATION] 🎭 {diarization.speaker_count} speaker(s) détecté(s) | "
                f"Principal: {diarization.primary_speaker_id} | "
                f"Durée: {diarization.total_duration_ms/1000:.1f}s"
            )

            # LOG TRANSCRIPTION COMPLÈTE PAR SPEAKER
            logger.info("─" * 60)
            logger.info("[TRANSCRIPTION] 📜 CONVERSATION COMPLÈTE:")

            sorted_segments = sorted(transcription.segments, key=lambda s: s.start_ms)

            for speaker in diarization.speakers:
                speaker_segs = [s for s in sorted_segments if s.speaker_id == speaker.speaker_id]
                if speaker_segs:
                    full_text = " ".join([s.text for s in speaker_segs])
                    marker = "⭐" if speaker.is_primary else " "
                    logger.info(
                        f"[{speaker.speaker_id}]{marker} ({speaker.speaking_ratio * 100:.0f}%): "
                        f"\"{full_text}\""
                    )

            unassigned = [s for s in sorted_segments if not s.speaker_id]
            if unassigned:
                logger.info(f"[?] ({len(unassigned)} seg): \"{' '.join([s.text for s in unassigned])}\"")

            logger.info("─" * 60)

            return transcription

        except Exception as e:
            logger.error(f"[TRANSCRIPTION] Erreur diarisation: {e}")
            import traceback
            traceback.print_exc()
            # Retourner le résultat sans diarisation en cas d'erreur
            return transcription

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        # Vérifier si le modèle est dans le ModelManager
        model = get_stt_model(self._model_id)
        model_info = get_model_manager().get_model_info(self._model_id)

        stats = {
            "service": "TranscriptionService",
            "initialized": self.is_initialized,
            "whisper_available": WHISPER_AVAILABLE,
            "audio_processing_available": AUDIO_PROCESSING_AVAILABLE,
            "model_loaded": model is not None,
            "model_size": self.model_size,
            "device": self.device,
            "compute_type": self.compute_type,
            "model_manager_integrated": True,
            "model_id": self._model_id
        }

        if model_info:
            stats["model_info"] = {
                "memory_mb": model_info.memory_bytes / 1024 / 1024,
                "use_count": model_info.use_count,
                "priority": model_info.priority
            }

        return stats

    async def close(self):
        """Libère les ressources"""
        logger.info("[TRANSCRIPTION] 🛑 Fermeture du service")
        # NOTE: Le modèle est géré par le ModelManager centralisé
        # On peut le décharger explicitement si besoin
        manager = get_model_manager()
        if manager.has_model(self._model_id):
            manager.unload_model(self._model_id)
            logger.info(f"[TRANSCRIPTION] Modèle {self._model_id} déchargé")
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_transcription_service() -> TranscriptionService:
    """Retourne l'instance singleton du service de transcription"""
    return TranscriptionService()
