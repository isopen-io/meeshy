"""
System Handlers - Health, metrics, and system-level operations
Handles health checks, admin metrics, and supported languages.
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class VoiceAPIResult:
    """Result wrapper for Voice API responses"""
    def __init__(
        self,
        success: bool,
        data: Optional[Dict] = None,
        error: Optional[str] = None,
        error_code: Optional[str] = None,
        processing_time_ms: int = 0
    ):
        self.success = success
        self.data = data
        self.error = error
        self.error_code = error_code
        self.processing_time_ms = processing_time_ms


class SystemHandlers:
    """
    Handles system-level operations including health checks,
    metrics reporting, and language support queries.
    """

    def __init__(
        self,
        transcription_service=None,
        translation_service=None,
        voice_clone_service=None,
        tts_service=None,
        translation_pipeline=None,
        analytics_service=None
    ):
        """
        Initialize system handlers with service dependencies.

        Args:
            transcription_service: Whisper transcription service
            translation_service: NLLB translation service
            voice_clone_service: Voice cloning service
            tts_service: Text-to-speech service
            translation_pipeline: Translation pipeline orchestrator
            analytics_service: Analytics and metrics service
        """
        self.transcription_service = transcription_service
        self.translation_service = translation_service
        self.voice_clone_service = voice_clone_service
        self.tts_service = tts_service
        self.translation_pipeline = translation_pipeline
        self.analytics_service = analytics_service

        logger.info("[SystemHandlers] Initialized")

    # ═══════════════════════════════════════════════════════════════════════════
    # HEALTH AND METRICS
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_health(self) -> VoiceAPIResult:
        """Get health status of all services"""
        try:
            services = {
                'transcription': self.transcription_service is not None,
                'translation': self.translation_service is not None,
                'tts': self.tts_service is not None,
                'voiceClone': self.voice_clone_service is not None,
                'analytics': self.analytics_service is not None,
                'database': True  # Assume connected
            }

            # Determine overall status
            active_services = sum(services.values())
            total_services = len(services)

            if active_services == total_services:
                status = 'healthy'
            elif active_services >= total_services * 0.5:
                status = 'degraded'
            else:
                status = 'unhealthy'

            return VoiceAPIResult(
                success=True,
                data={
                    'status': status,
                    'services': services,
                    'latency': {
                        'transcriptionMs': 0,
                        'translationMs': 0,
                        'ttsMs': 0
                    },
                    'timestamp': datetime.now().isoformat()
                }
            )

        except Exception as e:
            logger.error(f"Health error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    async def handle_admin_metrics(self) -> VoiceAPIResult:
        """Get admin metrics including system stats and pipeline metrics"""
        try:
            import psutil

            metrics = {
                'activeJobs': 0,
                'queuedJobs': 0,
                'completedToday': 0,
                'failedToday': 0,
                'averageProcessingTimeMs': 0,
                'cpuUsage': psutil.cpu_percent(),
                'memoryUsageMb': psutil.Process().memory_info().rss / 1024 / 1024,
                'modelsLoaded': [],
                'uptime': 0,
                'version': '1.0.0'
            }

            # Get pipeline stats if available
            if self.translation_pipeline:
                pipeline_stats = await self.translation_pipeline.get_stats()
                metrics.update({
                    'activeJobs': pipeline_stats.get('active_jobs', 0),
                    'queuedJobs': pipeline_stats.get('queued_jobs', 0),
                    'completedToday': pipeline_stats.get('completed_today', 0),
                    'failedToday': pipeline_stats.get('failed_today', 0),
                    'averageProcessingTimeMs': pipeline_stats.get('avg_processing_time_ms', 0)
                })

            # Get loaded models
            models_loaded = []
            if self.transcription_service:
                models_loaded.append('whisper')
            if self.translation_service:
                models_loaded.append('nllb')
            if self.tts_service:
                models_loaded.append('xtts')
            if self.voice_clone_service:
                models_loaded.append('voice_clone')

            metrics['modelsLoaded'] = models_loaded

            return VoiceAPIResult(
                success=True,
                data=metrics
            )

        except Exception as e:
            logger.error(f"Admin metrics error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )

    # ═══════════════════════════════════════════════════════════════════════════
    # LANGUAGE SUPPORT
    # ═══════════════════════════════════════════════════════════════════════════

    async def handle_languages(self) -> VoiceAPIResult:
        """Get list of supported languages with feature availability"""
        try:
            # Common languages supported by NLLB and Whisper
            languages = [
                {
                    'code': 'en',
                    'name': 'English',
                    'nativeName': 'English',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'fr',
                    'name': 'French',
                    'nativeName': 'Français',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'es',
                    'name': 'Spanish',
                    'nativeName': 'Español',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'de',
                    'name': 'German',
                    'nativeName': 'Deutsch',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'it',
                    'name': 'Italian',
                    'nativeName': 'Italiano',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'pt',
                    'name': 'Portuguese',
                    'nativeName': 'Português',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'nl',
                    'name': 'Dutch',
                    'nativeName': 'Nederlands',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'pl',
                    'name': 'Polish',
                    'nativeName': 'Polski',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'ru',
                    'name': 'Russian',
                    'nativeName': 'Русский',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'ja',
                    'name': 'Japanese',
                    'nativeName': '日本語',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'ko',
                    'name': 'Korean',
                    'nativeName': '한국어',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'zh',
                    'name': 'Chinese',
                    'nativeName': '中文',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'ar',
                    'name': 'Arabic',
                    'nativeName': 'العربية',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'hi',
                    'name': 'Hindi',
                    'nativeName': 'हिन्दी',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
                {
                    'code': 'tr',
                    'name': 'Turkish',
                    'nativeName': 'Türkçe',
                    'supportedFeatures': {
                        'transcription': True,
                        'translation': True,
                        'tts': True,
                        'voiceClone': True
                    }
                },
            ]

            return VoiceAPIResult(
                success=True,
                data=languages
            )

        except Exception as e:
            logger.error(f"Languages error: {e}")
            return VoiceAPIResult(
                success=False,
                error=str(e),
                error_code="INTERNAL_ERROR"
            )
