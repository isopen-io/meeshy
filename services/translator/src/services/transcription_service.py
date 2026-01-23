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
                    vad_filter=True  # Filtrer les silences
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

                # ✅ Fusion intelligente des mots courts (Option D)
                # Règles: pause < 90ms ET somme < 8 caractères
                original_count = len(segments)
                if original_count > 0:
                    segments = merge_short_segments(
                        segments,
                        word_max_pause_ms=90,
                        word_max_chars=8
                    )
                    reduction_pct = (original_count - len(segments)) / original_count * 100
                    logger.info(
                        f"[TRANSCRIPTION] Fusion intelligente: {original_count} → {len(segments)} segments "
                        f"(réduction {reduction_pct:.1f}%)"
                    )
                else:
                    logger.warning("[TRANSCRIPTION] ⚠️ Aucun segment à fusionner")

            processing_time = int((time.time() - start_time) * 1000)

            logger.info(
                f"[TRANSCRIPTION] ✅ Transcrit: '{full_text[:50]}...' "
                f"(lang={info.language}, conf={info.language_probability:.2f}, "
                f"dur={int(info.duration)}s, time={processing_time}ms)"
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
                lambda: librosa.get_duration(path=audio_path)
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

            diarization_service = get_diarization_service()

            # Détecter les locuteurs
            diarization = await diarization_service.detect_speakers(audio_path)

            # Identifier l'expéditeur
            diarization = await diarization_service.identify_sender(
                diarization,
                sender_voice_profile
            )

            logger.info(
                f"[TRANSCRIPTION] Détecté {diarization.speaker_count} locuteur(s), "
                f"principal={diarization.primary_speaker_id}"
            )

            # Taguer les segments avec les speaker_id
            logger.info(f"[TRANSCRIPTION] 🎯 Tagging {len(transcription.segments)} segments with {len(diarization.speakers)} speakers")

            for idx, segment in enumerate(transcription.segments):
                # Trouver le locuteur correspondant à ce segment
                segment_mid_ms = (segment.start_ms + segment.end_ms) // 2

                for speaker in diarization.speakers:
                    for speaker_seg in speaker.segments:
                        if speaker_seg.start_ms <= segment_mid_ms <= speaker_seg.end_ms:
                            segment.speaker_id = speaker.speaker_id
                            # Utiliser le score numérique du speaker (0-1) au lieu d'un booléen
                            segment.voice_similarity_score = speaker.voice_similarity_score

                            # DEBUG: Log pour les 3 premiers segments
                            if idx < 3:
                                logger.info(
                                    f"[TRANSCRIPTION]   Segment {idx}: '{segment.text[:20]}' → "
                                    f"speaker={speaker.speaker_id}, "
                                    f"score={speaker.voice_similarity_score} (type={type(speaker.voice_similarity_score).__name__})"
                                )
                            break
                    if segment.speaker_id:
                        break

            # Enrichir le résultat de transcription
            transcription.speaker_count = diarization.speaker_count
            transcription.primary_speaker_id = diarization.primary_speaker_id
            transcription.sender_voice_identified = diarization.sender_identified
            transcription.sender_speaker_id = diarization.sender_speaker_id

            # Construire speaker_analysis pour la base de données (camelCase pour cohérence API)
            # NOTE: Les segments sont déjà dans transcription.segments, pas besoin de les dupliquer ici
            # On garde uniquement les métadonnées et caractéristiques vocales de chaque speaker
            speakers_list = []
            for s in diarization.speakers:
                # Construire les voiceCharacteristics si disponibles
                voice_chars = None
                if hasattr(s, 'voice_characteristics') and s.voice_characteristics:
                    try:
                        voice_chars = s.voice_characteristics.to_dict()
                        logger.info(f"   ✅ [VOICE-CHARS] Speaker {s.speaker_id}: voiceCharacteristics inclus (pitch={voice_chars.get('pitch', {}).get('mean_hz', 'N/A')} Hz)")
                    except Exception as e:
                        logger.error(f"   ❌ [VOICE-CHARS] Erreur conversion voiceCharacteristics pour {s.speaker_id}: {e}")
                else:
                    logger.warning(f"   ⚠️ [VOICE-CHARS] Speaker {s.speaker_id}: Pas de voiceCharacteristics disponibles")

                speakers_list.append({
                    'sid': s.speaker_id,
                    'isPrimary': s.is_primary,
                    'speakingTimeMs': s.speaking_time_ms,
                    'speakingRatio': s.speaking_ratio,
                    'voiceSimilarityScore': s.voice_similarity_score,
                    # Voice characteristics: fréquences, pitch, timbre, etc.
                    'voiceCharacteristics': voice_chars
                    # ⚠️ segments supprimés car déjà présents dans transcription.segments avec speakerId
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

            logger.info(f"   📊 [SPEAKER-ANALYSIS] Construit avec {len(speakers_list)} speaker(s), voiceCharacteristics: {sum(1 for s in speakers_list if s.get('voiceCharacteristics'))}/{len(speakers_list)}")

            # ═══════════════════════════════════════════════════════════════
            # LOGS DÉTAILLÉS PAR INTERLOCUTEUR
            # ═══════════════════════════════════════════════════════════════
            logger.info("=" * 80)
            logger.info(f"[DIARIZATION] 🎭 RÉSUMÉ DÉTAILLÉ DE LA DIARISATION")
            logger.info(f"[DIARIZATION] Nombre d'interlocuteurs détectés: {diarization.speaker_count}")
            logger.info(f"[DIARIZATION] Méthode utilisée: {diarization.method}")
            logger.info(f"[DIARIZATION] Durée totale: {diarization.total_duration_ms}ms")
            logger.info(f"[DIARIZATION] Interlocuteur principal: {diarization.primary_speaker_id}")
            logger.info("=" * 80)

            # Analyser les segments par speaker
            for speaker in diarization.speakers:
                # Compter les segments assignés à ce speaker
                speaker_segments = [seg for seg in transcription.segments if seg.speaker_id == speaker.speaker_id]

                if speaker_segments:
                    # Détecter les langues présentes dans les segments de ce speaker
                    # Utiliser getattr pour compatibilité avec différentes définitions de TranscriptionSegment
                    languages = set(
                        getattr(seg, 'language', None)
                        for seg in speaker_segments
                        if getattr(seg, 'language', None)
                    )
                    languages_str = ", ".join(sorted(languages)) if languages else "non détectée"

                    logger.info(
                        f"[DIARIZATION] 👤 Speaker {speaker.speaker_id} "
                        f"({'PRINCIPAL' if speaker.is_primary else 'secondaire'}):"
                    )
                    logger.info(
                        f"             ├─ Temps de parole: {speaker.speaking_time_ms}ms "
                        f"({speaker.speaking_ratio * 100:.1f}%)"
                    )
                    logger.info(
                        f"             ├─ Nombre de segments: {len(speaker_segments)}"
                    )
                    logger.info(
                        f"             ├─ Langue(s) détectée(s): {languages_str}"
                    )
                    if speaker.voice_similarity_score is not None:
                        logger.info(
                            f"             ├─ Score de similarité vocale: {speaker.voice_similarity_score:.2f}"
                        )

                    # Afficher les caractéristiques vocales si disponibles
                    if hasattr(speaker, 'voice_characteristics') and speaker.voice_characteristics:
                        vc = speaker.voice_characteristics

                        # Extract labels from VoiceCharacteristics (English)
                        gender = vc.estimated_gender or "unknown"

                        pitch = vc.pitch_mean
                        if pitch > 250:
                            pitch_level = "very_high"
                        elif pitch > 200:
                            pitch_level = "high"
                        elif pitch > 120:
                            pitch_level = "medium"
                        elif pitch > 90:
                            pitch_level = "low"
                        else:
                            pitch_level = "very_low"

                        age_range = vc.estimated_age_range
                        if "child" in age_range:
                            age = "child"
                        elif "teen" in age_range or "young" in age_range:
                            age = "teen"
                        elif "senior" in age_range:
                            age = "senior"
                        else:
                            age = "adult"

                        variance = vc.pitch_std
                        if variance > 40:
                            tone = "very_expressive"
                        elif variance > 20:
                            tone = "expressive"
                        else:
                            tone = "monotone"

                        syl_per_sec = (vc.speech_rate_wpm * 2) / 60 if vc.speech_rate_wpm > 0 else 0
                        if syl_per_sec > 6:
                            speech_rate = "rapide"
                        elif syl_per_sec > 3:
                            speech_rate = "normal"
                        else:
                            speech_rate = "lent"

                        logger.info(
                            f"             ├─ Voix: {gender} | "
                            f"Registre: {pitch_level} ({pitch:.0f}Hz) | "
                            f"Âge: {age}"
                        )
                        logger.info(
                            f"             ├─ Ton: {tone} | "
                            f"Rapidité: {speech_rate} ({syl_per_sec:.1f} syl/s)"
                        )

                    # Afficher les 3 premiers segments comme exemples
                    logger.info(f"             └─ Exemples de segments:")
                    for i, seg in enumerate(speaker_segments[:3]):
                        seg_lang = getattr(seg, 'language', None) or 'N/A'
                        logger.info(
                            f"                [{i+1}] {seg.start_ms/1000:.1f}s-{seg.end_ms/1000:.1f}s | "
                            f"lang={seg_lang} | "
                            f"\"{seg.text[:40]}{'...' if len(seg.text) > 40 else ''}\""
                        )
                    if len(speaker_segments) > 3:
                        logger.info(f"                ... et {len(speaker_segments) - 3} autres segments")
                    logger.info("")

            # Segments non assignés
            unassigned_segments = [seg for seg in transcription.segments if not seg.speaker_id]
            if unassigned_segments:
                logger.info(f"[DIARIZATION] ⚠️  {len(unassigned_segments)} segment(s) non assigné(s)")
                for i, seg in enumerate(unassigned_segments[:3]):
                    logger.info(
                        f"             [{i+1}] {seg.start_ms/1000:.1f}s-{seg.end_ms/1000:.1f}s | "
                        f"\"{seg.text[:40]}{'...' if len(seg.text) > 40 else ''}\""
                    )

            logger.info("=" * 80)

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
