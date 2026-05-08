# iOS Conversation List, Cache-First Coverage & Offline Queue Hardening — Design

**Date:** 2026-05-08
**Scope:** apps/ios + packages/MeeshySDK + services/gateway + packages/shared (Prisma) + apps/web (Phase 4 uniquement, pour la migration coordonnee de `clientMessageId`)
**Objectif:** corriger trois bugs critiques (tri stale, drop multi-send offline, perte d'erreurs silencieuse), ajouter la pagination infinite scroll des conversations, etendre le pattern cache-first stale-while-revalidate aux 5 ViewModels qui y derogent, durcir l'envoi offline (idempotence end-to-end via clientMessageId, edit/delete/reactions/audio offline robustes).

---

## Table des matieres

1. [Contexte et bugs identifies](#1-contexte-et-bugs-identifies)
2. [Architecture globale et phasage](#2-architecture-globale-et-phasage)
3. [Phase 1 — Fix tri stale conversations](#3-phase-1--fix-tri-stale-conversations)
4. [Phase 2 — Pagination infinite scroll cursor-based](#4-phase-2--pagination-infinite-scroll-cursor-based)
5. [Phase 3 — Cache-first complet sur les listes en breche](#5-phase-3--cache-first-complet-sur-les-listes-en-breche)
6. [Phase 4 — Offline queue durcie et clientMessageId end-to-end](#6-phase-4--offline-queue-durcie-et-clientmessageid-end-to-end)
7. [Hors scope](#7-hors-scope)
8. [Acceptance criteria globaux](#8-acceptance-criteria-globaux)
9. [Strategie de tests](#9-strategie-de-tests)
10. [Risques et mitigation](#10-risques-et-mitigation)

---

## 1. Contexte et bugs identifies

### 1.1 Bug 1 — Liste des conversations dans le mauvais ordre en cache stale

`ConversationListViewModel.reloadFromCache()` (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:227-235`) et `loadMore()` (lignes 469-492) assignent les donnees du cache directement a `@Published var conversations` **sans appliquer de tri**. Le tri n'existe que dans le computed `groupedConversations` (lignes 159-210). Toute lecture directe de `conversations` herite de l'ordre de restitution SQLite.

Cause adjacente : `ConversationSyncEngine.syncSinceLastCheckpoint` (lignes 268-281) reconstruit la liste cachee sans tri final avant `cache.conversations.save(merged, for: "list")`.

### 1.2 Bug 2 — Messages multiples en envoi offline silencieusement perdus

`ConversationViewModel.sendMessage()` (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1305-1400`) presente trois defauts cumules :

- `guard !isSending else { return false }` (ligne 1305) protege uniquement le path online (`isSending = true` ligne 1417). En offline, on `return true` ligne 1400 sans jamais positionner le flag. Plusieurs `Task` partent en parallele.
- Persistance fire-and-forget non awaited :
  - `Task { await OfflineQueue.shared.enqueue(queueItem) }` (ligne 1317)
  - `Task.detached(priority: .utility) { try? await persistence.insertOptimistic(...) }` (ligne 1370)
  - `Task.detached(priority: .utility) { await CacheCoordinator.shared.messages.mergeUpdate(...) }` (ligne 1375)
- Erreurs avalees par `try?` partout (`OfflineQueue.writeToOutbox` ligne 230 ; `insertOptimistic` ligne 1370). Toute erreur GRDB sur lock SQLite -> message evapore sans trace.

Symptome utilisateur : le 1er message apparait avec icone horloge, les suivants disparaissent (ni dans l'UI, ni dans le cache, ni dans la queue).

### 1.3 Bug 3 — Pas de pagination cote iOS

`ConversationListViewModel.loadMore()` existe mais utilise un `offset` (vulnerable aux decalages quand de nouvelles conversations arrivent pendant le scroll), avec un cap dur `autoLoadCap = 1000` (ligne 50). Le cache n'est pas mis a jour pour les pages 2+. La route gateway `GET /conversations` supporte deja `before` cursor + `limit` (`services/gateway/src/routes/conversations/core.ts:99-519`), mais le SDK et le ViewModel ne l'exploitent pas.

### 1.4 Audit cache-first — 5 ViewModels en breche

| ViewModel | Etat | Localisation |
|---|---|---|
| RequestsViewModel (friend requests received/sent) | Manquant | `apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift:29` |
| DiscoverViewModel (recherche utilisateurs) | Manquant | `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift:44` |
| BlockedViewModel (utilisateurs bloques) | Manquant | `apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift:20` |
| GlobalSearchViewModel (recherche messages) | Partiel | `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:151` |
| Participants (membres conversation) | Partiel | `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1822` |

### 1.5 Audit offline queue — operations manquantes ou fragiles

- **Reactions offline** : `ReactionQueue` separee, non branchee sur l'infrastructure `OutboxRecord` (pas de persistance disque)
- **Edit message offline** : `OutboxKind.editMessage` existe mais `OutboxDispatcher.dispatch` est no-op pour ce cas
- **Delete message offline** : idem, no-op
- **Audio offline** : upload TUS synchrone bloquant ; `attachmentId` peut etre invalide si reseau coupe pendant l'upload
- **Idempotence cross-device** : `clientMessageId` existe **partiellement** cote backend mais n'est ni persiste ni dedupe :
  - Cote contrat WebSocket : `services/gateway/src/validation/socket-event-schemas.ts:14` valide `clientMessageId: z.string().optional()` (optionnel)
  - Cote ACK : le serveur retourne le `clientMessageId` dans le ack quand fourni (`services/gateway/src/socketio/__tests__/message-ack.test.ts:45-50`)
  - Cote broadcast : `clientMessageId` est **volontairement omis** du broadcast `message:new` (`message-ack.test.ts:61-75`) pour ne pas leak l'identifiant d'un client a un autre
  - Cote web (Next.js) : `apps/web/services/socketio/messaging.service.ts` envoie deja `clientMessageId` (optionnel)
  - Cote iOS : RIEN — le `tempId` (`offline_<uuid>`) est purement local SDK iOS, jamais transmis au backend
  - Cote DB : pas de champ `clientMessageId` en Prisma, pas d'index unique
  - Cote dedup : aucune. Si un message est rejoue, le serveur cree un doublon

---

## 2. Architecture globale et phasage

Quatre phases independantes, mergeable separement :

| Phase | Sujet | Backend impacte | Risque | Effort |
|---|---|---|---|---|
| 1 | Fix tri stale conversations | Non | Faible | XS (~80 LoC + 3 tests) |
| 2 | Pagination infinite scroll cursor-based | Non (route prete) | Moyen | M (~250 LoC + 6 tests) |
| 3 | Cache-first sur 5 ViewModels en breche | Non | Moyen | M (~400 LoC + 20 tests) |
| 4 | Offline queue durcie + clientMessageId end-to-end (iOS + gateway + Prisma + web) | Oui (Prisma + routes + web migration) | Eleve | L (~900 LoC iOS + ~200 LoC gateway + ~150 LoC web + 25 tests) |

**Ordre logique** : 1 → 2 → 3 → 4. Les phases sont **independantes** et peuvent partir en parallele sur 4 worktrees `feat/ios-conv-listing-{phase}` si plusieurs sessions sont disponibles.

**Principes appliques** (`CLAUDE.md` "Instant App Principles") :
- Cache-First, Network-Second
- Stale-While-Revalidate avec `CacheResult<T>` discriminant
- Optimistic Updates avec rollback
- Offline Graceful Degradation (writes queued FIFO)
- Zero Unnecessary Re-render (LoadState distinct du loading initial)
- Single Source of Truth (sort centralise, helper cache-first reutilisable)

---

## 3. Phase 1 — Fix tri stale conversations

### 3.1 Modifications iOS

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` :

```swift
private var conversationsRaw: [MeeshyConversation] = []
@Published private(set) var conversations: [MeeshyConversation] = []
@Published private(set) var groupedConversations: [ConversationSection] = []

private func setConversations(_ items: [MeeshyConversation]) {
    conversationsRaw = items
    let sorted = items.sorted { $0.lastMessageAt > $1.lastMessageAt }
    conversations = sorted
    groupedConversations = computeSections(from: sorted)  // memoize
}

private func appendConversations(_ items: [MeeshyConversation]) {
    let merged = (conversationsRaw + items).deduplicatedById()
    setConversations(merged)
}

/// Move single conversation to top — O(n) instead of O(n log n) full re-sort.
/// Used when a socket message:new arrives for an existing conversation.
private func bumpToTop(conversationId: String, newLastMessageAt: Date) {
    guard let idx = conversationsRaw.firstIndex(where: { $0.id == conversationId }) else { return }
    var updated = conversationsRaw[idx]
    updated.lastMessageAt = newLastMessageAt
    conversationsRaw.remove(at: idx)
    conversationsRaw.insert(updated, at: 0)
    conversations = conversationsRaw  // already sorted by invariant
    groupedConversations = computeSections(from: conversationsRaw)
}
```

Tous les sites d'ecriture (`reloadFromCache`, `loadConversations`, `loadMore`, optimistic insert sur creation conv, sync engine merge) passent par ces helpers. **Plus aucun assignement direct a `conversations`.** Les arrivees socket `message:new` sur conversation existante passent par `bumpToTop` (insertion-sort incremental), pas un re-sort complet.

`groupedConversations` est **memoized comme `@Published private(set)`**, plus computed property. Cela evite la recomputation a chaque body re-eval pendant le scroll. Le timer minuit (qui peut faire glisser une conversation entre "Today" et "Yesterday") est gere via `Timer.publish(every: 60)` qui appelle `groupedConversations = computeSections(from: conversationsRaw)` quand le wall-clock change de jour.

**Note performance** : a 1000 conversations, `sorted()` ~0.3-0.8ms, computeSections ~5ms — acceptable. A 10k+, le full re-sort devient sensible (5-10ms par event), d'ou l'importance de `bumpToTop` pour le hot path socket.

### 3.2 Modifications SDK

`packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:268-281` : ajouter `.sorted { $0.lastMessageAt > $1.lastMessageAt }` a la sortie du merge avant `cache.conversations.save(merged, for: "list")`. Le cache lui-meme est stocke trie ; tout futur lecteur voit l'ordre canonique.

### 3.3 Tests

`packages/MeeshySDK/Tests/MeeshySDKTests/ConversationListViewModelTests.swift` (creer si n'existe pas) :

- `test_reloadFromCache_unsortedData_returnsListSortedByLastMessageAtDesc`
- `test_loadMore_appendsAndKeepsSortOrder`
- `test_optimisticInsert_newestConversationGoesToTop`

### 3.4 Acceptance criteria

1. Au demarrage froid, `conversations` est trie `lastMessageAt DESC` des la lecture cache stale (avant le fetch reseau)
2. Apres `loadMore`, l'ordre est conserve (pas de "queue" de conversations plus anciennes au milieu de recentes)
3. Quand un nouveau message arrive sur une conversation X, X remonte en position 1 instantanement (via `bumpToTop`, sans full re-sort)
4. `groupedConversations` ne se recompute qu'a (a) chaque setter `setConversations`/`bumpToTop`, (b) tick minuit (changement de jour), (c) jamais pendant le scroll

---

## 4. Phase 2 — Pagination infinite scroll cursor-based

### 4.1 Choix design : cursor `before`

Le backend supporte les deux modes (offset+limit et cursor `before` par `lastMessageAt`). Le cursor est immune aux decalages quand de nouvelles conversations arrivent en haut de la liste pendant le scroll.

### 4.2 Modifications SDK

`packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift` :

```swift
public func listPage(before cursor: Date? = nil, limit: Int = 30) async throws -> ConversationPage {
    var query = "limit=\(limit)"
    if let cursor { query += "&before=\(ISO8601DateFormatter().string(from: cursor))" }
    let response: CursorPaginatedAPIResponse<[APIConversation]> = try await APIClient.shared.get("/conversations?\(query)")
    return ConversationPage(
        items: response.data.map { $0.toMeeshyConversation() },
        nextCursor: response.cursorPagination?.nextCursor,
        hasMore: response.cursorPagination?.hasMore ?? false
    )
}

public struct ConversationPage {
    public let items: [MeeshyConversation]
    public let nextCursor: Date?
    public let hasMore: Bool
}
```

L'ancienne signature `list(offset:limit:)` reste pour compatibilite interne (sync engine peut continuer a l'utiliser pour la premiere page sans cursor).

### 4.3 Cache : table dediee row-per-conversation

**Changement de schema GRDB** : aujourd'hui le store `conversations` stocke un blob JSON unique sous cle `"list"`. A 5k+ conversations, l'encode/decode de ce blob bloque le MainActor 200-500ms au cold start. **On migre vers une table dediee row-per-conversation** :

```sql
CREATE TABLE cached_conversations (
    id TEXT PRIMARY KEY,
    last_message_at INTEGER NOT NULL,  -- epoch ms, indexed
    payload BLOB NOT NULL,             -- JSON encoded MeeshyConversation
    fetched_at INTEGER NOT NULL,
    INDEX idx_last_message_at (last_message_at DESC)
);
```

Avantages :
- Reads partiels possibles (page d'affichage par exemple LIMIT 30 ORDER BY last_message_at DESC)
- Decode incremental (seules les rows visibles sont decodees)
- `mergeUpdate` devient un INSERT ON CONFLICT REPLACE par row
- LRU efficace via `DELETE WHERE id NOT IN (SELECT id ORDER BY last_message_at DESC LIMIT N)`

**Plafond LRU pragmatique : 2000 conversations cachees.** Au-dela, purge des plus anciennes par `lastMessageAt` ascendant. 99% des utilisateurs n'atteindront jamais 500 ; 2000 couvre les power users sans risque de bloat. Si l'utilisateur scrolle au-dela des 2000 cachees, les anciennes pages sont re-fetched depuis le backend.

**WAL mode obligatoire** : verifier que GRDB utilise `DatabasePool` (pas `DatabaseQueue`) avec `prepareDatabase { try $0.execute(sql: "PRAGMA journal_mode = WAL") }`. Sans WAL, les writes bloquent les reads → jank UI lors d'un fetch reseau pendant scroll.

Procedure de fetch :

1. Lire la page courante via `SELECT * FROM cached_conversations ORDER BY last_message_at DESC LIMIT 30 OFFSET <n>`
2. Merge les nouveaux items via `INSERT OR REPLACE` (un par row)
3. Pas besoin de re-trier en memoire — l'index BTREE garantit l'ordre
4. Trigger LRU si count > 2000 : `DELETE FROM cached_conversations WHERE id IN (SELECT id ... LIMIT count - 2000)`

### 4.4 ViewModel

```swift
@Published private(set) var loadState: LoadState = .idle
@Published private(set) var paginationState: PaginationState = .idle
private var oldestLoadedDate: Date?
private var hasMore = true

enum PaginationState: Equatable {
    case idle
    case loadingMore
    case exhausted
    case error(String)
}

func loadMore() async {
    guard hasMore && paginationState != .loadingMore else { return }
    paginationState = .loadingMore
    do {
        let page = try await service.listPage(before: oldestLoadedDate, limit: 30)
        appendConversations(page.items)
        oldestLoadedDate = page.items.last?.lastMessageAt
        hasMore = page.hasMore
        await CacheCoordinator.shared.conversations.mergeUpdate(page.items, for: "list")
        paginationState = page.hasMore ? .idle : .exhausted
    } catch {
        paginationState = .error(error.localizedDescription)
    }
}
```

`loadState` reste pour le chargement initial. `paginationState` distinct evite le shimmer global pendant un load more.

Suppression du cap dur `autoLoadCap = 1000` (`ConversationListViewModel.swift:50`).

### 4.5 UI infinite scroll

`ConversationListView.swift` (ou equivalent) :

```swift
ForEach(viewModel.groupedConversations, id: \.title) { section in
    Section { ... }
}
// Footer
Group {
    if viewModel.paginationState == .loadingMore {
        LoadMoreSpinner()
    } else if viewModel.paginationState == .exhausted && viewModel.conversations.count > 30 {
        Text("Toutes les conversations chargees")
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}
.onAppear {
    if viewModel.paginationState == .idle && viewModel.hasMore {
        Task { await viewModel.loadMore() }
    }
}
```

Detection 2 lignes avant la fin pour eviter que l'utilisateur ne voit le ProgressView.

### 4.6 Cas edge

- **Cache stale n=15, hasMore=true** : 15 affiches immediatement, page 1 reseau en background, pas de loadMore tant qu'user n'a pas scrolle
- **Race nouveau message socket pendant load more** : sync engine insere via `mergeUpdate` independamment ; le tri central de Phase 1 garantit la position correcte
- **Pull-to-refresh** : reset `oldestLoadedDate = nil`, `hasMore = true`, refetch page 1 cursor-less

### 4.7 Tests

- `test_loadPage_initialFetch_setsCursorFromLastItem`
- `test_loadMore_appendsToExistingList_preservesSortOrder`
- `test_loadMore_whenHasMoreFalse_doesNotFetch`
- `test_loadMore_concurrentCalls_onlyOneInFlight`
- `test_cache_persistsMultiplePages_acrossRestart` (integration GRDB)
- `test_pullToRefresh_resetsCursorAndRefetches`
- `test_cache_lruPurge_keepsOnly2000RecentConversations` (integration GRDB)
- `test_bumpToTop_singleConversation_doesNotFullSort` (perf — assert max ms)

### 4.8 Acceptance criteria

1. L'utilisateur peut scroller indefiniment dans la liste tant que `hasMore = true`
2. L'arrivee d'une nouvelle conversation pendant le scroll ne provoque ni perte ni doublon
3. Au prochain demarrage de l'app, l'utilisateur retrouve la fenetre deja chargee (jusqu'a 500) sans re-scroll

---

## 5. Phase 3 — Cache-first complet sur les listes en breche

### 5.1 LoadState unifie

`packages/MeeshySDK/Sources/MeeshySDK/Cache/LoadState.swift` (consolider si deja partiellement defini) :

```swift
public enum LoadState: Equatable {
    case idle
    case cachedStale       // affichage cache + refresh bg
    case cachedFresh       // affichage cache, pas de refresh
    case loading           // empty cache, premier fetch
    case loaded            // chargement reseau OK
    case offline           // pas de reseau, cache deja affiche
    case error(String)
}
```

### 5.2 Helper reutilisable

**Decision : helper dans `MeeshySDK core`** (pas `MeeshyUI`). Le helper manipule des stores SDK + LoadState, n'a pas de dependance SwiftUI. Le placer dans le core target permet a tout futur ViewModel/SyncEngine de s'en servir sans pulling la dependance UI.

`packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheFirstLoader.swift` :

```swift
public actor CacheFirstLoader<T: Codable & Sendable> {
    private let store: any CacheStore<T>
    private let key: String

    public init(store: any CacheStore<T>, key: String) {
        self.store = store
        self.key = key
    }

    public func load(
        fetch: @Sendable () async throws -> T,
        setLoadState: @MainActor @Sendable (LoadState) -> Void,
        apply: @MainActor @Sendable (T) -> Void
    ) async -> Task<Void, Never>? {
        let result = await store.load(for: key)
        switch result {
        case .fresh(let data, _):
            await MainActor.run { apply(data); setLoadState(.cachedFresh) }
            return nil
        case .stale(let data, _):
            await MainActor.run { apply(data); setLoadState(.cachedStale) }
            // Return revalidation task so caller can store + cancel
            return Task { [store, key] in
                guard !Task.isCancelled else { return }
                do {
                    let fresh = try await fetch()
                    guard !Task.isCancelled else { return }
                    await MainActor.run { apply(fresh); setLoadState(.loaded) }
                    await store.save(fresh, for: key)
                } catch {
                    // Silent revalidate failure — keep stale displayed
                    Logger.cache.warning("Silent revalidate failed for \(key): \(error)")
                }
            }
        case .expired, .empty:
            await MainActor.run { setLoadState(.loading) }
            do {
                let data = try await fetch()
                await MainActor.run { apply(data); setLoadState(.loaded) }
                await store.save(data, for: key)
            } catch {
                let isOffline = await NetworkMonitor.shared.isOffline
                await MainActor.run {
                    setLoadState(isOffline ? .offline : .error(error.localizedDescription))
                }
            }
            return nil
        }
    }
}
```

Le helper retourne `Task<Void, Never>?` (le revalidation task quand applicable) que le ViewModel **doit stocker pour pouvoir annuler** au teardown.

### 5.2.1 Discipline Task — eviter les Tasks orphelines

Tout ViewModel utilisant `loadWithCacheFirst` declare :

```swift
@MainActor
final class ExampleViewModel: ObservableObject, CacheFirstLoading {
    @Published private(set) var loadState: LoadState = .idle
    private var activeTasks: Set<Task<Void, Never>> = []

    func load() async {
        let revalidate = await CacheFirstLoader(store: ..., key: ...)
            .load(fetch: { ... }, setLoadState: { [weak self] in self?.loadState = $0 },
                  apply: { [weak self] in self?.items = $0 })
        if let revalidate { activeTasks.insert(revalidate) }
    }

    deinit {
        activeTasks.forEach { $0.cancel() }
    }
}
```

Sans cette discipline, un user qui change rapidement d'ecran pendant un revalidate peut accumuler des Tasks zombies qui consomment CPU/network plusieurs secondes.

**Note** : `deinit` n'est pas `@MainActor`-isole. `activeTasks.forEach { $0.cancel() }` est safe car `Task.cancel()` est `Sendable` et thread-safe.

### 5.3 ViewModels a corriger

#### A. RequestsViewModel
`apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift` : ajouter cles `"requests:received"` et `"requests:sent"` dans le store `friends` deja existant.

#### B. DiscoverViewModel
`apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift` :
- Query non-vide → fetch direct (pas de cache, comportement actuel)
- Query vide → cache via `profiles` store, cle `"discover:suggestions"`, TTL 5min
- `FriendshipCache` reste orthogonal pour l'etat ami

#### C. BlockedViewModel
`apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift` : store `friends`, cle `"blocked:list"`, pattern complet identique a RequestsViewModel.

#### D. GlobalSearchViewModel — messages search
`apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:151` : cache des **5 dernieres queries** dans le store `messages` avec cle `"search:msg:<sha256(query)[:16]>"`, TTL 2min, LRU. Au-dela des 5, fetch direct sans cache.

#### E. Participants
`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1822` : promotion du fallback en pattern complet via `loadWithCacheFirst`.

### 5.4 Hors scope explicite

- **StoryViewModel partiel** : chantier actif (PR #224 mergee 2026-05-07, story timeline editor en evolution). On ne touche pas pour eviter conflits.
- **Notifications ViewModel** : aucun ecran iOS l'utilise (seulement `NotificationSettingsView` qui est un panneau parametres). Hors scope tant qu'aucune UI ne le consomme.

### 5.5 Tests

5 ViewModels × 4 tests + 2 tests helper = 22 tests :
- `test_load_withCachedFreshData_doesNotFetch`
- `test_load_withCachedStaleData_displaysImmediatelyAndRefreshesInBackground`
- `test_load_withEmptyCache_showsLoadingThenLoaded`
- `test_load_offlineWithStaleData_keepsDisplayingCache`
- `test_loader_revalidateTask_cancelsOnViewModelDeinit` (helper)
- `test_loader_concurrentLoads_lastApplyWins` (helper)

### 5.6 Acceptance criteria

1. Sur chaque ecran cible, retour depuis arriere-plan affiche les donnees instantanement (zero spinner si cache existe)
2. Sur chaque ecran cible, mode avion → donnees stale visibles, pas de message d'erreur intrusif
3. Pas de duplication de logique : tous les VMs utilisent `loadWithCacheFirst`

---

## 6. Phase 4 — Offline queue durcie et clientMessageId end-to-end

### 6.1 Fix bug drop multi-message

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:sendMessage` :

```swift
@MainActor
func sendMessage(_ content: String, attachments: [Attachment] = []) async -> Bool {
    guard !isInputLocked else { return false }
    isInputLocked = true
    defer { isInputLocked = false }

    // UUID Swift produit des MAJUSCULES par defaut. La regex Zod serveur
    // accepte uniquement [a-f0-9]. .lowercased() est OBLIGATOIRE.
    let clientMessageId = "cid_\(UUID().uuidString.lowercased())"
    let optimistic = makeOptimisticMessage(content: content, clientMessageId: clientMessageId, ...)

    // 1. Optimistic UI — synchrone
    messages.append(optimistic)

    // 2. Persist local — await, propage erreurs
    do {
        try await persistOptimisticAtomically(optimistic)
    } catch {
        messages.removeAll { $0.clientMessageId == clientMessageId }
        Logger.messages.error("Failed to persist optimistic: \(error)")
        showError(.persistenceFailed)
        return false
    }

    // 3. Branchement online/offline — APRES persistance
    if NetworkMonitor.shared.isOffline || !MessageSocketManager.shared.isConnected {
        do {
            try await OfflineQueue.shared.enqueue(makeQueueItem(clientMessageId, ...))
            return true
        } catch {
            await markOptimisticAsFailed(clientMessageId, reason: error)
            return false
        }
    }

    // 4. Online send — Task non detachee
    Task { await self.sendOnline(clientMessageId: clientMessageId, ...) }
    return true
}
```

**Changements clefs** :
- `isInputLocked` guard immediat partage online/offline
- `persistOptimisticAtomically` : un seul `db.write` qui INSERT a la fois `Message` (status `.sending`) et `OutboxRecord` (status `.pending`) en meme transaction
- Tous les `try?` remplaces par `try` propages
- `OfflineQueue.enqueue` devient `throws async`
- `Logger.error` sur chaque chemin d'erreur
- `clientMessageId` **toujours en lowercase** (`UUID().uuidString.lowercased()`) — Swift produit des majuscules par defaut, mais le contrat serveur exige `[a-f0-9]`

### 6.1.1 Boot recovery des OutboxRecord en `.sending`

Si l'app crash pendant qu'un message est en cours d'envoi, son `OutboxRecord` reste en statut `.sending` avec `attempts > 0`. Sans recovery, le record est ignore par le `OutboxFlusher` (qui ne traite que `.pending`) → message coince eternellement.

**Boot sequence** dans `MeeshyApp.swift` :

```swift
Task.detached {
    // Etape 1 : recovery — reset .sending → .pending
    try? await pool.write { db in
        try db.execute(sql: """
            UPDATE outbox_records
            SET status = ?, last_error = ?
            WHERE status = ?
        """, arguments: [
            OutboxStatus.pending.rawValue,
            "Reset on boot after presumed crash",
            OutboxStatus.sending.rawValue
        ])
    }

    // Etape 2 : flush normal
    let flusher = OutboxFlusher(pool: pool, dispatcher: OutboxDispatcher())
    await flusher.flush()
}
```

Le `clientMessageId` etant idempotent end-to-end (cf. 6.2), un message qui a effectivement ete recu par le serveur avant le crash sera dedupe au replay — pas de doublon.

### 6.1.2 OfflineQueue declaree comme actor

Pour respecter Swift 6 strict concurrency, `OfflineQueue` doit etre un `actor` explicite (pas une classe singleton avec lock manuel) :

```swift
public actor OfflineQueue {
    public static let shared = OfflineQueue()
    private var items: [OfflineQueueItem] = []
    private let outboxPool: DatabasePool
    // ...
}
```

`OfflineQueueItem` doit etre `Sendable` (struct avec uniquement value types). `OutboxRecord` egalement.

### 6.2 clientMessageId end-to-end

#### Etat existant a fixer
- WebSocket : champ deja accepte mais `optional()` (`services/gateway/src/validation/socket-event-schemas.ts:14`) — a passer en obligatoire
- ACK socket : retourne deja le champ (existant, garder)
- Broadcast `message:new` : **volontairement sans clientMessageId** (privacy-preserving, garder ce design)
- Persistance DB : absente — a ajouter
- Dedup : absente — a ajouter
- Cote web : envoi optionnel deja en place (`apps/web/services/socketio/messaging.service.ts`) — a rendre obligatoire
- Cote iOS : envoi absent — a ajouter
- Route REST `POST /messages` : champ absent — a ajouter

#### Format
`cid_<UUID v4>` — prefixe pour distinguer des MongoDB ObjectIds (24 hex) et anciens tempIds locaux. Le format actuel cote web est libre (`client-temp-abc` dans les tests) — **on standardise tous les clients sur le prefixe `cid_`** au moment du shipping.

#### Contrat shared
`packages/shared/types/messages.ts` :

```typescript
export type SendMessageRequest = {
    content: string;
    clientMessageId: string;  // OBLIGATOIRE — minLength 5, maxLength 64
    originalLanguage?: string;
    replyToId?: string;
    attachmentIds?: string[];
    // ...
};
```

Validation Zod gateway (REST + WS unifies) :
```typescript
clientMessageId: z.string().regex(/^cid_[a-f0-9-]{36}$/)  // strict
```

Migration : `services/gateway/src/validation/socket-event-schemas.ts:14` passe de `optional()` a `regex(...)`.

#### Gateway — pattern catch-on-conflict (atomique)
`services/gateway/src/routes/messages.ts` (POST) + `services/gateway/src/socketio/message-handler.ts` (event `message:send-with-attachments`) :

**Le pattern `findUnique → INSERT` n'est PAS atomique** : deux requetes concurrentes avec le meme `clientMessageId` (retry reseau rapide, deux onglets web) passent toutes deux le `findUnique` avec `null`, puis l'une echoue sur la contrainte unique MongoDB → `PrismaClientKnownRequestError P2002`. Solution : INSERT direct + catch P2002.

```typescript
async function createMessageIdempotent(
    conversationId: string,
    clientMessageId: string,
    payload: SendMessagePayload
): Promise<{ message: Message; isDuplicate: boolean }> {
    try {
        const message = await prisma.message.create({
            data: { ...payload, conversationId, clientMessageId },
            include: { translations: true }  // necessaire pour 6.2.1
        });
        return { message, isDuplicate: false };
    } catch (e) {
        if (isPrismaUniqueViolation(e)) {  // e.code === 'P2002'
            const existing = await prisma.message.findUnique({
                where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
                include: { translations: true }
            });
            if (!existing) throw new Error('Race condition: P2002 but no existing record');
            return { message: existing, isDuplicate: true };
        }
        throw e;
    }
}
```

Avantages : 1 round-trip dans le cas normal (vs 2), atomicite garantie par la contrainte unique MongoDB.

#### 6.2.1 Re-translate si dedup hit sans traductions

Si la premiere insertion a reussi mais le PUSH ZMQ vers translator a echoue (translator down), le message en DB n'a pas de traductions. Un dedup hit sans re-push laisse ce message sans traductions indefiniment. Cout du fix : un `if` conditionnel (zero requete supplementaire — `translations` deja inclus via `include`) :

```typescript
const { message, isDuplicate } = await createMessageIdempotent(...);
if (isDuplicate && message.translations.length === 0 && requiresTranslation(message)) {
    // Re-push ZMQ asynchrone (pas attendu, fire-and-track)
    void messageTranslationService.translate(message);
}
```

`requiresTranslation(m)` retourne `true` pour messages texte avec `originalLanguage` set, ou messages avec attachment audio (transcription Whisper).

#### Prisma schema
`packages/shared/prisma/schema.prisma` :

```prisma
model Message {
    // ...
    clientMessageId String? @db.String
    @@unique([conversationId, clientMessageId], name: "conversationId_clientMessageId")
}
```

#### Migration MongoDB
Index unique partiel (uniquement quand `clientMessageId` non-null **et non-vide**) — compatible messages historiques :

```javascript
db.messages.createIndex(
    { conversationId: 1, clientMessageId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            clientMessageId: { $exists: true, $type: "string", $ne: "" }
        }
    }
);
```

#### Reconciliation iOS — ACK socket + broadcast cible vers sender

Le broadcast `message:new` est envoye en mode `io.to(conversationId).except(senderSocketId).emit(...)` aux **autres** membres (sans `clientMessageId`, comme aujourd'hui — privacy preservee). En parallele, le sender recoit son ACK avec le `clientMessageId`.

**Probleme avec ACK seul** : si l'ACK est perdu (timeout reseau, crash applicatif au mauvais moment), l'optimistic reste pending eternellement. Solution recommandee par la review architecture :

**Le sender recoit egalement un broadcast cible incluant `clientMessageId`** via `io.to(senderSocketId).emit('message:new', { ...message, clientMessageId })`. Comme le ciblage est par socket-id et que le payload du sender contient son propre `clientMessageId`, il n'y a pas de leak vers d'autres clients.

```typescript
// Cote gateway, apres createMessageIdempotent :
const broadcastPayload = { ...message };  // sans clientMessageId
const senderPayload = { ...message, clientMessageId };  // avec clientMessageId

io.to(conversationId).except(senderSocketId).emit('message:new', broadcastPayload);
io.to(senderSocketId).emit('message:new', senderPayload);

callback({ success: true, data: { messageId: message.id, clientMessageId } });
```

Cote iOS, la reconciliation a deux entry points :

```swift
socket.emitWithAck("message:send-with-attachments", payload) { ack in
    if let cid = ack.data?.clientMessageId, let serverMessage = ack.data?.message {
        promoteOptimistic(clientMessageId: cid, serverMessage: serverMessage)
    }
}

socket.on("message:new") { messageData in
    if let cid = messageData.clientMessageId {
        // Sender path : reconciliation par clientMessageId
        promoteOptimistic(clientMessageId: cid, serverMessage: messageData)
    } else {
        // Receiver path : insertion classique
        insertNewMessage(messageData)
    }
}

private func promoteOptimistic(clientMessageId: String, serverMessage: APIMessage) {
    guard let idx = messages.firstIndex(where: { $0.clientMessageId == clientMessageId }) else {
        // Optimistic deja promote (l'ACK et le broadcast sont arrives en sequence)
        // ou perdu — fallback : insertion normale
        if !messages.contains(where: { $0.id == serverMessage.id }) {
            insertNewMessage(serverMessage)
        }
        return
    }
    messages[idx] = MeeshyMessage(api: serverMessage, deliveryStatus: .sent)
}
```

Cas du cas REST (offline replay) : la reponse HTTP du POST contient le message complet ; le SDK match par `clientMessageId` du payload envoye, meme code path `promoteOptimistic`.

**Timeout** : si ni ACK ni broadcast n'arrivent dans 5 secondes, l'optimistic bascule en `.failed` avec retry budget `MessageRetryQueue`. Apres 5 retries epuises, etat `.failed` definitif avec retry manuel UI.

La map `pendingServerIds[tempId]` est supprimee. Le `tempId` (`offline_*`) disparait du SDK iOS — `clientMessageId` est l'unique cle de reconciliation.

**UX debounce** : afficher l'icone horloge uniquement apres 200ms de delai (debounce). Sur connexion rapide (<200ms ACK), le message passe directement de "envoi en cours invisible" a "envoye" sans flash de horloge.

#### Cote web (Next.js) — migration en meme PR que backend
`apps/web/services/socketio/messaging.service.ts` :
- `clientMessageId` actuellement optionnel → rendre **obligatoire** pour tous les sites d'appel
- Standardiser le format en `cid_<UUID v4>` (au lieu du format libre actuel)
- Ajouter le meme champ aux appels REST `POST /messages` (si le web a un fallback REST)

`apps/web/services/socketio/orchestrator.service.ts:319` et `apps/web/services/messages.service.ts` : audit complet des sites d'envoi pour s'assurer que tous passent un `clientMessageId` genere localement.

### 6.3 Extension de la queue

#### Edit / delete offline — machine d'etat de coalescing explicite

`apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` : brancher les cases :

```swift
case .editMessage:
    let payload = try decoder.decode(EditMessagePayload.self, from: record.payload)
    try await MessageService.shared.edit(messageId: payload.messageId, content: payload.content)
case .deleteMessage:
    let payload = try decoder.decode(DeleteMessagePayload.self, from: record.payload)
    try await MessageService.shared.delete(messageId: payload.messageId)
```

**Coalescing — machine d'etat** : la review architecture a flag que les sequences `edit-after-delete` n'etaient pas couvertes. On modelise explicitement les transitions dans `OfflineQueue.enqueue`, en regardant les records existants pour le meme `clientMessageId` (uniquement les records non encore envoyes — `status IN (.pending, .sending)`).

Etat actuel de la queue pour `clientMessageId X` | Action enqueue | Resultat
---|---|---
aucun | `sendMessage` | INSERT sendMessage
aucun | `editMessage(serverId)` | INSERT editMessage (cible un message deja sur serveur)
aucun | `deleteMessage(serverId)` | INSERT deleteMessage (idem)
`sendMessage(content=A)` | `editMessage(content=B)` | UPDATE sendMessage payload : `content=B`
`sendMessage` | `deleteMessage` | DELETE sendMessage record (no-op, le message n'existe pas serveur)
`sendMessage(content=A)` + `editMessage(B)` (deja coalesce en `sendMessage(B)`) | `deleteMessage` | DELETE sendMessage (idem)
`sendMessage` | `editMessage(...)` puis `deleteMessage` puis `editMessage(...)` | DELETE sendMessage apres le 1er delete. Le 2eme edit n'a plus de cible → log warning, drop le record (cas pathologique : l'utilisateur edite un message deja delete)
`editMessage(serverId, A)` | `editMessage(serverId, B)` | UPDATE editMessage payload : `content=B`
`editMessage(serverId)` | `deleteMessage(serverId)` | DELETE editMessage record + INSERT deleteMessage (delete prevaut sur edit)

Implementation pseudo-code dans `OfflineQueue.enqueue(_ item: OfflineQueueItem)` :

```swift
public func enqueue(_ item: OfflineQueueItem) async throws {
    try await outboxPool.write { db in
        let existing = try OutboxRecord
            .filter(Column("clientMessageId") == item.clientMessageId)
            .filter([OutboxStatus.pending.rawValue, OutboxStatus.sending.rawValue].contains(Column("status")))
            .order(Column("createdAt").desc)
            .fetchOne(db)

        switch (existing?.kind, item.kind) {
        case (.none, _):
            try OutboxRecord(item).insert(db)

        case (.sendMessage, .editMessage):
            // Fusion : update payload
            try mergeEditIntoSend(db: db, existing: existing!, edit: item)

        case (.sendMessage, .deleteMessage), (.editMessage, .deleteMessage):
            try OutboxRecord.deleteOne(db, key: existing!.id)

        case (.editMessage, .editMessage):
            try mergeEditIntoEdit(db: db, existing: existing!, edit: item)

        case (.editMessage, _):
            // Edit pre-existant + autre action → INSERT (cas rare)
            try OutboxRecord(item).insert(db)

        case (.deleteMessage, .editMessage):
            // Edit-after-delete : drop avec warning
            Logger.queue.warning("editMessage after deleteMessage on \(item.clientMessageId), dropping")

        case (.deleteMessage, _):
            // Tout autre apres delete : ignore
            break

        default:
            try OutboxRecord(item).insert(db)
        }
    }
}
```

Tous les cas sont dans la **meme transaction GRDB** que l'INSERT, donc atomique. Pas de race possible entre le SELECT existing et le INSERT/UPDATE/DELETE final.

#### Reactions offline
`ReactionQueue` est branchee sur `OutboxRecord` au lieu d'avoir son propre stockage en memoire. Nouveau `OutboxKind.reaction` avec payload `{ messageId, emoji, action: add|remove }`.

**Coalescing** : add+remove sur meme emoji s'annulent en queue ; double add est dedupe.

#### Audio offline — pattern write-ahead 2-step (vraie atomicite)

**Important** : `FileManager.moveItem` et `db.write` (GRDB) **ne peuvent PAS etre dans une vraie transaction commune**. Le filesystem et SQLite sont deux systemes de persistance independants. La review architecture a flag ce point comme critical. Solution : pattern write-ahead a 2 etapes documente.

**Etape 1 — Enregistrement** : produit `tmp/recording_<uuid>.m4a` (comportement actuel).

**Etape 2 — Send (sequence atomique a deux phases)** :

```swift
@MainActor
func sendAudioMessage(audioURL: URL, ...) async -> Bool {
    let clientMessageId = "cid_\(UUID().uuidString.lowercased())"
    let pendingPath = "Documents/pending-audio/\(clientMessageId).m4a"

    // Phase A : INSERT OutboxRecord avec status .pending et localAudioPath = pendingPath
    //          (le fichier n'existe pas encore — c'est intentionnel)
    do {
        try await pool.write { db in
            try OutboxRecord(
                id: "ofq_\(clientMessageId)",
                kind: .sendMessage,
                conversationId: conversationId,
                clientMessageId: clientMessageId,
                payload: encodeAudioPayload(localAudioPath: pendingPath, ...),
                status: .pending,
                ...
            ).insert(db)

            try Message(clientMessageId: clientMessageId, status: .sending, ...).insert(db)
        }
    } catch { /* rollback optimistic UI, return false */ }

    // Phase B : COPY (pas move) le fichier vers pending-audio/
    //           Si crash entre Phase A et Phase B : OutboxRecord existe mais fichier absent.
    //           La recovery au boot detecte cela (file missing) et marque OutboxRecord comme .failed.
    do {
        try FileManager.default.copyItem(at: audioURL, to: URL(fileURLWithPath: pendingPath))
    } catch {
        // OutboxRecord existe mais fichier copy a echoue. Mark comme failed.
        try? await pool.write { db in
            try db.execute(sql: "UPDATE outbox_records SET status = ? WHERE id = ?",
                           arguments: [OutboxStatus.failed.rawValue, "ofq_\(clientMessageId)"])
        }
        return false
    }

    // Phase C : cleanup tmp original (best-effort, non bloquant)
    try? FileManager.default.removeItem(at: audioURL)

    return true
}
```

**Boot recovery** dans `OfflineQueue.bootRecovery()` :

```swift
// Pour chaque OutboxRecord audio en .pending au reboot :
//   Si le fichier reference n'existe pas → mark .failed (perdu)
//   Sinon → laisse en .pending pour le flush normal
let pendingAudioRecords = try await pool.read { db in
    try OutboxRecord.filter(Column("status") == OutboxStatus.pending.rawValue).fetchAll(db)
}
for record in pendingAudioRecords {
    if let path = decodeAudioPath(record.payload),
       !FileManager.default.fileExists(atPath: path) {
        try? await pool.write { db in
            try db.execute(sql: "UPDATE outbox_records SET status = ?, last_error = ? WHERE id = ?",
                           arguments: [OutboxStatus.failed.rawValue, "Audio file missing after crash", record.id])
        }
        Logger.queue.warning("Audio file missing for OutboxRecord \(record.id), marked failed")
    }
}
```

**Au flush** : le dispatcher fait :
1. Verifier que `localAudioPath` existe sur disque (sinon `OutboxStatus.failed`, log)
2. TUS upload du fichier local → recoit `attachmentId` serveur (TUS supporte resume natif via `Upload-Offset` ; reprise transparente apres coupure)
3. POST `/messages` avec `attachmentIds: [<id>]` + `clientMessageId` + `originalLanguage` (pour pipeline Whisper transcription)
4. Apres `OutboxStatus.sent` : `try? FileManager.default.removeItem(atPath: localAudioPath)` (best-effort)

Si `OutboxRecord` archive (max retry budget atteint), le fichier reste sur disque jusqu'a un cleanup explicite (action UI "supprimer le brouillon") ou un nettoyage de fond (`OfflineQueue.cleanupOrphanFiles()` qui scan `Documents/pending-audio/` et supprime les fichiers sans `OutboxRecord` correspondant — execute mensuellement).

**Note performance** : copy 5MB sur meme volume = ~50-200ms (pas un rename atomique inode car on doit garder le tmp en cas de retry de l'utilisateur). Sur SSD iPhone moderne, latence acceptable pour l'UX d'envoi audio.

#### Idempotence du dispatcher
`OutboxRecord.status` cycle : `pending → sending → sent → archived`. Le passage a `sending` se fait via UPDATE atomique au debut de la tentative. Au retour :
- succes → `sent`
- echec → retour a `pending` avec `lastError` + `nextAttemptAt = now + backoff`

Plus de risque de double-dispatch grace a la transaction GRDB.

### 6.4 Tests

**iOS** :
- `test_offlineSend_10concurrentMessages_allPersistedAndDisplayed`
- `test_offlineSend_persistenceFails_optimisticRolledBack`
- `test_socketBroadcast_matchesByClientMessageId_promotesOptimistic`
- `test_audioOffline_tusInterrupted_resumesOnReconnect`
- `test_editAfterOfflineSend_coalesceInQueue`
- `test_deleteAfterOfflineSend_cancelsQueueItem`
- `test_outboxStatus_failedAttempt_reentersPendingWithBackoff`
- `test_reactionAddThenRemove_coalescedToNoop`

**Gateway** :
- `test_postMessage_sameClientMessageId_returnsSameMessageNoDuplicate`
- `test_postMessage_invalidClientMessageIdFormat_400`
- `test_socketSend_sameClientMessageId_returnsSameMessage`
- `test_existingMessage_dedupHit_doesNotRetranslate`

### 6.5 Acceptance criteria

1. Taper 10 messages texte d'affilee en avion → les 10 apparaissent en bulles avec icone horloge, persistent au kill app, sont envoyes FIFO quand wifi revient
2. 1 audio offline → blob persiste, upload TUS reprend correctement a la reconnexion
3. Meme `clientMessageId` envoye 2× (test : coupure reseau pendant ack) → un seul message en base, retourne identique
4. Edit puis delete offline du meme message pending → flush ne fait rien (annulation locale)
5. App killed pendant qu'un message est en queue → au reboot, l'optimistic est encore visible et flush demarre
6. Aucun message n'est perdu silencieusement : toute erreur de persistance produit un log et un etat UI `.failed` avec retry manuel

---

## 7. Hors scope

- Pagination des messages dans une conversation (deja fonctionnelle)
- Liste de notifications (aucun ecran iOS l'utilise)
- Refonte des stores GRDB (on etend, on ne reecrit pas)
- StoryViewModel cache extension (chantier story timeline actif)
- Tests UI snapshot (cible XCTest unit pour ViewModels et logique pure)
- Refresh des avatars / images / autres ressources binaires (CacheCoordinator deja en place)
- Retroactive backfill de `clientMessageId` sur messages historiques (l'index unique est partiel, ils restent valides)

---

## 8. Acceptance criteria globaux

Au terme des 4 phases :

1. **Tri stale** : la liste des conversations affiche **toujours** l'ordre `lastMessageAt DESC`, en cache et en reseau, des le premier render
2. **Infinite scroll** : pagination cursor-based stable, jusqu'a 500 conversations cachees, immune aux nouvelles conversations en haut
3. **Cache-first universel** : 5 ViewModels supplementaires conformes au pattern stale-while-revalidate ; helper `loadWithCacheFirst` reutilisable pour tous les futurs ViewModels
4. **Offline send fiable** : N messages dans M conversations en mode avion → 100% persistes, FIFO au retour reseau, idempotence garantie meme apres crash applicatif
5. **Idempotence cross-device** : `clientMessageId` end-to-end, dedup native MongoDB par index unique partiel
6. **Operations offline etendues** : reactions, edit, delete, audio supportes hors connexion avec coalescing intelligent

---

## 9. Strategie de tests

### 9.1 Pyramide

| Niveau | Cible | Outil | Volume |
|---|---|---|---|
| Unit | ViewModels (logique pure), helpers cache, coalescing queue | XCTest | ~50 tests |
| Integration SDK | GRDB cache cross-restart, OfflineQueue persistance | XCTest | ~10 tests |
| Integration gateway | Dedup clientMessageId via supertest | Vitest/Jest | ~5 tests |

### 9.2 Mock pattern (apps/ios/CLAUDE.md)
- `MockConversationService` conforme a `ConversationServiceProviding`
- `MockOutboxDispatcher` conforme a `OutboxDispatching`
- Properties : `var {method}Result: Result<T, Error>`, `var {method}CallCount: Int`, `func reset()`

### 9.3 Convention nommage
`test_{method}_{condition}_{expectedResult}` strict.

### 9.4 Couverture target
- Phase 1 : 100% des branches `setConversations`/`appendConversations`
- Phase 2 : 100% du `loadMore`, edge cases (concurrent, hasMore=false, error)
- Phase 3 : 4 tests par VM × 5 VMs
- Phase 4 : 100% des chemins persistance (succes + echec) + dedup serveur

### 9.5 Build gate
`./apps/ios/meeshy.sh test` doit passer avant tout commit (per `apps/ios/CLAUDE.md`).

---

## 10. Risques et mitigation

### 10.1 Migration MongoDB index unique partiel

**Risque** : si des messages historiques ont accidentellement `clientMessageId = ""` (string vide), l'index uniquement partiel basé sur `$exists: true, $type: "string"` les inclut et un doublon vide casse l'index.

**Mitigation** :
- Avant creation de l'index, script de validation : `db.messages.find({ clientMessageId: "" })` doit retourner zero document
- Ajouter `clientMessageId: { $ne: "" }` au `partialFilterExpression`
- Migration en deux temps : (1) deploy schema sans contrainte unique, observer 24h, (2) ajout contrainte unique

### 10.2 Compatibilite anciens clients (iOS et web)

**Risque** : un client pre-Phase-4 envoie `SendMessageRequest` sans `clientMessageId`. Si le serveur exige le champ, requete rejetee.

**Decision** : **strict d'emblee.** Le projet est pre-launch (cf. memoire projet `StoryTimelineFeatureFlag DROPPED` 2026-05-07 — pas de retrocompat soft sur breaking changes). On ship `clientMessageId` obligatoire serveur ET client en meme deploiement.

**Migration coordonnee dans la meme PR backend** :
- Gateway : valide `clientMessageId` obligatoire (REST + WS), persiste, dedup
- Web (Next.js) : passe son `clientMessageId` deja present de `optional` a `obligatoire` pour tous les sites d'envoi, standardise le format `cid_<uuid>`
- Prisma + migration MongoDB : index unique partiel
- Aucun client n'envoie sans clientMessageId au moment du deploiement → pas de regression

**Mitigation operationnelle** : si l'audit revele un site d'appel oublie cote web (par exemple un fallback REST mal documente), deployer le backend en mode "warning logs only" (accepte sans `clientMessageId`, log une alerte) pendant 24h pour detecter, puis bascule en strict.

### 10.3 Regression visuelle pagination

**Risque** : le tri central de Phase 1 + l'append de Phase 2 changent l'ordre d'affichage des sections grouped (Today / Yesterday / This week / Older).

**Mitigation** : test snapshot manuel avant/apres sur 3 datasets : 5 convs, 30 convs, 200+ convs (apres scroll loadMore). Verifier l'ordre des sections et l'ordre intra-section.

### 10.4 Race entre OfflineQueue.flush et arrivee socket `message:new`

**Risque** : pendant le flush au retour reseau, le serveur broadcast `message:new` qui arrive avant que le POST result soit traite localement. Sans `clientMessageId`, on a un doublon transitoire.

**Mitigation** : le serveur emet le broadcast **uniquement apres** avoir confirme l'idempotence (en cas de hit dedup, pas de broadcast). Cote iOS, le matching `clientMessageId` resout le cas trivial.

### 10.5 Coalescing edit/delete : etat de la queue inconsistant

**Risque** : `enqueue(.editMessage)` puis `enqueue(.deleteMessage)` sur un message pending → si le coalescing n'est pas atomique, on peut envoyer un edit puis delete au serveur (deux roundtrips inutiles).

**Mitigation** : `OfflineQueue.enqueue` execute le merge dans la meme transaction GRDB que l'INSERT. Toute lecture/modification de la queue est seriealisee (le pool est single-writer).

---

## Annexe A — Inventaire des fichiers touches

### apps/ios/
- `Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (Phases 1, 2)
- `Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (Phases 1, 4)
- `Meeshy/Features/Main/Services/OutboxDispatcher.swift` (Phase 4)
- `Meeshy/Features/Contacts/RequestsViewModel.swift` (Phase 3)
- `Meeshy/Features/Contacts/DiscoverViewModel.swift` (Phase 3)
- `Meeshy/Features/Contacts/BlockedViewModel.swift` (Phase 3)
- `Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift` (Phase 3)
- `Meeshy/Features/Main/Views/ConversationListView.swift` (ou equivalent — Phase 2)
- `MeeshyTests/Unit/ViewModels/*Tests.swift` (toutes phases)

### packages/MeeshySDK/
- `Sources/MeeshySDK/Services/ConversationService.swift` (Phase 2)
- `Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` (Phase 1)
- `Sources/MeeshySDK/Persistence/OfflineQueue.swift` (Phase 4)
- `Sources/MeeshySDK/Persistence/OutboxRecord.swift` (Phase 4)
- `Sources/MeeshySDK/Persistence/ReactionQueue.swift` (Phase 4)
- `Sources/MeeshySDK/Models/MessageModels.swift` (Phase 4 — ajout clientMessageId)
- `Sources/MeeshySDK/Cache/LoadState.swift` (Phase 3 — consolidation)
- `Sources/MeeshyUI/Cache/CacheFirstLoader.swift` (Phase 3 — nouveau)
- `Tests/MeeshySDKTests/*Tests.swift`

### services/gateway/
- `src/routes/messages.ts` (Phase 4 — dedup REST)
- `src/socketio/message-handler.ts` (Phase 4 — dedup WS)
- `src/services/MessageSocketManager.ts` (Phase 4 — flow envoi)
- `src/services/MessageTranslationService.ts` (Phase 4 — skip retranslate sur dedup)
- `src/validation/socket-event-schemas.ts` (Phase 4 — clientMessageId obligatoire)
- `src/socketio/__tests__/message-ack.test.ts` (Phase 4 — etendre tests dedup)
- Tests integration nouveaux : `src/routes/__tests__/messages-dedup.test.ts`, `src/socketio/__tests__/message-dedup.test.ts`

### packages/shared/
- `types/messages.ts` (Phase 4 — clientMessageId obligatoire)
- `types/socketio-events.ts` (Phase 4 — payload `message:send-with-attachments`)
- `prisma/schema.prisma` (Phase 4 — champ + index unique partiel)
- `prisma/migrations/<timestamp>-add-clientMessageId/migration.sql` ou script MongoDB (Phase 4)

### apps/web/ (Phase 4 — migration coordonnee)
- `services/socketio/messaging.service.ts` (clientMessageId optionnel → obligatoire)
- `services/socketio/orchestrator.service.ts` (idem)
- `services/socketio/types.ts` (typage)
- `services/conversations/messages.service.ts` (REST POST avec clientMessageId)
- `services/messages.service.ts` (idem si point d'entree principal)
- Audit complet de tous les sites d'envoi pour aligner sur `cid_<uuid>` standardise

---

## Annexe B — Memoire projet relevante

- `MEMORY.md` : "iOS Build" → utiliser `./apps/ios/meeshy.sh` exclusivement
- `feedback_ios_pagination_via_viewmodel.md` : older-message pagination MUST call ConversationViewModel.loadOlderMessages — **ce spec etend ce principe a la pagination des conversations elles-memes**
- `feedback_swift6_concurrency_pitfalls.md` : `@MainActor` strict sur ViewModels, pas de `Task.detached` pour la persistance critique (applique en Phase 4)
- `MEMORY.md` : pre-launch app, pas de retrocompat soft sur breaking changes (donc Phase 4 peut shipper la version stricte du clientMessageId si l'audit gateway le confirme)

---

**Fin du design document.**
