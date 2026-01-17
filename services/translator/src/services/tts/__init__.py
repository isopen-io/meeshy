"""
TTS Module
==========

Module TTS avec backends séparés par fichier.

Usage:
    from services.tts import ChatterboxBackend, MMSBackend, VITSBackend
    from services.tts.base import BaseTTSBackend
"""

from .base import BaseTTSBackend
from .backends import (
    ChatterboxBackend,
    MMSBackend,
    VITSBackend,
    XTTSBackend,
    HiggsAudioBackend,
)

__all__ = [
    "BaseTTSBackend",
    "ChatterboxBackend",
    "MMSBackend",
    "VITSBackend",
    "XTTSBackend",
    "HiggsAudioBackend",
]
