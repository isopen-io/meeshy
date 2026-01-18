"""
ZMQ Pool Manager - Backward compatibility wrapper

Cette version redirige vers le nouveau module zmq_pool.TranslationPoolManager
pour maintenir la compatibilité avec l'ancien code.

ARCHITECTURE REFACTORISÉE:
════════════════════════════════════════════════════════════════════════════
L'ancien God Object (872 lignes) a été divisé en modules spécialisés:

1. zmq_pool/worker_pool.py (~304L)
   - Gestion du pool de workers
   - Scaling dynamique
   - Health checks et monitoring

2. zmq_pool/connection_manager.py (~288L)
   - Gestion des queues (normal, any, fast)
   - Batch accumulation
   - Priority queue logic

3. zmq_pool/translation_processor.py (~361L)
   - Traitement single translation
   - Traitement batch translation
   - Cache management

4. zmq_pool/zmq_pool_manager.py (~411L)
   - Façade orchestrateur
   - API publique
   - Coordination des modules

MIGRATION:
════════════════════════════════════════════════════════════════════════════
Ancien code:
  from services.zmq_pool_manager import TranslationPoolManager

Nouveau code (recommandé):
  from .zmq_pool import TranslationPoolManager

Compatibilité totale maintenue.
════════════════════════════════════════════════════════════════════════════
"""

from .zmq_pool import TranslationPoolManager

__all__ = ['TranslationPoolManager']
