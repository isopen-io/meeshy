# Audit complet — Cache stale-while-revalidate iOS Meeshy

**Date :** 2026-05-11
**Scope :** apps/ios + packages/MeeshySDK + interactions services/gateway
**Objectif :** Évaluer l'état actuel du cache local-first sur 5 axes (couverture, architecture, offline queue, UX, sync delta backend) pour cibler "local-first 100% + sync delta intelligent".

---

## Synthèse exécutive

L'app iOS Meeshy dispose déjà d'une fondation cache mature (CacheCoordinator, GRDB + Disk stores, CacheFirstLoader, CacheResult, OfflineQueue), mais il reste **8 brèches structurelles** qui empêchent l'atteinte d'un "vrai local-first" :

| # | Brèche | Sévérité | Axe |
|---|--------|----------|-----|
| 1 | Couverture cache à ~54 % (Communities 0 %, Notifications 0 %, Calls 0 %, Drafts 0 %, Search 37 %, Settings 25 %) | P0 | Couverture |
| 2 | `staleTTL` court (2-10 min) → spinner réseau inévitable au-delà | P0 | Architecture |
| 3 | 7+ usages de `CacheResult.value` qui masquent `.stale` (pas de SWR) | P0 | UX |
| 4 | Dédup gateway absente : pas de `@@unique(conversationId, clientMessageId)`, pas de `catch P2002` | P0 | Offline |
| 5 | 14 actions write *online-only* (block, friend req, profile, settings, post, like, comment...) | P0 | Offline |
| 6 | Gateway : 1 seul endpoint sur 30 supporte `?since=`, aucun event Socket.IO n'a de sequence number | P0 | Sync |
| 7 | Encryption fallback silencieux (plaintext si erreur) sur stores sensibles | P1 | Architecture |
| 8 | `OfflineQueue.enqueue()` async non-throws → erreurs avalées par `try?` | P1 | Offline |

**Couverture moyenne cache-first par domaine :** ~54 %
**Actions write offline-capable :** 6 / 20+
**Endpoints REST avec delta sync :** 1 / 30
**Spinners non cache-aware :** 8 / 111 ProgressView

---

## Axe 1 — Couverture cache iOS

### Catégories de données par taux de couverture

| Catégorie | Couverture | Détail |
|-----------|------------|--------|
| Conversations & messages | 100 % | ConversationListViewModel (cursor pagination), ConversationViewModel (dual-store GRDB + legacy), PostDetailViewModel (comments) |
| Contacts & friend requests | 100 % | RequestsViewModel, ContactsListViewModel, BlockedViewModel (tous CacheFirstLoader) |
| Stories & Feed | 100 % | FeedViewModel, BookmarksViewModel, StoryViewModel, PostDetailViewModel |
| Profiles & users | 40 % | UserProfileViewModel ✓, DiscoverViewModel (suggestions ✓ / search ✗), GlobalSearchViewModel (users ✗), VoiceProfileManageViewModel ✗ |
| Search | 37 % | GlobalSearchViewModel partial (read-only sur conversations), pas de cache search-results dédié |
| Media | 50 % | Images ✓ (3-tier), Story media ✓, Attachments ⚠️ write-through seulement |
| Settings & preferences | 25 % | PreferenceService partial, ConversationOptionsViewModel unclear |
| Communities | 0 % | CommunityService, CommunityLinkService : network-first |
| Notifications | 0 % | NotificationService.list() : network-first |
| Calls | 0 % | Pas de ViewModel cache pour CallService.history |
| Drafts | 0 % | Aucune persistance locale identifiée |

### Top 10 gaps prioritaires

1. **GlobalSearchViewModel — user search** (Search/Profiles) — CRITIQUE, M
2. **NotificationService** — HAUTE, M
3. **CommunityService** — HAUTE, M
4. **MessageSearchService** — MOYENNE, M
5. **DiscoverViewModel — performSearch()** — MOYENNE, M
6. **UserProfileViewModel — stats** — MOYENNE, S
7. **ConversationOptionsViewModel** — MOYENNE, S
8. **AttachmentService cache lecture** — BASSE, S
9. **VoiceProfileManageViewModel** — BASSE, S
10. **CallService.history** — BASSE, M

---

## Axe 2 — Architecture cache existante

### Stores typés exposés par CacheCoordinator (27 stores)

```
GRDB stores (encrypted + plain) : conversations, messages, participants, profiles,
  feed, comments, stories, stats, notifications, affiliateTokens, shareLinks,
  trackingLinks, communityLinks, statuses, friends, friendRequests, blockedUsers,
  userSearch, timeline, categories, userTags, userPreferences, conversationPreferences

Disk stores : images (300 MB), audio (200 MB), video (500 MB), thumbnails (50 MB)
```

### CachePolicy actuelles (extraits)

| Catégorie | TTL | staleTTL | maxItemCount | Évaluation |
|-----------|-----|----------|--------------|------------|
| conversations | 24h | 5m | ∞ | OK |
| messages | 6mo | 2m | 600 | staleTTL agressif |
| profiles | 1h | 5m | 100 | Court |
| feed | 6h | 2m | 100 | OK volatile |
| stories | 24h | 5m | ∞ | OK |
| notifications | 24h | 2m | 200 | SWR agressif |

**Problème central :** un `staleTTL` de 2-10 min implique qu'au-delà, l'item devient `.expired` → fetch obligatoire → spinner si offline. Pour vrai local-first, le pattern devrait être **staleTTL = ∞ avec invalidation push Socket.IO**.

### 3 faiblesses critiques

1. **Encryption fallback silencieux** (`GRDBCacheStore.swift:278/315/409`) : `encrypt() ?? json` → plaintext fallback si erreur → données sensibles peuvent fuiter
2. **Dirty tracking race en terminate** (`CacheCoordinator.swift:392-402`) : semaphore 4s peut ne pas suffire à flushAll() → perte data
3. **maxL1Keys = 20** (`GRDBCacheStore.swift:28`) : très bas, force des allers-retours L2 fréquents

### Invalidation Socket.IO

53+ events trackés (messages : 35+, social : 18+). Bonne couverture, mais :
- ❌ Pas de sequence number → impossible de détecter un gap
- ❌ Pas de conflict resolution Socket+REST (event tardif peut clobber un fetch frais)
- ❌ Search index non invalidé
- ❌ Pas d'event `user:profile-updated`
- ❌ Pas d'event `community:member-changed`

### Lifecycle & memory

- ✅ Background flush sur `willResignActive`, `didEnterBackground`, `willTerminate` (4s timeout)
- ✅ Memory pressure → evict L1 + expire media
- ✅ Logout purge complète (invalidateAll + Keychain destroyKey)
- ❌ `isExcludedFromBackup` non set → iCloud bloat possible
- ❌ `evictOverBudget()` non automatisé (média peut bloater le disque)

---

## Axe 3 — OfflineQueue & idempotence

### Actions write offline-capable

| Action | Offline ? | Queue | Idempotent ? |
|--------|-----------|-------|--------------|
| Send message text/audio | ✅ | OfflineQueue (ofq_*) | ✅ clientMessageId |
| Send attachments | ❌ | — | — |
| Edit message | ✅ | OfflineQueue (ofqe_*) | ✅ |
| Delete message | ✅ | OfflineQueue (ofqd_*) | ✅ |
| Toggle reaction | ✅ | ReactionQueue (rxq_*) | ✅ |
| Mark as read | ❌ | — | — |
| Send/accept/reject friend req | ❌ | — | — |
| Block/unblock user | ❌ | — | — |
| Create/update conversation | ❌ | — | — |
| Update profile (avatar, bio, username) | ❌ | — | — |
| Update settings | ❌ | — | — |
| Publish story | ✅ | StoryOfflineQueue | ✅ |
| Repost story | ❌ | — | — |
| Comment / like post / story | ❌ | — | — |

**Bilan : 6 / 20+ actions offline-capable.**

### clientMessageId end-to-end

- ✅ Format `cid_<uuid lowercase>` (iOS `ClientMessageId.generate()`)
- ✅ Schema Prisma `Message.clientMessageId String?` + index `@@index([conversationId, clientMessageId])`
- ❌ **Pas de `@@unique([conversationId, clientMessageId])` → dedup gateway impossible**
- ❌ Gateway `POST /conversations/:id/messages` accepte clientMessageId mais ne dédup pas
- ❌ Socket `_sendResponse()` retourne `{ messageId }` mais pas `clientMessageId` → reconciliation client cassée
- ✅ iOS `pendingServerIds: [String: String]` map tempId → serverId

### 3 queues séparées, pourquoi ?

- **OfflineQueue** : enqueue pendant offline (boot recovery + reconnect)
- **MessageRetryQueue** : retry online sur 5xx/timeout (5 retries, backoff exponentiel 2-30 s)
- **ReactionQueue** : reaction toggle (déjà sur OutboxRecord, mais lit GRDB à chaque accès, pas de cache in-memory)

Risque race : même `clientMessageId` peut être enqueued dans 2 queues si online → 5xx → offline rapide.

### Top 5 faiblesses offline

1. Gateway dedup manquante (P0)
2. ACK socket sans clientMessageId (P0)
3. `OfflineQueue.enqueue` async non-throws → erreurs silencieuses (P1)
4. MessageRetryQueue ↔ OfflineQueue race (P1)
5. Pas d'UI badge "offline" / "retry" sur messages failed (P1)

---

## Axe 4 — UX local-first

### Spinners et anti-patterns

- **111 ProgressView trouvés**, dont 8 problématiques sans cache-check :
  - StoryViewerView+Content:1029 — bannière bloquante
  - LinkPreviewCard:112 — inline sans skeleton
  - ProfileView:165, FeedView:410, MessageDetailSheet:610 — `if isLoading` sans cache-aware guard
- **7+ usages `.value` sur CacheResult** masquent `.stale` :
  - ConversationListViewModel:1209, GlobalSearchViewModel:252/333, FeedViewModel:313,
    ConversationViewModel:1886, UserStatsView:194, ParticipantService 3 instances

### Optimistic updates manquants

| Action | Optimistic ? | Rollback ? |
|--------|--------------|------------|
| Send message | ✅ | ✅ |
| Edit/Delete/React | ✅ | ✅ |
| Pin message | ✅ | ✅ |
| Block user | ❌ | N/A |
| Accept/reject friend req | ⚠️ unclear | unclear |
| Send friend request | ⚠️ unclear | unclear |
| Update profile | ❌ | N/A |

### Indicateurs offline

- ✅ ConnectionBanner global (`ConnectionBanner.swift:22`)
- ⚠️ Pas de badge "⏳ Offline" distinct sur messages `.sending`
- ❌ Pas de bouton "Retry" sur messages `.failed`
- ❌ Pas de banner "Synchronisation..." au reconnect
- ✅ Pas de distinction visuelle stale vs fresh (correct, transparent)

### Re-render hazards

- `@ObservedObject` sur singletons (MeeshyApp:16 / ThemeManager, ConnectionBanner:7-8 / MessageSocketManager + NetworkMonitor, SecurityView, EditProfileView, SettingsView, ProfileView, AudioPostComposerView)
- ✅ Equatable + .equatable() bien implémenté sur les cells

### Skeletons

- ✅ SkeletonShape, SkeletonConversationRow, SkeletonMessageBubble, ShimmerModifier existent
- ❌ Sous-utilisés : fallback à ProgressView dans la plupart des écrans
- ❌ Manquants : Profile, Story, Feed post, MessageDetail

---

## Axe 5 — Gateway endpoints delta sync

### Inventaire (30 endpoints GET)

| Catégorie | Pagination | Delta `?since=` | Cache headers | Verdict |
|-----------|------------|-----------------|---------------|---------|
| `/conversations` (list) | cursor + offset | ✅ `updatedSince` | ❌ | ready ✓ |
| `/conversations/:id/messages` | cursor (before) | ❌ | ❌ | needs delta ⚠️ |
| `/notifications` | offset | ❌ | ❌ | needs delta ⚠️ |
| `/posts/feed` (+ stories, statuses, bookmarks, user, community) | cursor opaque | ❌ | ❌ | needs delta ⚠️ |
| `/friend-requests/received` & `/sent` | offset | ❌ | ❌ | needs delta ⚠️ |
| `/communities/:id/members` | offset | ❌ | ❌ | needs delta ⚠️ |
| `/calls/history` | offset + cursor | ❌ | ❌ | needs delta ⚠️ |
| `/messages/:id/reactions` | offset | ❌ | ❌ | needs delta ⚠️ |
| `/mentions` | offset | ❌ | ❌ | needs delta ⚠️ |

**Sur 30 endpoints :** 6 ready, 8 cursor opaque, 1 avec `since`, 15+ sans support delta.

### Champs Prisma utiles pour delta

| Modèle | updatedAt | indexed | deletedAt |
|--------|-----------|---------|-----------|
| User | ✅ | ✅ | ✅ |
| Conversation | ✅ | ✅ | ❌ (closedAt) |
| Message | ✅ | ✅ | ✅ |
| Participant | ✅ | ✅ | ⚠️ leftAt/deletedForMe |
| Reaction | ✅ | ✅ | ❌ |
| FriendRequest | ✅ | ❌ | ❌ |
| Notification | createdAt | ✅ | ❌ (expiresAt) |
| Community | ✅ | ❌ | ✅ |
| Post / PostComment / Story | ✅ | ❌ | ✅ |
| CallSession | ✅ | ❌ | ❌ |

**Aucun modèle n'a `version` ou `revision` field** — la concurrence repose uniquement sur timestamps.

### Socket.IO events (53+ totaux)

- ✅ IDs composites (messageId, conversationId, emoji) pour l'idempotence
- ❌ **Aucun event n'a de `sequenceNumber` ou `version`** → gap detection impossible
- ❌ Pas d'event `friendRequest:updated`, `user:profile-updated`, `community:member-changed`

### Top 10 endpoints à étendre pour local-first

1. `/conversations/:id/messages` (P0, M) — `?since=` + tombstones
2. `/notifications` (P0, S) — `?since=` + isRead deltas
3. `/posts/feed` (P0, M) — `?since=` + cursor opaque (retention)
4. `/friend-requests/received` (P1, S)
5. `/communities/:id/members` (P1, M)
6. `/calls/history` (P1, S)
7. `/messages/:id/reactions` (P2, M)
8. `/posts/bookmarks` (P2, S)
9. `/mentions` (P2, S)
10. `/conversations/:id/participants` (P1, L) — endpoint à créer

**Effort gateway :** ~100 h (~2.5 sprints)

---

## Évaluation globale vs Instant App Principles

| Principe (CLAUDE.md racine) | Conformité | Justification |
|------------------------------|-----------|---------------|
| 1. Cache-First, Network-Second | ⚠️ 54 % | Couverture partielle, staleTTL court |
| 2. Stale-While-Revalidate | ❌ | 7+ `.value` masquent stale, pas de path révalidation explicite |
| 3. Optimistic Updates | ⚠️ | OK sur messages/reactions, manquant sur 10+ actions write |
| 4. Offline Graceful Degradation (reads + writes) | ⚠️ | Reads OK pour data cachée, writes seulement 6/20+ |
| 5. Zero Unnecessary Re-render | ⚠️ | @ObservedObject sur singletons dans 8+ vues |
| 6. Single Source of Truth | ✅ | CacheCoordinator + GRDBCacheStore unifié, packages/shared/types |

**Score global : 5.5/10** (vs cible 9/10 pour local-first 100%).

---

## Prochaines étapes recommandées

Voir spec design `docs/superpowers/specs/2026-05-11-ios-local-first-complete-design.md` (à venir) pour :
1. Architecture cible (SyncEngine + push-invalidation + staleTTL = ∞)
2. Plan de migration phasé (5-7 sprints)
3. Acceptance criteria mesurables (0 spinner sur cache chaud, 100 % actions offline-capable, sync delta < 500 ms)
