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

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class TranslatedAudioVersion:
    """Translated audio version for a language"""
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
    # Segments traduits pour synchronisation audio
    segments: Optional[List[Dict[str, Any]]] = None


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
        translation_cache: Optional[TranslationCacheService] = None
    ):
        """
        Initialize translation stage.

        Args:
            translation_service: ML translation service
            tts_service: Text-to-speech service
            voice_clone_service: Voice cloning service
            audio_cache: Redis cache for audio
            translation_cache: Redis cache for text translations
        """
        self.translation_service = translation_service
        self.tts_service = tts_service or get_tts_service()
        self.voice_clone_service = voice_clone_service or get_voice_clone_service()
        self.audio_cache = audio_cache or get_audio_cache_service()
        self.translation_cache = translation_cache or get_translation_cache_service()

        self._initialized = False
        self._init_lock = asyncio.Lock()

        logger.info("[TRANSLATION_STAGE] Translation stage created")

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
        on_translation_ready: Optional[any] = None
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
            on_translation_ready=on_translation_ready,
            target_languages=target_languages
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
        on_translation_ready: Optional[any] = None,
        target_languages: Optional[List[str]] = None
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
                        on_translation_ready,
                        target_languages
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
        on_translation_ready: Optional[any] = None,
        target_languages: Optional[List[str]] = None
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
                        on_translation_ready=on_translation_ready,
                        target_languages=target_languages
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
        on_translation_ready: Optional[any] = None,
        target_languages: Optional[List[str]] = None
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
            translated_text = await self._translate_text_with_cache(
                text=source_text,
                source_language=source_language,
                target_language=target_lang,
                model_type=model_type
            )

            logger.info(
                f"[TRANSLATION_STAGE] Translated ({target_lang}): "
                f"'{translated_text[:50]}...'"
            )

            # 2. Generate TTS audio
            if voice_model:
                # PRIORITÉ 1: Utiliser les conditionals pré-calculés si disponibles
                # (plus rapide et qualité constante - évite recalcul à chaque synthèse)
                has_conditionals = (
                    hasattr(voice_model, 'chatterbox_conditionals') and
                    voice_model.chatterbox_conditionals is not None
                )

                if has_conditionals:
                    logger.info(
                        f"[TRANSLATION_STAGE] 🎤 Clonage vocal: conditionals pré-calculés "
                        f"(profil vocal réutilisé - optimisé)"
                    )
                    tts_result = await self.tts_service.synthesize_with_conditionals(
                        text=translated_text,
                        conditionals=voice_model.chatterbox_conditionals,
                        target_language=target_lang,
                        output_format="mp3",
                        message_id=f"{message_id}_{attachment_id}",
                        cloning_params=cloning_params
                    )
                else:
                    # PRIORITÉ 2: Calculer depuis l'audio de référence
                    # (fallback si pas de conditionals pré-calculés)
                    speaker_audio = source_audio_path if source_audio_path and os.path.exists(source_audio_path) else getattr(voice_model, 'reference_audio_path', None)

                    if speaker_audio:
                        logger.info(
                            f"[TRANSLATION_STAGE] 🎤 Clonage vocal: calcul depuis audio "
                            f"(ref={os.path.basename(speaker_audio)})"
                        )
                    else:
                        logger.warning(
                            f"[TRANSLATION_STAGE] ⚠️ Pas d'audio de référence ni conditionals "
                            f"→ voix générique"
                        )

                    tts_result = await self.tts_service.synthesize_with_voice(
                        text=translated_text,
                        speaker_audio_path=speaker_audio,
                        target_language=target_lang,
                        output_format="mp3",
                        message_id=f"{message_id}_{attachment_id}",
                        cloning_params=cloning_params
                    )
            else:
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

            # 3. RE-TRANSCRIPTION LÉGÈRE POUR SEGMENTS FINS (mono-locuteur)
            # ═══════════════════════════════════════════════════════════════
            fine_segments = None
            if tts_result.audio_path and os.path.exists(tts_result.audio_path):
                try:
                    logger.info(
                        f"[TRANSLATION_STAGE] 🎯 Re-transcription pour segments fins "
                        f"({target_lang}, mono-speaker)..."
                    )

                    # Créer métadonnées de "tour" unique pour mono-speaker
                    turns_metadata = [{
                        'start_ms': 0,
                        'end_ms': tts_result.duration_ms,
                        'speaker_id': 's0',  # Speaker unique pour mono
                        'voice_similarity_score': tts_result.voice_quality if tts_result.voice_cloned else None
                    }]

                    # Re-transcrire l'audio traduit
                    from .retranscription_service import retranscribe_translated_audio
                    fine_segments = await retranscribe_translated_audio(
                        audio_path=tts_result.audio_path,
                        target_language=target_lang,
                        turns_metadata=turns_metadata
                    )

                    logger.info(
                        f"[TRANSLATION_STAGE] ✅ {len(fine_segments)} segments fins créés "
                        f"pour mono-speaker"
                    )

                except Exception as e:
                    logger.warning(
                        f"[TRANSLATION_STAGE] ⚠️ Échec re-transcription segments fins: {e}"
                    )
                    # Continuer sans segments fins (fallback)

            # 4. Cache audio
            await self._cache_translated_audio(
                audio_hash=audio_hash,
                language=target_lang,
                translated_text=translated_text,
                tts_result=tts_result
            )

            # 5. Créer le résultat
            translation_result = TranslatedAudioVersion(
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
                segments=fine_segments  # Segments fins avec timestamps exacts
            )

            # 6. Callback pour remontée progressive (MONO-SPEAKER)
            if on_translation_ready and target_languages:
                try:
                    logger.info(f"[TRANSLATION_STAGE] 📤 Remontée traduction {target_lang} à la gateway (mono-speaker)...")

                    # Déterminer le type d'événement selon le nombre de langues
                    total_languages = len(target_languages)
                    is_single_language = total_languages == 1
                    current_index = target_languages.index(target_lang) + 1
                    is_last_language = current_index == total_languages

                    translation_data = {
                        'message_id': message_id,
                        'attachment_id': attachment_id,
                        'language': target_lang,
                        'translation': translation_result,
                        'segments': fine_segments,
                        # Métadonnées pour déterminer le type d'événement
                        'is_single_language': is_single_language,
                        'is_last_language': is_last_language,
                        'current_index': current_index,
                        'total_languages': total_languages
                    }

                    # Appeler le callback (peut être async)
                    if asyncio.iscoroutinefunction(on_translation_ready):
                        await on_translation_ready(translation_data)
                    else:
                        on_translation_ready(translation_data)

                    logger.info(
                        f"[TRANSLATION_STAGE] ✅ Traduction {target_lang} remontée "
                        f"({current_index}/{total_languages})"
                    )
                except Exception as e:
                    logger.warning(f"[TRANSLATION_STAGE] ⚠️ Erreur callback traduction: {e}")
                    import traceback
                    traceback.print_exc()

            # 7. Return result
            return (target_lang, translation_result)

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
        # Check cache
        cached = await self.translation_cache.get_translation(
            text=text,
            source_lang=source_language,
            target_lang=target_language,
            model_type=model_type
        )

        if cached:
            logger.debug(
                f"[TRANSLATION_STAGE] Translation cache hit: "
                f"{source_language}→{target_language}"
            )
            return cached.get("translated_text", text)

        # Translate
        translated = await self._translate_text(
            text,
            source_language,
            target_language,
            model_type
        )

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
        if not self.translation_service:
            logger.warning(
                "[TRANSLATION_STAGE] Translation service unavailable, "
                "returning original text"
            )
            return text

        try:
            result = await self.translation_service.translate_with_structure(
                text=text,
                source_language=source_language,
                target_language=target_language,
                model_type=model_type,
                source_channel="audio_pipeline"
            )
            return result.get('translated_text', text)

        except Exception as e:
            logger.error(f"[TRANSLATION_STAGE] Translation error: {e}")
            return text

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
    translation_cache: Optional[TranslationCacheService] = None
) -> TranslationStage:
    """
    Create a new translation stage instance.

    Args:
        translation_service: ML translation service
        tts_service: Text-to-speech service
        voice_clone_service: Voice cloning service
        audio_cache: Audio cache service
        translation_cache: Translation cache service

    Returns:
        TranslationStage instance
    """
    return TranslationStage(
        translation_service=translation_service,
        tts_service=tts_service,
        voice_clone_service=voice_clone_service,
        audio_cache=audio_cache,
        translation_cache=translation_cache
    )
