## 2025-01: Services - Singletons (`static let shared`)
**Statut**: Remplacée le 2026-11-08 par [2026-11-08-le-singleton-est-une-frontiere-pas-un-acces-depuis-la-vue.md](2026-11-08-le-singleton-est-une-frontiere-pas-un-acces-depuis-la-vue.md)
**Contexte**: Managers coteux (connexions rseau, modles ML) ne doivent pas tre recrs
**Decision**: Singleton pour AuthManager, APIClient, MessageSocketManager, PresenceManager, MediaCacheManager, ThemeManager
**Alternatives rejet**: Dependency injection (setup container complexe), Environment Objects (pas adapt aux services), Service Locator (indirection inutile)
**Cons**: Difficile  tester (tat global), dpendances caches
