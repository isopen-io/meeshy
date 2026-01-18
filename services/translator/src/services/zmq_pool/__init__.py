"""
ZMQ Pool Package - Modular Translation Pool Management

Architecture:
- zmq_pool_manager.py: Façade orchestrateur (API publique)
- worker_pool.py: Gestion des workers et scaling
- connection_manager.py: Gestion des queues et batching
- translation_processor.py: Traitement des traductions

Public API:
- TranslationPoolManager: Classe principale à utiliser
"""

from .zmq_pool_manager import TranslationPoolManager

__all__ = ['TranslationPoolManager']
