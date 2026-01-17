"""
Pipeline complet pour le traitement des messages audio.
Orchestre: Transcription → Traduction → Clonage → TTS

Architecture OPTIMISÉE:
- Utilise Redis pour le cache (transcriptions, traductions, audios)
- NE sauvegarde PAS en base de données (Gateway le fait)
- Réutilise les traductions existantes cross-conversation
- Traitement parallèle des langues cibles
"""

import os
import logging
import time
import asyncio
import threading
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# Configuration du logging
logger = logging.getLogger(__name__)

# Import des services
from services.transcription_service import (
    TranscriptionService,
    TranscriptionResult,
    get_transcription_service
)
from services.voice_clone_service import (
    VoiceCloneService,
    VoiceModel,
    get_voice_clone_service
)
# TTS Service simplifié (utilise ModelManager pour gestion mémoire)
from services.tts_service import (
    TTSService,
    TTSResult,
    get_tts_service
)
from services.redis_service import (
    get_redis_service,
    get_audio_cache_service,
    get_translation_cache_service,
    AudioCacheService,
    TranslationCacheService
)


@dataclass
class AudioMessageMetadata:
    """Métadonnées fournies par le client mobile"""
    transcription: Optional[str] = None  # Transcription faite sur mobile
    language: Optional[str] = None       # Langue détectée par mobile
    confidence: Optional[float] = None   # Score de confiance
    source: Optional[str] = None         # Source (ios_speech, android_speech, etc.)
    segments: Optional[List[Dict]] = None  # Segments avec timestamps


@dataclass
class OriginalAudio:
    """Données de l'audio original"""
    audio_path: str
    audio_url: str
    transcription: str
    language: str
    duration_ms: int
    confidence: float
    source: str  # "mobile" ou "whisper"
    segments: Optional[List[Dict]] = None


@dataclass
class TranslatedAudioVersion:
    """Version audio traduite pour une langue"""
    language: str
    translated_text: str
    audio_path: str
    audio_url: str
    duration_ms: int
    format: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int


@dataclass
class NewVoiceProfileData:
    """Données d'un nouveau profil vocal à sauvegarder par Gateway"""
    user_id: str
    profile_id: str
    embedding_base64: str  # Embedding en Base64 pour transmission
    quality_score: float
    audio_count: int
    total_duration_ms: int
    version: int
    fingerprint: Optional[Dict[str, Any]] = None
    voice_characteristics: Optional[Dict[str, Any]] = None


@dataclass
class AudioMessageResult:
    """Résultat complet du traitement d'un message audio"""
    message_id: str
    attachment_id: str
    original: OriginalAudio
    translations: Dict[str, TranslatedAudioVersion]
    voice_model_user_id: str
    voice_model_quality: float
    processing_time_ms: int
    timestamp: datetime = field(default_factory=datetime.now)
    # Nouveau profil vocal créé par Translator (à sauvegarder par Gateway)
    new_voice_profile: Optional[NewVoiceProfileData] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire pour sérialisation"""
        return {
            "message_id": self.message_id,
            "attachment_id": self.attachment_id,
            "original": {
                "audio_path": self.original.audio_path,
                "audio_url": self.original.audio_url,
                "transcription": self.original.transcription,
                "language": self.original.language,
                "duration_ms": self.original.duration_ms,
                "confidence": self.original.confidence,
                "source": self.original.source
            },
            "translations": {
                lang: {
                    "language": t.language,
                    "translated_text": t.translated_text,
                    "audio_path": t.audio_path,
                    "audio_url": t.audio_url,
                    "duration_ms": t.duration_ms,
                    "format": t.format,
                    "voice_cloned": t.voice_cloned,
                    "voice_quality": t.voice_quality
                }
                for lang, t in self.translations.items()
            },
            "voice_model_user_id": self.voice_model_user_id,
            "voice_model_quality": self.voice_model_quality,
            "processing_time_ms": self.processing_time_ms,
            "timestamp": self.timestamp.isoformat()
        }


class AudioMessagePipeline:
    """
    Pipeline complet pour le traitement des messages audio.

    Orchestre les étapes:
    1. Vérifier cache (transcription + traductions existantes)
    2. Transcription (mobile ou Whisper) si pas en cache
    3. Clonage vocal
    4. Traduction + TTS pour chaque langue (PARALLÈLE)
    5. Mise en cache des résultats

    IMPORTANT: Ce pipeline NE sauvegarde PAS en base de données.
    Les résultats sont retournés à Gateway qui gère la persistance.

    Optimisations:
    - Cache Redis pour transcriptions (par hash audio)
    - Cache Redis pour traductions audio (cross-conversation)
    - Réutilisation des traductions existantes
    - Traitement parallèle des langues
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(
        self,
        translation_service=None,
        database_service=None
    ):
        """
        ═══════════════════════════════════════════════════════════════════════
        ARCHITECTURE: PAS DE PERSISTANCE BASE DE DONNÉES
        ═══════════════════════════════════════════════════════════════════════
        Ce pipeline NE SAUVEGARDE PAS en base de données.
        La persistance des traductions (texte et audio) est la RESPONSABILITÉ
        DE LA GATEWAY, pas du Translator.

        Translator:
          - Transcrit, traduit, génère les audios
          - Cache les résultats dans Redis (TTL 1 mois)
          - Renvoie les résultats à Gateway via ZMQ

        Gateway:
          - Reçoit les résultats
          - Persiste en base de données (avec encryption si nécessaire)
          - Gère la logique métier de persistance

        database_service est gardé uniquement pour:
          - Lecture des profils vocaux (voice_clone_service)
          - Compatibilité avec les anciens appels
        ═══════════════════════════════════════════════════════════════════════
        """
        if self._initialized:
            return

        # Services audio
        self.transcription_service = get_transcription_service()
        self.voice_clone_service = get_voice_clone_service()
        self.tts_service = get_tts_service()
        self.translation_service = translation_service

        # Services cache (Redis) - Cache principal, pas de BDD
        self.audio_cache = get_audio_cache_service()
        self.translation_cache = get_translation_cache_service()
        self.redis_service = get_redis_service()

        # Database service: lecture seule pour profils vocaux, PAS de persistance
        self.database_service = database_service

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        logger.info("[PIPELINE] AudioMessagePipeline créé (mode cache, sans persistance BDD)")
        self._initialized = True

    def set_translation_service(self, translation_service):
        """Injecte le service de traduction"""
        self.translation_service = translation_service

    def set_database_service(self, database_service):
        """
        Injecte le service de base de données.
        NOTE: Utilisé uniquement pour lecture des profils vocaux,
        PAS pour persistance des traductions.
        """
        self.database_service = database_service
        if self.voice_clone_service:
            self.voice_clone_service.set_database_service(database_service)

    async def initialize(self) -> bool:
        """Initialise tous les services du pipeline (audio + cache)"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            logger.info("[PIPELINE] 🔄 Initialisation du pipeline audio + cache...")

            try:
                # Initialiser les services en parallèle (audio + cache)
                results = await asyncio.gather(
                    self.transcription_service.initialize(),
                    self.voice_clone_service.initialize(),
                    self.tts_service.initialize(),
                    self.redis_service.initialize(),
                    return_exceptions=True
                )

                # Vérifier les erreurs
                service_names = ["transcription", "voice_clone", "tts", "redis"]
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        logger.error(f"[PIPELINE] Erreur initialisation {service_names[i]}: {result}")

                self.is_initialized = True
                logger.info(f"[PIPELINE] ✅ Pipeline audio initialisé (Redis: {'OK' if self.redis_service.is_available() else 'mémoire'})")
                return True

            except Exception as e:
                logger.error(f"[PIPELINE] ❌ Erreur initialisation pipeline: {e}")
                import traceback
                traceback.print_exc()
                return False

    async def process_audio_message(
        self,
        audio_path: str,
        audio_url: str,
        sender_id: str,
        conversation_id: str,
        message_id: str,
        attachment_id: str,
        audio_duration_ms: int = 0,
        metadata: Optional[AudioMessageMetadata] = None,
        target_languages: Optional[List[str]] = None,
        generate_voice_clone: bool = True,
        model_type: str = "medium",
        # Voice profile options - for using original sender's voice in forwarded messages
        original_sender_id: Optional[str] = None,
        existing_voice_profile: Optional[Dict[str, Any]] = None,
        use_original_voice: bool = True,
        # Paramètres de clonage vocal configurables par l'utilisateur
        cloning_params: Optional[Dict[str, Any]] = None
    ) -> AudioMessageResult:
        """
        Traite un message audio complet.

        Pipeline:
        1. Transcription (mobile ou Whisper)
        2. Traduction vers toutes les langues des destinataires
        3. Clonage de la voix de l'émetteur (ou utilisation du profil existant)
        4. Génération audio traduit pour chaque langue

        Args:
            audio_path: Chemin vers le fichier audio original
            audio_url: URL accessible de l'audio
            sender_id: ID de l'utilisateur émetteur
            conversation_id: ID de la conversation
            message_id: ID du message
            attachment_id: ID de l'attachment
            audio_duration_ms: Durée de l'audio (optionnel)
            metadata: Métadonnées (transcription mobile, etc.)
            target_languages: Langues cibles (auto-détectées si non fournies)
            generate_voice_clone: Activer le clonage vocal
            model_type: Type de modèle de traduction
            original_sender_id: ID de l'émetteur original (pour messages transférés)
            existing_voice_profile: Profil vocal existant envoyé par Gateway
                                   (pour utiliser la voix de l'émetteur original)
            use_original_voice: Utiliser la voix de l'émetteur original (défaut: True)
            cloning_params: Paramètres de clonage vocal configurables:
                           - exaggeration: float (0.0-1.0, défaut 0.5)
                           - cfg_weight: float (0.0-1.0, 0.0 pour langues non-anglaises)
                           - temperature: float (0.1-2.0, défaut 1.0)
                           - top_p: float (0.0-1.0, défaut 0.9)
                           - quality_preset: str ("fast", "balanced", "high_quality")

        Returns:
            AudioMessageResult avec original + toutes les traductions audio
            NOTE: Les résultats NE sont PAS sauvegardés en BDD - Gateway le fait
        """
        start_time = time.time()

        logger.info(f"[PIPELINE] 🚀 Traitement audio: msg={message_id}, sender={sender_id}")

        # S'assurer que le pipeline est initialisé
        if not self.is_initialized:
            await self.initialize()

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 0: CALCULER HASH AUDIO (pour cache cross-conversation)
        # ═══════════════════════════════════════════════════════════════
        audio_hash = await self.audio_cache.get_or_compute_audio_hash(attachment_id, audio_path)
        logger.info(f"[PIPELINE] 🔑 Hash audio: {audio_hash[:8]}...")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 1: TRANSCRIPTION (avec cache)
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"[PIPELINE] 📝 Étape 1: Transcription")

        # Vérifier le cache de transcription (par hash audio)
        cached_transcription = await self.audio_cache.get_transcription_by_hash(audio_hash)

        if cached_transcription:
            logger.info(f"[PIPELINE] ⚡ Transcription en cache (hash={audio_hash[:8]})")
            # Reconstruire l'objet TranscriptionResult depuis le cache
            transcription = TranscriptionResult(
                text=cached_transcription.get("text", ""),
                language=cached_transcription.get("language", "en"),
                confidence=cached_transcription.get("confidence", 0.9),
                duration_ms=cached_transcription.get("duration_ms", 0),
                source=cached_transcription.get("source", "cache"),
                segments=[]
            )
        else:
            # Préparer les données mobiles si disponibles
            mobile_transcription = None
            if metadata and metadata.transcription:
                mobile_transcription = {
                    "text": metadata.transcription,
                    "language": metadata.language,
                    "confidence": metadata.confidence or 0.85,
                    "source": metadata.source or "mobile",
                    "segments": metadata.segments
                }

            transcription = await self.transcription_service.transcribe(
                audio_path=audio_path,
                mobile_transcription=mobile_transcription,
                return_timestamps=True
            )

            # Mettre en cache la transcription
            await self.audio_cache.set_transcription_by_hash(audio_hash, {
                "text": transcription.text,
                "language": transcription.language,
                "confidence": transcription.confidence,
                "duration_ms": transcription.duration_ms,
                "source": transcription.source
            })

            logger.info(
                f"[PIPELINE] ✅ Transcrit: '{transcription.text[:50]}...' "
                f"(lang={transcription.language}, src={transcription.source})"
            )

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 2: RÉCUPÉRER LES LANGUES DESTINATAIRES
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"[PIPELINE] 🌍 Étape 2: Récupération langues cibles")

        if not target_languages:
            target_languages = await self._get_target_languages(
                conversation_id=conversation_id,
                source_language=transcription.language,
                sender_id=sender_id
            )

        logger.info(f"[PIPELINE] 🎯 Langues cibles: {target_languages}")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 3: CLONAGE VOCAL
        # ═══════════════════════════════════════════════════════════════
        voice_model = None
        voice_model_user_id = sender_id  # Par défaut, on utilise la voix du sender

        if generate_voice_clone:
            logger.info(f"[PIPELINE] 🎤 Étape 3: Clonage vocal")

            try:
                # Option 1: Utiliser le profil vocal existant fourni par Gateway
                # (cas des messages transférés - utiliser la voix de l'émetteur original)
                if use_original_voice and existing_voice_profile:
                    logger.info(
                        f"[PIPELINE] 📦 Utilisation du profil vocal Gateway "
                        f"(original_sender={original_sender_id or 'unknown'})"
                    )
                    voice_model = await self.voice_clone_service.create_voice_model_from_gateway_profile(
                        profile_data=existing_voice_profile,
                        user_id=original_sender_id or sender_id
                    )
                    if voice_model:
                        voice_model_user_id = original_sender_id or sender_id
                        logger.info(
                            f"[PIPELINE] ✅ Modèle voix (Gateway): "
                            f"user={voice_model_user_id}, quality={voice_model.quality_score:.2f}"
                        )

                # Option 2: Créer/récupérer le modèle de voix normalement
                if voice_model is None:
                    voice_model = await self.voice_clone_service.get_or_create_voice_model(
                        user_id=sender_id,
                        current_audio_path=audio_path,
                        current_audio_duration_ms=audio_duration_ms or transcription.duration_ms
                    )
                    voice_model_user_id = sender_id
                    logger.info(f"[PIPELINE] ✅ Modèle voix: quality={voice_model.quality_score:.2f}")

            except Exception as e:
                logger.warning(f"[PIPELINE] ⚠️ Échec clonage vocal: {e}")
                voice_model = None

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 4: VÉRIFIER CACHE + TRADUCTION + TTS (EN PARALLÈLE)
        # ═══════════════════════════════════════════════════════════════
        translations = {}

        logger.info(f"[PIPELINE] 🔄 Étape 4: Vérification cache + traitement {len(target_languages)} langues")

        # 4a. Vérifier quelles traductions audio existent déjà en cache
        cached_translations = await self.audio_cache.get_all_translated_audio_by_hash(audio_hash, target_languages)

        # Séparer: langues en cache vs langues à traiter
        languages_to_process = []
        for lang in target_languages:
            if cached_translations.get(lang):
                cached = cached_translations[lang]
                logger.info(f"[PIPELINE] ⚡ Audio {lang} en cache: {cached.get('audio_url', 'N/A')}")
                translations[lang] = TranslatedAudioVersion(
                    language=lang,
                    translated_text=cached.get("translated_text", ""),
                    audio_path=cached.get("audio_path", ""),
                    audio_url=cached.get("audio_url", ""),
                    duration_ms=cached.get("duration_ms", 0),
                    format=cached.get("format", "mp3"),
                    voice_cloned=cached.get("voice_cloned", False),
                    voice_quality=cached.get("voice_quality", 0.0),
                    processing_time_ms=0  # Instantané depuis cache
                )
            else:
                languages_to_process.append(lang)

        if not languages_to_process:
            logger.info(f"[PIPELINE] ⚡ Toutes les {len(target_languages)} traductions en cache!")
        else:
            logger.info(f"[PIPELINE] 🔄 Traitement PARALLÈLE de {len(languages_to_process)} langues: {languages_to_process}")

            # Fonction helper pour traiter une langue (avec accès aux cloning_params)
            async def process_single_language(target_lang: str, lang_cloning_params: Optional[Dict[str, Any]] = None) -> tuple:
                """Traite une langue: traduction + TTS + mise en cache"""
                lang_start = time.time()
                try:
                    # 4b. Traduire le texte (avec cache texte)
                    translated_text = await self._translate_text_with_cache(
                        text=transcription.text,
                        source_language=transcription.language,
                        target_language=target_lang,
                        model_type=model_type
                    )

                    logger.info(f"[PIPELINE] 📝 Traduit ({target_lang}): '{translated_text[:50]}...'")

                    # 4c. Générer audio avec voix clonée
                    if voice_model:
                        tts_result = await self.tts_service.synthesize_with_voice(
                            text=translated_text,
                            speaker_audio_path=voice_model.reference_audio_path if hasattr(voice_model, 'reference_audio_path') else None,
                            target_language=target_lang,
                            output_format="mp3",
                            message_id=f"{message_id}_{attachment_id}",
                            # Passer les paramètres de clonage configurables
                            cloning_params=lang_cloning_params
                        )
                    else:
                        # Sans clonage vocal
                        tts_result = await self.tts_service.synthesize(
                            text=translated_text,
                            language=target_lang,
                            output_format="mp3",
                            # Passer les paramètres de clonage (pour température, etc.)
                            cloning_params=lang_cloning_params
                        )

                    lang_time = int((time.time() - lang_start) * 1000)
                    logger.info(f"[PIPELINE] ✅ Audio généré ({target_lang}): {tts_result.audio_url} [{lang_time}ms]")

                    # 4d. Mettre en cache l'audio traduit (pour réutilisation cross-conversation)
                    audio_data = {
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
                    await self.audio_cache.set_translated_audio_by_hash(audio_hash, target_lang, audio_data)

                    return (target_lang, TranslatedAudioVersion(
                        language=target_lang,
                        translated_text=translated_text,
                        audio_path=tts_result.audio_path,
                        audio_url=tts_result.audio_url,
                        duration_ms=tts_result.duration_ms,
                        format=tts_result.format,
                        voice_cloned=tts_result.voice_cloned,
                        voice_quality=tts_result.voice_quality,
                        processing_time_ms=tts_result.processing_time_ms
                    ))

                except Exception as e:
                    logger.error(f"[PIPELINE] ❌ Erreur traitement {target_lang}: {e}")
                    import traceback
                    traceback.print_exc()
                    return (target_lang, None)

            # Exécuter toutes les traductions en parallèle
            parallel_start = time.time()
            results = await asyncio.gather(
                *[process_single_language(lang, cloning_params) for lang in languages_to_process],
                return_exceptions=True
            )
            parallel_time = int((time.time() - parallel_start) * 1000)

            # Collecter les résultats réussis
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"[PIPELINE] ❌ Exception dans traitement parallèle: {result}")
                elif result and result[1] is not None:
                    target_lang, translation = result
                    translations[target_lang] = translation

            logger.info(f"[PIPELINE] ⚡ {len(languages_to_process)} langues traitées en {parallel_time}ms")

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 5: CONSTRUIRE LE RÉSULTAT (sans sauvegarde BDD)
        # ═══════════════════════════════════════════════════════════════
        processing_time = int((time.time() - start_time) * 1000)

        # Compter les résultats en cache vs nouvellement générés
        cached_count = len(target_languages) - len(languages_to_process) if 'languages_to_process' in dir() else 0

        # Préparer les données du nouveau profil vocal si créé par Translator
        # (à sauvegarder par Gateway dans MongoDB)
        new_voice_profile_data = None
        if voice_model and not existing_voice_profile and voice_model.embedding is not None:
            import base64
            try:
                # Encoder l'embedding en Base64 pour transmission
                embedding_bytes = voice_model.embedding.tobytes()
                embedding_base64 = base64.b64encode(embedding_bytes).decode('utf-8')

                # Sérialiser fingerprint si disponible
                fingerprint_dict = None
                if voice_model.fingerprint:
                    fingerprint_dict = {
                        'fingerprint_id': voice_model.fingerprint.fingerprint_id,
                        'signature': voice_model.fingerprint.signature,
                        'signature_short': voice_model.fingerprint.signature_short,
                        'audio_duration_ms': voice_model.fingerprint.audio_duration_ms,
                        'created_at': voice_model.fingerprint.created_at.isoformat() if voice_model.fingerprint.created_at else None
                    }

                # Sérialiser voice_characteristics si disponible
                voice_chars_dict = None
                if voice_model.voice_characteristics:
                    vc = voice_model.voice_characteristics
                    voice_chars_dict = {
                        'pitch_mean_hz': vc.pitch_mean_hz,
                        'pitch_std_hz': vc.pitch_std_hz,
                        'pitch_range_hz': vc.pitch_range_hz,
                        'estimated_gender': vc.estimated_gender,
                        'speaking_rate_wpm': vc.speaking_rate_wpm,
                        'spectral_centroid_hz': vc.spectral_centroid_hz,
                        'spectral_bandwidth_hz': vc.spectral_bandwidth_hz,
                        'energy_mean': vc.energy_mean,
                        'energy_std': vc.energy_std,
                        'confidence': vc.confidence
                    }

                new_voice_profile_data = NewVoiceProfileData(
                    user_id=voice_model_user_id,
                    profile_id=voice_model.profile_id,
                    embedding_base64=embedding_base64,
                    quality_score=voice_model.quality_score,
                    audio_count=voice_model.audio_count,
                    total_duration_ms=voice_model.total_duration_ms,
                    version=voice_model.version,
                    fingerprint=fingerprint_dict,
                    voice_characteristics=voice_chars_dict
                )
                logger.info(f"[PIPELINE] 📦 Nouveau profil vocal préparé pour Gateway: {voice_model_user_id}")
            except Exception as e:
                logger.warning(f"[PIPELINE] ⚠️ Erreur préparation profil vocal: {e}")

        result = AudioMessageResult(
            message_id=message_id,
            attachment_id=attachment_id,
            original=OriginalAudio(
                audio_path=audio_path,
                audio_url=audio_url,
                transcription=transcription.text,
                language=transcription.language,
                duration_ms=transcription.duration_ms,
                confidence=transcription.confidence,
                source=transcription.source,
                segments=[{
                    "text": s.text,
                    "startMs": s.start_ms,
                    "endMs": s.end_ms
                } for s in transcription.segments] if transcription.segments else None
            ),
            translations=translations,
            voice_model_user_id=voice_model_user_id,
            voice_model_quality=voice_model.quality_score if voice_model else 0.0,
            processing_time_ms=processing_time,
            new_voice_profile=new_voice_profile_data
        )

        logger.info(
            f"[PIPELINE] ✅ Pipeline terminé: {len(translations)} traductions "
            f"({cached_count} en cache), time={processing_time}ms"
        )

        # NOTE: PAS de sauvegarde en BDD - Gateway gère la persistance
        # Les résultats sont en cache Redis pour réutilisation

        return result

    async def _translate_text_with_cache(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model_type: str = "premium"
    ) -> str:
        """
        Traduit du texte avec vérification cache Redis.
        Ne retraduit pas si déjà en cache avec modèle premium.
        """
        # Vérifier le cache de traduction texte
        cached = await self.translation_cache.get_translation(
            text=text,
            source_lang=source_language,
            target_lang=target_language,
            model_type=model_type
        )

        if cached:
            logger.debug(f"[PIPELINE] ⚡ Traduction texte en cache: {source_language}→{target_language}")
            return cached.get("translated_text", text)

        # Pas en cache, traduire
        translated = await self._translate_text(text, source_language, target_language, model_type)

        # Mettre en cache
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
        model_type: str = "premium"
    ) -> str:
        """Traduit du texte via le service de traduction (sans cache)"""
        if not self.translation_service:
            logger.warning("[PIPELINE] Translation service non disponible, retour texte original")
            return text

        try:
            # Utiliser le service de traduction ML
            result = await self.translation_service.translate_with_structure(
                text=text,
                source_language=source_language,
                target_language=target_language,
                model_type=model_type,
                source_channel="audio_pipeline"
            )
            return result.get('translated_text', text)
        except Exception as e:
            logger.error(f"[PIPELINE] Erreur traduction: {e}")
            return text

    async def _get_target_languages(
        self,
        conversation_id: str,
        source_language: str,
        sender_id: str
    ) -> List[str]:
        """
        Retourne les langues par défaut si non fournies par Gateway.

        NOTE: Dans la nouvelle architecture, Gateway DOIT fournir target_languages.
        Cette méthode est un fallback qui retourne des valeurs par défaut.
        """
        logger.warning("[PIPELINE] target_languages non fourni par Gateway, utilisation fallback")
        return ["en"] if source_language != "en" else ["fr"]

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du pipeline"""
        return {
            "service": "AudioMessagePipeline",
            "initialized": self.is_initialized,
            "mode": "cache_only",  # Pas de persistance BDD
            "transcription": await self.transcription_service.get_stats(),
            "voice_clone": await self.voice_clone_service.get_stats(),
            "tts": await self.tts_service.get_stats(),
            "translation_available": self.translation_service is not None,
            "cache": {
                "redis": self.redis_service.get_stats(),
                "audio": self.audio_cache.get_stats(),
                "translation": self.translation_cache.get_stats()
            }
        }

    async def close(self):
        """Libère les ressources"""
        logger.info("[PIPELINE] 🛑 Fermeture du pipeline")
        await asyncio.gather(
            self.transcription_service.close(),
            self.voice_clone_service.close(),
            self.tts_service.close(),
            self.redis_service.close(),
            return_exceptions=True
        )
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_audio_pipeline() -> AudioMessagePipeline:
    """Retourne l'instance singleton du pipeline audio"""
    return AudioMessagePipeline()
