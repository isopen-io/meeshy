# iOS Conversation List, Cache-First Coverage & Offline Queue Hardening — Design

**Date:** 2026-05-08
**Scope:** apps/ios + packages/MeeshySDK + services/gateway + packages/shared (Prisma) + apps/web (Phase 4 uniquement, pour la migration coordonnee de `clientMessageId`)
**Objectif:** corriger trois bugs critiques (tri stale, drop multi-send offline, perte d'erreurs silencieuse), ajouter la pagination infinite scroll cursor-based des conversations, etendre le pattern cache-first stale-while-revalidate aux 5 ViewModels qui y derogent, durcir l'envoi offline (idempotence end-to-end via `clientMessageId`, edit/delete/reactions/audio offline robustes).

**Spec amendee 2026-05-08 (post audit code)** : corrections appliquees apres verification ligne-par-ligne du code source.
- Cursor pagination = conversation **ID** (pas timestamp ISO8601). Le SDK iOS stocke `nextCursor: String?`
- ACK socket `_sendResponse()` (`MessageHandler.ts:861-878`) NE retourne pas `clientMessageId` — a ajouter (le test gateway decrit un contrat non implemente)
- `OutboxStatus` reels = `pending/inflight/failed/exhausted` (pas `sending/sent/archived`)
- `OutboxKind.sendReaction` existe deja, mais `ReactionQueue` stocke en JSON file separe — refonte sur OutboxRecord
- `OfflineQueue.enqueue` actuellement async non-throws (OfflineQueue.swift:115) — passe en `async throws`
- `MessageTranslation` est un Json field embedded dans `Message.translations`, pas une relation Prisma — pas de `include: { translations: true }`
- **Route REST POST existe** : `POST /conversations/:id/messages` (`services/gateway/src/routes/conversations/messages.ts:1191`) — fallback REST legitime du WS, partage le meme `MessagingService.handleMessage`. Egalement `POST /links/:identifier/messages` (links/messages.ts:27) et `POST /links/:identifier/messages/auth` (links/messages.ts:302) pour le chat anonyme via lien. Toutes a aligner sur `clientMessageId`
- Pas de `LoadState` enum existant — a creer ex nihilo
- Cache GRDB actuel = table `cache_entries(key, itemId, encodedData)` generique ; le store conversations evolue vers row-per-conversation via migration v5

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

`ConversationListViewModel.reloadFromCache()` (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:227-235`) et `loadMore()` (lignes 469-505) assignent les donnees du cache directement a `@Published var conversations` **sans appliquer de tri**.

Le tri intra-section EST applique en aval, mais asynchroniquement, dans la **methode static** `groupConversations()` (lignes 159-210), declenchee via le pipeline Combine `CombineLatest4($conversations, $searchText, $selectedFilter, $userCategories)` (lignes 111-127). Cela signifie :
1. `conversations` lui-meme n'est jamais trie a la source — tout consommateur direct (binding UI prematuree, screenshot, autres VMs) voit l'ordre brut SQLite
2. Le pipeline produit un etat transitoire ou `groupedConversations` peut etre vide/decale pendant ~1 frame entre l'assignation `conversations = data` et le re-emit de CombineLatest
3. Sites d'ecriture directe a `conversations` sans tri : L231, L401, L405, L415, L448, L502 (`append(contentsOf:)` du loadMore)

Cause adjacente : `ConversationSyncEngine.syncSinceLastCheckpoint` (ligne 350 — `cache.conversations.save(merged, for: "list")`) reconstruit la liste cachee sans tri final ; `merged` preserve l'ordre d'insertion (append apres dedup par `firstIndex`), pas un tri par `lastMessageAt`.

### 1.2 Bug 2 — Messages multiples en envoi offline silencieusement perdus

`ConversationViewModel.sendMessage()` (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1305+`) presente trois defauts cumules :

- `guard !isSending else { return false }` (ligne 1305) protege uniquement le path online (`isSending = true` ligne 1415 environ). En offline, on `return true` ligne 1399 sans jamais positionner le flag. Plusieurs `Task` partent en parallele.
- Persistance fire-and-forget non awaited :
  - `Task { await OfflineQueue.shared.enqueue(queueItem) }` (ligne 1317) — `OfflineQueue.enqueue` est actuellement `public func enqueue(_ item: OfflineQueueItem) async` non-throws (cf. `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift:115`). La signature doit passer en `async throws` (cf. §6.1)
  - `Task.detached(priority: .utility) { try? await persistence.insertOptimistic(...) }` (ligne 1370)
  - `Task.detached(priority: .utility) { await CacheCoordinator.shared.messages.mergeUpdate(...) }` (ligne 1375)
- Erreurs avalees par `try?` partout (`OfflineQueue.writeToOutbox` ligne 230 ; `insertOptimistic` ligne 1370). Toute erreur GRDB sur lock SQLite -> message evapore sans trace.

**Generation de tempId inconsistante** : la base existante utilise 3 prefixes selon le path :
- `temp_<uuid>` (online optimistic, ConversationViewModel:1449)
- `offline_<uuid>` (OfflineQueue, OfflineQueue.swift:34)
- `retry_<uuid>` (MessageRetryQueue, MessageRetryQueue.swift:35)

La map `pendingServerIds: [String: String]` (ConversationViewModel:221, set ligne 1552 environ) traduit `tempId → serverId` apres ACK. Phase 4 unifie tout sur `clientMessageId` au format `cid_<uuid lowercase>` et supprime les 3 prefixes locaux.

Symptome utilisateur : le 1er message apparait avec icone horloge, les suivants disparaissent (ni dans l'UI, ni dans le cache, ni dans la queue).

### 1.3 Bug 3 — Pas de pagination cote iOS

`ConversationListViewModel.loadMore()` (lignes 469-505) existe mais utilise `offset` (vulnerable aux decalages quand de nouvelles conversations arrivent pendant le scroll), avec un cap dur `autoLoadCap = 1000` (ligne 50). Le cache n'est pas mis a jour pour les pages 2+. La route gateway `GET /conversations` supporte deja `before` + `limit` (`services/gateway/src/routes/conversations/core.ts:99-519`), mais le SDK (`ConversationService.list(offset:limit:)`) ne l'exploite pas.

**Format reel du cursor** (verifie `core.ts:147,194-200`) : `before` est un **conversation ID** (24-char ObjectId), pas un timestamp ISO8601. Le gateway fait `findFirst({ id: before })` puis applique `whereClause.lastMessageAt = { lt: cursor.lastMessageAt }`. Le `nextCursor` retourne dans `cursorPagination` est l'ID de la derniere conversation de la page (`resultCount > 0 ? lastItemId : null`), pas un timestamp.

Cela impose au SDK iOS de stocker le cursor comme `String?` (ID opaque), pas `Date?`.

### 1.4 Audit cache-first — 5 ViewModels en breche

| ViewModel | Etat | Localisation |
|---|---|---|
| RequestsViewModel (friend requests received/sent) | Manquant | `apps/ios/Meeshy/Features/Contacts/RequestsViewModel.swift:29` |
| DiscoverViewModel (recherche utilisateurs) | Manquant | `apps/ios/Meeshy/Features/Contacts/DiscoverViewModel.swift:44` |
| BlockedViewModel (utilisateurs bloques) | Manquant | `apps/ios/Meeshy/Features/Contacts/BlockedViewModel.swift:20` |
| GlobalSearchViewModel (recherche messages) | Partiel | `apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift:151` |
| Participants (membres conversation) | Partiel | `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift:1822` |

### 1.5 Audit offline queue — operations manquantes ou fragiles

- **OutboxKind reel** : `sendMessage`, `sendReaction`, `editMessage`, `deleteMessage` (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift:4-8`) — donc `sendReaction` existe **deja** comme kind, contrairement a ce qu'une lecture rapide suggere
- **OutboxStatus reel** : `pending`, `inflight`, `failed`, `exhausted` (OutboxRecord.swift:11-15) — pas `pending → sending → sent → archived`. Le boot recovery (cf. §6.1.1) doit donc reset `inflight → pending`, pas `sending → pending`
- **Reactions offline** : `ReactionQueue` (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionQueue.swift`) est un `actor` (ligne 68) avec stockage **separe** (in-memory + JSON file), **pas** branche sur `OutboxRecord`/GRDB. Bien que `OutboxKind.sendReaction` existe, `OutboxDispatcher.dispatch` ne le traite pas et `ReactionQueue.enqueue` n'ecrit pas de OutboxRecord. Phase 4 : refonte du flow reaction pour passer par OutboxRecord (suppression du stockage JSON file)
- **Edit message offline** : `OutboxKind.editMessage` existe mais `OutboxDispatcher.swift:22-28` est no-op pour ce cas (et `deleteMessage` aussi)
- **Delete message offline** : idem, no-op
- **Audio offline** : upload TUS synchrone bloquant ; `attachmentId` peut etre invalide si reseau coupe pendant l'upload
- **Idempotence cross-device** : `clientMessageId` est partiellement cote contrat mais **pas implemente cote serveur ni iOS** :
  - Cote contrat WebSocket : `services/gateway/src/validation/socket-event-schemas.ts:14,26` valide `clientMessageId: z.string().optional()` (optionnel) sur `SocketMessageSendSchema` ET `SocketMessageSendWithAttachmentsSchema`
  - **Cote ACK actuel** : `MessageHandler._sendResponse()` (`services/gateway/src/socketio/handlers/MessageHandler.ts:861-878`) retourne **uniquement** `{ success: true, data: { messageId: response.data.id } }`. Le `clientMessageId` n'est **PAS** retourne, contrairement a ce que decrit `services/gateway/src/socketio/__tests__/message-ack.test.ts:45-50`. **Le test decrit un contrat NON IMPLEMENTE**. Phase 4 doit modifier `_sendResponse()` pour propager `clientMessageId` dans l'ACK
  - Cote broadcast : `broadcastNewMessage()` (MessageHandler.ts:388-451) ne transmet jamais `clientMessageId` — comportement correct (privacy-preserving), a conserver
  - Cote web (Next.js) : `clientMessageId` est genere via `crypto.randomUUID()` au niveau du composant (`ConversationLayout.tsx:618`), propage via `useSocketIOMessaging` → `meeshySocketIOService` → `SocketIOOrchestrator` → `MessagingService.sendMessage()` (lignes 221-325). **Format actuel : UUID v4 nu, sans prefixe `cid_`.** Inclusion conditionnelle ligne 254 : `...(clientMessageId && { clientMessageId })`. Migration Phase 4 : standardisation au format `cid_<uuid>`
  - Cote web fallback REST : `MessagingService.sendMessageViaRest()` (messaging.service.ts:379-406) NE propage PAS `clientMessageId` — gap a fixer
  - Cote web anonymous : `apps/web/services/anonymous-chat.service.ts:117` est REST-only et ne propage pas non plus
  - Cote iOS : RIEN — le `tempId` (3 variantes) est purement local SDK iOS, jamais transmis au backend
  - Cote DB : pas de champ `clientMessageId` en Prisma (`packages/shared/prisma/schema.prisma:515-644` confirme l'absence), pas d'index unique
  - Cote dedup : aucune. Si un message est rejoue, le serveur cree un doublon
  - **Routes REST POST existantes** (correction apres revue : audit initial superficiel — recherche par `POST /messages` global manquait les routes nestees) :
    - `POST /conversations/:id/messages` (`services/gateway/src/routes/conversations/messages.ts:1191`) — body type `SendMessageBody` (defini `services/gateway/src/routes/conversations/types.ts:23-44`), schema Fastify body lignes 1206-1225, handler appelle `MessagingService.handleMessage` (meme service que WS) puis `socketIOHandler.broadcastMessage()` pour emit `MESSAGE_NEW`. **Aucun `clientMessageId`** dans le contrat actuel.
    - `POST /links/:identifier/messages` (`services/gateway/src/routes/links/messages.ts:27`) — chat anonyme via lien partage, schema Zod `links/types.ts:54-62`. Pas de clientMessageId.
    - `POST /links/:identifier/messages/auth` (`links/messages.ts:302`) — chat authentifie via lien partage. Pas de clientMessageId.
  - **Pipeline REST = pipeline WS** : meme `MessagingService.handleMessage` partage. La dedup `catch P2002` (cf. §6.2) couvre les deux surfaces nativement, sans logique dupliquee. Le fallback REST web (`MessagingService.sendMessageViaRest`) cible cette route — c'est un fallback **legitime**, pas une surface a deprecier. Phase 4 aligne donc REST + WS sur `clientMessageId` simultanement.

### 1.6 Audit shared types

- `SendMessageRequest` (`packages/shared/types/index.ts:653`) : interface TypeScript **sans** `clientMessageId`, **sans** schema Zod associe
- `SocketIOMessage` broadcast (`packages/shared/types/socketio-events.ts:957-971`) : pas de `clientMessageId` (correct, a conserver)
- `MessageSendWithAttachmentsData` (socketio-events.ts:883) : pas de `clientMessageId` dans le contrat shared (mais le gateway l'accepte via Zod optional)
- `MessageTranslation` : **n'est pas un model Prisma separe** — c'est un champ `Json` embedded dans `Message.translations` (schema.prisma:515-644). Format : `{ "en": { text, translationModel, ... }, "es": {...} }`. **Implication directe** : le code spec `prisma.message.create({ data: ..., include: { translations: true } })` est **invalide Prisma** car `translations` est un scalar Json, pas une relation. Il faut juste lire `message.translations` (toujours present)
- `MessageAttachment` (schema.prisma:649-848) : model distinct, lie a Message via `messageId` FK nullable. Pour audio : champs `transcription: Json?`, `translations: Json?`, `duration`, `codec`, `sampleRate`, `channels`
- `resolveUserLanguage` (`packages/shared/utils/conversation-helpers.ts:10-19`) : existe et fonctionne — utilise pour le Prisme Linguistique
- `client-message-id.ts` : **n'existe pas**, a creer (Phase 4)

---

## 2. Architecture globale et phasage

Quatre phases independantes, mergeable separement :

| Phase | Sujet | Backend impacte | Risque | Effort |
|---|---|---|---|---|
| 1 | Fix tri stale conversations | Non | Faible | XS (~80 LoC + 3 tests) |
| 2 | Pagination infinite scroll cursor-based | Non (route prete) | Moyen | M (~250 LoC + 6 tests) |
| 3 | Cache-first sur 5 ViewModels en breche | Non | Moyen | M (~400 LoC + 20 tests) |
| 4 | Offline queue durcie + clientMessageId end-to-end (iOS + gateway REST + WS + Prisma + web) | Oui (Prisma + MessagingService dedup + REST + WS schemas + web migration) | Eleve | L (~900 LoC iOS + ~350 LoC gateway + ~250 LoC web + 32 tests) |

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

### 3.0 Etat existant a preserver

`ConversationListViewModel` actuel :
- `groupedConversations: [ConversationSection]` est deja un `@Published var` (ligne 27)
- Pipeline existant `CombineLatest4($conversations, $searchText, $selectedFilter, $userCategories)` (lignes 111-127) → declenche `groupConversations()` (methode static lignes 159-210) → reassigne `groupedConversations`
- `groupConversations()` static applique le tri intra-section : L166-169, L186, L192-195, L206 (`sorted { a, b in a.lastMessageAt > b.lastMessageAt }`)
- Flags concurrence existants : `isLoadingMore` (L14), `hasMore: Bool` non-published (L21), `currentOffset` (L51)
- Pas de socket `message:new` listener — les nouveaux messages externes arrivent uniquement via `conversationUpdated` event qui ne touche que titre/avatar (L270-282)

**On garde le pipeline `CombineLatest4` + `groupConversations()` static** (cela couvre les filters + categories). On ajoute un tri **a la source** sur `conversations` pour resoudre le bug.

### 3.1 Modifications iOS

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` :

```swift
@Published private(set) var conversations: [MeeshyConversation] = []
// groupedConversations existant inchange — alimente par CombineLatest4 + groupConversations()

private func setConversations(_ items: [MeeshyConversation]) {
    conversations = items.sorted { $0.lastMessageAt > $1.lastMessageAt }
}

private func appendConversations(_ items: [MeeshyConversation]) {
    let merged = (conversations + items).deduplicatedById()
    setConversations(merged)
}

/// Move single conversation to top — O(n) instead of O(n log n) full re-sort.
/// Used when a socket message:new arrives for an existing conversation.
/// Requires `MeeshyConversation.lastMessageAt` to be `var` (mutable) — to confirm
/// in `packages/MeeshySDK/Sources/MeeshySDK/Models/`. If the type is immutable,
/// use `MeeshyConversation(other: existing, lastMessageAt: newDate)` copy-init helper.
private func bumpToTop(conversationId: String, newLastMessageAt: Date) {
    guard let idx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
    var updated = conversations[idx]
    updated.lastMessageAt = newLastMessageAt  // requires var, see note above
    conversations.remove(at: idx)
    conversations.insert(updated, at: 0)
    // groupedConversations sera recomputed automatiquement via CombineLatest4
}
```

**Sites d'ecriture a refactor** (recensement audit) :
- L231 (`reloadFromCache`) → `setConversations(data)`
- L401, L405 (`loadConversations`) → `setConversations(data)`
- L415 (`forceRefresh`) → `setConversations(data)`
- L448 → `setConversations(data)`
- L502 (`loadMore` `append(contentsOf: deduplicated)`) → `appendConversations(deduplicated)`
- L265, L275-280, L288, L296, L304 (mutations propriete d'une conversation) → restent inchanges (ne perturbent pas l'ordre car `lastMessageAt` n'est pas modifie)
- L616, L634 (`isActive`) → idem
- L650 (`remove(at:)`) → idem (reduce, pas insertion)

**Plus aucun assignement direct a `conversations`** (replace_all les `conversations = data`). Le tri etant centralise, le pipeline `CombineLatest4` recoit deja une liste triee → `groupConversations()` applique son tri intra-section sur deja-trie (no-op net) sans regression.

### 3.1.1 Socket listener `message:new` pour bumpToTop

Pas de listener socket actuellement dans `ConversationListViewModel` (audit confirme). On en ajoute un :

```swift
private var socketSubscriptions = Set<AnyCancellable>()

private func subscribeToSocketEvents() {
    MessageSocketManager.shared.newMessageReceived
        .receive(on: DispatchQueue.main)
        .sink { [weak self] payload in
            self?.bumpToTop(conversationId: payload.conversationId,
                            newLastMessageAt: payload.createdAt)
        }
        .store(in: &socketSubscriptions)
}
```

L'inscription se fait dans `init` (apres `super.init` si applicable) ou `onAppear` selon le cycle de vie. Le `PassthroughSubject<NewMessagePayload, Never>` `newMessageReceived` doit exister sur `MessageSocketManager` — verifier ; sinon Phase 1 introduit aussi cette publication. (Note SDK : le socket manager publie deja les events via Combine, il s'agit d'ajouter un selecteur dedie aux conversations list).

**Note performance** : a 1000 conversations, `sorted()` ~0.3-0.8ms — acceptable. A 10k+, le full re-sort devient sensible (5-10ms par event), d'ou l'importance de `bumpToTop` (O(n) lookup + 2 mutations array) pour le hot path socket. Le pipeline `CombineLatest4` se redeclenche automatiquement, ce qui implique une recomputation `groupConversations()` (~5ms a 1000 convs) — acceptable hors scroll, et debounced de fait par le re-emit Combine sur le main run loop.

### 3.2 Modifications SDK

`packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:350` (avant `cache.conversations.save(merged, for: "list")`) : ajouter `.sorted { $0.lastMessageAt > $1.lastMessageAt }` a la sortie du merge. Le cache lui-meme est stocke trie ; tout futur lecteur voit l'ordre canonique.

Idem ligne 279 et 336 (autres sites `cache.conversations.save(merged, for: "list")` dans le sync engine) — auditer toutes les occurrences. Une factorisation `private func saveSorted(_ items: [MeeshyConversation])` dans le sync engine reduit le risque d'oubli.

### 3.3 Tests

`packages/MeeshySDK/Tests/MeeshySDKTests/ConversationListViewModelTests.swift` (creer si n'existe pas) :

- `test_reloadFromCache_unsortedData_returnsListSortedByLastMessageAtDesc`
- `test_loadMore_appendsAndKeepsSortOrder`
- `test_optimisticInsert_newestConversationGoesToTop`

### 3.4 Acceptance criteria

1. Au demarrage froid, `conversations` est trie `lastMessageAt DESC` des la lecture cache stale (avant le fetch reseau)
2. Apres `loadMore`, l'ordre est conserve (pas de "queue" de conversations plus anciennes au milieu de recentes)
3. Quand un nouveau message arrive sur une conversation X, X remonte en position 1 instantanement (via `bumpToTop`)
4. Le pipeline `CombineLatest4 → groupConversations()` continue de fonctionner et reagit aux changements `searchText`, `selectedFilter`, `userCategories` ; aucune regression sur les filtres
5. La recomputation `groupConversations()` est tolerable lors du scroll (debounced naturellement par le re-emit Combine MainActor — pas de jank perceptible a 1000 convs)

---

## 4. Phase 2 — Pagination infinite scroll cursor-based

### 4.1 Choix design : cursor `before` (conversation ID)

Le backend (`services/gateway/src/routes/conversations/core.ts:99-519`) supporte deux modes : offset+limit ET cursor `before`. Le cursor `before` est une **conversation ID** opaque (24-char ObjectId) — le gateway fait `findFirst({ id: before })` puis applique `whereClause.lastMessageAt = { lt: cursor.lastMessageAt }`. Le `nextCursor` retourne dans la reponse est l'ID de la derniere conversation de la page (`cursorPagination.nextCursor: string | null`).

Le cursor est immune aux decalages quand de nouvelles conversations arrivent en haut de la liste pendant le scroll : le filtre par `lastMessageAt` cible la conversation precise referencee par `before`, pas une position indexielle.

### 4.2 Modifications SDK

`packages/MeeshySDK/Sources/MeeshySDK/Services/ConversationService.swift` :

```swift
public func listPage(before cursor: String? = nil, limit: Int = 30) async throws -> ConversationPage {
    var query = "limit=\(limit)"
    if let cursor, !cursor.isEmpty {
        query += "&before=\(cursor)"
    }
    // PaginatedAPIResponse existe deja (Networking/APIClient.swift:48-60)
    // mais conversations utilise actuellement OffsetPaginatedAPIResponse — on bascule
    let response: PaginatedAPIResponse<[APIConversation]> = try await APIClient.shared.get("/conversations?\(query)")
    return ConversationPage(
        items: response.data.map { $0.toMeeshyConversation() },
        nextCursor: response.pagination?.nextCursor,  // String? (conversation ID)
        hasMore: response.pagination?.hasMore ?? false
    )
}

public struct ConversationPage: Sendable {
    public let items: [MeeshyConversation]
    public let nextCursor: String?  // conversation ID, opaque
    public let hasMore: Bool
}
```

**Important** : la reponse gateway expose **les deux** champs `pagination` (offset-based, retro-compat) ET `cursorPagination` (cursor-based). Cf. audit gateway. Le SDK utilise `cursorPagination` ; l'ancienne signature `list(offset:limit:)` reste pour le ConversationSyncEngine actuel jusqu'a sa migration future.

### 4.3 Cache : evolution du schema GRDB

**Etat actuel** (`AppDatabase.swift` migrations v3_unified_cache, v4_drop_legacy_tables) : table generique `cache_entries(key TEXT, itemId TEXT, encodedData BLOB, updatedAt DATETIME)` avec PK composite `(key, itemId)` et index sur `key`. Le store `conversations` ecrit aujourd'hui une seule entree avec `key="conv:list"` et `itemId="list"` contenant un blob JSON unique de la liste entiere — **pas vraiment row-per-conversation**, malgre la table multi-row.

**Changement de format dans la meme table** (pas de nouvelle migration de schema) : le store `conversations` evolue pour ecrire **un row par conversation** dans `cache_entries` :
- `key = "conv:item"` (constant, partage par toutes les conversations cachees)
- `itemId = <conversationId>` (cle PK partielle)
- `encodedData = JSON encoded MeeshyConversation` (un seul element, pas un array)
- `updatedAt = lastMessageAt` (au lieu de "fetched at" pour exploiter l'index naturel)

Pour optimiser le scan trie, on ajoute une **migration v5_cache_entries_sort_index** :

```sql
-- v5_cache_entries_sort_index
CREATE INDEX idx_cache_entries_key_updatedat
    ON cache_entries(key, updatedAt DESC);
```

Cet index permet `SELECT * FROM cache_entries WHERE key = 'conv:item' ORDER BY updatedAt DESC LIMIT 30 OFFSET <n>` en O(log n + page_size).

**Strategie de migration de l'ancien blob `conv:list`** : au boot, si un row `(key='conv:list', itemId='list')` existe, decoder le blob, pour chaque element ecrire un row `(key='conv:item', itemId=<id>, encodedData=<single>, updatedAt=<lastMessageAt>)`, puis supprimer le blob. Operation single-shot dans `AppDatabase.applyMigrations` apres v5. Si la deserialisation echoue (corruption), le blob est efface et on repart d'un cache froid.

Avantages :
- Reads partiels (page d'affichage LIMIT 30 OFFSET n)
- Decode incremental (seules les rows visibles)
- `mergeUpdate` devient INSERT OR REPLACE par row (deja le pattern naturel de la table)
- LRU efficace via `DELETE FROM cache_entries WHERE key='conv:item' AND itemId NOT IN (...)`

**Plafond LRU pragmatique : 2000 conversations cachees.** Au-dela, purge des plus anciennes par `updatedAt` ascendant. 99% des utilisateurs n'atteindront jamais 500. Si l'utilisateur scrolle au-dela des 2000 cachees, les anciennes pages sont re-fetched depuis le backend.

**WAL mode** : verifier le mode actuel d'AppDatabase. Si `DatabaseQueue` actuel, migrer en `DatabasePool` avec `prepareDatabase { try $0.execute(sql: "PRAGMA journal_mode = WAL") }`. Sans WAL, les writes bloquent les reads → jank UI lors d'un fetch reseau pendant scroll. (Audit a faire en debut Phase 2 ; si deja en pool/WAL, no-op).

Procedure de fetch :

1. Lire la page courante via `SELECT encodedData FROM cache_entries WHERE key = 'conv:item' ORDER BY updatedAt DESC LIMIT 30 OFFSET <n>`
2. Merge les nouveaux items via `INSERT OR REPLACE` (un par row)
3. Pas besoin de re-trier en memoire — l'index garantit l'ordre
4. Trigger LRU si count > 2000 : `DELETE FROM cache_entries WHERE key='conv:item' AND itemId IN (SELECT itemId ... ORDER BY updatedAt ASC LIMIT count - 2000)`

**Impact sur CacheStore generic** : le store actuel manipule `key+itemId` mais expose une API `load(for: String)` orientee blob. Phase 2 introduit dans le store conversations une API specifique `loadPage(offset:limit:)` qui contourne la couche generique pour exploiter l'index. La compatibilite descendante est preservee : `load(for: "list")` continue a fonctionner via une vue (assemble une page entiere triee), uniquement utilise par le sync engine pendant son refresh complet.

### 4.4 ViewModel

```swift
@Published private(set) var loadState: LoadState = .idle
@Published private(set) var paginationState: PaginationState = .idle
private var nextCursor: String?  // conversation ID, opaque (cf. §4.1)
@Published private(set) var hasMore: Bool = true  // promote to @Published pour binding UI

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
        let page = try await service.listPage(before: nextCursor, limit: 30)
        appendConversations(page.items)
        nextCursor = page.nextCursor
        hasMore = page.hasMore
        // Mise a jour cache row-per-conversation (cf. §4.3)
        await CacheCoordinator.shared.conversations.upsertRows(page.items)
        paginationState = page.hasMore ? .idle : .exhausted
    } catch {
        paginationState = .error(error.localizedDescription)
    }
}

func pullToRefresh() async {
    nextCursor = nil
    hasMore = true
    paginationState = .idle
    await loadConversations()  // refetch page 1 cursor-less
}
```

`loadState` (defini en Phase 3) reste pour le chargement initial. `paginationState` distinct evite le shimmer global pendant un load more. `hasMore` devient `@Published` pour permettre a la vue de masquer le footer quand exhausted.

Suppression du cap dur `autoLoadCap = 1000` (`ConversationListViewModel.swift:50`) et de `currentOffset` (L51) qui devient obsolete.

**Note `upsertRows`** : nouvelle methode du store conversations exploitant la migration row-per-conversation (§4.3). Signature : `func upsertRows(_ items: [MeeshyConversation]) async`. Implementation : INSERT OR REPLACE par row dans `cache_entries` avec `key='conv:item'`.

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
- **Race nouveau message socket pendant load more** : `bumpToTop` (Phase 1) insere via setter independamment ; le tri central garantit la position correcte
- **Pull-to-refresh** : reset `nextCursor = nil`, `hasMore = true`, refetch page 1 cursor-less (cf. `pullToRefresh()`)
- **Cursor obsolete** : si la conversation referencee par `nextCursor` est supprimee entre deux pages, le gateway retourne 404 sur le `findFirst`. A clarifier cote backend (audit) — soit fallback gracieux (continue avec offset implicite), soit error explicite. Decision attendue : iOS reset `nextCursor` au sentinel et refetch sans cursor (= pull-to-refresh implicite, accepte une duplication transitoire avec dedup par id)

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

**A creer ex nihilo** (audit confirme : aucun `LoadState` enum n'existe actuellement dans le SDK ; les ViewModels gerent un `@Published var isLoading: Bool` ou switch directement sur `CacheResult`). On centralise dans :

`packages/MeeshySDK/Sources/MeeshySDK/Cache/LoadState.swift` (NOUVEAU) :

```swift
public enum LoadState: Equatable, Sendable {
    case idle
    case cachedStale       // affichage cache + refresh bg
    case cachedFresh       // affichage cache, pas de refresh
    case loading           // empty cache, premier fetch
    case loaded            // chargement reseau OK
    case offline           // pas de reseau, cache deja affiche
    case error(String)
}
```

**Compatibilite descendante** : on garde temporairement `@Published var isLoading: Bool` calcule a partir de `loadState` via `var isLoading: Bool { loadState == .loading }` pour ne pas casser les vues actuelles qui bindent dessus. Migration progressive vue par vue.

**TTLs par store** (verifies dans `CacheCoordinator.swift:10-25` + `CachePolicy.swift:50-64`) :

| Store | TTL total | staleTTL | Capacite max |
|---|---|---|---|
| conversations | 24h | 5min | illimitee |
| messages | 6 mois | 2min | 600 items |
| participants | 24h | 5min | illimitee |
| profiles | 1h | 5min | 100 |
| friends | (nouveau) — proposer 24h / 5min stale | — |
| feed, comments, stories | cf. CachePolicy.swift | — |

Pour les nouveaux usages Phase 3 (RequestsViewModel, BlockedViewModel) on utilise le store `friends` deja existant ou on cree un policy si manquant. Les TTLs annonces "5min discover" et "2min search" sont donc des **staleTTL** (au-dela => fetch background), tandis que le TTL total est aligne sur le defaut du store host. Tableau TTL final a verifier en debut Phase 3.

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
    // Note: Task<Void, Never> n'est pas Hashable — on utilise un Array
    private var activeTasks: [Task<Void, Never>] = []

    func load() async {
        let revalidate = await CacheFirstLoader(store: ..., key: ...)
            .load(fetch: { ... }, setLoadState: { [weak self] in self?.loadState = $0 },
                  apply: { [weak self] in self?.items = $0 })
        if let revalidate { activeTasks.append(revalidate) }
    }

    deinit {
        activeTasks.forEach { $0.cancel() }
    }
}
```

Sans cette discipline, un user qui change rapidement d'ecran pendant un revalidate peut accumuler des Tasks zombies qui consomment CPU/network plusieurs secondes.

**Note technique** :
- `Task<Void, Never>` n'est pas `Hashable` par defaut, donc `Set<Task>` ne compile pas — on utilise `[Task<Void, Never>]`. Le coup en O(n) du cancel-all au deinit est negligeable (taille pratique ≤ 3-5 tasks).
- `deinit` n'est pas `@MainActor`-isole. `Task.cancel()` est `Sendable` et thread-safe, donc l'appel cross-isolation est OK.
- En Swift 6 strict, l'acces a `activeTasks` (proprietee `@MainActor`) depuis un `deinit` non-isole emet un warning. Workaround : marquer `nonisolated` la propriete de cancel-list OU utiliser un wrapper `actor TaskBag` partage. Premiere approche prefereable (less ceremony).

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
    let clientMessageId = ClientMessageId.generate()  // helper centralise §6.2
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
- `isInputLocked` guard immediat partage online/offline (renomme depuis `isSending` pour expliciter qu'il s'agit du verrouillage de l'input UI, pas du status reseau)
- `persistOptimisticAtomically` : un seul `db.write` qui INSERT a la fois la trace optimistic (cache GRDB messages) et `OutboxRecord` (status `.pending`) en meme transaction. **Le model `Message` n'est PAS persiste cote iOS** — pas de table dediee, le cache messages est un blob via CacheStore. La persistance "atomique" combine donc OutboxRecord (table cache_entries pour les hooks GRDB) + cache messages (blob mergeUpdate).
- Tous les `try?` remplaces par `try` propages
- **`OfflineQueue.enqueue` doit etre modifiee** : signature actuelle `public func enqueue(_ item: OfflineQueueItem) async` (OfflineQueue.swift:115) a passer en `public func enqueue(_ item: OfflineQueueItem) async throws`. La methode interne `writeToOutbox` (ligne 230) qui utilise `try?` doit etre refactor en `try` propage.
- `Logger.error` sur chaque chemin d'erreur
- `clientMessageId` **toujours en lowercase** via `ClientMessageId.generate()` — wrapper qui force `.lowercased()` (Swift produit des majuscules par defaut, mais le contrat serveur exige `[a-f0-9]`)
- **Suppression de `tempId`** dans tous les paths (online `temp_*`, offline `offline_*`, retry `retry_*`) — `clientMessageId` est l'unique cle locale + serveur. La map `pendingServerIds: [tempId: serverId]` (ligne 221) devient `pendingServerIds: [clientMessageId: serverId]` (meme structure, cle renommee).

### 6.1.1 Boot recovery des OutboxRecord en `.inflight`

**Statuts reels** (audit OutboxRecord.swift:11-15) : `pending`, `inflight`, `failed`, `exhausted`. Pas de `.sending` ni `.archived` — le spec utilise les noms reels.

Si l'app crash pendant qu'un message est en cours d'envoi, son `OutboxRecord` reste en statut `.inflight` (transition appliquee au debut du dispatch). Sans recovery, le record est ignore par le `OutboxFlusher` (qui ne traite que `.pending`) → message coince eternellement.

**Boot sequence** dans `MeeshyApp.swift` (ou hook equivalent au demarrage) :

```swift
Task.detached {
    // Etape 1 : recovery — reset .inflight → .pending
    try? await pool.write { db in
        try db.execute(sql: """
            UPDATE outbox_records
            SET status = ?, last_error = ?
            WHERE status = ?
        """, arguments: [
            OutboxStatus.pending.rawValue,
            "Reset on boot after presumed crash",
            OutboxStatus.inflight.rawValue
        ])
    }

    // Etape 2 : flush normal
    let flusher = OutboxFlusher(pool: pool, dispatcher: OutboxDispatcher())
    await flusher.flush()
}
```

Le `clientMessageId` etant idempotent end-to-end (cf. 6.2), un message qui a effectivement ete recu par le serveur avant le crash sera dedupe au replay — pas de doublon.

**Note `Sendable`** : `pool` (`DatabasePool` GRDB) est `Sendable` (les types GRDB modernes le sont). Le `Task.detached` capture est valide en Swift 6 strict. A verifier sur la version GRDB utilisee — sinon refactor en `Task { await MainActor.run { ... } }` ou injection via parametre.

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

#### Etat existant a fixer (audit code en main)
- WebSocket : champ deja accepte mais `optional()` (`services/gateway/src/validation/socket-event-schemas.ts:14,26` — sur `SocketMessageSendSchema` ET `SocketMessageSendWithAttachmentsSchema`) — a passer en `regex(...)`
- **ACK socket : claim invalide.** `MessageHandler._sendResponse()` (`services/gateway/src/socketio/handlers/MessageHandler.ts:861-878`) retourne actuellement **uniquement** `callback({ success: true, data: { messageId: response.data.id } })`. Le test `services/gateway/src/socketio/__tests__/message-ack.test.ts:45-50` decrit un contrat **NON IMPLEMENTE**. Phase 4 doit AJOUTER `clientMessageId` au callback ACK.
- Broadcast `message:new` : volontairement sans clientMessageId (privacy-preserving, garder ce design — `broadcastNewMessage()` MessageHandler.ts:388-451 ne le transmet pas)
- Persistance DB : absente — a ajouter (model Prisma + migration MongoDB)
- Dedup : absente — a ajouter (catch P2002 pattern, cf. infra)
- Cote web (Socket.IO) : envoi optionnel deja en place via `MessagingService.sendMessage()` (lignes 221-325, inclusion conditionnelle ligne 254 `...(clientMessageId && { clientMessageId })`). Format actuel : **UUID v4 nu** sans prefixe `cid_`. Migration : standardiser au format `cid_<uuid>` ET rendre l'envoi inconditionnel.
- Cote web (REST fallback) : `MessagingService.sendMessageViaRest()` (`apps/web/services/socketio/messaging.service.ts:379-406`) **NE propage PAS** `clientMessageId` — gap a fixer.
- Cote web (anonymous) : `apps/web/services/anonymous-chat.service.ts:117` est REST-only sans `clientMessageId` — a ajouter.
- Cote iOS : envoi absent (audit confirme) — a ajouter.
- **Route REST POST EXISTE** (correction post-revue user) : `POST /conversations/:id/messages` (`services/gateway/src/routes/conversations/messages.ts:1191`) est la route de fallback REST partageant le meme `MessagingService.handleMessage` que le WS. Egalement `POST /links/:identifier/messages` et `POST /links/:identifier/messages/auth` pour le chat anonyme. **Phase 4 aligne ces 3 routes sur `clientMessageId`** :
  1. Ajouter `clientMessageId: string` (obligatoire) au type TypeScript `SendMessageBody` (`services/gateway/src/routes/conversations/types.ts:23-44`)
  2. Ajouter le champ `clientMessageId` au `schema.body` Fastify (lignes 1206-1225 de `messages.ts`)
  3. Propager dans l'appel `MessagingService.handleMessage(body, participantId)` — le service applique le pattern catch P2002 atomique (cf. infra)
  4. Idem pour les 2 routes `links/messages.ts:27` et `links/messages.ts:302`
  5. Le handler reponse retourne deja `result` du `MessagingService` ; ce result inclut `messageId` — Phase 4 ajoute `clientMessageId` dans la response (echo)

#### Format `cid_<UUID v4 lowercase>` — helper centralise

`cid_<UUID v4>` lowercase. Prefixe pour distinguer des MongoDB ObjectIds (24 hex) et anciens tempIds locaux. Le format actuel cote web est libre (`client-temp-abc` dans les tests) — **on standardise tous les clients sur le prefixe `cid_`** au moment du shipping.

**Helper centralise** dans `packages/shared/utils/client-message-id.ts` (importe par web ET regenere manuellement en Swift identique pour iOS) :

```typescript
// packages/shared/utils/client-message-id.ts
export function generateClientMessageId(): string {
    return `cid_${crypto.randomUUID()}`;  // randomUUID retourne du lowercase
}

export const CLIENT_MESSAGE_ID_REGEX =
    /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
```

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift
public enum ClientMessageId {
    public static func generate() -> String {
        // Swift UUID() est case-insensitive en hex mais .uuidString produit du UPPERCASE.
        // .lowercased() OBLIGATOIRE pour correspondre a la regex serveur.
        return "cid_\(UUID().uuidString.lowercased())"
    }

    public static let regex = #"^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#
}
```

Test cross-platform (gateway integration) :
- `"cid_" + UUID().uuidString.lowercased()` → doit valider (Swift)
- `"cid_" + UUID().uuidString` (uppercase par defaut Swift) → doit invalider
- `"cid_" + crypto.randomUUID()` → doit valider (Node/Web)

#### Contrat shared

**Etat actuel** (audit) : `SendMessageRequest` est defini dans `packages/shared/types/index.ts:653` comme **interface TypeScript pure**, sans schema Zod associe (audit confirme : pas de `SendMessageRequestSchema` dans le repo). On AJOUTE le schema Zod et on touche aussi `socketio-events.ts` qui ne contient pas non plus `clientMessageId` dans `MessageSendWithAttachmentsData` (ligne 883 environ).

`packages/shared/types/messages.ts` (NOUVEAU fichier dedie, ou extension de `index.ts`) :

```typescript
import { z } from 'zod';
import { CLIENT_MESSAGE_ID_REGEX } from '../utils/client-message-id';

export const SendMessageRequestSchema = z.object({
    content: z.string().min(1).max(50_000),
    clientMessageId: z.string().regex(CLIENT_MESSAGE_ID_REGEX, 'Invalid clientMessageId format'),
    originalLanguage: z.string().optional(),
    replyToId: z.string().optional(),
    forwardedFromId: z.string().optional(),
    forwardedFromConversationId: z.string().optional(),
    attachmentIds: z.array(z.string()).optional(),
    messageType: z.string().optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
```

L'interface `SendMessageRequest` existante dans `index.ts:653` est remplacee par l'inference Zod (`z.infer`) pour garder la single source of truth.

`packages/shared/types/socketio-events.ts:883` (`MessageSendWithAttachmentsData`) ajoute `clientMessageId: string` (obligatoire) — meme regex via Zod.

Validation Zod gateway (WS — REST POST /messages non cree, cf. decision §6.2 option (a)) : reuse `SendMessageRequestSchema`. Le schema socket actuel `SocketMessageSendSchema` (socket-event-schemas.ts:14) et `SocketMessageSendWithAttachmentsSchema` (socket-event-schemas.ts:26) fusionnent leurs champs avec `SendMessageRequestSchema` via `z.intersection` ou par re-import du regex.

Migration concrete : `services/gateway/src/validation/socket-event-schemas.ts:14,26` passe de `clientMessageId: z.string().optional()` a `clientMessageId: z.string().regex(CLIENT_MESSAGE_ID_REGEX)`.

#### Gateway — pattern catch-on-conflict (atomique)

**Important** : le pattern catch-P2002 est implemente dans `MessagingService.handleMessage` (service partage par REST + WS), pas dans les handlers de surface. Cela garantit que :
- Le handler Socket.IO `message:send-with-attachments` (`services/gateway/src/socketio/handlers/MessageHandler.ts`) en herite
- La route REST `POST /conversations/:id/messages` (`services/gateway/src/routes/conversations/messages.ts:1191`) en herite
- Les routes `POST /links/:identifier/messages[/auth]` (`services/gateway/src/routes/links/messages.ts`) en heritent
- Aucune logique dedup dupliquee, single source of truth dans le service

**Le pattern `findUnique → INSERT` n'est PAS atomique** : deux requetes concurrentes avec le meme `clientMessageId` (retry reseau rapide, deux onglets web) passent toutes deux le `findUnique` avec `null`, puis l'une echoue sur la contrainte unique MongoDB → `PrismaClientKnownRequestError P2002`. Solution : INSERT direct + catch P2002.

```typescript
async function createMessageIdempotent(
    conversationId: string,
    clientMessageId: string,
    payload: SendMessagePayload
): Promise<{ message: Message; isDuplicate: boolean }> {
    try {
        const message = await prisma.message.create({
            data: { ...payload, conversationId, clientMessageId }
            // Note: pas de `include: { translations: true }` — translations est un Json field
            // embedded dans Message (cf. 1.6), automatiquement retourne avec le record
        });
        return { message, isDuplicate: false };
    } catch (e) {
        if (isPrismaUniqueViolation(e)) {  // e.code === 'P2002'
            const existing = await prisma.message.findUnique({
                where: { conversationId_clientMessageId: { conversationId, clientMessageId } }
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

Si la premiere insertion a reussi mais le PUSH ZMQ vers translator a echoue (translator down), le message en DB n'a pas de traductions. Un dedup hit sans re-push laisse ce message sans traductions indefiniment.

`MessageTranslation` est un **Json field embedded** dans `Message.translations` (audit prisma/schema.prisma:515-644 confirme — pas de model relation, format `{ "en": { text, ... }, "es": {...} }`). Le check est donc sur la taille du Json, pas un `.length` array Prisma :

```typescript
const { message, isDuplicate } = await createMessageIdempotent(...);
if (isDuplicate && isTranslationsEmpty(message.translations) && requiresTranslation(message)) {
    // Re-push ZMQ asynchrone (pas attendu, fire-and-track) avec capture d'erreur
    void messageTranslationService.translate(message)
        .catch(err => Logger.translation.error(`Re-translate dedup hit failed: ${err}`));
}

function isTranslationsEmpty(translations: unknown): boolean {
    if (!translations) return true;
    if (typeof translations !== 'object') return true;
    return Object.keys(translations as Record<string, unknown>).length === 0;
}
```

`requiresTranslation(m)` retourne `true` pour messages texte avec `originalLanguage` set, ou messages avec attachment audio (transcription Whisper). Le `.catch` explicite remplace le `void` qui swallow silencieusement les erreurs.

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

**Etat actuel** (audit MessageHandler.ts:861-878) : `_sendResponse()` retourne uniquement `{ messageId: response.data.id }` — pas de `clientMessageId`. **C'est ce qui doit etre fixe en premier.**

**Strategie ciblage sender** : le serveur identifie les sockets du sender via la **room utilisateur** `ROOMS.user(userId)` (existante, audit gateway). Cela couvre le cas multi-device : si un user est connecte sur iOS + web simultanement, les **deux** sockets recoivent le broadcast cible avec `clientMessageId`. Chaque client matche par `clientMessageId` dans sa propre map locale ; un device qui n'a jamais envoye ce `clientMessageId` ne le trouvera pas dans sa map et fera une insertion classique (path receiver).

Le broadcast `message:new` est envoye en deux temps :

```typescript
// Cote gateway MessageHandler, apres createMessageIdempotent :
const broadcastPayload = { ...message };  // sans clientMessageId
const senderPayload = { ...message, clientMessageId };  // avec clientMessageId

// 1. Broadcast generique aux autres participants (hors sender)
io.to(ROOMS.conversation(conversationId)).except(ROOMS.user(senderId)).emit('message:new', broadcastPayload);

// 2. Broadcast cible au sender (toutes ses sockets, pour cohérence multi-device)
io.to(ROOMS.user(senderId)).emit('message:new', senderPayload);

// 3. ACK au socket initial (FIX: inclure clientMessageId, manquant dans _sendResponse actuel)
callback({ success: true, data: { messageId: message.id, clientMessageId } });
```

**Cas multi-device** : un user envoyant depuis iOS recoit le `senderPayload` avec `clientMessageId` sur **ses deux** sessions (iOS + web simultanees). Le device iOS matche dans sa map → promotion optimistic. Le device web n'a pas ce `clientMessageId` dans sa map (il n'a pas envoye) → fait une insertion classique. Pas de doublon, comportement coherent attendu.

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

**Timeouts a deux paliers** (review : 5s seul est trop court sur 3G/EDGE) :
- **Palier "envoi lent"** : a 5s sans ACK ni broadcast, afficher l'etat UI `.slow` (icone horloge + spinner discret, pas d'erreur). N'interrompt pas le wait.
- **Palier `.failed`** : a 30s sans signal, basculer en `.failed` et delegue au retry budget `MessageRetryQueue`. Apres 5 retries epuises, etat `.failed` definitif avec retry manuel UI.

La map `pendingServerIds[tempId]` (ConversationViewModel:221) devient `pendingServerIds[clientMessageId: serverId]` — meme structure, cle renommee. Les 3 prefixes locaux (`offline_*`, `temp_*`, `retry_*`) disparaissent du SDK iOS.

**UX debounce icone horloge** : afficher l'icone horloge uniquement apres 200ms de delai (debounce). Sur connexion rapide (<200ms ACK), le message passe directement de "envoi en cours invisible" a "envoye" sans flash de horloge. Etat UI cycle complet : `.invisible → (200ms) → .clock → (5s) → .slow → (30s) → .failed`.

#### Cote web (Next.js) — migration en meme PR que backend

**Etat actuel** (audit) :
- `clientMessageId` est genere par **`crypto.randomUUID()`** (UUID v4 nu, **sans prefixe `cid_`**) au niveau du composant React `ConversationLayout.tsx:618` (proprete `optimistic._tempId`)
- Propage via `useSocketIOMessaging` → `meeshySocketIOService.sendMessage` → `SocketIOOrchestrator.sendMessage` (lignes 311-394, queue + send) → `MessagingService.sendMessage` (lignes 221-325)
- Inclusion conditionnelle ligne 254 : `...(clientMessageId && { clientMessageId })` — **omis si non fourni**, ce qui arrive si un appelant amont oublie le param
- `MessagingService.sendMessageViaRest()` (lignes 379-406) — **NE propage PAS** `clientMessageId` au backend (gap critique)
- `apps/web/services/anonymous-chat.service.ts:117` — REST-only sans `clientMessageId`
- Path Socket.IO standard : OK sur le contrat technique, manque uniquement le format `cid_` et la garantie d'inconditionnalite

**Audit obligatoire** des sites d'appel a re-verifier ligne par ligne :
- `apps/web/services/socketio/messaging.service.ts` (lignes 254, 379-406) — spread conditionnel a remplacer + REST a propager
- `apps/web/services/socketio/orchestrator.service.ts` (lignes 311-394) — parametre `clientMessageId?` a passer obligatoire
- `apps/web/services/socketio/types.ts` — `MessageSendOptions.clientMessageId?: string` → `: string` (obligatoire)
- `apps/web/services/conversations/messages.service.ts` — fallback REST a brancher
- `apps/web/services/messages.service.ts` — point d'entree haut niveau, generer si manquant
- `apps/web/services/anonymous-chat.service.ts:117` — generer + propager
- `apps/web/components/.../ConversationLayout.tsx:618` — utiliser `generateClientMessageId()` au lieu de `crypto.randomUUID()` brut
- `apps/web/hooks/use-chat-v2.ts`, `use-messaging.ts` — relayage explicite

**Strategie de migration** :
1. Ajouter `import { generateClientMessageId } from '@meeshy/shared/utils/client-message-id';` au point d'entree composant (`ConversationLayout.tsx`, `BubbleStreamPage.tsx`)
2. Tous les appels descendants recoivent ce `clientMessageId` propage en parametre **obligatoire** (typage `MessageSendOptions.clientMessageId: string`)
3. Standardiser sur prefixe `cid_<uuid lowercase>` — format actuel UUID v4 nu deviendra `cid_<UUID>`
4. Brancher `sendMessageViaRest()` ligne 379-406 pour propager le champ
5. Tests d'integration web : `messaging.service.test.ts` doit verifier que tout `sendMessage()` produit un payload contenant `clientMessageId` matchant `CLIENT_MESSAGE_ID_REGEX`

**Tests E2E Playwright** (deja en place dans `tests/`) doivent etre etendus :
- Envoyer 5 messages d'affilee, verifier que le payload reseau de chacun a un `clientMessageId` unique au format `cid_*`
- Couper le reseau via `context.setOffline(true)`, taper 3 messages, restaurer le reseau, verifier que les 3 sont envoyes avec leurs `clientMessageId` originaux (pas regeneres)

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

**Coalescing — machine d'etat** : la review architecture a flag que les sequences `edit-after-delete` n'etaient pas couvertes. On modelise explicitement les transitions dans `OfflineQueue.enqueue`, en regardant les records existants pour le meme `clientMessageId`.

**Statut `.inflight` — gestion explicite** : le coalescing s'applique uniquement aux records `status = .pending` (non encore parti vers le serveur). Si un record est en `.inflight` (envoye, ACK pas encore recu), on ne peut pas modifier son payload — le serveur peut deja avoir le message. Comportement attendu :
- `editMessage` arrive pendant que `sendMessage(A)` est `.inflight` → INSERT un nouveau `editMessage` record pending. Au dispatch, `editMessage` attendra que `sendMessage` soit `.sent` (passage par le `clientMessageId → serverId` map). Si `sendMessage` echoue (`.failed`), `editMessage` echoue aussi (cible inexistante) → log + skip.
- `deleteMessage` arrive pendant que `sendMessage(A)` est `.inflight` → meme pattern, INSERT un `deleteMessage` pending. Sequence finale serveur : INSERT puis DELETE atomique.

Le filtrage est donc plus strict : `existing` = records `status = .pending` uniquement (pas `.inflight`).

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
        // Coalescing : uniquement sur records `.pending` (cf. note .inflight ci-dessus)
        let existing = try OutboxRecord
            .filter(Column("clientMessageId") == item.clientMessageId)
            .filter(Column("status") == OutboxStatus.pending.rawValue)
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

**Etat actuel** (audit) : `OutboxKind.sendReaction` **existe deja** (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/OutboxRecord.swift:4-8`), mais `ReactionQueue` (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/ReactionQueue.swift:68`) est un actor avec stockage **separe** in-memory + JSON file, qui **ne cree pas** de `OutboxRecord`. `OutboxDispatcher.swift` ne dispatche pas `sendReaction` non plus.

Phase 4 : refonte de `ReactionQueue` pour persister via OutboxRecord (suppression du JSON file) et branchement `OutboxDispatcher.dispatch(.sendReaction)` pour appeler `MessageService.shared.toggleReaction(messageId:emoji:action:)`. Payload `OutboxRecord.payload` : encodage JSON de `{ messageId: String, emoji: String, action: "add" | "remove" }`.

**Coalescing reactions** : add+remove sur meme `(messageId, emoji)` s'annulent en queue (DELETE des deux records `.pending`) ; double add est dedupe (DELETE du second). La machine d'etat infra (cf. table coalescing message ci-dessous) est etendue avec une cle de coalescing `(clientMessageId | messageId+emoji)` selon le `OutboxKind`.

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

`OutboxRecord.status` cycle reel (audit OutboxRecord.swift:11-15) : `pending → inflight → failed | exhausted`. Pas de status `.sent` ni `.archived` — un record dispatche avec succes est **supprime** (ou move vers une table d'historique si besoin de logs futurs). Le passage a `.inflight` se fait via UPDATE atomique au debut de la tentative.

Au retour :
- **Succes** → DELETE du record
- **Echec recoverable** → retour a `.pending` avec `lastError` + `nextAttemptAt = now + backoff`
- **Echec apres N retries** → `.exhausted` (visible dans UI debug, retry manuel possible)
- **Echec critique non-retryable** (4xx serveur, payload corrompu) → `.failed` immediatement

Plus de risque de double-dispatch grace a la transaction GRDB sur le passage `.pending → .inflight`.

### 6.4 Tests

**iOS unit** :
- `test_offlineSend_10concurrentMessages_allPersistedAndDisplayed`
- `test_offlineSend_persistenceFails_optimisticRolledBack`
- `test_offlineQueue_isActor_serializesEnqueueCalls` (Swift 6 isolation)
- `test_clientMessageId_generatedWithLowercaseUUID` (regex CLIENT_MESSAGE_ID_REGEX)
- `test_socketAck_matchesByClientMessageId_promotesOptimistic`
- `test_socketBroadcastToSender_includesClientMessageId_promotesOptimistic`
- `test_socketBroadcastToOther_omitsClientMessageId_insertsAsNew`
- `test_ackTimeout_5seconds_marksMessageFailed`
- `test_clockIcon_debounce200ms_notShownIfAckArrivesEarlier`
- `test_audioOffline_writeAheadPattern_outboxBeforeFileCopy`
- `test_audioOffline_crashAfterOutboxBeforeCopy_bootRecoveryMarksFailed`
- `test_audioOffline_tusInterrupted_resumesOnReconnect`
- `test_bootRecovery_resetsSendingToPending`
- `test_bootRecovery_orphanAudioFile_deleted`

**iOS coalescing (machine d'etat)** :
- `test_coalesce_sendThenEdit_mergesPayload`
- `test_coalesce_sendThenDelete_dropsRecord`
- `test_coalesce_sendEditDelete_dropsRecord`
- `test_coalesce_editAfterDelete_dropsWithWarning`
- `test_coalesce_editEdit_keepsLatestPayload`
- `test_coalesce_editThenDelete_dropsEditInsertsDelete`
- `test_reactionAddThenRemove_coalescedToNoop`

**Gateway** :
- `test_postMessage_sameClientMessageId_returnsSameMessageNoDuplicate`
- `test_postMessage_invalidClientMessageIdFormat_400`
- `test_postMessage_uppercaseClientMessageId_400` (verifie le strict lowercase)
- `test_postMessage_clientMessageIdMissingPrefix_400`
- `test_postMessage_clientMessageIdNot36CharsUUID_400`
- `test_socketSend_sameClientMessageId_returnsSameMessage`
- `test_existingMessage_dedupHitWithTranslations_doesNotRetranslate`
- `test_existingMessage_dedupHitWithoutTranslations_repushesZmq`
- `test_socketBroadcast_excludesSenderFromGenericBroadcast` (verifies io.except)
- `test_socketBroadcast_includesClientMessageIdToSenderOnly`
- `test_concurrentInsert_sameClientMessageId_p2002CaughtAndDedup` (race condition test)

**E2E Playwright (web)** :
- `test_e2e_offlineSendMultipleMessages_allDeliveredOnReconnect`
- `test_e2e_clientMessageIdConsistent_acrossOfflineRetries`

### 6.5 Acceptance criteria

1. Taper 10 messages texte d'affilee en avion → les 10 apparaissent en bulles avec icone horloge, persistent au kill app, sont envoyes FIFO quand wifi revient
2. 1 audio offline → blob persiste, upload TUS reprend correctement a la reconnexion
3. Meme `clientMessageId` envoye 2× (test : coupure reseau pendant ack) → un seul message en base, retourne identique
4. Edit puis delete offline du meme message pending → flush ne fait rien (annulation locale)
5. App killed pendant qu'un message est en queue → au reboot, l'optimistic est encore visible et flush demarre
6. Aucun message n'est perdu silencieusement : toute erreur de persistance produit un log et un etat UI `.failed` avec retry manuel

---

### 6.5 Note performance — index unique partiel a 100k msgs/s

La review performance a confirme que l'index unique partiel `(conversationId, clientMessageId)` ajoute **~5% de latence d'ecriture** MongoDB 8 avec replica set. Sur le cible projet de 100k msgs/s (`CLAUDE.md`), ce n'est pas le goulot ; le veritable plafond est la connection pool Prisma. Documentation a ajouter dans `services/gateway/decisions.md` post-implementation.

Pour le scaling futur, l'index est compatible avec le pattern de sharding `{ conversationId: "hashed" }` (cle de shard alignee, pas de scatter-gather sur le dedup). **Hors scope de ce spec** — note pour le futur.

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

1. **Tri stale** : la liste des conversations affiche **toujours** l'ordre `lastMessageAt DESC`, en cache et en reseau, des le premier render. `bumpToTop` evite le full re-sort sur arrivee socket.
2. **Infinite scroll** : pagination cursor-based stable, jusqu'a 2000 conversations cachees (LRU au-dela), immune aux nouvelles conversations en haut. Cache GRDB row-per-conversation, WAL mode.
3. **Cache-first universel** : 5 ViewModels supplementaires conformes au pattern stale-while-revalidate ; helper `CacheFirstLoader` actor reutilisable depuis tout target SDK ou app. Discipline Task obligatoire (cancel au deinit).
4. **Offline send fiable** : N messages dans M conversations en mode avion → 100% persistes, FIFO au retour reseau, idempotence garantie meme apres crash applicatif (bootRecovery .sending → .pending).
5. **Idempotence cross-device** : `clientMessageId` end-to-end, format `cid_<uuid lowercase>`, dedup native MongoDB par index unique partiel + pattern catch-P2002. Helper centralise `packages/shared/utils/client-message-id.ts`.
6. **Operations offline etendues** : reactions, edit, delete, audio supportes hors connexion avec machine d'etat de coalescing explicite (incluant edit-after-delete).
7. **Audio offline atomique** : pattern write-ahead 2-step (INSERT OutboxRecord → copy file), bootRecovery des fichiers orphelins.
8. **Reconciliation iOS double entry-point** : ACK socket pour le path nominal + broadcast cible vers sender pour le path crash recovery. Debounce 200ms sur l'icone horloge.
9. **Performance** : pas de jank UI sur 2000 conversations, 60 FPS scroll garanti via memoization `groupedConversations` et leaf-equatable rows.
10. **Migration sans downtime** : sequence DB → gateway warning-only → clients → gateway strict.

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

**Mitigation** : `OfflineQueue.enqueue` execute la machine d'etat de coalescing (cf. Section 6.3) dans la meme transaction GRDB que le SELECT existing + INSERT/UPDATE/DELETE final. Toute lecture/modification de la queue est seriealisee (l'`actor` OfflineQueue garantit l'isolation au niveau Swift, et la transaction GRDB garantit l'atomicite au niveau persistance).

### 10.6 Order de deploiement Phase 4 — pas de downtime

**Risque** : breaking change cross-surface (DB + gateway + web + iOS) deploye dans l'ordre incorrect → rejet de requetes legitimes.

**Mitigation — sequence imposee** :
1. **DB d'abord** : creer l'index unique partiel (background index creation, non-bloquant sur replica set MongoDB 8). Documents existants sans `clientMessageId` non affectes
2. **Gateway en mode "warning-only"** : deployer le gateway qui accepte `clientMessageId` optionnel, persiste, dedupe — mais ne rejette pas les requetes sans le champ. Fenetre de securite ~24h
3. **Web + iOS simultanement** : deployer le frontend web (clientMessageId obligatoire genere systematiquement) et la version iOS avec le champ. En pre-launch, pas de clients legacy en production
4. **Gateway passe en strict** : activer la validation `regex(...)` obligatoire apres confirmation que tous les clients deployent envoient le champ

Cette sequence garantit zero requete rejete pendant la transition.

### 10.7 Race condition INSERT MongoDB

**Risque** : deux requetes concurrentes avec le meme `clientMessageId` (retry reseau rapide, deux onglets web, ou meme mobile + web) passent toutes deux le SELECT pre-INSERT → l'une echoue sur la contrainte unique.

**Mitigation** : pattern `INSERT direct + catch P2002` documentee Section 6.2. Le INSERT atomique via la contrainte unique est le seul point de synchronisation correct ; le `findUnique` pre-INSERT est une optimisation qui doit etre supprimee.

---

## Annexe A — Inventaire des fichiers touches

### apps/ios/
- `Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` (Phases 1, 2 — refactor setters via setConversations/appendConversations/bumpToTop, socket listener message:new, paginationState/nextCursor String)
- `Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (Phases 1, 4 — sendMessage refactor, ClientMessageId helper, isInputLocked unifie, suppression `temp_*`)
- `Meeshy/Features/Main/Services/OutboxDispatcher.swift` (Phase 4 — brancher .editMessage/.deleteMessage/.sendReaction qui sont actuellement no-op aux lignes 22-28)
- `Meeshy/Features/Contacts/RequestsViewModel.swift` (Phase 3)
- `Meeshy/Features/Contacts/DiscoverViewModel.swift` (Phase 3)
- `Meeshy/Features/Contacts/BlockedViewModel.swift` (Phase 3)
- `Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift` (Phase 3)
- `Meeshy/Features/Main/Views/ConversationListView.swift` (ou equivalent — Phase 2 footer load more)
- `MeeshyApp.swift` (Phase 4 — boot recovery `.inflight → .pending`)
- `MeeshyTests/Unit/ViewModels/*Tests.swift` (toutes phases)

### packages/MeeshySDK/
- `Sources/MeeshySDK/Services/ConversationService.swift` (Phase 2 — listPage(before: String?, limit:) cursor-based, ConversationPage struct Sendable)
- `Sources/MeeshySDK/Sync/ConversationSyncEngine.swift` (Phase 1 — tri merge avant `cache.conversations.save(...)` lignes 279, 336, 350 — factoriser en helper saveSorted)
- `Sources/MeeshySDK/Persistence/OfflineQueue.swift` (Phase 4 — `enqueue` async throws, coalescing state machine, suppression try? ligne 230)
- `Sources/MeeshySDK/Persistence/OutboxRecord.swift` (Phase 4 — ajouter `clientMessageId: String` field ; statuts deja `pending/inflight/failed/exhausted`, pas de changement)
- `Sources/MeeshySDK/Persistence/MessageRetryQueue.swift` (Phase 4 — adopter clientMessageId, supprimer prefixe `retry_*`)
- `Sources/MeeshySDK/Persistence/ReactionQueue.swift` (Phase 4 — refonte sur OutboxRecord, suppression du JSON file storage)
- `Sources/MeeshySDK/Models/MessageModels.swift` (Phase 4 — `clientMessageId: String` obligatoire dans MeeshyMessage, deliveryStatus avec `.invisible/.clock/.slow/.failed`)
- `Sources/MeeshySDK/Models/MeeshyConversation.swift` (Phase 1 — verifier `lastMessageAt: Date` est `var` mutable ; sinon copy-init helper)
- `Sources/MeeshySDK/Cache/LoadState.swift` (Phase 3 — NOUVEAU, n'existe pas actuellement)
- `Sources/MeeshySDK/Cache/CacheFirstLoader.swift` (Phase 3 — NOUVEAU, dans core target pas UI)
- `Sources/MeeshySDK/Cache/CachePolicy.swift` (Phase 3 — verifier/eventuellement etendre policies friends/participants)
- `Sources/MeeshySDK/Cache/AppDatabase.swift` (Phase 2 — migration v5_cache_entries_sort_index, runtime migration de `conv:list` → row-per-conversation)
- `Sources/MeeshySDK/Cache/GRDBCacheStore.swift` ou stores specialises (Phase 2 — API loadPage(offset:limit:) sur conversations, upsertRows)
- `Sources/MeeshySDK/Utils/ClientMessageId.swift` (Phase 4 — NOUVEAU helper Swift, `cid_<UUID lowercase>` + regex)
- `Tests/MeeshySDKTests/*Tests.swift`

### services/gateway/
- `src/services/MessagingService.ts` (Phase 4 — implementer le pattern catch-P2002 dans `handleMessage`, single source of truth pour REST + WS)
- `src/socketio/handlers/MessageHandler.ts` (Phase 4 — `_sendResponse()` lignes 861-878 AJOUTER clientMessageId au callback ; `broadcastNewMessage()` lignes 388-451 broadcast cible sender via ROOMS.user(senderId))
- `src/routes/conversations/messages.ts` (Phase 4 — route POST ligne 1191 schema body lignes 1206-1225 ajouter clientMessageId obligatoire ; response ajouter clientMessageId echo)
- `src/routes/conversations/types.ts` (Phase 4 — lignes 23-44 ajouter `clientMessageId: string` a `SendMessageBody`)
- `src/routes/links/messages.ts` (Phase 4 — POST lignes 27 et 302 idem ; schema Zod `links/types.ts:54-62` etendre)
- `src/routes/links/types.ts` (Phase 4 — schema Zod sendMessageSchema ajouter clientMessageId)
- `src/services/MessageTranslationService.ts` (Phase 4 — skip retranslate sur dedup, helper isTranslationsEmpty pour Json field)
- `src/validation/socket-event-schemas.ts` (Phase 4 — lignes 14, 26 — clientMessageId regex obligatoire sur les deux schemas)
- `src/socketio/__tests__/message-ack.test.ts` (Phase 4 — convertir le contrat decrit lignes 45-50 en test passant)
- Tests integration nouveaux : `src/socketio/__tests__/message-dedup.test.ts`, `src/socketio/__tests__/message-ack-clientid.test.ts`, `src/routes/__tests__/messages-rest-dedup.test.ts`

### packages/shared/
- `types/index.ts:653` (Phase 4 — remplacer interface `SendMessageRequest` par `z.infer<typeof SendMessageRequestSchema>`)
- `types/messages.ts` (Phase 4 — NOUVEAU fichier OU extension, contient `SendMessageRequestSchema` Zod)
- `types/socketio-events.ts:883` (Phase 4 — `MessageSendWithAttachmentsData` ajouter clientMessageId obligatoire)
- `utils/client-message-id.ts` (Phase 4 — generateClientMessageId + CLIENT_MESSAGE_ID_REGEX, NOUVEAU)
- `prisma/schema.prisma:515-644` (Phase 4 — model Message ajouter `clientMessageId String?` + `@@unique([conversationId, clientMessageId])`)
- Migration MongoDB (Phase 4 — script `db.messages.createIndex` partial unique, executer hors Prisma migration)

### apps/web/ (Phase 4 — migration coordonnee)
- `services/socketio/messaging.service.ts` (lignes 254 spread conditionnel + lignes 379-406 `sendMessageViaRest` qui ne propage actuellement PAS clientMessageId)
- `services/socketio/orchestrator.service.ts` (lignes 311-394 — parametre clientMessageId obligatoire, queue `PendingMessage`)
- `services/socketio/types.ts` (`MessageSendOptions.clientMessageId?: string` → `: string`)
- `services/socketio/meeshySocketIOService` wrapper (idem)
- `services/conversations/messages.service.ts` (REST avec clientMessageId)
- `services/messages.service.ts` (point d'entree haut niveau — generer si manquant)
- `services/anonymous-chat.service.ts:117` (REST-only — ajouter clientMessageId, gap audit confirme)
- `components/.../ConversationLayout.tsx:618` (`crypto.randomUUID()` brut → `generateClientMessageId()` pour format `cid_<uuid>`)
- `hooks/use-chat-v2.ts`, `use-messaging.ts`, `useSocketIOMessaging.ts` (relayage explicite)
- `components/.../BubbleStreamPage.tsx` (utilise `useStreamSocket` clone — meme refactor)
- Audit complet de tous les sites d'envoi pour aligner sur `cid_<uuid>` standardise

---

## Annexe B — Memoire projet relevante

- `MEMORY.md` : "iOS Build" → utiliser `./apps/ios/meeshy.sh` exclusivement
- `feedback_ios_pagination_via_viewmodel.md` : older-message pagination MUST call ConversationViewModel.loadOlderMessages — **ce spec etend ce principe a la pagination des conversations elles-memes**
- `feedback_swift6_concurrency_pitfalls.md` : `@MainActor` strict sur ViewModels, pas de `Task.detached` pour la persistance critique (applique en Phase 4)
- `MEMORY.md` : pre-launch app, pas de retrocompat soft sur breaking changes (donc Phase 4 peut shipper la version stricte du clientMessageId si l'audit gateway le confirme)

---

**Fin du design document.**
