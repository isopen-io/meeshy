"""
TTS Backends Package
====================

Backends TTS disponibles:
- ChatterboxBackend: Clonage vocal 23 langues (défaut)
- MMSBackend: 1100+ langues africaines (sans clonage)
- VITSBackend: Langues spécifiques (ex: Lingala)
- XTTSBackend: Legacy Coqui (16 langues)
- HiggsAudioBackend: État de l'art Boson AI
"""

from .chatterbox_backend import ChatterboxBackend
from .mms_backend import MMSBackend
from .vits_backend import VITSBackend
from .xtts_backend import XTTSBackend
from .higgs_backend import HiggsAudioBackend

__all__ = [
    "ChatterboxBackend",
    "MMSBackend",
    "VITSBackend",
    "XTTSBackend",
    "HiggsAudioBackend",
]
