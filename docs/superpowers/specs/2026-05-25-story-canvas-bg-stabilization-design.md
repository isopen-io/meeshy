# Story Canvas Background Stabilization — Design

**Date :** 2026-05-25
**Auteur :** Claude (Opus 4.7) avec J. Charles N. M.
**Status :** Brainstorm validé, prêt pour implementation plan
**Estimate :** 2–2.5 jours
**Scope :** `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/` + `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift`

## Contexte

Trois bugs distincts du composer de stories iOS partagent une même racine architecturale : la synchronisation entre le modèle Swift et les `CALayer` GPU du `StoryBackgroundLayer` n'est pas idéale.

| # | Bug | Root cause confirmée (investigation 2026-05-25) |
|---|-----|---|
| 1 | Vidéo paysage en background croppée (étirée pour remplir le canvas 9:16) | `StoryBackgroundLayer.swift:395` `videoGravity = .resizeAspectFill` hardcodé |
| 2 | Flash noir à chaque édition (frappe texte, drag/release sticker, drag bg) | `handlePan.ended` fait `slideContentRevision &+= 1` + `rebuildLayers()` → réassignation `layer.frame` + `layer.transform` sans `CATransaction.setDisableActions(true)` → animation implicite CALayer = fade noir entre deux frames |
| 3 | Drag du background visible sur mini-preview (haut du composer) mais pas sur canvas principal | `handlePan.changed` mute `slide.mediaObject.x/y` (vu par mini-preview qui rerend tout SwiftUI), mais le canvas principal applique la position bg via `slide.effects.backgroundTransform` qui n'est **jamais** mutée pendant le geste — commit n'arrive qu'au release via `buildEffects()` |

L'objectif : stabiliser `StoryBackgroundLayer` une fois pour toutes, avec un contrat clair "le layer est stable, le diff fait le tri".

## Objectifs

1. Vidéo/image de fond paysage → letterbox centré, fond de story visible derrière (parité avec Instagram/TikTok)
2. Vidéo/image de fond portrait → aspectFill (= `.resizeAspectFill`, comportement actuel préservé)
3. Override double-tap (.auto → .fit → .fill → .auto) persisté dans le modèle
4. Zéro flash noir sur **toutes** les éditions du canvas (texte, sticker, drag bg)
5. Drag du background visible live sur le canvas principal (parité avec mini-preview)

## Non-objectifs

- Refactor de `StoryBackgroundLayer` en service séparé (over-engineering pour le besoin)
- Changement de l'API publique exposée par le SDK
- Migration des stories existantes (le champ ajouté est optionnel, default = auto)
- Feature flag (c'est un fix, pas une feature gated)

## Architecture

### Stratégie fit auto (sans nouveau champ persisté quand l'utilisateur n'overide pas)

Le mode initial est **calculé à la volée** depuis le `naturalSize` de l'asset au moment du `configure()` :

```
naturalSize  = AVAsset.tracks(.video).naturalSize   (vidéo)
            OR UIImage.size                          (image)

ratioMedia  = w / h
ratioCanvas = 9 / 16  ≈ 0.5625

si ratioMedia > ratioCanvas → paysage  → mode = .fit (letterbox, AVLayerVideoGravity.resizeAspect)
sinon                       → portrait → mode = .fill (AVLayerVideoGravity.resizeAspectFill)
```

Une vidéo iPhone portrait (9:16) garde le comportement actuel (full bleed). Une vidéo desktop 16:9 affiche la vidéo entière centrée avec le `StoryBackgroundLayer.backgroundColor` visible au-dessus/dessous.

### Override double-tap persisté

Un `UITapGestureRecognizer(numberOfTapsRequired: 2)` est ajouté à `StoryCanvasUIView` (séparé du recognizer single-tap existant via `UIGestureRecognizer.require(toFail:)`). Le tap-target est résolu via la même fonction que `handlePan` : `resolveManipulationTarget(at:)`. Le toggle est ignoré si le target n'est pas le background media object.

Le cycle est :

```
.auto → .fit → .fill → .auto → ...
```

Persistance dans `StoryBackgroundTransform` (modèle déjà existant à `StoryModels.swift:1041`) :

```swift
public struct StoryBackgroundTransform: Codable, Sendable {
    public var scale: CGFloat?
    public var offsetX: CGFloat?
    public var offsetY: CGFloat?
    public var rotation: Double?
    public var videoFitMode: String?  // NOUVEAU — nil = auto, "fit" | "fill"
}
```

`nil` = comportement auto (calculé). Anciens stories continuent de fonctionner sans migration (Codable optionnel).

### Architecture du flow live drag (bug 3)

Avant :

```
[USER DRAG BG]
  ├─ handlePan.changed → mute slide.mediaObject.x/y
  │      → mini-preview re-render (OK)
  │      → canvas principal: NO-OP (read backgroundTransform inchangé) ❌
  └─ handlePan.ended   → buildEffects() commit dans slide.effects.backgroundTransform
                       → rebuildLayers() → flash noir ❌
```

Après :

```
[USER DRAG BG]
  ├─ handlePan.changed → IF target == backgroundMediaObject:
  │      CATransaction.setDisableActions(true)
  │      backgroundLayer.transform = liveCATransform    (LIVE, no animation)
  │   ELSE: existing path for stickers/text
  └─ handlePan.ended   → commit dans slide.effects.backgroundTransform
                       → SKIP rebuildLayers() si seul transform a changé (diff)
                       → backgroundLayer.transform reste déjà en place ✓
```

### Anti-flash global (bug 2)

Toutes les mutations CALayer dans `StoryBackgroundLayer` sont wrappées :

```swift
CATransaction.begin()
CATransaction.setDisableActions(true)
defer { CATransaction.commit() }
// mutations frame, transform, contents
```

Le fast-path d'identité (`StoryBackgroundLayer.swift:139-155`) gagne un diff sur la transform : si `currentTransform == newTransform`, skip l'assignation entièrement.

### Périmètre des changements

Aucun nouveau service, aucune nouvelle API publique. Tout le changement reste dans 3 fichiers :

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` — videoGravity dynamique, anti-flash, diff transform, double-tap toggle
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` — handlePan live drag pour background, skip rebuildLayers conditionnel
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` — champ `videoFitMode: String?` optionnel sur `StoryBackgroundTransform`

Plus tests + smoke checklist QA.

## Phases d'implémentation

### Phase 1 — Instrumentation & repro (0.5 j)

Avant tout fix, prouver les hypothèses par test.

- `StoryBackgroundLayer_FlashOnRebuildTests.swift` : appel `configure()` deux fois avec **même URL/transform/geometry**, capture `CALayer.presentationLayer.opacity`, asserte qu'il reste à 1.0 (= pas d'animation implicite). Test échoue avant fix, passe après.
- `handlePan_textKeystroke_backgroundLayerUnchangedTests.swift` : simule une frappe texte, capture les compteurs `attachBackgroundPlayer / detachBackgroundPlayer`, asserte 0 réattach.
- Trace OSLog conditionnelle (`#if DEBUG`) dans `attachBackgroundPlayer/detachBackgroundPlayer/configure` pour confirmer en simu.

**Critère sortie :** les tests rouges confirment précisément la cause du flash (CATransaction implicite vs slideContentRevision vs reattach).

### Phase 2 — Bug 1 : orientation-aware fit (0.5 j)

**Fichier :** `StoryBackgroundLayer.swift`

```swift
private func resolveVideoGravity(
    naturalSize: CGSize,
    canvasSize: CGSize,
    override: String?
) -> AVLayerVideoGravity {
    if let o = override {
        return o == "fit" ? .resizeAspect : .resizeAspectFill
    }
    guard naturalSize.height > 0, canvasSize.height > 0 else {
        return .resizeAspectFill
    }
    let mediaRatio = naturalSize.width / naturalSize.height
    let canvasRatio = canvasSize.width / canvasSize.height
    return mediaRatio > canvasRatio ? .resizeAspect : .resizeAspectFill
}
```

Hooked dans `attachBackgroundPlayer` après `AVAsset.tracks(.video)` load. Si la naturalSize n'est pas encore résolue, fallback `.resizeAspectFill` (= comportement actuel, pas de régression), puis update au `loaded(.naturalSize)` callback.

**Pour les images :** même règle appliquée via `UIImage.size`. `contentLayer.contentsGravity = .resizeAspect | .resizeAspectFill`.

**Backdrop story visible :** `StoryBackgroundLayer.backgroundColor` est déjà setté (ligne ~177) à la couleur de fond de la story. Le letterbox révèle automatiquement cette couleur dans les bandes haut/bas.

**Critère sortie :** vidéo paysage 16:9 ajoutée → letterbox immédiat, fond story visible. Tests snapshot verts.

### Phase 3 — Bug 2 : éliminer le flash noir (0.5 j)

**Fichier :** `StoryBackgroundLayer.swift`

Wrap toutes les mutations CALayer dans le fast-path et le full rebuild :

```swift
CATransaction.begin()
CATransaction.setDisableActions(true)
defer { CATransaction.commit() }
```

Ajouter un diff transform dans le fast-path (lignes 139-155) :

```swift
if canReuseContent {
    let newCA = transform.caTransform()
    if !CATransform3DEqualToTransform(self.transform, newCA) {
        self.transform = newCA
    }
    let newFrame = CGRect(origin: .zero, size: geometry.renderSize)
    if self.frame != newFrame {
        self.frame = newFrame
        contentLayer?.frame = bounds
        avPlayerLayer?.frame = bounds
    }
    return
}
```

**Fichier :** `StoryCanvasUIView.swift`

`handlePan.ended` : ne plus incrémenter `slideContentRevision &+= 1` ni appeler `rebuildLayers()` si seules les positions x/y ont changé.

```swift
case .ended, .cancelled, .failed:
    manipulatedItemId = nil
    hideSnapGuides()
    if didModifyBackgroundContent {
        slideContentRevision &+= 1
        rebuildLayers()
    }
    // else: layers déjà à jour live → rien à faire
```

**Critère sortie :** taper du texte → 0 flash. Drag sticker → 0 flash. Drag bg → 0 flash. Tests régression verts.

### Phase 4 — Bug 3 : live drag du background (0.5 j)

**Fichier :** `StoryCanvasUIView.swift`

Dans `handlePan.changed`, branche dédiée background. `backgroundMediaObjectId` est résolu en lisant la slide courante à `.began` : `slide.effects.mediaObjects.first(where: { $0.isBackground })?.id`. Cette valeur est stockée dans une propriété privée `private var backgroundMediaObjectId: String?` mise à jour à chaque `slide.didSet`.

```swift
case .changed:
    guard let id = manipulatedItemId, bounds.size != .zero else { return }
    let translation = recognizer.translation(in: self)

    if id == backgroundMediaObjectId {
        let liveTransform = BackgroundTransform(
            scale: dragStartScale,
            offsetX: dragStartOffsetX + dxNorm,
            offsetY: dragStartOffsetY + dyNorm,
            rotation: dragStartRotation
        )
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        backgroundLayer.transform = liveTransform.caTransform()
        CATransaction.commit()
        liveBackgroundTransformDuringDrag = liveTransform
    } else {
        // chemin existant pour stickers/text
        slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
        onItemModified?(slide)
    }
```

Au `.ended` du background : commit dans `slide.effects.backgroundTransform` via callback parent (`onBackgroundTransformChanged?(liveBackgroundTransformDuringDrag)`). Le canvas reste tel quel (déjà à jour visuellement).

**Pour la mini-preview :** elle observe déjà `viewModel.slides` qui ne change qu'au `.ended` → la mini-preview montrera donc l'état "post-release". Si la parité live mini-preview est souhaitée pendant le drag, publier `@Published var liveBackgroundTransformDuringDrag: BackgroundTransform?` optionnel sur le ViewModel et la mini-preview l'observe. À valider en smoke (R5 dans risques).

**Critère sortie :** drag bg → canvas principal suit en temps réel, pas de flash au release.

### Phase 5 — Tests + smoke checklist (0.5 j)

#### Tests unitaires nouveaux

| Fichier | Cas |
|---|---|
| `StoryBackgroundLayer_VideoGravityTests.swift` | landscape video → `.resizeAspect`, portrait → `.resizeAspectFill`, override `fit/fill` respecté |
| `StoryBackgroundLayer_NoFlashTests.swift` | configure 2x same URL → 0 réattach AVPlayer, transform diff skip, opacity reste à 1.0 |
| `StoryBackgroundLayer_DoubleTapToggleTests.swift` | cycle auto→fit→fill→auto via touch event |
| `StoryCanvasUIView_LiveBackgroundDragTests.swift` | handlePan.changed sur bg → layer.transform muté live, model **non muté**, au .ended → model muté une seule fois |
| `StoryBackgroundTransform_CodableTests.swift` | round-trip avec `videoFitMode` nil/"fit"/"fill" |

#### Smoke checklist QA

`docs/qa/2026-05-25-story-canvas-bg-fixes-smoke.md`

- [ ] Vidéo paysage 16:9 → letterbox + fond story visible
- [ ] Vidéo portrait 9:16 → full bleed (comportement actuel)
- [ ] Vidéo carrée 1:1 → letterbox (ratio < canvas)
- [ ] Image paysage → même letterbox
- [ ] Double-tap → cycle .auto → .fit → .fill → .auto (visuel)
- [ ] Édition texte (10+ keystrokes) → 0 flash noir
- [ ] Drag sticker + release → 0 flash noir
- [ ] Drag background → mouvement live sur canvas principal (parité mini-preview)
- [ ] Pinch zoom bg → behaviour préservé
- [ ] Stories existantes (sans `videoFitMode`) → comportement auto par orientation

## Risques

| # | Risque | Mitigation |
|---|---|---|
| R1 | `AVAsset.tracks(.video).naturalSize` async → fallback `.resizeAspectFill` au premier frame puis "snap" au letterbox quand chargé | Pré-charger via `AVURLAsset.loadValuesAsynchronously` avant l'attach. Si indisponible, fallback aspectFill (= état actuel, pas de régression) |
| R2 | `CATransaction.setDisableActions(true)` global supprime des animations souhaitées (transition entre 2 bg différents) | Conserver des animations explicites via `UIView.animate(...)` ou `CATransaction` explicite quand on veut vraiment animer. Default "no animation" plus prévisible |
| R3 | Live drag bg avec snap guides → snap guides codés pour stickers, pas pour bg | Désactiver snap guides pendant drag bg (le bg n'a pas besoin de snap aux centres) |
| R4 | Override `videoFitMode` persisté → un export PNG/MP4 doit respecter le mode | `StoryExporter` lit `slide.effects.backgroundTransform.videoFitMode` et applique la même règle de gravity au composite final |
| R5 | Mini-preview en désync avec live drag si on ne publie pas la transform live | Phase 4 prévoit `@Published var liveBackgroundTransformDuringDrag` optionnel. À valider si nécessaire en smoke |

## Stratégie de test

Pyramide :

1. **Unit (XCTest)** — pure logique `resolveVideoGravity`, diff `CATransform3DEqualToTransform`, encodage `Codable` du nouveau champ
2. **Integration (XCTest UI test)** — `StoryBackgroundLayer.configure(...)` séquences, repro des 3 bugs
3. **Snapshot (SnapshotTesting)** — letterbox vs aspectFill rendu visuel, override toggle
4. **Smoke (manuel)** — checklist QA exhaustive sur device réel + simu

Couverture cible : 100% des branches `resolveVideoGravity`, 100% des chemins `configure()` (fast-path + full rebuild + new diff), 100% du flow `handlePan` background vs non-background.

## Plan de rollout

- Une seule PR sur la branche `fix/story-canvas-bg-stabilization-2026-05-25`
- Pas de feature flag (c'est un fix, pas une feature)
- Pas de migration DB (champ optionnel, default auto)
- Self-review + Codex review avant merge sur main
- Smoke QA manuelle obligatoire avant push prod

## Références

- Investigation root causes : conversations Claude 2026-05-25
- Composant impacté : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift`
- Modèle impacté : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1041` (`StoryBackgroundTransform`)
- Lien parent : `docs/superpowers/specs/2026-05-12-story-canvas-fidelity-design.md` (refonte tout-CALayer cross-device, déjà livrée)
