## 2025-01: Framework - FastAPI + Uvicorn
**Statut**: Accept
**Contexte**: Service ML async-first avec haute concurrence I/O
**Decision**: FastAPI avec Uvicorn, async/await partout, Pydantic Settings pour config
**Alternatives rejet**: Flask (synchrone, lent), Django (trop lourd pour microservice), Tornado (cosystme moins mature)
**Cons**: `asyncio.to_thread()` ncessaire pour les oprations ML CPU-bound
