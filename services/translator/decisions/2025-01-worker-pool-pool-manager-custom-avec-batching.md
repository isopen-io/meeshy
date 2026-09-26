## 2025-01: Worker Pool - Pool Manager custom avec batching
**Statut**: Accept
**Contexte**: Maximiser le throughput de traduction sur CPU
**Decision**: TranslationPoolManager facade, WorkerPool avec priorit, batch accumulation 50ms / max 10 textes, scaling dynamique 2-40 workers
**Alternatives rejet**: ThreadPoolExecutor seul (pas de priorit/batching), Celery (overhead broker), Ray (trop lourd)
**Cons**: 50ms de latence base (batching), code complexe rparti sur 4 modules
