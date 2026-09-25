## 2025-01: Cache - Redis avec fallback mmoire
**Statut**: Accept
**Contexte**: Le service ne doit jamais crasher cause de Redis
**Decision**: RedisWrapper singleton, fallback automatique vers `Map<string, CacheEntry>` aprs 3 checs, `permanentlyDisabled` flag
**Alternatives rejet**: Redis seul (crash si Redis down), mmoire seul (perdu au restart), Memcached (client async moins mature)
**Cons**: Mode mmoire non partag entre instances, taux de cache hit rduit si Redis tombe
