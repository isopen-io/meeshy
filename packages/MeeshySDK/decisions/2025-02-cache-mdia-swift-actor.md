## 2025-02: Cache Mdia - Swift Actor
**Statut**: Superseded by Unified Cache System (2026-03)
**Contexte**: Accs concurrent au cache depuis multiple threads
**Decision**: `actor MediaCacheManager` avec double couche (NSCache mmoire + FileManager disque 7j TTL), dduplification in-flight
**Alternatives rejet**: Class avec locks (error-prone), DispatchQueue (legacy), Kingfisher seul (pas de cache audio/vido)
**Cons**: Syntaxe `await` obligatoire pour chaque accs au cache
