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
