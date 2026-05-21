# iOS hardening — follow-up (post PR #280)

> **Branche** : `claude/ios-hardening-followup-5KnB2` (depuis `main`)
> **Contexte** : PR #280 (`claude/analyze-ios-weaknesses-3aXOc`) est mergée. Cette
> branche reprend les items P4.1 / P4.2 / P5.1 / P4.3 qui restaient
> `⏳ partiel` ou `⛔ deferred` après ce premier round, dans l'ordre du plus
> facile au plus complexe pour qu'un environnement Linux sans Xcode
> puisse les livrer en TDD sans casser le build.
> **Méthode** : protocoles + DI + tests avec `MockAPIClientForApp` (déjà
> dans `MeeshyTests/Mocks/`) et `JSONStub` (déjà dans `MeeshyTests/Helpers/`).

---

## Inventaire après PR #280

### Déjà livré et mergé dans main

- P1.1 — App Store demo credentials sortis du code
- P1.2 — VoIP token migré UserDefaults → Keychain
- P1.3 — APNs registration validé + regression test
- P1.4 — SPKI public-key pinning + doc opérateur
- P1.5 — DB recovery on boot + diagnostics
- P2.1 — Translation request buffer + replay
- P2.2 — Socket re-auth validé + publisher
- P3.1 — Pagination coalescing validé + regression test
- P3.2 — `Locale.current` purgé du composer
- **P4.1 site 1/12** — `NewConversationView` → `NewConversationViewModel`
- **P4.1 site 2/12** — `SharePickerView` → `SharePickerViewModel`
- **P4.1 site 3/12** — `ConversationView+Header.navigateToDM` → `ConversationCreator`
- **P4.2 step 1/6** — `ConversationLanguagePreferences` struct extraite
- **P4.3 step 1/3** — `MeeshyTests` ajouté à `project.yml`
- **P5.1 partiel** — `MessageComposer` labellisé

### Reste à livrer

Liste exhaustive, classée du plus facile au plus complexe.

#### 🟢 Easy (≤ 30 min)

- [ ] **F1 — `ReplyThreadOverlay` refactor** (1 site `APIClient.shared.request`,
      ligne 97). Extraire un petit `ReplyThreadLoader` service ou un
      `ReplyThreadOverlayViewModel`. Le pattern est exactement celui de
      `ConversationCreator` qui est mergé.
- [ ] **F2 — `ThreadView` refactor** (1 site `APIClient.shared.request`,
      ligne 237 — paginated message fetch). Sortir un `ThreadViewModel`
      analogue à `NewConversationViewModel`. Tests : load success +
      load failure + pagination cursor.
- [ ] **F3 — A11y batch sur Components** : 174 `Image(systemName:)` dans
      `Features/Main/Components/`, seulement 28 ont `accessibilityLabel`.
      Cible les boutons / glyphes signifiants (pas les chevrons /
      séparateurs / dots décoratifs). Estimation : 10-20 vrais sites.

#### 🟡 Medium (30-90 min)

- [ ] **M1 — `StoryInteractionService`** : 5 sites `try? await
      APIClient.shared.post` dans `StoryViewerView+Canvas/+Sidebar/+Content`
      (×3). Extraire un service unique exposant `react(storyId:emoji:)`,
      `markView(storyId:)`, etc. Remplacer le `try?` muet par un logger
      `os.fault` — silencer une erreur de reaction est OK, mais on doit
      au moins le savoir en debug. Tests sur le service avec
      `MockAPIClientForApp`.
- [ ] **M2 — `ConversationUIState` struct** : grouper les ~15 booléens
      loading de `ConversationViewModel` (`isLoadingInitial`,
      `isLoadingOlder`, `isLoadingTranslations`, etc.) dans une struct
      Equatable unique. Réduit le nombre de `@Published` et donc le
      thrashing de re-render. Pattern : `enum LoadingPhase { .idle,
      .loadingInitial, .loadingOlder, .loaded, .error(String) }`. Tests
      sur les transitions.

#### 🟠 Hard (2-4h)

- [ ] **H1 — `ConversationPresenceCoordinator`** : extraire
      `typingUsernames: Set<String>` + `activeLiveLocations: [String:
      LiveLocation]` du gros VM. Pas de coupling avec les messages →
      extraction safe. `@MainActor class` + `@Published private(set)`
      properties. Tests sur typing add/remove avec timeout.
- [ ] **H2 — Refactor des 4 dernières views Story** au pattern MVVM
      (StoryViewerView+Canvas, +Sidebar, +Content). Si M1 est livré,
      ce point devient mécanique.

#### 🔴 Blocked / Deferred (besoin Xcode/macOS)

- [ ] **B1 — `xcodegen generate` validation** + suppression des 20
      scripts Ruby. `xcodegen` non disponible sur cet env Linux.
- [ ] **B2 — `ConversationTranslationCoordinator`** (P4.2 step 2). Actor
      partagé, beaucoup de call-sites, ne JAMAIS livrer sans build +
      smoke test.
- [ ] **B3 — `ConversationMessageSender`** (P4.2 step 4). Touche au
      flow envoi + OfflineQueue. Trop risqué sans simulateur.
- [ ] **B4 — Façade ConversationViewModel finale** (P4.2 step 6).
      Suite logique de B2 + B3 + H1.

---

## Plan d'exécution sur cette branche

1. F1 (`ReplyThreadOverlay`) — commit + push
2. F2 (`ThreadView`) — commit + push
3. F3 (A11y batch) — commit + push
4. M1 (`StoryInteractionService`) — commit + push
5. M2 (`ConversationUIState`) — commit + push
6. H1 (`ConversationPresenceCoordinator`) — commit + push
7. Self-review + récap pour PR

Chaque commit indique les fichiers à ajouter au target via Xcode (le
quirk pbxproj-explicit-refs persiste tant que B1 n'est pas livré).

---

## Résultat livré sur cette branche

| ID | Item | Statut | Commit |
|----|------|--------|--------|
| F1 | `ReplyThreadOverlay` → `ReplyThreadLoader` | ✅ Livré | 186923a |
| F2 | `ThreadView` → `ThreadRepliesLoader` | ✅ Livré | d591dc8 |
| F3 | A11y batch (audio/video controls + 2 sheets) | ✅ Livré | 2209aca |
| M1 | `StoryInteractionService` (4 sites + loadViewers) | ✅ Livré | f3a92be + eadf07d |
| M2 | `ConversationLoadingPhase` (additive enum) | ✅ Livré | f734bc7 |
| H1 | `ConversationPresenceCoordinator` | ⛔ Skippé — voir ci-dessous |

### Pourquoi H1 a été skippé

L'extraction de `typingUsernames` + `activeLiveLocations` nécessite :
- Modifier `ConversationSocketHandler.Delegate` (protocole utilisé par
  10+ mutations dans le handler)
- Mettre à jour ~5 vues qui lisent ces propriétés
- Garantir que les `@Published` réactivités SwiftUI restent intactes

Sans boucle Xcode pour vérifier compile + smoke test simulateur, le
risque d'introduire une régression silencieuse (re-render brisé,
état désynchronisé entre socket et UI) est trop élevé. Le pattern
M2 (additive : nouveau type + computed property, anciens champs
préservés) ne marche pas ici parce que la coordination presence est
mutative (le socket handler ÉCRIT dans ces propriétés via le
delegate).

**Action de reprise** : à exécuter sur macOS avec une boucle Xcode
disponible. Plan :
1. Créer `ConversationPresenceCoordinator` (@MainActor class)
2. Ajouter méthodes `addTyping(name:)`, `removeTyping(name:)`,
   `upsertLocation(...)`, `removeLocation(userId:)`
3. Garder `typingUsernames` et `activeLiveLocations` sur VM en
   delegated computed property → coordinator
4. Refactor `ConversationSocketHandler` pour appeler les méthodes
   du coordinator au lieu de muter via le delegate
5. Smoke test simulateur : ouvrir conversation, vérifier que
   "X est en train d'écrire" apparaît correctement

### Récap chiffres

- **6 commits** sur cette branche
- **8 fichiers Swift nouveaux** (4 services + 1 modèle + 3 tests)
- **3 fichiers Swift modifiés** (4 vues + 1 ViewModel)
- **~33 nouveaux tests** ajoutés
- **5 sites `APIClient.shared` retirés** des Views (3 POSTs + 2 GETs)
- **6 boutons a11y** correctement labellisés

### Actions utilisateur (post-merge)

1. **Ajouter les 8 fichiers .swift au project.pbxproj** via Xcode
   (services + modèle + tests). Les paths :
   - `apps/ios/Meeshy/Features/Main/Services/ReplyThreadLoader.swift`
   - `apps/ios/Meeshy/Features/Main/Services/ThreadRepliesLoader.swift`
   - `apps/ios/Meeshy/Features/Main/Services/StoryInteractionService.swift`
   - `apps/ios/Meeshy/Features/Main/Models/ConversationLoadingPhase.swift`
   - `apps/ios/MeeshyTests/Unit/Services/ReplyThreadLoaderTests.swift`
   - `apps/ios/MeeshyTests/Unit/Services/ThreadRepliesLoaderTests.swift`
   - `apps/ios/MeeshyTests/Unit/Services/StoryInteractionServiceTests.swift`
   - `apps/ios/MeeshyTests/Unit/Models/ConversationLoadingPhaseTests.swift`
2. **Lancer `./apps/ios/meeshy.sh test`** pour valider que les
   ~33 nouveaux tests passent.
3. **Reprendre H1** quand un développeur avec macOS + simulateur est
   disponible (cf. plan ci-dessus).
4. **Reprendre B1** (xcodegen + suppression des 20 scripts Ruby) sur
   le même environnement.
