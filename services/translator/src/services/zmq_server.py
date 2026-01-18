"""
Serveur ZeroMQ haute performance pour le service de traduction Meeshy
Architecture: PUB/SUB + REQ/REP avec pool de connexions et traitement asynchrone

Module de compatibilité - Réexporte les classes depuis les modules refactorisés.
"""

# ═══════════════════════════════════════════════════════════════════
# Imports des modules refactorisés
# ═══════════════════════════════════════════════════════════════════

from .zmq_models import TranslationTask
from .zmq_pool_manager import TranslationPoolManager
from .zmq_server_core import ZMQTranslationServer
from .zmq_translation_handler import TranslationHandler
from .zmq_audio_handler import AudioHandler
from .zmq_transcription_handler import TranscriptionHandler
from .zmq_voice_handler import VoiceHandler

# ═══════════════════════════════════════════════════════════════════
# Exports publics
# ═══════════════════════════════════════════════════════════════════

__all__ = [
    'TranslationTask',
    'TranslationPoolManager',
    'ZMQTranslationServer',
    'TranslationHandler',
    'AudioHandler',
    'TranscriptionHandler',
    'VoiceHandler',
]
