"""
Service de pipeline de traduction avec queue async - Singleton
Orchestre: Transcription → Traduction → Clonage → TTS avec jobs asynchrones
Support webhooks, progression, annulation
"""

import os
import logging
import time
import asyncio
import threading
import uuid
import json
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from enum import Enum
from collections import OrderedDict
import base64

# Configuration du logging
logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """États possibles d'un job"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobPriority(int, Enum):
    """Priorités des jobs"""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    URGENT = 3


@dataclass
class TranslationJob:
    """Job de traduction asynchrone"""
    id: str
    user_id: str
    status: JobStatus = JobStatus.PENDING
    priority: JobPriority = JobPriority.NORMAL

    # Input
    audio_path: Optional[str] = None
    audio_url: Optional[str] = None
    audio_base64: Optional[str] = None
    source_language: Optional[str] = None
    target_languages: List[str] = field(default_factory=list)
    generate_voice_clone: bool = True

    # Options
    webhook_url: Optional[str] = None
    callback_metadata: Dict[str, Any] = field(default_factory=dict)
    mobile_transcription: Optional[Dict[str, Any]] = None  # Transcription existante pour optimisation

    # Progress
    progress: int = 0  # 0-100
    current_step: str = ""
    steps_completed: List[str] = field(default_factory=list)

    # Result
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    error_code: Optional[str] = None

    # Timing
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Versioning
    model_version: str = "mshy_gen_v1"
    embedding_type: str = "openvoice_v2"

    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire"""
        return {
            "id": self.id,
            "user_id": self.user_id,
            "status": self.status.value,
            "priority": self.priority.value,
            "progress": self.progress,
            "current_step": self.current_step,
            "steps_completed": self.steps_completed,
            "result": self.result,
            "error": self.error,
            "error_code": self.error_code,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "target_languages": self.target_languages,
            "webhook_url": self.webhook_url,
            "model_version": self.model_version,
            "embedding_type": self.embedding_type
        }


@dataclass
class PipelineResult:
    """Résultat d'une traduction complète"""
    job_id: str
    success: bool = True

    # Original
    original_text: str = ""
    original_language: str = ""
    original_duration_ms: int = 0
    transcription_confidence: float = 0.0
    transcription_segments: Optional[List[Dict[str, Any]]] = None  # ✅ Segments de transcription

    # Traductions
    translations: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # Voice
    voice_cloned: bool = False
    voice_quality: float = 0.0
    voice_model_version: int = 0

    # Timing
    processing_time_ms: int = 0
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """
        Convertit en dictionnaire au format attendu par le Gateway.

        Format TypeScript attendu: VoiceTranslationResult
        """
        # Convertir translations dict en array pour le Gateway
        translations_array = []
        for lang, translation_data in self.translations.items():
            translations_array.append({
                "targetLanguage": lang,
                "translatedText": translation_data.get("translated_text", ""),
                "audioUrl": translation_data.get("audio_url"),
                "audioBase64": translation_data.get("audio_base64"),
                "durationMs": translation_data.get("duration_ms", 0),
                "voiceCloned": translation_data.get("voice_cloned", False),
                "voiceQuality": translation_data.get("voice_quality", 0.0)
            })

        # Construire originalAudio avec segments si disponibles
        original_audio = {
            "transcription": self.original_text,
            "language": self.original_language,
            "durationMs": self.original_duration_ms,
            "confidence": self.transcription_confidence
        }

        # ✅ Ajouter segments si disponibles
        if self.transcription_segments:
            original_audio["segments"] = self.transcription_segments

        return {
            # Format Gateway: VoiceTranslationResult
            "translationId": self.job_id,
            "originalAudio": original_audio,
            "translations": translations_array,  # Array, pas dict
            "voiceProfile": {
                "profileId": f"voice_{self.job_id}",
                "quality": self.voice_quality,
                "isNew": self.voice_model_version == 0
            } if self.voice_cloned else None,
            "processingTimeMs": self.processing_time_ms
        }


class TranslationPipelineService:
    """
    Service de pipeline de traduction avec queue async - Singleton

    Fonctionnalités:
    - Queue de jobs avec priorités
    - Workers concurrents configurables
    - Callbacks webhook
    - Progression en temps réel
    - Annulation de jobs
    - Retry automatique
    """

    _instance = None
    _lock = threading.Lock()

    # Pipeline steps
    PIPELINE_STEPS = [
        "validate_input",
        "transcribe_audio",
        "detect_language",
        "translate_text",
        "clone_voice",
        "synthesize_audio",
        "encode_output",
        "cleanup"
    ]

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
        max_concurrent_jobs: int = None,
        audio_output_dir: str = None,
        transcription_service=None,
        voice_clone_service=None,
        tts_service=None,
        translation_service=None,
        on_job_completed=None
    ):
        if self._initialized:
            return

        # Configuration
        self.max_concurrent_jobs = max_concurrent_jobs or int(os.getenv('MAX_CONCURRENT_JOBS', '10'))
        # ROBUSTESSE: Limiter la queue pour éviter OOM en cas de pic de trafic
        self.max_queue_size = int(os.getenv('MAX_QUEUE_SIZE', '1000'))
        self.audio_output_dir = Path(audio_output_dir or os.getenv('AUDIO_OUTPUT_DIR', './audio_output'))
        self.audio_output_dir.mkdir(parents=True, exist_ok=True)

        # Services (injection de dépendances)
        self.transcription_service = transcription_service
        self.voice_clone_service = voice_clone_service
        self.tts_service = tts_service
        self.translation_service = translation_service

        # CRITIQUE: Callback pour notifier quand un job est complété
        # Utilisé pour publier via ZMQ PUB vers le Gateway
        self.on_job_completed = on_job_completed

        # Queue de jobs (OrderedDict pour maintenir l'ordre)
        self._jobs: OrderedDict[str, TranslationJob] = OrderedDict()
        self._jobs_lock = asyncio.Lock()

        # Workers
        self._workers: List[asyncio.Task] = []
        self._running = False
        self._job_queue: asyncio.Queue = None
        self._worker_semaphore: asyncio.Semaphore = None

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Stats
        self._stats = {
            "jobs_created": 0,
            "jobs_completed": 0,
            "jobs_failed": 0,
            "jobs_cancelled": 0,
            "total_processing_time_ms": 0,
            "avg_processing_time_ms": 0
        }

        # Cleanup old jobs
        self._max_job_history = 1000
        self._job_ttl_hours = 24

        logger.info(
            f"[PIPELINE] Service créé: max_workers={self.max_concurrent_jobs}, "
            f"output_dir={self.audio_output_dir}"
        )
        self._initialized = True

    def set_services(
        self,
        transcription_service=None,
        voice_clone_service=None,
        tts_service=None,
        translation_service=None
    ):
        """Injecte les services dépendants"""
        if transcription_service:
            self.transcription_service = transcription_service
        if voice_clone_service:
            self.voice_clone_service = voice_clone_service
        if tts_service:
            self.tts_service = tts_service
        if translation_service:
            self.translation_service = translation_service

    async def initialize(self) -> bool:
        """Initialise le service et démarre les workers"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            logger.info("[PIPELINE] 🔄 Initialisation du pipeline...")

            # Créer la queue et le semaphore
            # ROBUSTESSE: Queue limitée pour éviter OOM (Out Of Memory) si pic de trafic
            self._job_queue = asyncio.Queue(maxsize=self.max_queue_size)
            self._worker_semaphore = asyncio.Semaphore(self.max_concurrent_jobs)

            logger.info(
                f"[PIPELINE] 📊 Queue configurée: max_size={self.max_queue_size}, "
                f"max_workers={self.max_concurrent_jobs}"
            )

            # Démarrer les workers
            self._running = True
            for i in range(self.max_concurrent_jobs):
                worker = asyncio.create_task(self._worker_loop(i))
                self._workers.append(worker)

            self.is_initialized = True
            logger.info(f"[PIPELINE] ✅ Pipeline initialisé avec {self.max_concurrent_jobs} workers")
            return True

    async def _worker_loop(self, worker_id: int):
        """Boucle principale d'un worker"""
        logger.info(f"[PIPELINE] 🔧 Worker {worker_id} démarré")

        while self._running:
            try:
                # Attendre un job
                try:
                    job_id = await asyncio.wait_for(
                        self._job_queue.get(),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                # Traiter le job
                async with self._worker_semaphore:
                    await self._process_job(job_id, worker_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[PIPELINE] ❌ Worker {worker_id} erreur: {e}")
                await asyncio.sleep(1)

        logger.info(f"[PIPELINE] 🛑 Worker {worker_id} arrêté")

    async def submit_job(
        self,
        user_id: str,
        audio_path: Optional[str] = None,
        audio_url: Optional[str] = None,
        audio_base64: Optional[str] = None,
        source_language: Optional[str] = None,
        target_languages: List[str] = None,
        generate_voice_clone: bool = True,
        webhook_url: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        callback_metadata: Dict[str, Any] = None,
        mobile_transcription: Optional[Dict[str, Any]] = None
    ) -> TranslationJob:
        """
        Soumet un nouveau job de traduction async.

        Args:
            user_id: ID de l'utilisateur
            audio_path: Chemin vers le fichier audio local
            audio_url: URL de l'audio à télécharger
            audio_base64: Audio encodé en base64
            source_language: Langue source (auto-detect si None)
            target_languages: Liste des langues cibles
            generate_voice_clone: Cloner la voix
            webhook_url: URL pour callback à la fin
            priority: Priorité du job
            callback_metadata: Métadonnées pour le webhook

        Returns:
            TranslationJob créé
        """
        # Validation
        if not any([audio_path, audio_url, audio_base64]):
            raise ValueError("Au moins un input audio requis (path, url, ou base64)")

        if not target_languages:
            target_languages = ["en"]

        # Créer le job
        job = TranslationJob(
            id=self._generate_job_id(user_id),
            user_id=user_id,
            audio_path=audio_path,
            audio_url=audio_url,
            audio_base64=audio_base64,
            source_language=source_language,
            target_languages=target_languages,
            generate_voice_clone=generate_voice_clone,
            webhook_url=webhook_url,
            priority=priority,
            callback_metadata=callback_metadata or {},
            mobile_transcription=mobile_transcription
        )

        # Ajouter à la queue
        async with self._jobs_lock:
            self._jobs[job.id] = job
            self._stats["jobs_created"] += 1

        # Ajouter à la queue de processing
        await self._job_queue.put(job.id)

        logger.info(f"[PIPELINE] 📋 Job créé: {job.id} (langues: {target_languages})")

        return job

    async def get_job(self, job_id: str) -> Optional[TranslationJob]:
        """Récupère un job par son ID"""
        async with self._jobs_lock:
            return self._jobs.get(job_id)

    async def cancel_job(self, job_id: str) -> bool:
        """Annule un job en attente"""
        async with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status == JobStatus.PENDING:
                job.status = JobStatus.CANCELLED
                job.completed_at = datetime.now()
                self._stats["jobs_cancelled"] += 1
                logger.info(f"[PIPELINE] ❌ Job annulé: {job_id}")
                return True

            return False

    async def _process_job(self, job_id: str, worker_id: int):
        """Traite un job de traduction"""
        start_time = time.time()

        job = await self.get_job(job_id)
        if not job or job.status == JobStatus.CANCELLED:
            return

        logger.info(f"[PIPELINE] 🚀 Worker {worker_id} traite job {job_id}")

        try:
            # Marquer comme en cours
            job.status = JobStatus.PROCESSING
            job.started_at = datetime.now()

            result = PipelineResult(job_id=job_id)

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 1: VALIDER L'INPUT
            # ═══════════════════════════════════════════════════════════════
            await self._update_job_progress(job, "validate_input", 5)

            audio_path = await self._prepare_audio_input(job)
            if not audio_path:
                raise ValueError("Impossible de préparer l'audio input")

            job.audio_path = audio_path

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 2: TRANSCRIPTION
            # ═══════════════════════════════════════════════════════════════
            await self._update_job_progress(job, "transcribe_audio", 15)

            if self.transcription_service:
                # Utiliser la transcription existante si disponible (optimisation)
                # ✅ Activer return_timestamps pour obtenir les segments
                transcription = await self.transcription_service.transcribe(
                    audio_path=audio_path,
                    mobile_transcription=job.mobile_transcription,
                    return_timestamps=True  # ✅ Activer pour whisper_boost
                )
                result.original_text = transcription.text
                result.original_language = transcription.language
                result.original_duration_ms = transcription.duration_ms
                result.transcription_confidence = transcription.confidence

                # ✅ Stocker les segments si disponibles (converti en dicts pour JSON)
                if hasattr(transcription, 'segments') and transcription.segments:
                    result.transcription_segments = [
                        {
                            "text": seg.text,
                            "startMs": seg.start_ms,
                            "endMs": seg.end_ms,
                            "confidence": seg.confidence,
                            "speakerId": seg.speaker_id if hasattr(seg, 'speaker_id') and seg.speaker_id else None,
                            "voiceSimilarityScore": seg.voice_similarity_score if hasattr(seg, 'voice_similarity_score') else None
                        }
                        for seg in transcription.segments
                    ]
            else:
                raise ValueError("Transcription service non disponible")

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 3: CLONAGE VOCAL (si activé)
            # ═══════════════════════════════════════════════════════════════
            voice_model = None
            if job.generate_voice_clone and self.voice_clone_service:
                await self._update_job_progress(job, "clone_voice", 30)

                try:
                    voice_model = await self.voice_clone_service.get_or_create_voice_model(
                        user_id=job.user_id,
                        current_audio_path=audio_path,
                        current_audio_duration_ms=result.original_duration_ms
                    )
                    result.voice_cloned = True
                    result.voice_quality = voice_model.quality_score
                    result.voice_model_version = voice_model.version
                except Exception as e:
                    logger.warning(f"[PIPELINE] ⚠️ Clonage vocal échoué: {e}")

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 4: TRADUCTION + TTS POUR CHAQUE LANGUE
            # ═══════════════════════════════════════════════════════════════
            total_languages = len(job.target_languages)
            base_progress = 40
            progress_per_lang = 50 // total_languages

            for i, target_lang in enumerate(job.target_languages):
                current_progress = base_progress + (i * progress_per_lang)
                await self._update_job_progress(job, f"translate_to_{target_lang}", current_progress)

                try:
                    translation_result = await self._process_single_language(
                        job=job,
                        text=result.original_text,
                        source_lang=result.original_language,
                        target_lang=target_lang,
                        voice_model=voice_model,
                        audio_path=audio_path
                    )
                    result.translations[target_lang] = translation_result

                except Exception as e:
                    logger.error(f"[PIPELINE] ❌ Erreur traduction {target_lang}: {e}")
                    result.translations[target_lang] = {
                        "error": str(e),
                        "success": False
                    }

            # ═══════════════════════════════════════════════════════════════
            # ÉTAPE 5: FINALISER
            # ═══════════════════════════════════════════════════════════════
            await self._update_job_progress(job, "encode_output", 95)

            processing_time = int((time.time() - start_time) * 1000)
            result.processing_time_ms = processing_time

            # Marquer comme terminé
            job.status = JobStatus.COMPLETED
            job.progress = 100
            job.current_step = "completed"
            job.completed_at = datetime.now()
            job.result = result.to_dict()

            # Stats
            self._stats["jobs_completed"] += 1
            self._stats["total_processing_time_ms"] += processing_time
            self._stats["avg_processing_time_ms"] = (
                self._stats["total_processing_time_ms"] // self._stats["jobs_completed"]
            )

            logger.info(f"[PIPELINE] ✅ Job terminé: {job_id} ({processing_time}ms)")

            # CRITIQUE: Notifier via callback (pour publier via ZMQ PUB)
            if self.on_job_completed:
                try:
                    await self.on_job_completed(job)
                    logger.debug(f"[PIPELINE] 📤 Callback de complétion appelé pour {job_id}")
                except Exception as e:
                    logger.error(f"[PIPELINE] ❌ Erreur callback complétion: {e}")

            # Webhook callback HTTP (optionnel)
            if job.webhook_url:
                await self._send_webhook(job)

        except Exception as e:
            logger.error(f"[PIPELINE] ❌ Job échoué: {job_id} - {e}")
            import traceback
            traceback.print_exc()

            job.status = JobStatus.FAILED
            job.error = str(e)
            job.error_code = type(e).__name__
            job.completed_at = datetime.now()
            self._stats["jobs_failed"] += 1

            # CRITIQUE: Notifier via callback même en cas d'échec
            if self.on_job_completed:
                try:
                    await self.on_job_completed(job)
                    logger.debug(f"[PIPELINE] 📤 Callback d'échec appelé pour {job_id}")
                except Exception as callback_error:
                    logger.error(f"[PIPELINE] ❌ Erreur callback échec: {callback_error}")

            # Webhook callback HTTP (erreur, optionnel)
            if job.webhook_url:
                await self._send_webhook(job)

    async def _process_single_language(
        self,
        job: TranslationJob,
        text: str,
        source_lang: str,
        target_lang: str,
        voice_model=None,
        audio_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """Traite une seule langue cible"""
        result = {
            "language": target_lang,
            "success": True,
            "voice_cloned": False,
            "voice_quality": 0.0
        }

        # Traduire le texte
        translated_text = text
        if source_lang != target_lang and self.translation_service:
            try:
                trans_result = await self.translation_service.translate_with_structure(
                    text=text,
                    source_language=source_lang,
                    target_language=target_lang,
                    model_type="medium",
                    source_channel="voice_pipeline"
                )
                translated_text = trans_result.get('translated_text', text)
            except Exception as e:
                logger.warning(f"[PIPELINE] Traduction fallback: {e}")

        result["translated_text"] = translated_text
        logger.info(f"[PIPELINE] ✅ Texte traduit ({len(translated_text)} chars): {translated_text[:50]}...")

        # Générer l'audio
        logger.info(f"[PIPELINE] 🎤 Début génération audio TTS (tts_service={self.tts_service is not None})")
        if self.tts_service:
            # Récupérer le profile_id du voice model si disponible
            profile_id = getattr(voice_model, 'profile_id', None) if voice_model else None
            output_filename = self._generate_output_filename(
                job=job,
                target_lang=target_lang,
                profile_id=profile_id
            )
            output_path = self.audio_output_dir / output_filename

            if voice_model:
                # Utiliser l'audio source comme référence pour le clonage
                speaker_audio = None
                if audio_path and os.path.exists(audio_path):
                    speaker_audio = audio_path
                elif hasattr(voice_model, 'reference_audio_path') and voice_model.reference_audio_path:
                    speaker_audio = voice_model.reference_audio_path

                # Récupérer les conditionals si disponibles
                conditionals = getattr(voice_model, 'chatterbox_conditionals', None)

                tts_result = await self.tts_service.synthesize_with_voice(
                    text=translated_text,
                    speaker_audio_path=speaker_audio,
                    target_language=target_lang,
                    output_format="mp3",
                    message_id=f"{job.id}_{target_lang}",
                    conditionals=conditionals
                )
            else:
                tts_result = await self.tts_service.synthesize(
                    text=translated_text,
                    language=target_lang,
                    output_format="mp3"
                )

            result["audio_path"] = tts_result.audio_path
            result["audio_url"] = tts_result.audio_url
            result["duration_ms"] = tts_result.duration_ms
            result["voice_cloned"] = tts_result.voice_cloned
            result["voice_quality"] = tts_result.voice_quality

            # Encoder en base64 si demandé
            if os.path.exists(tts_result.audio_path):
                with open(tts_result.audio_path, 'rb') as f:
                    result["audio_base64"] = base64.b64encode(f.read()).decode('utf-8')

        return result

    async def _prepare_audio_input(self, job: TranslationJob) -> Optional[str]:
        """Prépare l'input audio (télécharge si nécessaire)"""
        if job.audio_path and os.path.exists(job.audio_path):
            return job.audio_path

        if job.audio_base64:
            # Décoder le base64
            temp_path = self.audio_output_dir / f"input_{job.id}.wav"
            audio_data = base64.b64decode(job.audio_base64)
            with open(temp_path, 'wb') as f:
                f.write(audio_data)
            return str(temp_path)

        if job.audio_url:
            # TODO: Télécharger depuis l'URL
            logger.warning("[PIPELINE] Téléchargement URL non implémenté")
            return None

        return None

    async def _update_job_progress(self, job: TranslationJob, step: str, progress: int):
        """Met à jour la progression d'un job"""
        job.current_step = step
        job.progress = progress
        if step not in job.steps_completed:
            job.steps_completed.append(step)

    async def _send_webhook(self, job: TranslationJob):
        """Envoie un callback webhook"""
        if not job.webhook_url:
            return

        try:
            import aiohttp

            payload = {
                "event": "translation_completed" if job.status == JobStatus.COMPLETED else "translation_failed",
                "job": job.to_dict(),
                "metadata": job.callback_metadata
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    job.webhook_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status >= 400:
                        logger.warning(f"[PIPELINE] Webhook failed: {response.status}")
                    else:
                        logger.info(f"[PIPELINE] Webhook envoyé: {job.webhook_url}")

        except Exception as e:
            logger.error(f"[PIPELINE] Erreur webhook: {e}")

    def _generate_job_id(self, user_id: str) -> str:
        """Génère un ID unique pour un job"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        unique = uuid.uuid4().hex[:8]
        return f"mshy_{timestamp}_{user_id[:8]}_{unique}"

    def _generate_output_filename(
        self,
        job: TranslationJob,
        target_lang: str,
        message_id: str = None,
        attachment_id: str = None,
        profile_id: str = None,
        ext: str = "mp3"
    ) -> str:
        """
        Génère un nom de fichier de sortie avec métadonnées.
        Format: mshy_gen_{version}_{embedding}_{userId}_{lang}_{jobId}[_msg{id}][_att{id}][_prof{id}]_{timestamp}.{ext}
        """
        msg_id = message_id or job.callback_metadata.get('message_id', '')
        att_id = attachment_id or job.callback_metadata.get('attachment_id', '')
        prof_id = profile_id or job.callback_metadata.get('profile_id', '')
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Base: model_version contient déjà "mshy_gen_v1", pas besoin de préfixe supplémentaire
        base = f"{job.model_version}_{job.embedding_type}_{job.user_id[:8]}_{target_lang}_{job.id[-8:]}"

        # Ajouter les détails d'attachement si disponibles
        details = []
        if msg_id:
            details.append(f"msg{msg_id[:8]}")
        if att_id:
            details.append(f"att{att_id[:8]}")
        if prof_id:
            details.append(f"prof{prof_id[:8]}")

        if details:
            return f"{base}_{'_'.join(details)}_{timestamp}.{ext}"
        else:
            return f"{base}_{timestamp}.{ext}"

    async def translate_sync(
        self,
        user_id: str,
        audio_path: str,
        target_languages: List[str],
        generate_voice_clone: bool = True,
        source_language: Optional[str] = None,
        mobile_transcription: Optional[Dict[str, Any]] = None
    ) -> PipelineResult:
        """
        Traduction synchrone (attend le résultat).

        Pour les cas où l'async n'est pas nécessaire.
        """
        # Créer un job
        job = await self.submit_job(
            user_id=user_id,
            audio_path=audio_path,
            target_languages=target_languages,
            source_language=source_language,
            generate_voice_clone=generate_voice_clone,
            priority=JobPriority.HIGH,
            mobile_transcription=mobile_transcription
        )

        # Attendre la fin
        while job.status in [JobStatus.PENDING, JobStatus.PROCESSING]:
            await asyncio.sleep(0.1)
            job = await self.get_job(job.id)

        if job.status == JobStatus.COMPLETED:
            return PipelineResult(**job.result) if job.result else PipelineResult(job_id=job.id)
        else:
            raise Exception(f"Job failed: {job.error}")

    async def get_queue_status(self) -> Dict[str, Any]:
        """Retourne le status de la queue"""
        async with self._jobs_lock:
            pending = sum(1 for j in self._jobs.values() if j.status == JobStatus.PENDING)
            processing = sum(1 for j in self._jobs.values() if j.status == JobStatus.PROCESSING)
            completed = sum(1 for j in self._jobs.values() if j.status == JobStatus.COMPLETED)
            failed = sum(1 for j in self._jobs.values() if j.status == JobStatus.FAILED)

            return {
                "queue_size": pending,
                "processing": processing,
                "completed_total": completed,
                "failed_total": failed,
                "workers_active": len(self._workers),
                "workers_max": self.max_concurrent_jobs
            }

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        queue_status = await self.get_queue_status()
        return {
            "service": "TranslationPipelineService",
            "initialized": self.is_initialized,
            "running": self._running,
            **queue_status,
            **self._stats
        }

    async def cleanup_old_jobs(self):
        """Nettoie les vieux jobs terminés"""
        cutoff = datetime.now() - timedelta(hours=self._job_ttl_hours)

        async with self._jobs_lock:
            to_remove = []
            for job_id, job in self._jobs.items():
                if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                    if job.completed_at and job.completed_at < cutoff:
                        to_remove.append(job_id)

            for job_id in to_remove:
                del self._jobs[job_id]

            if to_remove:
                logger.info(f"[PIPELINE] 🧹 {len(to_remove)} vieux jobs nettoyés")

    async def close(self):
        """Arrête le service proprement"""
        logger.info("[PIPELINE] 🛑 Arrêt du pipeline...")

        self._running = False

        # Annuler les workers
        for worker in self._workers:
            worker.cancel()

        # Attendre que les workers se terminent
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)

        self._workers.clear()
        self.is_initialized = False
        logger.info("[PIPELINE] ✅ Pipeline arrêté")


# Fonction helper pour obtenir l'instance singleton
def get_translation_pipeline_service() -> TranslationPipelineService:
    """Retourne l'instance singleton du service de pipeline"""
    return TranslationPipelineService()
