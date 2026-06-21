# Stories — Unification du lancement, cache & offline (iOS)

## Contexte / Diagnostic (preuves)
- **Bug principal (écran noir d'échec depuis les feeds)** : le chemin feeds présente le viewer via
  `.fullScreenCover(isPresented: $showStoryViewer)` + variable séparée `selectedStoryUserId`,
  toutes deux affectées dans le même closure de tap. SwiftUI évalue le contenu du cover avec
  `selectedStoryUserId` encore `nil` (capture périmée) → `uid` vide → `StoryViewerContainer.ensureGroupAvailable`
  marque immédiatement `timedOut` → `notFoundOverlay` (fond noir « réessayer/fermer »).
  Le chemin chats utilise `.fullScreenCover(item: $coordinator.pendingRequest)` (capture atomique) → pas de bug.
  Fichiers : FeedView.swift (iPad), RootViewComponents.swift `ThemedFeedOverlay` (iPhone feed).
- **TTL cache** (`CachePolicy.swift`) : `feedPosts = 6h` (souhaité 7 j), `stories = 24h` (déjà OK),
  médias images 1 an / vidéo+audio 6 mois (déjà OK).
- **Offline** : le chemin online insère les stories en optimiste (`insertOrAppendStoryItem`),
  mais le chemin offline (`enqueueStoryForOfflinePublish`) **n'insère rien** → l'auteur ne voit pas
  ses stories hors-ligne. La queue (`StoryPublishQueue`) persiste/retry déjà (FIFO + backoff).

## Plan
- [x] **P1 — Unifier le lancement (feeds == chats)** : présentation centralisée dans
      `StoryTrayView` + `PinnedStoryTrailBand` via `StoryViewerCoordinator` (`.fullScreenCover(item:)`).
      `onViewStory` optionnel (défaut = coordinator). Covers locaux divergents + états morts supprimés
      dans FeedView & RootViewComponents. Tap « story depuis avatar de post » routé via le coordinator.
- [x] **P2 — Cache TTL** : `feedPosts` 6h → 7 jours (fenêtre fraîche 5 min). `stories` reste 24h.
- [x] **P3 — Prefetch** : dédupe `prefetchedMediaURLs` (pas de re-sonde des médias déjà servis) +
      tray élargi 5→8 groupes / 3→4 slides à venir + fenêtre viewer N±1 → N+2 (`StoryReaderPrefetcher`).
- [x] **P4 — Offline optimiste** : insertion locale au moment de l'enqueue offline (cover composite
      rendu localement), préservation à travers les refetch réseau, réconciliation sur succès de publication.
- [x] Tests unitaires (VM + prefetcher) ajustés. ⚠️ Pas de toolchain Swift en local (Linux) → compilation
      vérifiée en CI / Codex.

## Review
### Cause racine du bug principal (écran noir depuis les feeds) — CONFIRMÉE
Le chemin feeds présentait `StoryViewerContainer` via `.fullScreenCover(isPresented: $showStoryViewer)`
avec `userId: selectedStoryUserId` (variable `@State` séparée, posée dans le même closure de tap).
SwiftUI évaluait le contenu du cover avec `selectedStoryUserId` encore `nil` (capture périmée) → `uid`
vide → `ensureGroupAvailable` marquait `timedOut` → `notFoundOverlay` (fond noir « réessayer/fermer »).
Le chemin chats n'avait pas le bug car il utilise `.fullScreenCover(item: $coordinator.pendingRequest)`
(capture atomique de la requête). **L'unification vers le coordinator supprime la cause à la racine.**

### Fichiers touchés
- `StoryTrayView.swift` : `onViewStory` optionnel + `presentStory()` (coordinator par défaut) sur la
  grande trail ET la mini-trail épinglée (env object coordinator ajouté à `PinnedStoryTrailBand`).
- `FeedView.swift` (iPad) : closures + cover local + 3 `@State` supprimés.
- `RootViewComponents.swift` (`ThemedFeedOverlay`, feed iPhone) : idem + tap post-author → coordinator
  (env object coordinator injecté).
- `CachePolicy.swift` : `feedPosts` TTL 6h → 7 j.
- `StoryViewModel.swift` : dédupe prefetch + élargissement, insertion/préservation/réconciliation offline,
  `insertOrAppendStoryItem` refactoré (variante champs primitifs car `APIAuthor` n'a pas d'init public).
- `StoryReaderPrefetcher.swift` (SDK) : fenêtre N±1 → asymétrique N+2 ; tests `windowIndices` ajustés.
- Tests : `StoryViewModelTests` (mediaURLStrings, optimisticStoryId, remove/insert optimistic, préservation
  au refetch), `StoryReader_PrefetchTests` (fenêtre N+2).

### Limites assumées (honnêteté)
- **Pas de compilation locale** (environnement Linux, aucune toolchain Swift/Xcode) → la compilation et
  l'exécution des tests se font en CI. Changements gardés chirurgicaux en conséquence.
- **Reorder manuel de la file offline NON livré** : la queue publie en FIFO (ordre d'enregistrement) avec
  retry auto à la reconnexion + persistance cross-restart ; chaque story est visible. Un écran de
  ré-ordonnancement drag-and-drop est une feature UI distincte, écartée du périmètre (risque sans compilateur).
- `ConversationView` (story depuis le header) garde le pattern `(isPresented:)` + uid séparé MAIS via un
  `ObservableObject` (mutations synchrones) — risque latent moindre, non signalé par l'utilisateur, laissé tel quel.
