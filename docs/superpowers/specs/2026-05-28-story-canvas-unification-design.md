# Story Canvas Unification — design

**Date** : 2026-05-28
**Auteur** : Claude (Opus 4.7) — discussion avec @jcnm
**Statut** : Design — implémentation à planifier post-launch (Option B)
**Effort estimé** : ~3 jours
**Prérequis** : Fix surgical A est mergé sur main (commit forthcoming, 2026-05-28)

## Contexte

Le lecteur de stories iOS maintient aujourd'hui **deux hiérarchies de canvas
parallèles** pour le slide courant :

1. `StoryReaderPrefetcher` — bootstrappe **jusqu'à 4 `StoryCanvasUIView`** dans
   son `hostView` invisible (1×1 px, alpha 0) : `[N-1, N, N+1, N+2]`. Chaque
   canvas charge son image bg, attache son `AVPlayer`, prépare son `audioMixer`.
2. `StoryCardView` — instancie **1 à 2 `StoryReaderRepresentable`** dans le
   ZStack visible : le canvas courant (sur `currentStory`) et, pendant un
   cross-fade, le canvas sortant (sur `outgoingStory`).

Total instancié simultanément pour un slide visible : **5 à 6 canvas**,
**chacun avec son propre arbre `AVPlayer` + `ReaderAudioMixer` + display link**.

### Sources de bleed identifiées (Fix A 2026-05-28)

Le Fix A surgical résout :
- ✅ Outgoing canvas force `.edit` mode (`isOutgoing: true`) → pas de bleed pendant cross-fade
- ✅ Prefetcher reste en `.edit` à vie → pas de double-lecture parallèle

Mais conserve l'architecture multi-canvas. Les coûts résiduels :
- **Mémoire** : 4 prefetcher canvases × ~30-50 MB (image bg décodée + `AVURLAsset` + layers) = 120-200 MB de baseline pour 4 slides chargés simultanément. Sur iPhone SE / 12 mini c'est en bordure de pression mémoire.
- **CPU** : 4 décodages image en parallèle au mount du window, 4 fetch d'asset AVPlayer
- **Sync risk** : la transition repose sur la séquence implicite SwiftUI `body re-eval → makeUIView nouveau canvas → onChange → refreshPrefetchWindowAndTimer`. Tout changement de cet ordre (priorities, async scenePhase) peut re-introduire des races.

## Objectif Option B

**Un seul `StoryCanvasUIView` par identité de slide dans tout l'arbre de l'app.**

Le prefetcher bootstrappe les canvas hors-écran. Quand le viewer arrive sur un
slide, le canvas du prefetcher est **re-parented** dans le slot visible (au lieu
d'être instancié à nouveau). Quand le viewer quitte le slide, le canvas est
re-parented vers le `hostView` du prefetcher.

### Bénéfices attendus

- **Mémoire** : ~30 % de réduction du baseline (1 canvas visible + 3 préchargés au lieu de 5-6)
- **Fluidité** : la transition entre slides ne passe plus par un cycle `makeUIView` complet → première frame du nouveau slide instantanée
- **Garantie d'invariant** : impossible structurellement d'avoir 2 canvases en `.play` pour le même slide
- **Cross-fade simplifié** : snapshot UIImage à la place du double canvas — fini les hacks `isOutgoing`

## Architecture proposée

### Phase 1 — API de transfert dans le prefetcher

`StoryReaderPrefetcher` expose :

```swift
extension StoryReaderPrefetcher {
    /// Retire le canvas de son hostView, le démonte du parent actuel s'il en a
    /// un, et le retourne au caller. Le canvas conserve son état (image cache,
    /// AVPlayer asset, audio mixer en `.edit`).
    ///
    /// - Returns: Le canvas si bootstrapé, sinon `nil`.
    public func adopt(itemId: String) -> StoryCanvasUIView?

    /// Re-parente un canvas vers le hostView du prefetcher (slot off-screen).
    /// Le caller appelle ça quand le slide quitte l'écran et qu'on veut
    /// préserver le canvas pour un retour rapide.
    public func release(canvas: StoryCanvasUIView, itemId: String)
}
```

### Phase 2 — `StoryCardCanvasHost` UIViewRepresentable

Nouveau type qui remplace `StoryReaderRepresentable` dans le ZStack :

```swift
struct StoryCardCanvasHost: UIViewRepresentable {
    let storyId: String
    let prefetcher: StoryReaderPrefetcher
    // ... autres params timeline

    func makeUIView(context: Context) -> StoryCanvasHostView {
        let host = StoryCanvasHostView()
        // makeUIView ne crée PAS de StoryCanvasUIView — il attend que
        // updateUIView pige le canvas du prefetcher
        return host
    }

    func updateUIView(_ host: StoryCanvasHostView, context: Context) {
        // Promotion : adopte le canvas du prefetcher pour le slide courant
        if host.currentSlideId != storyId {
            host.returnCurrentCanvasToPrefetcher(prefetcher)
            if let canvas = prefetcher.adopt(itemId: storyId) {
                host.installCanvas(canvas)
                canvas.setMode(.play, time: .zero)
                // Bind isPaused, mute, callbacks comme aujourd'hui
            }
            host.currentSlideId = storyId
        }
        // Updates idempotents : isPaused, mute, callbacks
    }
}
```

`StoryCanvasHostView` est un simple `UIView` qui :
- Layout son child canvas en `frame = bounds` (résize)
- Tracke quel `storyId` est actuellement adopté
- Forwarde les callbacks (`onContentReady`, `onPlaybackTime`) du canvas vers la closure du Representable

### Phase 3 — Cross-fade via snapshot UIImage

Remplace le double-canvas du cross-fade par une `UIImage` snapshot :

```swift
// Dans crossFadeStory, AVANT le swap :
let outgoingSnapshot: UIImage? = {
    guard let view = visibleHost else { return nil }
    let renderer = UIGraphicsImageRenderer(bounds: view.bounds)
    return renderer.image { ctx in view.layer.render(in: ctx.cgContext) }
}()
// Le snapshot est posé dans le ZStack à la place de StoryReaderRepresentable(outgoing)
// — pure Image SwiftUI, zéro media playback possible.
```

`outgoingStory: StoryItem?` devient `outgoingSnapshot: UIImage?`. Le ZStack
affiche `if let snap = outgoingSnapshot { Image(uiImage: snap)... }` à la place
du canvas représentable.

### Phase 4 — Garbage collection & cycle de vie

| Événement | Action |
|-----------|--------|
| Viewer `onAppear` | Prefetcher attaché. Adopt canvas du slide courant. Bootstrap N-1, N+1, N+2. |
| Slide change `N → N+1` | Snapshot du visible. Return canvas N au prefetcher (en `.edit`). Adopt canvas N+1 du prefetcher. Bootstrap N+2 (et drop N-2 si hors fenêtre). |
| Slide change `N → N-1` | Idem en miroir. |
| Group change | Snapshot du visible. Detach + rebuild prefetcher pour le nouveau groupe. |
| Viewer `onDisappear` | Return visible au prefetcher (puis detach). |
| Memory warning | Detach prefetcher. Le canvas visible reste mais ses voisins sont évacués. |

Le canvas en transit (entre `adopt` et `install`) ne doit jamais être en `.play`
plus d'un seul layout pass — sinon SwiftUI peut décider de réutiliser l'ancien
host et on perd le contrôle. `setMode(.play)` est appelé **explicitement après**
`installCanvas(canvas)` dans `updateUIView`.

### Phase 5 — Tests

#### Unit (MeeshyUITests)
- `test_adopt_removesFromHostView` : adopt retire bien le canvas du hostView du prefetcher
- `test_adopt_preservesCanvasState` : après adopt + setMode(.play), le canvas joue ; après release + adopt à nouveau, l'image bg est toujours en cache (pas de redécodage)
- `test_release_returnsCanvasToHostView` : release re-parent le canvas vers le hostView et appelle setMode(.edit)
- `test_evict_evictsAdoptedCanvas` : si un canvas est adopté ET son slide quitte la fenêtre, l'éviction est différée jusqu'au release explicite

#### Integration (MeeshyTests)
- `test_navigation_N_to_N+1_reusesPrefetcherCanvas` : après navigation, le canvas visible est le MEME ObjectIdentifier que celui bootstrapé en N+1 par le prefetcher
- `test_navigation_doesntCreateDuplicateCanvas` : compteur d'instances `StoryCanvasUIView` reste stable à 4 (max window) après 10 navigations

#### Smoke UI (manuel)
- Naviguer 20 stories vidéo rapidement → vérifier pas de bleed audio
- Backgrounder l'app pendant cross-fade → resume sans canvas zombie
- Memory warning simulé → seul le canvas visible reste

## Risques identifiés

| # | Risque | Mitigation |
|---|--------|------------|
| R1 | Canvas réutilisé carrie son `currentTime` résiduel → slide N+1 part au milieu | `setMode(.play, time: .zero)` explicite à chaque adopt |
| R2 | Window SwiftUI rebuild force `makeUIView` à recréer le hostView → on perd la référence au canvas | `StoryCanvasHostView` stocke le canvas en `@State`-equivalent (UIView ivar). Tests SwiftUI lifecycle. |
| R3 | iOS suspend l'AVPlayer hors window → canvas adopté présente une vidéo gelée | `willMove(toWindow:)` du canvas reste comme aujourd'hui. Le hostView est en window via `hostView` du prefetcher (1×1 alpha 0), donc l'AVPlayer reste vivant en `.edit`. |
| R4 | Cross-fade snapshot capture une image vide si le visible n'a pas encore fait son premier draw | Skip snapshot si `view.bounds.isEmpty` → fallback gradient `storyBackground` |
| R5 | Eviction d'un canvas adopté en plein cross-fade | Refcount sur `bootstrapped[itemId]` : `adopt` incrémente, `release` décrémente. `evict` ne supprime que si refcount = 0. |
| R6 | Tests d'intégration existants asserent `[N-1, N, N+1]` (stale) — déjà cassés mais à mettre à jour | Mettre à jour windowIndices expectations dans `StoryViewerView_PrefetchTimerIntegrationTests` |

## Effort détaillé

- **Jour 1** : Phase 1 + Phase 4 lifecycle. Refcounting, adopt/release API. Tests unitaires.
- **Jour 2** : Phase 2 `StoryCardCanvasHost`. Wiring dans `StoryCardView` (remplace `StoryReaderRepresentable` du visible). Tests d'intégration.
- **Jour 3** : Phase 3 snapshot cross-fade. Tests visuels. Smoke device. Cleanup `isOutgoing` (devient inutile).

## Out of scope

- Refacto `StoryCardView` body global (les 10 layers ZStack restent)
- Refacto `StoryViewerView+Content.startTimer` (le wall-clock reste — c'est le choix utilisateur 2026-05-28)
- Modifications du `ReaderAudioMixer` ou du `PlaybackCoordinator`
- iPhone SE memory pressure tuning (orthogonal)

## Décision de timing

À implémenter **après** que le Fix A surgical soit en prod et validé sur device.
Pas avant launch — l'unification est une optimisation, pas une feature critique.
Le Fix A élimine le bleed observable à l'œil/oreille, l'Option B améliore la
structure interne (memory, fluidité) sans changer la perception utilisateur.

## Références

- Fix A surgical : commit forthcoming 2026-05-28 sur main
  - `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift` (isOutgoing param)
  - `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift` (call-site isOutgoing: true)
  - `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift` (suppression p.activate)
  - `packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/StoryReaderRepresentableOutgoingTests.swift` (tests)
- Architecture actuelle : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryReaderPrefetcher.swift`
- Sources de double-lecture identifiées : conversation 2026-05-28 user @jcnm
