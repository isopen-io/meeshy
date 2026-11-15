## 2025-01: Singletons - Pattern pour ressources coteuses
**Statut**: Accept
**Contexte**: Modles ML (600M-1.3B params) ne doivent tre chargs qu'une fois
**Decision**: Singleton thread-safe avec `threading.Lock()` pour TranslationMLService, TTSService, VoiceCloneService, RedisService
**Alternatives rejet**: DI (passer des modles  travers 10+ couches), variables globales (pas thread-safe), init au niveau module (side effects)
**Cons**: Difficile  tester (reset tat singleton), dpendances caches
