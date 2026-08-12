# 00 — État des lieux : l'architecture local-first réelle au HEAD `901e92589`

> Synthèse factuelle des 13 cartographies (chaque affirmation est sourcée `fichier:ligne` dans les rapports de dimension `01`–`09`). Ce fichier décrit **ce qui existe** ; les écarts sont dans les fichiers suivants.

## 1. Vue d'ensemble

```
┌─ apps/ios/Meeshy ──────────────────────────────────────────────────────────┐
│ ViewModels (27) ─ Services (84) ─ Stores app (FeedStore/MessageStore/…)    │
│   │ cache-first + optimiste          │ orchestration (SDK purity)          │
├─ packages/MeeshySDK ───────────────────────────────────────────────────────┤
│ CacheCoordinator (acteur, 27 stores GRDB + 4 stores disque + 3 caches      │
│   traduction) · CacheFirstLoader/CacheResult (SWR)                         │
│ Persistance : meeshy.sqlite (cache_entries, translation_cache, FTS)        │
│   + meeshy_messages.sqlite (App Group : messages, outbox, feed_*, FTS)     │
│ OfflineQueue (outbox 19 kinds) + OutboxFlusher + files annexes             │
│ MessageSocketManager (~70 listeners) · SocialSocketManager (31 events)     │
│ ConversationSyncEngine (fullSync paginé + delta updatedSince + watermarks) │
│ APIClient (ETag/URLCache, retry 429/503, 401 single-flight, TUS)           │
├─ Extensions ───────────────────────────────────────────────────────────────┤
│ NSE (pré-persist GRDB cross-process) · Widgets · Share (relais durable)    │
│ App Group group.me.meeshy.apps (UserDefaults + staging + SQLite partagé)   │
├─ services/gateway ─────────────────────────────────────────────────────────┤
│ ~95 events Socket.IO typés · ETag global (onSend) · idempotence            │
│ (clientMessageId + MutationLog) · deltas : conversations?updatedSince,     │
│ messages?after=, stories?updatedSince+tombstones · /sync (pilote)          │
└────────────────────────────────────────────────────────────────────────────┘
```

Toolchain : iOS 16+, Swift 6.2 (SDK core `nonisolated` par défaut, MeeshyUI `@MainActor` par défaut — SE-0466), GRDB 6.29.3, socket.io-client-swift 16.1.1.

## 2. Lecture (cache-first)

**Ce qui existe.**
- **CacheCoordinator** (acteur singleton) expose 27 `GRDBCacheStore` typés — L1 dictionnaire LRU (20 clés) + L2 SQLite namespacé, dirty-tracking avec debounce 2 s / plafond 10 s, chiffrement strict optionnel — et 4 `DiskCacheStore` médias (L1 NSCache + fichiers SHA256, pins persistés, LRU par date d'accès réel).
- **Discipline SWR outillée** : `CacheResult` à 4 cas (`.fresh/.stale/.expired/.empty`), `.value` déprécié au profit de `snapshot()`, `CacheFirstLoader` mutualise le patron « peindre le cache puis revalider », `LoadState.cachedStale/cachedFresh` distincts de `.loading`.
- `lastFetchedAt` est possédé par `save()` seul : les flushs de mutations locales via le dirty-tracking ne rajeunissent pas l'horloge de fraîcheur (fix T3 de la vague de juin). En revanche, 9 sites app appellent `save()` pour des mutations purement locales et la rajeunissent à tort — écart stores-08 (fichier 05).
- **Écrans étalons** : `ConversationListViewModel` (4 cas `CacheResult` gérés, récupération `.expired` via `loadIgnoringExpiry`, curseur de pagination persisté/restauré) et `ConversationViewModel` (publication atomique messages+métadonnées, drain NSE avant lecture, pagination offline avec repli GRDB dans le `catch`).
- **Cold start** : `MeeshyApp.init` ouvre les deux bases, la session Keychain est affichée **avant tout réseau** (`checkExistingSession`), le splash est gaté cache-first (attente socket bornée 1,5 s uniquement si cache non vide et en ligne, fast-path offline, plafond dur 5 s).

**Persistance durable** : toutes les écritures messages passent par `MessagePersistenceActor` (transaction unique, réconciliation optimiste à 4 clés cid→PendingId→PK→serverId, gardes anti-clobber des mutations outbox en attente, machine à états `MessageStateMachine` avec auto-guérison). Ouverture résiliente (quarantaine du fichier corrompu, repli in-memory, zéro crash-loop). FTS5 messages/conversations/users.

## 3. Écriture (optimiste + offline)

- **Outbox unifié GRDB** : 19 `OutboxKind` (messages, réactions, likes, posts, commentaires, vus story, block, friend requests…), write-ahead 2 phases pour les médias (row avant octets), claim atomique `pending→inflight`, backoff exponentiel, dead-letter des 4xx permanents, GC des `.exhausted` > 7 j, dédup serveur par `clientMessageId`/`X-Client-Mutation-Id` (MutationLog gateway).
- **Réveils du flusher** : boot, foreground, reconnect socket, transition réseau offline→online, timer de backoff, `flushNow()` post-enqueue (côté messages).
- **Rollback optimiste** : outcomes par cmid (`AsyncStream`), `.exhausted` déclenche le rollback dans Feed/PostDetail/UserProfile ; SyncPill et ConnectionBanner surfacent `pending/failed/exhausted`.
- **Files annexes** (héritage, cf. écarts) : `StoryPublishQueue`, `SettingsActionQueue`, `ConversationStateOutbox` (pin/mute/archive — SSOT exemplaire avec versioning + rollback), `EngagementOutbox` (batchs ≤ 50), `PendingStatusQueue`, impressions, widget `pending_mark_read`.
- **Uploads TUS** résumables : checkpoints GRDB keyés SHA-256 streamé, réalignement 409/HEAD, re-POST sur 404/410, seed du cache média auteur après succès (relecture offline sans re-téléchargement).

## 4. Temps réel

- **MessageSocketManager** (3 307 lignes) : ~70 listeners couvrant la quasi-totalité de `socketio-events.ts` ; `suspendTransport()` préserve `hadPreviousConnection` + rooms au background, `didReconnect` refire au resume ; backoff jitteré cappé 60 s ; décodage off-main sérialisé **avec stratégie de dates** (le piège historique des drops silencieux est fermé et verrouillé par test).
- **Double étage messages** : `ConversationSocketHandler` (conversation ouverte) fait du write-through GRDB systématique pour TOUS les events ; `ConversationSyncEngine` (global) persiste `message:new` même conversation fermée et maintient la liste.
- **SocialSocketManager** : couvre les 31 events sociaux émis (posts, stories, statuses, comments, réactions, traductions) ; re-join feed + post rooms au `.connect` ; backfill feed au `didReconnect` (`FeedViewModel` → `loadFeed(forceRefresh:)` avec `mergePreservingRealtimeHead`) — **R2-app est résolu pour le feed visible**.
- **Compteurs absolus** partout (likeCount/commentCount/viewCount serveur) + `patchEverywhere` balaye L1∪L2 pour le like multi-clés — deux surfaces ne peuvent pas dériver tant que l'event arrive.
- **Présence** alignée sur la règle produit 60 s/5 min/30 min, typing = preuve d'activité.

## 5. Synchronisation / rattrapage

- **Conversations** : `fullSync` paginé (première page peinte ~300 ms, fan-out borné 4, re-fetch des pages intérieures perdues, frontière de lecture locale préservée) + `deltaSyncCore` `?updatedSince=` (retrait des `isActive:false`) + réconciliation complète chaînée 24 h pour les hard-deletes. Watermarks en **temps serveur** (`SyncWatermark`, anti-dérive d'horloge, exclusion des horloges optimistes).
- **Messages** : `syncMissedMessages` = forward-paging par watermark `?after=` (cap 1000, recul sub-ms), déclenché au `didReconnect` **et** au foreground (coalescé 2 s) — pour la conversation **ouverte**.
- **Stories = référence interne** : delta `?updatedSince=` **avec tombstones serveur** (`meta.deletedStoryIds`) → purge locale + unpin des médias. La mémoire projet « delta stories additif » est **périmée**.
- **Notifications** : `_seq` par user (`emitWithSeq` gateway) + `NotificationGapResyncCoordinator` (refetch tête débouncé) ; état lu écrit au cache durable.
- **Gateway** : `GET /sync` (pilote) existe — streams added/modified/**deleted** (tombstones messages), curseur keyset, ETag — **sans aucun client iOS à ce jour** (cf. écarts).

## 6. Hors process principal

- **NSE** : pré-persist GRDB cross-process (WAL + busy_timeout 5 s des deux côtés), staging fichiers « suppression après commit », résolution de présentation **locale** (customName/emoji/catégorie depuis `conversation_snapshots` — doctrine « gateway muet » appliquée), receipts en URLSession background.
- **Share extension** : session autonome App Group+Keychain, relais durable idempotent par `clientMessageId`, aucun fallback fabriqué.
- **Widgets** : mark-as-read optimiste (mutation App Group + reload timeline + file durable rejouée au foreground).

## 7. Réseau

- `APIClient` : session custom (timeouts 60/120 s, URLCache 10/50 MB `.useProtocolCachePolicy`, HTTP/3), fail-fast offline pour les GET (pas de `waitsForConnectivity`), retry 429/503 avec `Retry-After`, 401 single-flight, décodage off-main, `X-Device-Locale` + `X-Client-Mutation-Id` bout-en-bout.
- **Source réseau unique** : `NetworkPathSource` (un seul `NWPathMonitor`) dont dérivent `NetworkMonitor` (binaire) et `NetworkConditionMonitor` (qualitatif) — le doublon historique est résolu.
- Gateway : ETag systématique (hook `onSend` global + `sendWithETag` sur les 2 endpoints chauds), comparaison faible `W/`.

## 8. Acquis de la vague local-first de juin 2026 (vérifiés au HEAD)

| Acquis | Preuve de vie |
|---|---|
| Suspend préserve `hadPreviousConnection` + rooms (T1/T2/R1/R2-core) | les deux socket managers |
| Gap recovery messages par watermark `?after=` (T8/T9) | `syncMissedMessages` forward-paging |
| Purges logout : prefs, 7 tables messages, URLCache (T5/T6/T15b-b) | `AuthManager.logout` ordonné |
| L1 dirty flushé avant éviction LRU (T4), `lastFetchedAt` préservé (T3) | `GRDBCacheStore` |
| Réactions : tag `currentUserId` + garde anti-clobber pending (T7/T13) | `MessagePersistenceActor` |
| Outbox : flush au reconnect réseau (T10), edit/delete routés (T11), GC + SyncPill (T14/T14b) | `OutboxFlusher`, `SyncPillViewModel` |
| ETag gateway + selects trimmés (T15/T16/T17) | `utils/etag.ts` |
| Rollback `.exhausted` like/comment (R4–R7) | Feed/PostDetail VMs |
| T10c (friend requests via outbox) — **résolu depuis** | `DiscoverViewModel`, `ConnectionActionView` |
| R2-app feed — **résolu depuis** | `FeedViewModel` didReconnect backfill |

**Reliquats de juin confirmés encore ouverts** : R3 (`saveSorted` avale les erreurs de persist, watermark avance), sessions anonymes sans resume socket, T15b(a/c) (revalidation ETag côté client non vérifiée). Ils sont repris avec fiches complètes dans les fichiers d'écarts.

## 9. Où se joue l'écart avec l'état cible

Les fichiers `01`–`09` détaillent 113 écarts confirmés (cf. `10-plan-d-application.md` ; deux fiches initialement retenues, cache-10 et rts-05, ont été rattachées en doublons lors de la revue finale). Les cinq **thèmes systémiques** :

1. **Hygiène cross-compte incomplète** — le logout purge beaucoup, mais pas tout : tables feed GRDB, files annexes (SettingsActionQueue, ConversationStateOutbox), App Group, watermarks de sync, caches RAM annexes.
2. **Suppressions/éditions jamais réconciliées hors-ligne** — les merges messages côté client sont additifs ; l'endpoint `/sync` à tombstones n'a aucun client ; le delta conversations n'a pas de tombstones ; `?after=` ne rejoue ni éditions ni suppressions.
3. **La branche `.expired` jette la donnée disque** — `loadIgnoringExpiry` existe mais n'est câblé que sur 2 sites ; 7+ écrans rendent un écran vide offline après TTL.
4. **Le feed hors écran est aveugle** — sinks désarmés à l'`onDisappear`, `feed:subscribe` jamais ré-émis, aucun refetch au retour ; le pipeline GRDB feed est write-only (rendu mort) et non purgé.
5. **Fenêtres de perte au kill/background** — `flushAll` ne draine que 6 stores sur 27, la séquence memory-warning→background efface les traductions persistées, retryAll rejoue les médias en texte-only.
