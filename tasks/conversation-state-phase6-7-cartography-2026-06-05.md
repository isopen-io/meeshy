# Cartographie Phases 6-7 — Conversation User State Unification (2026-06-05)

Synthèse du workflow d'exploration (7 agents, lecture intégrale). Sert de base de décision avant migration.

## Réalité architecturale découverte (DÉCISIVE)

**`ConversationStore` est un module SHIPPÉ mais DORMANT.** Référencé NULLE PART dans `apps/ios` :
- `grep "ConversationStore.shared" apps/ios` → 0 résultat
- `grep "ConversationStoreSocketBridge" apps/ios` → 0 résultat (bridge jamais activé)
- Les 3 ViewModels ne prennent aucune dépendance `store:`.

### Flux de données réel aujourd'hui (PAS via le store)
1. **Liste** : `ConversationSyncEngine` écrit la liste canonique dans `CacheCoordinator.conversations["list"]`. `ConversationListViewModel` lit le cache + réagit à `syncEngine.conversationsDidChange` + mute in-place depuis sockets/broadcaster/push. Ses 9 méthodes de mutation font optimistic+réseau+rollback **directement** via `PreferenceService`/`ConversationService` — **PAS d'outbox, PAS persisté en cache**.
2. **Sheet options** (`ConversationOptionsViewModel`) : son PROPRE optimistic+rollback via `persistAsync` → `PreferenceService` + `ConversationPreferencesBroadcaster.broadcast` + écriture L2 cache.
3. **Header conv** (`ConversationViewModel`) : `markAsRead` via `SyncEngine.markConversationReadLocally` + `NotificationCenter(.conversationMarkedRead)` + `OfflineQueue`, gardé par `showReadReceipts`.

## Les 6 tensions de migration

1. **`apply` exige l'hydratation** : `ConversationStore.apply` throw `.unknownConversation` si la conv n'est pas hydratée. Rien n'hydrate le store aujourd'hui. → toute mutation échoue tant que le store n'est pas peuplé ET maintenu.
2. **Le store n'est PAS alimenté par le SyncEngine.** Sinker la list VM sur `listPublisher()` donnerait une liste VIDE et non rafraîchie.
3. **`publishList()` ne trie QUE par `lastMessageAt`** — ignore pins/drafts/sections. Le tri/filtre/groupement riche (`conversationsAreInOrder`, `groupConversations`) DOIT rester VM-side. → `listPublisher()` n'est PAS la bonne couture pour la liste rendue ; `publisher(for: id)` per-conv l'est.
4. **`deleteForUser` sémantique divergente** : VM retire physiquement ; store pose `deletedForUserAt` sans filtrer de `publishList`.
5. **`markAsRead` a 4-5 effets de bord** (SyncEngine local, NotificationCenter, OfflineQueue, gate privacy) non couverts par `apply(.markAsRead)`.
6. **Tests** : ~125 tests list VM + 22 options VM + 2 conv VM markAsRead assertent via compteurs de mocks service / NotificationCenter → cassent si la persistance migre vers l'outbox du store. Les 6 publishers du bridge ne sont PAS dans `MessageSocketProviding` → tests app ne peuvent pas piloter le bridge (testé SDK-side uniquement).

## Deux stratégies d'intégration

### Stratégie A — Store comme source de vérité unique (vision « pure » du plan littéral)
SyncEngine hydrate le store ; store = source unique de la liste ; VM miroir de `listPublisher()` + tri VM-side ; toutes mutations via `apply`.
- **Coût** : réécriture multi-jours du SyncEngine + writeback cache + tous les chemins de chargement. Risque très élevé (mémoire : « tentative naïve = 69 erreurs »).
- **Gain** : une seule source de vérité RAM.

### Stratégie B — Store comme couche de mutation + sync cross-surface (incrémental, sûr) ✅ RECOMMANDÉE
Garde intacte la machinerie de chargement/tri/groupement/cache du VM. Ajoute le store comme **couche de coordination des mutations** :
- Le VM hydrate le store depuis ses `conversations` chargées (et ré-hydrate sur changement).
- Toutes les mutations (swipes liste, menu, sheet options) routent via `store.apply(...)`.
- Le VM observe `publisher(for: id)` per-conv → fusionne le `userState` optimiste/ACK du store dans son tableau → le pipeline de tri/groupe/render existant réagit.
- Le broadcaster devient redondant (publisher du store le remplace) → supprimé Phase 8.
- `markAsRead` conserve ses spécificités (SyncEngine local / NotificationCenter / gate privacy) OU route via store + garde les extras.

**B satisfait les critères de succès #2/#3/#4/#5** (même snapshot, mutate via store, sync cross-surface au même tick, outbox offline, version socket) via `publisher(for:)` + `apply` + outbox — SANS le risque catastrophique de réécrire SyncEngine/chargement/cache. Déployable incrémentalement, TDD-able. Le `listPublisher()` du plan littéral était basé sur une hypothèse fausse (store = source de la liste).

## Inventaire des sites à migrer (référence)

### ConversationListViewModel — 9 méthodes mutation (L1221-1373) → `apply`
togglePin→`.setPinned`, toggleMute→`.setMuted`, markAsRead→`.markAsRead`(+extras), markAsUnread→`.markAsUnread`, archive→`.setArchived(true)`, unarchive→`.setArchived(false)`, deleteConversation→`.deleteForUser`, moveToSection→`.setSection(categoryId:)`, setFavoriteReaction→`.setReaction`.

### ConversationOptionsViewModel (312 l.) → slim
Garder : `load()` cache-first, debounce 500ms customName (Combine), dedup/trim tags, `categories`/`allTags`, `didDelete`/`didLeave`. Supprimer : `persistAsync` (L257-295), broadcast (L276), écriture L2 (L284), pattern optimistic/rollback manuel. 12 setters → `store.apply(...)` ; `createCategoryAndSelect` → `store.createSectionAndAssign`.

### ConversationViewModel (header) — markAsRead
Ajouter dépendance store (défaut `.shared`), sink `publisher(for: id)`, markAsRead conditionnel `unreadCount>0` sur `.task` + nouveau `.onChange(scenePhase==.active)`. Conserver gate privacy + SyncEngine local + NotificationCenter.

### UI — 23 sites de mutation (swipe + menu, redondance double)
ConversationListView.swift: pin L375, mute L384, lock L393(sheet), archive/unarchive L417-421, markRead/Unread L430-434, block L447-455(BlockService), hide/delete L459-465, drop→moveToSection L839, expand L502. ConversationListView+Overlays.swift: pin L15, mute L28, markRead L44, markUnread L51, reaction L80/L89, moveToSection L112/114/129, lock L141(sheet), archive L166-169, block L189-203(BlockService), delete L216. ConversationPreferencesTab.swift: 12 contrôles L174-364.
**Hors store** : block (`BlockService`), lock (`ConversationLockSheet`/`ConversationLockManager`).

### Bridge activation
`MeeshyApp.swift:444` (après `MessageSocketManager.shared.forceReconnect()`, branche `if isAuth`) → `ConversationStoreSocketBridge.shared.activate()`. Logout (`else` L470-491) → `.deactivate()`. Idempotent, les 6 publishers survivent aux reconnects → activer 1× après login suffit.

### Tests flaky à ignorer sur échec isolé
`test_schedulePersist_burstWithinDebounceWindow_coalesces`, `test_schedulePersist_spacedBeyondDebounceWindow_persistsEach` (ConversationListViewModelTests).

---

## Ledger d'increments (Stratégie B) — ordre corrigé

**Ordre corrigé** : le list VM est le KEYSTONE (dépendance broadcaster→liste : on ne peut pas supprimer le broadcaster tant que la liste n'observe pas le store). Donc list VM AVANT options VM.

| # | Increment | Branche | Statut | Commit main |
|---|-----------|---------|--------|-------------|
| 1a | SDK `hydrateMetadata` (merge version-aware) | feat/conv-state-store-merge | ✅ MERGÉ | `53804f530` |
| 1b-i | List VM observe store (dep + hydrate + observeStore/merge) | feat/conv-state-list-vm-observe | ✅ MERGÉ | `5e707b38e` |
| 1b-ii-a | List VM : migrer togglePin/toggleMute → `store.apply` + réécrire 7 tests (drainMainQueue) | — | ✅ MERGÉ | `291c60cde` |
| 1b-ii-b | List VM : migrer archive/unarchive/reaction/moveToSection/markAsUnread → `store.apply` + réécrire 12 tests (waitForListState, lifecycleError) | — | ✅ MERGÉ | `1d547d6a0` |
| 1b-ii-c | List VM : markAsRead (gate client `showReadReceipts` SUPPRIMÉ — serveur gate déjà le broadcast ; fixe sync cross-device) + deleteConversation (soft-delete `.deleteForUser` + filtre `deletedForUserAt` dans `filterConversations`) + tests | — | ✅ MERGÉ | `b2517737b` |
| 1b-iii | Activer le bridge dans MeeshyApp (login `activate()` / logout `deactivate()`). Removal cross-device `applyConversationDeleted` : self-heal au refresh (drop immédiat déféré). | — | ✅ MERGÉ | `bb300e5e8` |
| 2 | Options VM → `store.apply` (hydrate depuis la conv, mirror userState→prefs, optimiste sync + rollback, drop persistAsync/broadcaster/L2) + `ConversationPreferencesTab` init + 25 tests réécrits. Broadcaster du list VM rendu inerte (suppression Phase 8/inc. 5). | — | ✅ MERGÉ | `e0255ff18` |
| 3 | Conv header markAsRead via store + scenePhase (`ConversationViewModel` 3536 l. — risque moyen ; `ConversationView.swift` partagé potentiel avec Codex calls) | — | 🔲 SUIVANT | — |
| 4 | Section headers → UserCategoryStore (reorder/expand) + UI pendingMutationCount | — | 🔲 | — |
| 5 | Phase 8 : supprimer broadcaster (+ abonnement list VM inerte L542/L584 + pbxproj) + shims dépréciés, smoke, quality gate | — | 🔲 | — |

### État global (2/3 ViewModels migrés + bridge live)
La fondation Stratégie B est **substantiellement livrée** : list VM (9/9 mutations) + options VM mutent via `ConversationStore` (optimiste + outbox offline + rollback + sync cross-surface au même tick via le merge sink), et le bridge route les events cross-device (deleted/reorder/category) vers le store. Restent 3 raffinements : conv header (inc. 3), section headers (inc. 4), cleanup broadcaster/shims (inc. 5).

### Détails 1b-ii (prochain)
Réécrire dans `ConversationListViewModel.swift` (L~1221-1373) chaque méthode pour appeler `store.apply` au lieu de `preferenceService.updateConversationPreferences` direct. Le store fait l'optimiste + outbox + rollback ; le merge sink (1b-i) reflète déjà le résultat dans `conversations`. Donc le corps optimiste/rollback in-place des 9 méthodes disparaît.
- **markAsRead** : `store.apply(.markAsRead)` MAIS garder `syncEngine.markConversationReadLocally` + `NotificationCenter(.conversationMarkedRead)` + gate `showReadReceipts` (le store route déjà vers conversationService.markRead, donc NE PAS double-appeler le réseau — soit on garde le gate côté VM avant apply, soit on accepte que le store envoie toujours). **Décision** : garder le gate `showReadReceipts` côté VM ; si désactivé → mutation locale via store `.markAsRead` quand même (unreadCount=0 local) mais le dispatch réseau du store appellera markRead… → revoir : peut-être `.markAsRead` est toujours OK car le serveur read-receipt est idempotent. À trancher en codant.
- **deleteConversation** : `store.apply(.deleteForUser)` pose `deletedForUserAt` (ne retire pas). Le merge greffe `deletedForUserAt` sur la row → il faut FILTRER les `deletedForUserAt != nil` dans `filterConversations` (sinon la conv reste visible). Alternative : garder le retrait physique VM + appeler le réseau via store. **Décision** : filtrer `deletedForUserAt` dans le pipeline (cohérent avec `ConversationUserState.isVisible`).
- Tests : injecter le store de test (déjà branché via `makeSUT(store:)`), asserter via le comportement observable (`sut.conversations[i].userState.X` après `await sut.storeHydrationTask?.value` + apply) plutôt que via les compteurs `MockPreferenceService` (qui ne seront plus appelés — le store utilise ses propres writers). Pour les rollbacks : `ConvListTestPreferenceWriter.errorToThrow = MeeshyError.server(statusCode: 422, ...)` (permanent → rollback) vs transient (garde l'optimiste).

### Pièges confirmés par le code
- `classifyError` : seul `MeeshyError.server(4xx)` → permanent (throw+rollback) ; tout le reste → transient (garde l'optimiste, pas de throw). Les tests rollback doivent utiliser un 4xx.
- `hydrate`/`hydrateList` REMPLACENT (clobber userState) ; n'utiliser que `hydrateMetadata` pour les refresh répétés.
- `publisher(for:)` retourne `nil` si jamais hydraté → hydrater avant d'observer (options VM increment 2).
- Worktree partagé avec Codex (commits gateway call-diag en parallèle) — fichiers disjoints, mais re-vérifier `git log` avant chaque merge.
