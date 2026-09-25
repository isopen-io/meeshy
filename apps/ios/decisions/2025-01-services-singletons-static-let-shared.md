## 2025-01: Services - Singletons (`static let shared`)
**Statut**: Accept
**Contexte**: Managers coteux (connexions rseau, modles ML) ne doivent pas tre recrs
**Decision**: Singleton pour AuthManager, APIClient, MessageSocketManager, PresenceManager, MediaCacheManager, ThemeManager
**Alternatives rejet**: Dependency injection (setup container complexe), Environment Objects (pas adapt aux services), Service Locator (indirection inutile)
**Cons**: Difficile  tester (tat global), dpendances caches
