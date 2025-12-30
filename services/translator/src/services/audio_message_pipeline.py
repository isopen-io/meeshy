"""
Pipeline complet pour le traitement des messages audio.
Orchestre: Transcription → Traduction → Clonage → TTS

Ce pipeline fonctionne de manière AUTONOME (sans Gateway).
Architecture: Singleton, compatible avec le pattern du TranslationMLService.
"""

import os
import logging
import time
import asyncio
import threading
from typing import Optional, List, Dict, Any
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
from services.tts_service import (
    TTSService,
    TTSResult,
    get_tts_service
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
    1. Transcription (mobile ou Whisper)
    2. Récupération des langues cibles
    3. Clonage vocal
    4. Traduction + TTS pour chaque langue
    5. Sauvegarde en base de données

    Ce pipeline fonctionne de manière AUTONOME.
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
        if self._initialized:
            return

        # Services
        self.transcription_service = get_transcription_service()
        self.voice_clone_service = get_voice_clone_service()
        self.tts_service = get_tts_service()
        self.translation_service = translation_service
        self.database_service = database_service

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        logger.info("[PIPELINE] AudioMessagePipeline créé")
        self._initialized = True

    def set_translation_service(self, translation_service):
        """Injecte le service de traduction"""
        self.translation_service = translation_service

    def set_database_service(self, database_service):
        """Injecte le service de base de données"""
        self.database_service = database_service
        self.voice_clone_service.set_database_service(database_service)

    async def initialize(self) -> bool:
        """Initialise tous les services du pipeline"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            logger.info("[PIPELINE] 🔄 Initialisation du pipeline audio...")

            try:
                # Initialiser les services en parallèle
                results = await asyncio.gather(
                    self.transcription_service.initialize(),
                    self.voice_clone_service.initialize(),
                    self.tts_service.initialize(),
                    return_exceptions=True
                )

                # Vérifier les erreurs
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        logger.error(f"[PIPELINE] Erreur initialisation service {i}: {result}")

                self.is_initialized = True
                logger.info("[PIPELINE] ✅ Pipeline audio initialisé")
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
        model_type: str = "medium"
    ) -> AudioMessageResult:
        """
        Traite un message audio complet.

        Pipeline:
        1. Transcription (mobile ou Whisper)
        2. Traduction vers toutes les langues des destinataires
        3. Clonage de la voix de l'émetteur
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

        Returns:
            AudioMessageResult avec original + toutes les traductions audio
        """
        start_time = time.time()

        logger.info(f"[PIPELINE] 🚀 Traitement audio: msg={message_id}, sender={sender_id}")

        # S'assurer que le pipeline est initialisé
        if not self.is_initialized:
            await self.initialize()

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 1: TRANSCRIPTION
        # ═══════════════════════════════════════════════════════════════
        logger.info(f"[PIPELINE] 📝 Étape 1: Transcription")

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
        if generate_voice_clone:
            logger.info(f"[PIPELINE] 🎤 Étape 3: Clonage vocal")

            try:
                voice_model = await self.voice_clone_service.get_or_create_voice_model(
                    user_id=sender_id,
                    current_audio_path=audio_path,
                    current_audio_duration_ms=audio_duration_ms or transcription.duration_ms
                )
                logger.info(f"[PIPELINE] ✅ Modèle voix: quality={voice_model.quality_score:.2f}")
            except Exception as e:
                logger.warning(f"[PIPELINE] ⚠️ Échec clonage vocal: {e}")
                voice_model = None

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 4: TRADUCTION + TTS POUR CHAQUE LANGUE
        # ═══════════════════════════════════════════════════════════════
        translations = {}

        for target_lang in target_languages:
            logger.info(f"[PIPELINE] 🔄 Étape 4: Traitement langue {target_lang}")

            try:
                # 4a. Traduire le texte
                translated_text = await self._translate_text(
                    text=transcription.text,
                    source_language=transcription.language,
                    target_language=target_lang,
                    model_type=model_type
                )

                logger.info(f"[PIPELINE] 📝 Traduit ({target_lang}): '{translated_text[:50]}...'")

                # 4b. Générer audio avec voix clonée
                if voice_model:
                    tts_result = await self.tts_service.synthesize_with_voice(
                        text=translated_text,
                        voice_model=voice_model,
                        target_language=target_lang,
                        output_format="mp3",
                        message_id=f"{message_id}_{attachment_id}"
                    )
                else:
                    # Sans clonage vocal
                    tts_result = await self.tts_service.synthesize(
                        text=translated_text,
                        language=target_lang,
                        output_format="mp3"
                    )

                translations[target_lang] = TranslatedAudioVersion(
                    language=target_lang,
                    translated_text=translated_text,
                    audio_path=tts_result.audio_path,
                    audio_url=tts_result.audio_url,
                    duration_ms=tts_result.duration_ms,
                    format=tts_result.format,
                    voice_cloned=tts_result.voice_cloned,
                    voice_quality=tts_result.voice_quality,
                    processing_time_ms=tts_result.processing_time_ms
                )

                logger.info(f"[PIPELINE] ✅ Audio généré: {tts_result.audio_url}")

            except Exception as e:
                logger.error(f"[PIPELINE] ❌ Erreur traitement {target_lang}: {e}")
                import traceback
                traceback.print_exc()

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 5: CONSTRUIRE LE RÉSULTAT
        # ═══════════════════════════════════════════════════════════════
        processing_time = int((time.time() - start_time) * 1000)

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
            voice_model_user_id=sender_id,
            voice_model_quality=voice_model.quality_score if voice_model else 0.0,
            processing_time_ms=processing_time
        )

        logger.info(
            f"[PIPELINE] ✅ Pipeline terminé: {len(translations)} traductions, "
            f"time={processing_time}ms"
        )

        # ═══════════════════════════════════════════════════════════════
        # ÉTAPE 6: SAUVEGARDER EN BASE DE DONNÉES (optionnel)
        # ═══════════════════════════════════════════════════════════════
        if self.database_service:
            await self._save_to_database(result)

        return result

    async def _translate_text(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model_type: str = "medium"
    ) -> str:
        """Traduit du texte via le service de traduction"""
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
        Récupère les langues de destination uniques de tous les membres.
        Exclut la langue source si c'est la même.
        """
        if not self.database_service:
            logger.warning("[PIPELINE] Database service non disponible, utilisation anglais par défaut")
            return ["en"] if source_language != "en" else ["fr"]

        try:
            # Récupérer les membres de la conversation
            members = await self.database_service.prisma.conversationmember.find_many(
                where={
                    "conversationId": conversation_id,
                    "userId": {"not": sender_id},
                    "isActive": True
                },
                include={"user": True}
            )

            languages = set()
            for member in members:
                user = member.user
                if user:
                    # Priorité: customDestinationLanguage > systemLanguage > regionalLanguage
                    if user.useCustomDestination and user.customDestinationLanguage:
                        languages.add(user.customDestinationLanguage)
                    elif user.translateToSystemLanguage:
                        languages.add(user.systemLanguage)
                    elif user.translateToRegionalLanguage:
                        languages.add(user.regionalLanguage)
                    else:
                        languages.add(user.systemLanguage)

            # Exclure la langue source
            languages.discard(source_language)

            # Si aucune langue trouvée, utiliser une langue par défaut
            if not languages:
                default = "en" if source_language != "en" else "fr"
                languages.add(default)

            return list(languages)

        except Exception as e:
            logger.error(f"[PIPELINE] Erreur récupération langues: {e}")
            return ["en"] if source_language != "en" else ["fr"]

    async def _save_to_database(self, result: AudioMessageResult):
        """Sauvegarde les résultats en base de données"""
        if not self.database_service:
            return

        try:
            # Sauvegarder la transcription
            await self.database_service.prisma.messageaudiotranscription.create(
                data={
                    "attachmentId": result.attachment_id,
                    "messageId": result.message_id,
                    "transcribedText": result.original.transcription,
                    "language": result.original.language,
                    "confidence": result.original.confidence,
                    "source": result.original.source,
                    "segments": result.original.segments,
                    "audioDurationMs": result.original.duration_ms,
                    "model": f"whisper" if result.original.source == "whisper" else None
                }
            )

            # Sauvegarder chaque audio traduit
            for lang, translation in result.translations.items():
                await self.database_service.prisma.messagetranslatedaudio.create(
                    data={
                        "attachmentId": result.attachment_id,
                        "messageId": result.message_id,
                        "targetLanguage": translation.language,
                        "translatedText": translation.translated_text,
                        "audioPath": translation.audio_path,
                        "audioUrl": translation.audio_url,
                        "durationMs": translation.duration_ms,
                        "format": translation.format,
                        "voiceCloned": translation.voice_cloned,
                        "voiceQuality": translation.voice_quality,
                        "ttsModel": "xtts"
                    }
                )

            logger.info(f"[PIPELINE] 💾 Résultats sauvegardés en BDD")

        except Exception as e:
            logger.error(f"[PIPELINE] ❌ Erreur sauvegarde BDD: {e}")
            import traceback
            traceback.print_exc()

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du pipeline"""
        return {
            "service": "AudioMessagePipeline",
            "initialized": self.is_initialized,
            "transcription": await self.transcription_service.get_stats(),
            "voice_clone": await self.voice_clone_service.get_stats(),
            "tts": await self.tts_service.get_stats(),
            "translation_available": self.translation_service is not None,
            "database_available": self.database_service is not None
        }

    async def close(self):
        """Libère les ressources"""
        logger.info("[PIPELINE] 🛑 Fermeture du pipeline")
        await asyncio.gather(
            self.transcription_service.close(),
            self.voice_clone_service.close(),
            self.tts_service.close(),
            return_exceptions=True
        )
        self.is_initialized = False


# Fonction helper pour obtenir l'instance singleton
def get_audio_pipeline() -> AudioMessagePipeline:
    """Retourne l'instance singleton du pipeline audio"""
    return AudioMessagePipeline()
