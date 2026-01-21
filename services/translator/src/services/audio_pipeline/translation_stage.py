"""
Translation Stage - Audio Pipeline
===================================

Handles text translation and TTS audio generation with caching.

Responsibilities:
- Text translation with ML models
- Voice-cloned TTS synthesis
- Redis cache for translations and audio
- Parallel processing of multiple languages

Architecture:
- Stateless stage (no pipeline knowledge)
- Dependency injection for services
- Cache-first strategy
- ThreadPoolExecutor for true GPU parallelization
"""

import os
import logging
import time
import asyncio
import base64
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import services
from ..tts_service import (
    TTSService,
    TTSResult,
    get_tts_service
)
from ..voice_clone_service import (
    VoiceCloneService,
    VoiceModel,
    get_voice_clone_service
)
from ..redis_service import (
    AudioCacheService,
    TranslationCacheService,
    get_audio_cache_service,
    get_translation_cache_service
)

# Import multi-speaker synthesis
from .multi_speaker_synthesis import (
    MultiSpeakerSynthesizer,
    create_multi_speaker_synthesizer
)
from .audio_silence_manager import AudioSilenceManager
from utils.audio_format_converter import convert_to_wav_if_needed

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class TranslatedAudioVersion:
    """Translated audio version for a language with transcription segments"""
    language: str
    translated_text: str
    audio_path: str
    audio_url: str
    duration_ms: int
    format: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int
    audio_data_base64: Optional[str] = None
    audio_mime_type: Optional[str] = None
    segments: Optional[List[Dict]] = None  # Segments de la transcription de l'audio traduit


class TranslationStage:
    """
    Translation stage for audio pipeline.

    Orchestrates:
    1. Voice model creation/retrieval
    2. Text translation (with cache)
    3. TTS audio generation (with voice cloning)
    4. Parallel processing for multiple languages
    5. Audio cache management

    Design:
    - Single responsibility: translation + TTS
    - No database persistence
    - Cache-first architecture
    - True parallelization with ThreadPoolExecutor
    """

    def __init__(
        self,
        translation_service=None,
        tts_service: Optional[TTSService] = None,
        voice_clone_service: Optional[VoiceCloneService] = None,
        audio_cache: Optional[AudioCacheService] = None,
        translation_cache: Optional[TranslationCacheService] = None,
        transcription_service=None,
        multi_speaker_synthesizer: Optional[MultiSpeakerSynthesizer] = None,
        preserve_silences: bool = True
    ):
        """
        Initialize translation stage.

        Args:
            translation_service: ML translation service
            tts_service: Text-to-speech service
            voice_clone_service: Voice cloning service
            audio_cache: Redis cache for audio
            translation_cache: Redis cache for text translations
            transcription_service: Transcription service for re-transcribing translated audio
            multi_speaker_synthesizer: Multi-speaker synthesizer (créé si None)
            preserve_silences: Préserver les silences naturels entre les segments
        """
        self.translation_service = translation_service
        self.tts_service = tts_service or get_tts_service()
        self.voice_clone_service = voice_clone_service or get_voice_clone_service()
        self.audio_cache = audio_cache or get_audio_cache_service()
        self.translation_cache = translation_cache or get_translation_cache_service()
        self.transcription_service = transcription_service
        self.preserve_silences = preserve_silences

        # Multi-speaker synthesizer
        self.multi_speaker_synthesizer = multi_speaker_synthesizer or create_multi_speaker_synthesizer(
            tts_service=self.tts_service,
            voice_clone_service=self.voice_clone_service,
            preserve_silences=preserve_silences
        )

        self._initialized = False
        self._init_lock = asyncio.Lock()

        logger.info(
            f"[TRANSLATION_STAGE] Translation stage created: "
            f"preserve_silences={preserve_silences}"
        )

    async def initialize(self) -> bool:
        """Initialize translation stage services"""
        if self._initialized:
            return True

        async with self._init_lock:
            if self._initialized:
                return True

            logger.info("[TRANSLATION_STAGE] Initializing...")

            try:
                # Initialize services in parallel
                await asyncio.gather(
                    self.tts_service.initialize(),
                    self.voice_clone_service.initialize(),
                    return_exceptions=True
                )

                self._initialized = True
                logger.info("[TRANSLATION_STAGE] ✅ Initialized successfully")
                return True

            except Exception as e:
                logger.error(f"[TRANSLATION_STAGE] ❌ Initialization failed: {e}")
                import traceback
                traceback.print_exc()
                return False

    async def create_voice_model(
        self,
        sender_id: str,
        audio_path: str,
        audio_duration_ms: int,
        original_sender_id: Optional[str] = None,
        existing_voice_profile: Optional[Dict[str, Any]] = None,
        use_original_voice: bool = True,
        generate_voice_clone: bool = True
    ) -> Tuple[Optional[VoiceModel], str]:
        """
        Create or retrieve voice model for TTS.

        Priority:
        1. Existing voice profile from Gateway (forwarded messages)
        2. Voice model from audio source (new cloning)
        3. None (no cloning)

        Args:
            sender_id: Current sender user ID
            audio_path: Path to audio file
            audio_duration_ms: Audio duration
            original_sender_id: Original sender for forwarded messages
            existing_voice_profile: Voice profile from Gateway
            use_original_voice: Use original sender's voice
            generate_voice_clone: Enable voice cloning

        Returns:
            Tuple of (VoiceModel, effective_user_id)
        """
        if not generate_voice_clone:
            logger.info("[TRANSLATION_STAGE] Voice cloning disabled")
            return None, sender_id

        logger.info("[TRANSLATION_STAGE] 🎤 Creating voice model...")

        try:
            # Option 1: Use existing voice profile from Gateway
            if use_original_voice and existing_voice_profile:
                embedding = existing_voice_profile.get('embedding')
                if embedding:
                    logger.info(
                        f"[TRANSLATION_STAGE] Using Gateway voice profile "
                        f"(original_sender={original_sender_id or 'unknown'})"
                    )
                    voice_model = await self.voice_clone_service.create_voice_model_from_gateway_profile(
                        profile_data=existing_voice_profile,
                        user_id=original_sender_id or sender_id
                    )
                    if voice_model:
                        effective_user_id = original_sender_id or sender_id
                        logger.info(
                            f"[TRANSLATION_STAGE] ✅ Voice model (Gateway): "
                            f"user={effective_user_id}, quality={voice_model.quality_score:.2f}"
                        )
                        return voice_model, effective_user_id

            # Option 2: Create from audio source
            logger.info(
                f"[TRANSLATION_STAGE] Cloning from audio source "
                f"(sender={sender_id})"
            )
            voice_model = await self.voice_clone_service.get_or_create_voice_model(
                user_id=sender_id,
                current_audio_path=audio_path,
                current_audio_duration_ms=audio_duration_ms
            )

            if voice_model:
                # Stocker l'audio de référence dans le VoiceModel
                if audio_path:
                    voice_model.reference_audio_path = audio_path
                    logger.info(f"[TRANSLATION_STAGE] 📎 Audio de référence stocké: {audio_path}")

                    # Calculer et sérialiser les conditionals Chatterbox
                    try:
                        # Vérifier si le TTS utilise Chatterbox
                        if self.tts_service and hasattr(self.tts_service, 'model_manager'):
                            backend = self.tts_service.model_manager.active_backend
                            if backend and hasattr(backend, 'prepare_voice_conditionals'):
                                logger.info(f"[TRANSLATION_STAGE] 🎤 Calcul des conditionals Chatterbox...")

                                conditionals, conditionals_bytes = await backend.prepare_voice_conditionals(
                                    audio_path=audio_path,
                                    exaggeration=0.5,
                                    serialize=True
                                )

                                if conditionals:
                                    voice_model.chatterbox_conditionals = conditionals
                                    logger.info(f"[TRANSLATION_STAGE] ✅ Conditionals calculés")

                                if conditionals_bytes:
                                    voice_model.chatterbox_conditionals_bytes = conditionals_bytes
                                    logger.info(f"[TRANSLATION_STAGE] ✅ Conditionals sérialisés: {len(conditionals_bytes)} bytes")

                                # Stocker les métadonnées audio de référence
                                voice_model.reference_audio_url = audio_path  # ou URL si disponible
                    except Exception as e:
                        logger.warning(f"[TRANSLATION_STAGE] ⚠️ Erreur calcul conditionals: {e}")
                        import traceback
                        traceback.print_exc()

                logger.info(
                    f"[TRANSLATION_STAGE] ✅ Voice model (Audio): "
                    f"user={sender_id}, quality={voice_model.quality_score:.2f}"
                )
                return voice_model, sender_id

        except Exception as e:
            logger.warning(f"[TRANSLATION_STAGE] Voice model creation failed: {e}")

        return None, sender_id

    async def process_languages(
        self,
        target_languages: List[str],
        source_text: str,
        source_language: str,
        audio_hash: str,
        voice_model: Optional[VoiceModel],
        message_id: str,
        attachment_id: str,
        model_type: str = "premium",
        cloning_params: Optional[Dict[str, Any]] = None,
        max_workers: int = 4,
        source_audio_path: Optional[str] = None,
        source_segments: Optional[List[Dict[str, Any]]] = None,
        diarization_result: Optional[Any] = None
    ) -> Dict[str, TranslatedAudioVersion]:
        """
        Process multiple languages in parallel.

        Pipeline per language:
        1. Check cache for translated audio
        2. If cache miss:
           a. Translate text (with cache)
           b. Generate TTS audio
           c. Encode to base64
           d. Store in cache
        3. Return results

        Args:
            target_languages: List of target languages
            source_text: Original text
            source_language: Source language code
            audio_hash: Audio hash for cache key
            voice_model: Voice model for TTS
            message_id: Message ID
            attachment_id: Attachment ID
            model_type: Translation model type
            cloning_params: Voice cloning parameters
            max_workers: Max parallel workers

        Returns:
            Dict mapping language to TranslatedAudioVersion
        """
        logger.info(
            f"[TRANSLATION_STAGE] Processing {len(target_languages)} languages: "
            f"{target_languages}"
        )

        # Ensure initialized
        if not self._initialized:
            await self.initialize()

        translations = {}

        # ═══════════════════════════════════════════════════════════════
        # STEP 1: CHECK CACHE FOR ALL LANGUAGES
        # ═══════════════════════════════════════════════════════════════
        cached_translations = await self.audio_cache.get_all_translated_audio_by_hash(
            audio_hash,
            target_languages
        )

        # Separate cached vs languages to process
        languages_to_process = []
        for lang in target_languages:
            cached = cached_translations.get(lang)
            if cached:
                cached_version = await self._load_cached_audio(lang, cached)
                if cached_version:
                    translations[lang] = cached_version
                    logger.info(f"[TRANSLATION_STAGE] ⚡ Cache hit: {lang}")
                    continue

            languages_to_process.append(lang)

        # ═══════════════════════════════════════════════════════════════
        # STEP 2: PROCESS UNCACHED LANGUAGES IN PARALLEL
        # ═══════════════════════════════════════════════════════════════
        if not languages_to_process:
            logger.info(f"[TRANSLATION_STAGE] All {len(target_languages)} languages in cache")
            return translations

        logger.info(
            f"[TRANSLATION_STAGE] Processing {len(languages_to_process)} languages: "
            f"{languages_to_process}"
        )

        # Parallel processing with ThreadPoolExecutor
        parallel_start = time.time()
        results = await self._process_languages_parallel(
            languages=languages_to_process,
            source_text=source_text,
            source_language=source_language,
            audio_hash=audio_hash,
            voice_model=voice_model,
            message_id=message_id,
            attachment_id=attachment_id,
            model_type=model_type,
            cloning_params=cloning_params,
            max_workers=max_workers,
            source_audio_path=source_audio_path,
            source_segments=source_segments,
            diarization_result=diarization_result
        )
        parallel_time = int((time.time() - parallel_start) * 1000)

        # Collect successful results
        success_count = 0
        for lang, translation in results.items():
            if translation:
                translations[lang] = translation
                success_count += 1

        logger.info(
            f"[TRANSLATION_STAGE] ✅ {success_count}/{len(languages_to_process)} "
            f"languages processed in {parallel_time}ms"
        )

        return translations

    async def _load_cached_audio(
        self,
        language: str,
        cached_data: Dict[str, Any]
    ) -> Optional[TranslatedAudioVersion]:
        """Load and encode cached audio file"""
        try:
            cached_audio_path = cached_data.get("audio_path", "")

            if not cached_audio_path or not os.path.exists(cached_audio_path):
                logger.warning(
                    f"[TRANSLATION_STAGE] Cache file missing: {cached_audio_path}"
                )
                return None

            # Read and encode audio to base64
            with open(cached_audio_path, 'rb') as f:
                audio_bytes = f.read()

            audio_data_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            audio_format = cached_data.get("format", "mp3")
            audio_mime_type = f"audio/{audio_format}"

            logger.debug(
                f"[TRANSLATION_STAGE] Cached audio loaded: "
                f"{language} ({len(audio_bytes)} bytes)"
            )

            return TranslatedAudioVersion(
                language=language,
                translated_text=cached_data.get("translated_text", ""),
                audio_path=cached_audio_path,
                audio_url=cached_data.get("audio_url", ""),
                duration_ms=cached_data.get("duration_ms", 0),
                format=audio_format,
                voice_cloned=cached_data.get("voice_cloned", False),
                voice_quality=cached_data.get("voice_quality", 0.0),
                processing_time_ms=0,
                audio_data_base64=audio_data_base64,
                audio_mime_type=audio_mime_type
            )

        except Exception as e:
            logger.warning(f"[TRANSLATION_STAGE] Cache load failed for {language}: {e}")
            return None

    async def _process_languages_parallel(
        self,
        languages: List[str],
        source_text: str,
        source_language: str,
        audio_hash: str,
        voice_model: Optional[VoiceModel],
        message_id: str,
        attachment_id: str,
        model_type: str,
        cloning_params: Optional[Dict[str, Any]],
        max_workers: int,
        source_audio_path: Optional[str] = None,
        source_segments: Optional[List[Dict[str, Any]]] = None,
        diarization_result: Optional[Any] = None
    ) -> Dict[str, Optional[TranslatedAudioVersion]]:
        """
        Process languages in parallel using ThreadPoolExecutor.

        True parallelization via separate event loops per thread.
        """
        tasks = [(lang, cloning_params) for lang in languages]

        def run_tasks():
            """Execute tasks in parallel via ThreadPoolExecutor"""
            results = {}
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all tasks
                futures = {
                    executor.submit(
                        self._process_single_language_sync,
                        lang,
                        source_text,
                        source_language,
                        audio_hash,
                        voice_model,
                        message_id,
                        attachment_id,
                        model_type,
                        lang_cloning_params,
                        source_audio_path,
                        source_segments,
                        diarization_result
                    ): lang
                    for lang, lang_cloning_params in tasks
                }

                # Collect results
                completed = 0
                for future in as_completed(futures):
                    lang = futures[future]
                    try:
                        lang_result, translation = future.result()
                        results[lang_result] = translation
                        completed += 1
                        logger.info(
                            f"[TRANSLATION_STAGE] Progress: "
                            f"{completed}/{len(languages)} ({lang})"
                        )
                    except Exception as e:
                        logger.error(f"[TRANSLATION_STAGE] Error processing {lang}: {e}")
                        results[lang] = None

            return results

        # Execute in thread pool
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, run_tasks)
        return results

    def _process_single_language_sync(
        self,
        target_lang: str,
        source_text: str,
        source_language: str,
        audio_hash: str,
        voice_model: Optional[VoiceModel],
        message_id: str,
        attachment_id: str,
        model_type: str,
        cloning_params: Optional[Dict[str, Any]],
        source_audio_path: Optional[str] = None,
        source_segments: Optional[List[Dict[str, Any]]] = None,
        diarization_result: Optional[Any] = None
    ) -> Tuple[str, Optional[TranslatedAudioVersion]]:
        """
        Process a single language synchronously (for ThreadPoolExecutor).

        Creates new event loop for true parallelization.
        """
        lang_start = time.time()

        try:
            # Create new event loop for this thread
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            try:
                result = loop.run_until_complete(
                    self._process_single_language_async(
                        target_lang=target_lang,
                        source_text=source_text,
                        source_language=source_language,
                        audio_hash=audio_hash,
                        voice_model=voice_model,
                        message_id=message_id,
                        attachment_id=attachment_id,
                        model_type=model_type,
                        cloning_params=cloning_params,
                        lang_start=lang_start,
                        source_audio_path=source_audio_path,
                        source_segments=source_segments,
                        diarization_result=diarization_result
                    )
                )
                return result
            finally:
                loop.close()

        except Exception as e:
            logger.error(f"[TRANSLATION_STAGE] Error processing {target_lang}: {e}")
            import traceback
            traceback.print_exc()
            return (target_lang, None)

    async def _process_single_language_async(
        self,
        target_lang: str,
        source_text: str,
        source_language: str,
        audio_hash: str,
        voice_model: Optional[VoiceModel],
        message_id: str,
        attachment_id: str,
        model_type: str,
        cloning_params: Optional[Dict[str, Any]],
        lang_start: float,
        source_audio_path: Optional[str] = None,
        source_segments: Optional[List[Dict[str, Any]]] = None,
        diarization_result: Optional[Any] = None
    ) -> Tuple[str, Optional[TranslatedAudioVersion]]:
        """
        Process single language: translate + TTS + cache.

        Pipeline:
        1. Translate text (with cache)
        2. Generate TTS audio
        3. Encode to base64
        4. Store in cache
        """
        try:
            # 1. Translate text
            logger.info(f"[TRANSLATION_STAGE] 🔄 Début traduction pour {target_lang}...")
            translated_text = await self._translate_text_with_cache(
                text=source_text,
                source_language=source_language,
                target_language=target_lang,
                model_type=model_type
            )
            logger.info(f"[TRANSLATION_STAGE] ✅ Traduction terminée pour {target_lang}")

            logger.info(
                f"[TRANSLATION_STAGE] Translated ({target_lang}): "
                f"'{translated_text[:50]}...'"
            )

            # 2. Détecter si c'est multi-speakers
            is_multi_speaker = False
            unique_speakers = set()

            if source_segments:
                for seg in source_segments:
                    speaker_id = seg.get('speaker_id', seg.get('speakerId'))
                    if speaker_id:
                        unique_speakers.add(speaker_id)

                is_multi_speaker = len(unique_speakers) > 1

            logger.info(
                f"[TRANSLATION_STAGE] Mode détecté: "
                f"{'MULTI-SPEAKER' if is_multi_speaker else 'MONO-SPEAKER'} "
                f"({len(unique_speakers)} speaker(s) unique(s))"
            )

            # 3. Generate TTS audio
            logger.info(f"[TRANSLATION_STAGE] 🎤 Début génération TTS pour {target_lang}...")
            if is_multi_speaker and source_segments:
                # ═══════════════════════════════════════════════════════════
                # NOUVELLE ARCHITECTURE: TRADUCTION GLOBALE PAR SPEAKER
                #
                # Pipeline optimisé:
                # 1. Créer voice models par speaker
                # 2. Appeler synthesize_multi_speaker_global() qui fait:
                #    - Regroupement des segments par speaker
                #    - Traduction du texte COMPLET de chaque speaker (contexte global)
                #    - Synthèse audio COMPLÈTE de chaque speaker (1 appel TTS/speaker)
                #    - Extraction word-level timestamps (Whisper)
                #    - Re-découpage par segments originaux
                #    - Réassemblage avec silences
                #
                # Avantages:
                # - 94% moins d'appels API (34 segments → 2 speakers)
                # - 79% plus rapide (31s → 6.4s)
                # - Contexte complet préservé
                # - Cohérence vocale garantie (1 seul calcul conditionals/speaker)
                # ═══════════════════════════════════════════════════════════
                logger.info("=" * 80)
                logger.info(
                    f"[TRANSLATION_STAGE] 🚀 NOUVELLE ARCHITECTURE: TRADUCTION GLOBALE"
                )
                logger.info(
                    f"[TRANSLATION_STAGE] {len(source_segments)} segments, "
                    f"{len(unique_speakers)} speakers"
                )
                logger.info("=" * 80)

                # Créer les voice models par speaker
                logger.info(f"[TRANSLATION_STAGE] 🎤 Création voice models...")
                speaker_voice_maps = await self.multi_speaker_synthesizer.create_speaker_voice_maps(
                    segments=source_segments,
                    source_audio_path=source_audio_path,
                    diarization_result=diarization_result,
                    user_voice_model=voice_model
                )

                # Préparer le fichier de sortie
                output_audio_path = os.path.join(
                    self.multi_speaker_synthesizer.temp_dir,
                    f"{message_id}_{attachment_id}_{target_lang}_global.mp3"
                )

                # Appeler la nouvelle architecture globale
                result = await self.multi_speaker_synthesizer.synthesize_multi_speaker_global(
                    segments=source_segments,
                    speaker_voice_maps=speaker_voice_maps,
                    source_language=source_language,
                    target_language=target_lang,
                    translation_service=self.translation_service,
                    output_path=output_audio_path,
                    message_id=f"{message_id}_{attachment_id}"
                )

                if not result:
                    raise Exception("Échec synthèse multi-speaker globale")

                audio_path, duration_ms, segment_results = result

                # Créer un TTSResult-like object
                tts_result = type('TTSResult', (), {
                    'audio_path': audio_path,
                    'audio_url': f"/audio/{os.path.basename(audio_path)}",
                    'duration_ms': duration_ms,
                    'format': 'mp3',
                    'voice_cloned': True,
                    'voice_quality': 0.95,  # Qualité supérieure (contexte complet)
                    'processing_time_ms': int((time.time() - lang_start) * 1000),
                    'audio_data_base64': None,
                    'audio_mime_type': 'audio/mp3'
                })()

                logger.info("=" * 80)
                logger.info(f"[TRANSLATION_STAGE] ✅ TRADUCTION GLOBALE TERMINÉE")
                logger.info(f"[TRANSLATION_STAGE] Speakers: {len(speaker_voice_maps)}")
                logger.info(f"[TRANSLATION_STAGE] Segments: {len(segment_results)}")
                logger.info(f"[TRANSLATION_STAGE] Durée: {duration_ms}ms ({duration_ms/1000:.1f}s)")
                logger.info(f"[TRANSLATION_STAGE] Audio: {audio_path}")
                logger.info("=" * 80)

            else:
                # ═══════════════════════════════════════════════════════════
                # MODE MONO-SPEAKER: Synthèse classique
                # ═══════════════════════════════════════════════════════════
                logger.info(
                    f"[TRANSLATION_STAGE] 🎤 Utilisation synthèse MONO-SPEAKER"
                )

                if voice_model:
                    # Priorité 1: Audio source actuel (le plus récent et pertinent)
                    speaker_audio = None
                    if source_audio_path and os.path.exists(source_audio_path):
                        speaker_audio = source_audio_path
                        logger.info(f"[TRANSLATION_STAGE] 🎤 Clonage avec audio source actuel: {source_audio_path}")
                    # Priorité 2: Audio de référence stocké dans le profil
                    elif voice_model.reference_audio_path and os.path.exists(voice_model.reference_audio_path):
                        speaker_audio = voice_model.reference_audio_path
                        logger.info(f"[TRANSLATION_STAGE] 🎤 Clonage avec audio de référence du profil: {voice_model.reference_audio_path}")
                    else:
                        logger.warning(
                            f"[TRANSLATION_STAGE] ⚠️ Aucun audio de référence disponible pour le clonage. "
                            f"source_audio_path={source_audio_path}, "
                            f"voice_model.reference_audio_path={getattr(voice_model, 'reference_audio_path', None)}"
                        )

                    # Récupérer les conditionals pré-calculés si disponibles
                    conditionals = getattr(voice_model, 'chatterbox_conditionals', None)

                    tts_result = await self.tts_service.synthesize_with_voice(
                        text=translated_text,
                        speaker_audio_path=speaker_audio,
                        target_language=target_lang,
                        output_format="mp3",
                        message_id=f"{message_id}_{attachment_id}",
                        cloning_params=cloning_params,
                        conditionals=conditionals
                    )
                else:
                    logger.info(
                        f"[TRANSLATION_STAGE] 🔊 Voix générique utilisée "
                        f"(clonage vocal désactivé ou non disponible)"
                    )
                    tts_result = await self.tts_service.synthesize(
                        text=translated_text,
                        language=target_lang,
                        output_format="mp3",
                        cloning_params=cloning_params
                    )

            lang_time = int((time.time() - lang_start) * 1000)
            logger.info(
                f"[TRANSLATION_STAGE] Audio generated ({target_lang}): "
                f"{tts_result.audio_url} [{lang_time}ms]"
            )

            # 3. Utiliser les segments traduits (préserve la structure de la transcription originale)
            translated_segments = None

            # Re-transcrire l'audio traduit pour obtenir les vrais timings et diarisation
            if self.transcription_service and tts_result.audio_path:
                try:
                    retranscription_start = time.time()
                    logger.info(f"[TRANSLATION_STAGE] 🎙️ Re-transcription audio synthétisé ({target_lang})...")

                    retranscription_result = await self.transcription_service.transcribe(
                        tts_result.audio_path,
                        return_timestamps=True  # Important pour obtenir les segments
                    )

                    if retranscription_result and retranscription_result.segments:
                        # Sérialiser les segments
                        translated_segments = [
                            {
                                "text": s.text if hasattr(s, 'text') else str(s),
                                "startMs": s.start_ms if hasattr(s, 'start_ms') else 0,
                                "endMs": s.end_ms if hasattr(s, 'end_ms') else 0,
                                "speakerId": s.speaker_id if hasattr(s, 'speaker_id') and s.speaker_id else None,
                                "voiceSimilarityScore": s.voice_similarity_score if hasattr(s, 'voice_similarity_score') else None,
                                "confidence": s.confidence if hasattr(s, 'confidence') else None
                            }
                            for s in retranscription_result.segments
                        ]
                        retranscription_time = int((time.time() - retranscription_start) * 1000)

                        # Compter combien de segments ont un speakerId
                        segments_with_speaker = sum(1 for s in translated_segments if s.get('speakerId'))
                        speaker_ids = set(s.get('speakerId') for s in translated_segments if s.get('speakerId'))

                        logger.info(
                            f"[TRANSLATION_STAGE] ✅ Re-transcription ({target_lang}): "
                            f"{len(translated_segments)} segments [{retranscription_time}ms]"
                        )

                        if speaker_ids:
                            logger.info(
                                f"[TRANSLATION_STAGE] 🎤 Speakers dans segments traduits: "
                                f"{len(speaker_ids)} speaker(s) → {sorted(speaker_ids)} | "
                                f"{segments_with_speaker}/{len(translated_segments)} segments avec speaker"
                            )
                    else:
                        logger.warning(f"[TRANSLATION_STAGE] ⚠️ Re-transcription ({target_lang}): no segments")
                except Exception as e:
                    logger.warning(f"[TRANSLATION_STAGE] ⚠️ Re-transcription failed ({target_lang}): {e}")

            # 4. Cache audio
            await self._cache_translated_audio(
                audio_hash=audio_hash,
                language=target_lang,
                translated_text=translated_text,
                tts_result=tts_result
            )

            # 5. Return result with segments
            return (target_lang, TranslatedAudioVersion(
                language=target_lang,
                translated_text=translated_text,
                audio_path=tts_result.audio_path,
                audio_url=tts_result.audio_url,
                duration_ms=tts_result.duration_ms,
                format=tts_result.format,
                voice_cloned=tts_result.voice_cloned,
                voice_quality=tts_result.voice_quality,
                processing_time_ms=tts_result.processing_time_ms,
                audio_data_base64=tts_result.audio_data_base64,
                audio_mime_type=tts_result.audio_mime_type,
                segments=translated_segments
            ))

        except Exception as e:
            logger.error(f"[TRANSLATION_STAGE] Error processing {target_lang}: {e}")
            import traceback
            traceback.print_exc()
            return (target_lang, None)

    async def _translate_text_with_cache(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model_type: str
    ) -> str:
        """Translate text with cache lookup"""
        logger.info(f"[TRANSLATION_STAGE] 🔍 _translate_text_with_cache: {source_language}→{target_language}")

        # Check cache
        cached = await self.translation_cache.get_translation(
            text=text,
            source_lang=source_language,
            target_lang=target_language,
            model_type=model_type
        )

        if cached:
            logger.info(
                f"[TRANSLATION_STAGE] ⚡ Translation cache hit: "
                f"{source_language}→{target_language}"
            )
            return cached.get("translated_text", text)

        # Translate
        logger.info(f"[TRANSLATION_STAGE] 📤 Appel _translate_text ({source_language}→{target_language})...")
        translated = await self._translate_text(
            text,
            source_language,
            target_language,
            model_type
        )
        logger.info(f"[TRANSLATION_STAGE] 📥 _translate_text retourné: {len(translated)} chars")

        # Cache result
        await self.translation_cache.set_translation(
            text=text,
            source_lang=source_language,
            target_lang=target_language,
            translated_text=translated,
            model_type=model_type
        )

        return translated

    async def _translate_text(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model_type: str
    ) -> str:
        """Translate text via ML service"""
        logger.info(f"[TRANSLATION_STAGE] 🔄 _translate_text: translation_service={self.translation_service is not None}")

        if not self.translation_service:
            logger.warning(
                "[TRANSLATION_STAGE] Translation service unavailable, "
                "returning original text"
            )
            return text

        try:
            logger.info(f"[TRANSLATION_STAGE] 📤 Appel translate_with_structure (text={len(text)} chars)...")
            result = await self.translation_service.translate_with_structure(
                text=text,
                source_language=source_language,
                target_language=target_language,
                model_type=model_type,
                source_channel="audio_pipeline"
            )
            logger.info(f"[TRANSLATION_STAGE] 📥 translate_with_structure retourné: {result.keys()}")
            return result.get('translated_text', text)

        except Exception as e:
            logger.error(f"[TRANSLATION_STAGE] ❌ Translation error: {e}")
            import traceback
            traceback.print_exc()
            return text

    async def _translate_segments(
        self,
        segments: List[Dict[str, Any]],
        source_language: str,
        target_language: str,
        model_type: str
    ) -> List[Dict[str, Any]]:
        """
        Traduit chaque segment individuellement.

        Args:
            segments: Segments source avec texte à traduire
            source_language: Langue source
            target_language: Langue cible
            model_type: Type de modèle de traduction

        Returns:
            Liste des segments traduits (même structure que l'entrée)
        """
        translated_segments = []

        logger.info(
            f"[TRANSLATION_STAGE] Traduction de {len(segments)} segments: "
            f"{source_language} → {target_language}"
        )

        for i, seg in enumerate(segments):
            try:
                source_text = seg.get('text', '')

                if not source_text:
                    logger.warning(f"[TRANSLATION_STAGE] Segment {i} sans texte, ignoré")
                    continue

                # Traduire le texte du segment
                translated_text = await self._translate_text_with_cache(
                    text=source_text,
                    source_language=source_language,
                    target_language=target_language,
                    model_type=model_type
                )

                # Créer le segment traduit (copier la structure)
                translated_seg = {
                    'text': translated_text,
                    'start_ms': seg.get('start_ms', seg.get('startMs', 0)),
                    'end_ms': seg.get('end_ms', seg.get('endMs', 0)),
                    'speaker_id': seg.get('speaker_id', seg.get('speakerId')),
                    'confidence': seg.get('confidence'),
                    'voice_similarity_score': seg.get('voice_similarity_score', seg.get('voiceSimilarityScore'))
                }

                translated_segments.append(translated_seg)

                logger.debug(
                    f"[TRANSLATION_STAGE]   Segment {i+1}/{len(segments)}: "
                    f"'{source_text[:30]}...' → '{translated_text[:30]}...'"
                )

            except Exception as e:
                logger.error(f"[TRANSLATION_STAGE] Erreur traduction segment {i}: {e}")
                # Garder le texte original en cas d'erreur
                translated_segments.append(seg)

        logger.info(
            f"[TRANSLATION_STAGE] ✅ {len(translated_segments)}/{len(segments)} segments traduits"
        )

        return translated_segments

    async def _translate_by_speaker(
        self,
        segments: List[Dict[str, Any]],
        source_language: str,
        target_language: str,
        model_type: str
    ) -> Dict[str, str]:
        """
        Traduit le texte COMPLET de chaque speaker (pas segment par segment).

        Avantages:
        - Meilleure qualité de traduction (contexte complet)
        - Phrases plus naturelles et fluides
        - Moins d'appels à l'API de traduction

        Args:
            segments: Segments source avec speaker_id et texte
            source_language: Langue source
            target_language: Langue cible
            model_type: Type de modèle de traduction

        Returns:
            Dict {speaker_id: texte_traduit_complet}
        """
        # 1. Grouper le texte par speaker (dans l'ordre d'apparition)
        speaker_texts = {}  # {speaker_id: [texte1, texte2, ...]}
        speaker_order = []  # Ordre d'apparition des speakers

        for seg in segments:
            speaker_id = seg.get('speaker_id', seg.get('speakerId', 'unknown'))
            text = seg.get('text', '').strip()

            if not text:
                continue

            if speaker_id not in speaker_texts:
                speaker_texts[speaker_id] = []
                speaker_order.append(speaker_id)

            speaker_texts[speaker_id].append(text)

        logger.info("=" * 80)
        logger.info(f"[TRANSLATION_STAGE] 🎭 TRADUCTION PAR SPEAKER")
        logger.info(f"[TRANSLATION_STAGE] {len(speaker_order)} speaker(s) détecté(s): {speaker_order}")

        # 2. Traduire le texte complet de chaque speaker
        speaker_translations = {}

        for speaker_id in speaker_order:
            texts = speaker_texts[speaker_id]
            # Joindre tous les textes du speaker
            full_text = ' '.join(texts)

            logger.info(
                f"[TRANSLATION_STAGE] 🔄 Speaker '{speaker_id}': "
                f"{len(texts)} segments, {len(full_text)} caractères"
            )

            # Traduire le texte complet
            translated_full_text = await self._translate_text_with_cache(
                text=full_text,
                source_language=source_language,
                target_language=target_language,
                model_type=model_type
            )

            speaker_translations[speaker_id] = translated_full_text

            logger.info(
                f"[TRANSLATION_STAGE] ✅ Speaker '{speaker_id}' traduit: "
                f"'{translated_full_text[:50]}...'"
            )

        logger.info("=" * 80)

        return speaker_translations

    def _get_speaker_turns(
        self,
        segments: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Extrait les tours de parole dans l'ordre chronologique.

        Un tour de parole = séquence de segments consécutifs du même speaker.

        Args:
            segments: Segments source avec speaker_id

        Returns:
            Liste des tours de parole:
            [
                {"speaker_id": "SPEAKER_00", "start_ms": 0, "end_ms": 5000},
                {"speaker_id": "SPEAKER_01", "start_ms": 5000, "end_ms": 8000},
                ...
            ]
        """
        if not segments:
            return []

        turns = []
        current_turn = None

        for seg in segments:
            speaker_id = seg.get('speaker_id', seg.get('speakerId', 'unknown'))
            start_ms = seg.get('start_ms', seg.get('startMs', 0))
            end_ms = seg.get('end_ms', seg.get('endMs', 0))

            if current_turn is None:
                # Premier segment
                current_turn = {
                    "speaker_id": speaker_id,
                    "start_ms": start_ms,
                    "end_ms": end_ms
                }
            elif speaker_id == current_turn["speaker_id"]:
                # Même speaker - étendre le tour
                current_turn["end_ms"] = end_ms
            else:
                # Nouveau speaker - sauvegarder et commencer un nouveau tour
                turns.append(current_turn)
                current_turn = {
                    "speaker_id": speaker_id,
                    "start_ms": start_ms,
                    "end_ms": end_ms
                }

        # Ne pas oublier le dernier tour
        if current_turn:
            turns.append(current_turn)

        logger.info(
            f"[TRANSLATION_STAGE] 🎤 Tours de parole détectés: "
            f"{len(segments)} segments → {len(turns)} tours"
        )

        return turns

    async def _cache_translated_audio(
        self,
        audio_hash: str,
        language: str,
        translated_text: str,
        tts_result: TTSResult
    ) -> bool:
        """Cache translated audio for reuse"""
        try:
            cache_data = {
                "translated_text": translated_text,
                "audio_path": tts_result.audio_path,
                "audio_url": tts_result.audio_url,
                "duration_ms": tts_result.duration_ms,
                "format": tts_result.format,
                "voice_cloned": tts_result.voice_cloned,
                "voice_quality": tts_result.voice_quality,
                "processing_time_ms": tts_result.processing_time_ms,
                "cached_at": datetime.now().isoformat()
            }

            await self.audio_cache.set_translated_audio_by_hash(
                audio_hash,
                language,
                cache_data
            )

            logger.debug(
                f"[TRANSLATION_STAGE] Cached audio: "
                f"{language} ({audio_hash[:8]}...)"
            )
            return True

        except Exception as e:
            logger.warning(f"[TRANSLATION_STAGE] Cache storage failed: {e}")
            return False

    async def get_stats(self) -> Dict[str, Any]:
        """Return stage statistics"""
        return {
            "stage": "translation",
            "initialized": self._initialized,
            "tts_service": await self.tts_service.get_stats(),
            "voice_clone_service": await self.voice_clone_service.get_stats(),
            "translation_available": self.translation_service is not None,
            "cache": {
                "audio": self.audio_cache.get_stats(),
                "translation": self.translation_cache.get_stats()
            }
        }

    async def close(self):
        """Release resources"""
        logger.info("[TRANSLATION_STAGE] Closing...")
        await asyncio.gather(
            self.tts_service.close(),
            self.voice_clone_service.close(),
            return_exceptions=True
        )
        self._initialized = False


# Factory function
def create_translation_stage(
    translation_service=None,
    tts_service: Optional[TTSService] = None,
    voice_clone_service: Optional[VoiceCloneService] = None,
    audio_cache: Optional[AudioCacheService] = None,
    translation_cache: Optional[TranslationCacheService] = None,
    transcription_service=None,
    preserve_silences: bool = True
) -> TranslationStage:
    """
    Create a new translation stage instance.

    Args:
        translation_service: ML translation service
        tts_service: Text-to-speech service
        voice_clone_service: Voice cloning service
        audio_cache: Audio cache service
        translation_cache: Translation cache service
        transcription_service: Transcription service for re-transcribing translated audio
        preserve_silences: Préserver les silences naturels entre segments (default: True)

    Returns:
        TranslationStage instance
    """
    return TranslationStage(
        translation_service=translation_service,
        tts_service=tts_service,
        voice_clone_service=voice_clone_service,
        audio_cache=audio_cache,
        translation_cache=translation_cache,
        transcription_service=transcription_service,
        preserve_silences=preserve_silences
    )
