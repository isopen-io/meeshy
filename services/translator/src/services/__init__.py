"""
Meeshy Translation Services Module
Contient les services essentiels du système de traduction

✅ Migration terminée : QuantizedMLService actif
"""

from .zmq_server import ZMQTranslationServer

__all__ = [
    "ZMQTranslationServer"
]
