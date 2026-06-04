# Audit — « Conversation User State Unification » (tasks/todo.md)

**Date** : 2026-06-04
**Méthode** : 8 agents en parallèle, classement de chaque item par cross-check du
code réel + `git log --all` (les cases du plan n'ayant jamais été cochées malgré
l'exécution sur branches, elles sont ignorées).

## Verdict
**Partiellement complet.** La fondation SDK (Phases 2–5) est livrée et testée :
`ConversationUserState`/`UserStateMutation`, l'outbox SQLite avec coalescing,
`ConversationStore` (apply optimiste), `UserCategoryStore`. **Le travail s'arrête
là.** Les Phases 6–7 (refonte des ViewModels iOS pour lire le store + re-câblage
de TOUTES les surfaces UI vers `store.apply(...)`) sont **intactes** : les
ViewModels gardent leur état + méthodes de mutation, et **aucun code UI ne
référence `ConversationStore`**. La Phase 8 (cleanup, suppression ~700 lignes) est
donc bloquée. Moteur construit et testé, mais rien n'est branché dessus.

## Totaux (≈100 items audités sur 107 nominaux)
| Statut | Nb |
|---|---|
| DONE | 56 |
| OPEN | 34 |
| UNCERTAIN | 6 |
| NA (opérationnel) | 4 |

## Items réellement OUVERTS (34)

### Phase 4 — ConversationStore (différé « Phase 4 bis », commit a3b7c5667)
- `hydrateFromCache()` non implémenté (`ConversationStore.swift:87`)
- `createSectionAndAssign(...)` absent
- `reorderConversations(_:)` absent
- `applyReadReceipt(ReadStatusEvent)` différé (`:84`)
- `applyConversationDeleted(_:)` différé (`:84`)
- Publisher `userPreferencesReordered` non câblé (pas de listener `user:preferences-reordered`)
- Publisher `conversationDeleted` non câblé

### Phase 5 — UserCategoryStore
- Listeners socket catégories non câblés : `MessageSocketManager` a 63 `socket.on()`
  mais aucun pour `category:created/updated/deleted` / `categories:reordered`.
  `CategoryRemoteEvent` existe mais n'est jamais alimenté (`UserCategoryStore.swift:55-86`)

### Phase 6 — Refonte ViewModels iOS (entièrement ouverte)
- `ConversationListViewModel` : pas de sink sur `listPublisher()`, toujours `@Published conversations`
- Les 9 méthodes de mutation toujours présentes + appelées (`ConversationListViewModel.swift:1221-1373`)
- Suppression nette ~400 lignes non faite (fichier toujours 1595 l.)
- `ConversationOptionsViewModel` non aminci (toujours 312 l., cible ~80)
- Logique optimistic/rollback/broadcaster/L2 toujours inline (`:82-150+`)
- Handlers de toggle appellent encore `preferenceService`/`conversationService` directement
- `ConversationViewModel` : 0 référence au store (fichier 3536 l.)
- `markAsRead` n'appelle pas le store ; câblage scenePhase absent
- Tests « list VM read-only / mutations gone » : impossibles (mutations présentes)
- Test conv VM markAsRead onAppear+scenePhase : seul `test_markAsRead_postsNotification` existe

### Phase 7 — Re-câblage UI (entièrement ouverte)
- `ThemedConversationRow` : pas de sink `store.publisher(for:)`
- Swipe leading → encore `conversationViewModel.togglePin/toggleMute` (`ConversationListView.swift:365-403`)
- Swipe trailing → encore méthodes VM (`:406-465`) ; seul Block utilise BlockService correctement
- Context menu (13 actions) : aucun appel store/composite
- Headers de section : `toggleSection()` mute du `@State` local, jamais `UserCategoryStore` ; drop non implémenté (`:491-502`)
- `ConversationView` header : pas de sink store
- `ConversationOptionsSheet` : utilise le `ConversationOptionsViewModel` legacy
- `ConversationInfoSheet` : param statique, pas de sink
- UI « removal pending » (`pendingMutationCount > 0`) : grep vide côté `apps/ios` (champ SDK-only)
- Snapshot tests `ThemedConversationRow` × 9 états : absents
- Snapshot tests `ConversationOptionsSheet` × variantes : absents

### Phase 8 — Smoke + cleanup (bloquée sur 6/7)
- Suppression des 8 shims `@available(*, deprecated)` (`CoreModels.swift:180-226`) — bloquée jusqu'à 6/7
- Suppression ~700 lignes obsolètes : non faite
- `tasks/lessons.md` non mis à jour (inchangé depuis 2026-06-01)
- Section Review de todo.md toujours `_To be filled after Phase 8._`

## UNCERTAIN (6)
- Phase 3 — `schemaVersion` mismatch→drop : implémenté (`ConversationStateOutbox.swift:363-365`) mais pas de test dédié du chemin drop
- Phase 4 — Injectables : 3 protocoles lean injectés (vs 4 spec, CacheCoordinator volontairement différé) — divergence vs lettre du spec, intention respectée
- Phase 6 — debounce Options VM 1×/500ms : scaffolding présent, pas de test du timing exact
- Phase 8 — 3 scénarios E2E XCUITest : aucun fichier XCUITest ne les implémente

## NA / opérationnel (4)
- Laisser `ConversationSettingsViewModel` intact (intentionnel, hors scope)
- Gate `meeshy.sh test` / Gateway vitest / Web turbo lint : nécessitent exécution, non vérifiables depuis le repo

## Conclusion
Couche SDK (Phases 2–5) **shippable et testée**. Les 34 items ouverts se
concentrent sur les Phases 6–7 (refonte ViewModels + re-câblage UI complet),
plus les helpers/listeners store de la « Phase 4 bis » dont elles dépendent,
plus le cleanup Phase 8 gated. **Aucune surface UI ne consomme actuellement
`ConversationStore` ni `UserCategoryStore`** — la feature n'est pas user-facing.
