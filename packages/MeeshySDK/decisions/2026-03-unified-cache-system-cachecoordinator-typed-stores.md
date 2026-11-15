## 2026-03: Unified Cache System - CacheCoordinator + typed stores
**Statut**: Accept
**Contexte**: 5 cache managers indpendants (Conversation, Message, Participant, UserProfile, Media) avec logique duplique, flush/eviction incohrents, et aucune coordination centralize
**Decision**: Systme unifi avec 3 couches:
- **Foundation types**: `CachePolicy` (TTL/staleTTL/maxItemCount), `CacheIdentifiable`, `CacheResult<T>` (.fresh/.stale/.expired/.empty), `ReadableCacheStore`/`MutableCacheStore` protocols
- **GRDBCacheStore<Key, Value>**: Actor gnrique L1 Dictionary + L2 GRDB SQLite, dirty tracking (2s debounce + 10s max cap), LRU eviction
- **DiskCacheStore**: Actor L1 NSCache + L2 FileManager, SHA256 file naming, budget eviction, static UIImage cache
- **CacheCoordinator**: Actor singleton exposant `.conversations`, `.messages`, `.participants`, `.profiles` (GRDBCacheStore) et `.images`, `.audio`, `.video` (DiskCacheStore). Souscrit  17+ vnements Socket.IO, gre lifecycle (background flush, memory warning eviction)
- **ParticipantService**: Actor app-layer avec pagination (loadFirstPage, loadNextPage, hasMore)
**Alternatives rejet**: Core Data (heavyweight, pas actor-native), Realm (dpendance externe massive), pure UserDefaults (pas de requetes), garder les 5 managers spars (duplication ingrable)
**Cons**: Un seul point d'entre pour tout le cache, politiques configurable par type de donne, stale-while-revalidate pattern, tests isols via injection de dpendances (MockMessageSocket, MockSocialSocket, in-memory DatabaseWriter)
**Fichiers supprims**: ConversationCacheManager, MessageCacheManager, ParticipantCacheManager, UserProfileCacheManager, MediaCacheManager, DBCachedParticipant, LocalStore, SQLLocalStore + 4 test files
