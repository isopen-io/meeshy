# Story Reader — Residual Gaps Design

**Status** : Design v4 — Périmètre réduit après audit code actuel
**Date** : 2026-05-27
**Branche cible** : `feat/ios-story-reader-residual-gaps`

## Contexte (lecture obligatoire avant impl)

L'audit initial pointait 6 P1 + 9 P2 + 16 P3 dans le lecteur de stories. Vérification ligne-à-ligne contre `main` (commit cd8780892 et précédents 2026-05-25 → 2026-05-27) :

- 🟢 **8 items déjà fixés** sur main (T3 9:16, T4 6s, T5 canvas source of truth, T6 `roundedUpToBgLoops`, T7 canonical 48kHz audio, T9-B1/B2/B3/B4, U6 warm-cache, U9 KVO race, U13/U14/U15)
- ⚪ **1 WONTFIX** (MI4 corrupt-file UI feedback — conflit avec Prisme Linguistique "no banniere intrusive")
- 🔴 **4 vrais gaps résiduels** : U10, U11, U12, MI2
- 🟡 **2 à arbitrer** : MI1 (narrow KVO race), MI3 (cross-fade timer ordering)

Ce spec couvre uniquement les 6 derniers — un seul PR de cleanup, mergeable en 1 sprint court.

---

## Gap 1 — `MediaSessionCoordinator` consolidation (U11)

### Bug

Deux sites configurent `AVAudioSession` concurremment :

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/StoryMediaCoordinator.swift:40
try AVAudioSession.sharedInstance().setCategory(
    .playback, mode: .default,
    options: [.mixWithOthers, .duckOthers]
)

// packages/MeeshySDK/Sources/MeeshySDK/MediaSessionCoordinator.swift:73
setCategory(.playback, mode: .default, options: [.duckOthers])
```

`MediaSessionCoordinator` est l'entry-point canonique (refcount + interruption observers). `StoryMediaCoordinator.activate` est appelé depuis le reader et écrase les options du coordinator. Le dernier qui écrit gagne — comportement non-déterministe.

### Fix

`StoryMediaCoordinator.activate` délègue au coordinator central :

```swift
// StoryMediaCoordinator.swift — replace lines 38-42
public func activate(onStop: @escaping () -> Void) {
    self.onStop = onStop
    Task {
        try? await MediaSessionCoordinator.shared.request(role: .playback)
    }
    // Mute orchestration reste local (out of scope du coordinator central)
}

public func deactivate() {
    Task {
        await MediaSessionCoordinator.shared.release(role: .playback)
    }
    onStop = nil
}
```

**Décision options** : conserver `.duckOthers` (déjà le standard du coordinator central) **sans** `.mixWithOthers` :
- `.duckOthers` : baisse les autres apps quand on joue → OK pour le reader stories (TikTok-like)
- pas de `.mixWithOthers` : on prend le contrôle exclusif → garantit A2DP haute qualité sur Bluetooth

Si on découvre en QA un cas où user attendait "musique externe coexiste", on rajoutera `.mixWithOthers` côté `MediaSessionCoordinator` — pas dans 2 endroits.

### Edge cases

- Reader ouvert pendant appel : `MediaSessionCoordinator.shared.request(role: .playback)` est compatible (system mix automatique avec call session)
- Composer preview + reader simultanés : counter du coordinator handle correctement
- Interruption Siri/Bluetooth : déjà observée par `MediaSessionCoordinator`, pas de duplication ici

### Tests

- `StoryMediaCoordinatorTests`
  - `test_activate_delegatesToMediaSessionCoordinator`
  - `test_activate_doesNotCallSetCategoryDirectly`
  - `test_deactivate_releasesCoordinatorRole`

---

## Gap 2 — `StoryReaderPrefetcher.detach()` demotes canvas avant remove (MI2)

### Bug

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderPrefetcher.swift:83-87
public func detach() {
    bootstrapped.values.forEach { $0.removeFromSuperview() }
    bootstrapped.removeAll()
    hostView.removeFromSuperview()
}
```

Le canvas actif a été flipé à `.play` par `activate(currentId:)`. `removeFromSuperview()` tear-down le `editDisplayLink` (via `didMoveToWindow → stopEditDisplayLink`) mais **pas** l'`AVAudioEngine` du mixer ni les nodes registrés sur le `PlaybackCoordinator`. Sous SwiftUI, l'ARC dealloc est non-déterministe → audio peut continuer à spin quelques ms après que l'user a fermé le reader → "blip" audible si on rouvre rapidement.

### Fix

Démouter explicitement chaque canvas en `.edit` (qui tear-down le mixer via la mode-change machinery existante) avant `removeFromSuperview` :

```swift
// StoryReaderPrefetcher.swift:83-87 — remplacer
public func detach() {
    bootstrapped.values.forEach { canvas in
        if canvas.mode != .edit { canvas.setMode(.edit) }
        canvas.removeFromSuperview()
    }
    bootstrapped.removeAll()
    hostView.removeFromSuperview()
}
```

### Edge cases

- Detach pendant un `setMode(.play)` en cours : la mode-change machinery est `@MainActor` synchrone, séquence garantie
- Canvas en `.edit` (prefetched non-promoted) : `if canvas.mode != .edit` saute le flip, juste removeFromSuperview
- Detach immédiatement après `attach(to:)` : `bootstrapped` est vide, loop no-op

### Tests

- `StoryReaderPrefetcherTests`
  - `test_detach_demotesActiveCanvasToEdit_beforeRemoval`
  - `test_detach_skipsModeFlip_forAlreadyEditCanvases`
  - `test_detach_clearsAllStateAtomically`

---

## Gap 3 — Prefetch timeout par URL (U12)

### Bug

```swift
// apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift:996-1012
// prefetchAllMedia loop
for url in uniqueURLs {
    Task {
        _ = try? await imageStore.data(for: url)  // pas de timeout
        _ = try? await imageStore.image(for: url)
    }
}
```

Pas de `URLSession.timeoutIntervalForRequest` override. URL cassée + TCP stuck → ~60s par fetch zombie. `prefetchAllMedia` est appelé 3× par `crossFadeStory` (current + N+1 + N+2) + 1× par swipe → leak cumulable sur réseau mauvais.

### Fix

Wrapper léger avec `withThrowingTaskGroup` race timeout :

```swift
// Nouveau helper dans apps/ios/Meeshy/Features/Main/Services/PrefetchTimeoutHelper.swift
@MainActor
public enum PrefetchTimeoutHelper {
    /// Race `op` against an 8s timeout. Cancels op on timeout to free the
    /// connection slot. Returns nil on timeout/error (silent — diagnostic
    /// via Logger only).
    public static func withTimeout<T>(
        _ seconds: TimeInterval = 8.0,
        _ op: @escaping () async throws -> T
    ) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { try? await op() }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return nil
            }
            defer { group.cancelAll() }
            return await group.next() ?? nil
        }
    }
}
```

Usage dans `prefetchAllMedia` :

```swift
for url in uniqueURLs {
    Task {
        _ = await PrefetchTimeoutHelper.withTimeout {
            try await imageStore.data(for: url)
        }
    }
}
```

### Edge cases

- Fetch déjà cached → retourne immédiatement, pas de course timeout
- URL valide mais lente (≥8s) → cancellation silencieuse, fallback affiché par le canvas (loader spinner existing path)
- Slide swipe pendant fetch → `Task` du parent cancellé, `group.cancelAll()` propage

### Tests

- `PrefetchTimeoutHelperTests`
  - `test_withTimeout_returnsResult_whenOpCompletesBeforeTimeout`
  - `test_withTimeout_returnsNil_whenOpExceedsTimeout`
  - `test_withTimeout_cancelsOp_onTimeout`

---

## Gap 4 — Cross-group prefetch peek (U10)

### Bug

`prefetchCurrentGroup()` (lignes 1025-1037 de `+Content.swift`) prefetch raw bytes du groupe courant + 2 premières slides du groupe suivant via `imageStore`. Mais `StoryReaderPrefetcher.updateWindow` (qui bootstrap les `StoryCanvasUIView` complets) reçoit uniquement `currentGroupStories`. À la frontière de groupe, la 1ère story du groupe suivant paye :
- Layer tree build
- KVO setup AVPlayer
- `onContentReady` wait

= ~150-300ms de loader au passage de user → user-A à user-B malgré que les raw bytes soient warm en cache disque.

### Fix

Étendre `StoryReaderPrefetcher.updateWindow` pour accepter un `nextGroupPeek: StoryItem?` (juste la slide 0 du groupe N+1) :

```swift
// StoryReaderPrefetcher.swift — nouvelle surcharge
public func updateWindow(items: [StoryItem],
                         currentIndex: Int,
                         nextGroupPeek: StoryItem? = nil,
                         previousGroupPeek: StoryItem? = nil,
                         context: StoryReaderContext,
                         preferredLanguages: [String]) {
    guard !items.isEmpty,
          items.indices.contains(currentIndex) else {
        evict(keeping: [])
        return
    }

    let intraGroupIndices = windowIndices(around: currentIndex, count: items.count)
    var desiredIds = Set(intraGroupIndices.map { items[$0].id })

    var allToBootstrap: [StoryItem] = intraGroupIndices.map { items[$0] }
    if currentIndex >= items.count - 1, let peek = nextGroupPeek {
        // On est sur la dernière slide → peek la slide 0 du groupe suivant
        desiredIds.insert(peek.id)
        allToBootstrap.append(peek)
    }
    if currentIndex == 0, let peek = previousGroupPeek {
        desiredIds.insert(peek.id)
        allToBootstrap.append(peek)
    }

    evict(keeping: desiredIds)
    for item in allToBootstrap where bootstrapped[item.id] == nil {
        bootstrap(item: item,
                  context: context,
                  preferredLanguages: preferredLanguages)
    }
}
```

L'API existante (sans peek params) reste fonctionnelle via les defaults `nil`.

Côté caller (`StoryViewerView.swift` autour de la ligne 666) :

```swift
let nextGroupPeek: StoryItem? = {
    guard currentGroupIndex < groups.count - 1 else { return nil }
    let nextGroup = groups[currentGroupIndex + 1]
    let entry = nextGroup.stories.firstIndex(where: { !$0.isViewed }) ?? 0
    return nextGroup.stories.indices.contains(entry) ? nextGroup.stories[entry] : nil
}()
let prevGroupPeek: StoryItem? = {
    guard currentGroupIndex > 0 else { return nil }
    let prevGroup = groups[currentGroupIndex - 1]
    let entry = prevGroup.stories.lastIndex(where: { !$0.isViewed }) ?? 0
    return prevGroup.stories.indices.contains(entry) ? prevGroup.stories[entry] : nil
}()

prefetcher.updateWindow(
    items: currentGroupStories,
    currentIndex: currentStoryIndex,
    nextGroupPeek: nextGroupPeek,
    previousGroupPeek: prevGroupPeek,
    context: readerContext,
    preferredLanguages: preferredLanguages
)
```

### Edge cases

- Premier groupe + idx 0 : `prevGroupPeek = nil`, pas de fetch arrière
- Dernier groupe + dernière slide : `nextGroupPeek = nil`, callback `onReachedEnd` ferme
- Groupe suivant entièrement `isViewed` → fallback index 0 (cohérent Instagram)
- Single-slide group + peek : `intraGroupIndices.count = 1`, peek ajoutée seulement si on est ON slide 0 (les 2 conditions `currentIndex >= items.count - 1` et `currentIndex == 0` sont vraies simultanément pour single-slide → 2 peeks possibles, OK)
- Memory budget : +1 ou +2 canvas peek = ~3-6 MB extra. Acceptable.

### Tests

- `StoryReaderPrefetcherCrossGroupTests`
  - `test_updateWindow_bootstrapsNextGroupPeek_atLastSlideOfGroup`
  - `test_updateWindow_bootstrapsPrevGroupPeek_atFirstSlideOfGroup`
  - `test_updateWindow_doesNotPeekNext_whenInMiddleOfGroup`
  - `test_updateWindow_evictsPeek_whenLeavingBoundary`
  - `test_updateWindow_singleSlideGroup_peeksBothSides`

---

## Arbitrage 1 — MI1 narrow KVO race (`pendingVideoReadinessTask`)

### Bug suspecté

`StoryCanvasUIView.swift:1556-1577` — entre l. 1562 (entrée if-branch) et l. 1568 (install observer), une cancellation est ignorée. Slide swipe pendant ces ~3-5 instructions → observer installé sur `backgroundLayer` du nouveau slide.

### Évaluation

Race extrêmement étroite (< 1 frame typique). En pratique le `slideContentRevision` capture sur l'enclosing scope rend l'observer obsolète au prochain tick — mais l'observer peut tout de même firer `backgroundDidBecomeReady` une fois sur le nouveau slide → `onContentReady` peut firer prématurément si timing aligne.

**Décision proposée** : fix minimal une ligne, faible risque. Ajouter une garde `Task.isCancelled` entre l. 1567 et l. 1568 :

```swift
// StoryCanvasUIView.swift:1567 — ajouter avant install observer
if Task.isCancelled { return }
videoStatusObserver = item.observe(\.status, options: [.new]) { ... }
```

### Tests

- `StoryCanvasReadinessRaceTests`
  - `test_pendingVideoReadinessTask_doesNotInstallObserver_afterCancellation`

---

## Arbitrage 2 — MI3 cross-fade timer ordering

### Bug suspecté

`StoryViewerView+Content.swift:451-456` :
```swift
restartTimer()  // l. 451 — appelé AVANT cleanup
DispatchQueue.main.asyncAfter(deadline: .now() + animDuration + 0.04) {
    outgoingStory = nil
    isTransitioning = false
}
```

Le nouveau timer démarre pendant que l'overlay sortant est encore monté (~0.39s).

### Évaluation

Vérification : le proxy de progress gate sur `isContentReady` (ligne 591 du même fichier). Donc le timer ne TICK pas tant que le nouveau canvas n'est pas prêt. **Pas de bug visible**. C'est juste un sequencing "smell" mais le contrat est respecté.

**Décision proposée** : pas de fix. Ajouter un test qui assert ce contrat pour qu'une régression future ne casse pas la propriété :

```swift
// StoryViewerContentTimerTests
// test_restartTimer_calledDuringTransition_doesNotAdvanceProgress_untilContentReady
```

Si le test révèle un comportement inattendu, on revoit. Sinon, on documente le pattern (commentaire dans le code).

---

## Critères d'acceptation

| # | Critère | Gap |
|---|---|---|
| 1 | `StoryMediaCoordinator.activate` ne fait plus de `setCategory` direct, route via `MediaSessionCoordinator.request(role: .playback)` | U11 |
| 2 | `MediaSessionCoordinator.shared.currentRoute` après ouverture reader = `.bluetoothA2DP` sur AirPods (manuel device QA) | U11 |
| 3 | `StoryReaderPrefetcher.detach()` flippe tous les canvas en `.edit` avant remove | MI2 |
| 4 | Aucun audio blip mesurable au reader close + reopen rapide | MI2 |
| 5 | `prefetchAllMedia` cancel les URL stuck après 8s, log un warning silencieux | U12 |
| 6 | À la frontière de groupe, transition user-A → user-B sans loader visible (>150ms) | U10 |
| 7 | `videoStatusObserver` non installé après cancel race | MI1 |
| 8 | `restartTimer` pendant cross-fade n'avance pas `progress` avant content ready (asserté par test) | MI3 |
| 9 | Tous tests existants verts + ≥ 12 nouveaux tests passants | toutes |

## Risques

1. **U11 route via coordinator central** : si `MediaSessionCoordinator.request(role:)` a une sémantique légèrement différente (refcount, interruption handling), le comportement peut différer. Atténué par : c'est l'entry-point existant utilisé par le reste de l'app — convergence souhaitable.
2. **MI2 démotion `.edit` synchrone** : si le `setMode(.edit)` machinery déclenche un side-effect long (cache flush, file close), le detach peut prendre 50-100ms. Profile à mesurer en test.
3. **U12 timeout 8s** : valeur magique. Tester aussi avec 5s sur réseau lent simulé pour décider.
4. **U10 peek N+1** : +1 canvas en mémoire en permanence (~3-5 MB). Acceptable iPhone 16 Pro, à vérifier iPhone SE.

## Mergeabilité

Les 4 gaps + 2 arbitrages sont **indépendants** (fichiers distincts ou zones distinctes du même fichier). Tout peut atterrir dans **un seul PR** ou **6 PRs séparés**. Recommandation : 2 PRs :

- **PR 1** "story-reader-audio-session" : U11 + MI2 (les deux touchent l'audio path)
- **PR 2** "story-reader-prefetch" : U10 + U12 + MI1 + MI3 (les quatre touchent le prefetch/timer path)

Ordre : PR 1 d'abord (audio session = production-impactant), PR 2 ensuite.

## Non-objectifs

- Pas de nouvelle architecture (centralisation `StoryReaderAudioSession` rejetée — `MediaSessionCoordinator` existe déjà)
- Pas de migration window N±2 symétrique (intra-group ±2 déjà OK, juste peek aux frontières)
- Pas de fix MI4 (corrupt-file UI feedback — viole le Prisme Linguistique "no intrusive banner")
- Pas de re-touchage des 8 items déjà fixés sur main
