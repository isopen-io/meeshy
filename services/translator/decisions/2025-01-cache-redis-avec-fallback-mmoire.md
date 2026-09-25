## 2025-01: Cache - Redis avec fallback mmoire
**Statut**: Accept
**Contexte**: Cache de traductions/transcriptions, service ne doit jamais crasher
**Decision**: RedisService singleton, fallback automatique vers dict Python aprs 3 checs, cleanup toutes les 60s
**Alternatives rejet**: Redis seul (crash si down), mmoire seul (perdu au restart), Memcached (client async moins mature)
**Cons**: Mode mmoire perdu au restart, pas partag entre instances
