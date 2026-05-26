# Story Canvas Background Stabilization — Design v2

**Date :** 2026-05-25
**Auteur :** Claude (Opus 4.7) avec J. Charles N. M.
**Status :** Brainstorm validé + review v1 → v2 amendé pour atteindre 10/10
**Estimate :** 3 jours (révisé après audit complet de surface d'impact)
**Scope :** voir tableau "Fichiers impactés" — 6 fichiers principaux + 5 tests

## Contexte

Trois bugs distincts du composer de stories iOS partagent une même racine architecturale : la synchronisation entre le modèle Swift et les `CALayer` GPU du `StoryBackgroundLayer` n'est pas idéale, et la donnée "transform du background" est éclatée sur trois types Swift distincts.

| # | Bug | Root cause confirmée (investigation 2026-05-25) |
|---|-----|---|
| 1 | Vidéo paysage en background croppée (étirée pour remplir le canvas 9:16) | `StoryBackgroundLayer.swift:395` `videoGravity = .resizeAspectFill` hardcodé, AINSI que `StoryAVCompositor.swift:308` `paintAspectFill` pour l'export |
| 2 | Flash noir à chaque édition (frappe texte, drag/release sticker, drag bg) | À confirmer en Phase 1 (instrumentation). Hypothèse principale : les chemins asynchrones (Task @MainActor) dans `configure()` (lignes 254-278 image, 327-330 vidéo) s'exécutent **après** le `CATransaction.commit()` de `rebuildLayers()` → les `addSublayer` et `img.contents =` se font dans un contexte où les actions CA implicites sont activées. Hypothèse secondaire : `attachBackgroundPlayer` crée un nouveau `AVPlayerLayer` même quand le fast-path d'identité matche partiellement |
| 3 | Drag du background visible sur mini-preview (haut du composer) mais pas sur canvas principal | `handlePan.changed` mute `slide.mediaObject.x/y` (vu par mini-preview qui rerend tout SwiftUI), mais le canvas principal **n'utilise jamais** `mediaObject.x/y` pour le bg — il lit uniquement `slide.effects.backgroundTransform` qui n'est jamais muté pendant le geste. Le `mediaObject.x/y` du bg est donc **donnée morte** pour le canvas |

L'objectif : stabiliser `StoryBackgroundLayer` une fois pour toutes, avec un contrat clair "le layer est stable, le diff fait le tri, une seule source de vérité pour la position du bg".

## Objectifs

1. Vidéo/image de fond paysage → letterbox centré, fond de story visible derrière (parité Instagram/TikTok), parité composer + export
2. Vidéo/image de fond portrait → aspectFill (= `.resizeAspectFill`, comportement actuel préservé)
3. Override double-tap (.auto → .fit → .fill → .auto) persisté en base, respecté par composer + reader + export
4. Zéro flash noir sur **toutes** les éditions du canvas (texte, sticker, drag bg, drag stickers)
5. Drag du background visible **live** sur le canvas principal (parité avec mini-preview)
6. **Source unique de vérité** pour la position du background (`backgroundTransform` partout, `mediaObject.x/y` du bg = mort)

## Non-objectifs

- Refactor de `StoryBackgroundLayer` en service séparé (over-engineering)
- Changement de l'API publique exposée par le SDK
- Migration DB destructive (le champ ajouté est optionnel, default = auto)
- Feature flag (c'est un fix, pas une feature gated)

## Décisions architecturales

### D1. Trois types `BackgroundTransform` → unifier le contrat, propager le nouveau champ partout

L'audit révèle trois types distincts dans le code avec deux converters :

```
StoryBackgroundTransform            (SDK Codable, persisté)            — StoryModels.swift:1041
   ↕ buildEffects() / restoreCanvas()                                   — StoryComposerView.swift:1519, 1532
StoryComposerViewModel.BackgroundTransform   (composer @Published)     — StoryComposerViewModel.swift:366
   ↕ bgTransform = BackgroundTransform(...)                            — StoryCanvasUIView.swift:1027, 1278
BackgroundTransform                 (render-space Sendable+Equatable)  — StoryBackgroundLayer.swift:10
```

**Ajouter `videoFitMode: String?`** aux **trois** types, et le propager dans les **deux** converters :

```swift
// StoryModels.swift
public struct StoryBackgroundTransform: Codable, Sendable {
    public var scale: CGFloat?
    public var offsetX: CGFloat?
    public var offsetY: CGFloat?
    public var rotation: Double?
    public var videoFitMode: String?  // NOUVEAU : nil = auto | "fit" | "fill"

    public var isIdentity: Bool {
        (scale ?? 1.0) == 1.0 && (offsetX ?? 0) == 0 && (offsetY ?? 0) == 0
            && (rotation ?? 0) == 0 && videoFitMode == nil
    }
}

// StoryComposerViewModel.swift
struct BackgroundTransform {
    var scale: CGFloat = 1.0
    var offsetX: CGFloat = 0
    var offsetY: CGFloat = 0
    var rotation: Double = 0
    var videoFitMode: String? = nil  // NOUVEAU
}

// StoryBackgroundLayer.swift
public struct BackgroundTransform: Sendable, Equatable {
    public nonisolated var scale: Double
    public nonisolated var offsetX: Double
    public nonisolated var offsetY: Double
    public nonisolated var rotation: Double
    public nonisolated var videoFitMode: String?  // NOUVEAU
    // ...
}
```

L'`Equatable` synthétisé inclura `videoFitMode` automatiquement — utile pour le diff de fast-path (D3).

### D2. Stratégie fit auto + override persisté

Le mode initial est **calculé à la volée** depuis le `naturalSize` de l'asset au moment du `configure()` quand `videoFitMode == nil` :

```
naturalSize = AVAsset.tracks(.video).naturalSize   (vidéo)
           OR UIImage.size                          (image)

ratioMedia  = w / h
ratioCanvas = 9 / 16  ≈ 0.5625

mode auto = (ratioMedia > ratioCanvas) ? .resizeAspect : .resizeAspectFill
mode override "fit"  → .resizeAspect
mode override "fill" → .resizeAspectFill
```

L'`StoryBackgroundLayer.backgroundColor` (setté par le caller, ligne ~177) reste visible dans les bandes letterbox — c'est le fond de la story.

### D3. Diff complet dans `configure()` — pas de skip de `slideContentRevision`

L'audit révèle que `slideContentRevision` est consommé par **deux autres systèmes** :

```
StoryCanvasUIView.swift:897-898  → audio mixer cache invalidation
StoryCanvasUIView.swift:1204     → filter texture re-capture (Metal MPS pipeline)
```

Skipper l'increment dans `handlePan.ended` (proposition v1) **casserait les filtres et l'audio mixer** après chaque drag.

**Approche corrigée :** garder l'increment, mais rendre `configure()` **idempotent quand kind+transform+geometry n'ont pas changé**.

```swift
// Ajout au début de configure(), AVANT le fast-path d'identité existant
let nothingChanged = (self.kind == kind)
    && (self.transform3D == transform)
    && (self.frame.size == geometry.renderSize)
    && (contentLayer != nil || avPlayerLayer != nil || backgroundColor != nil)
if nothingChanged { return }
```

`Kind` est déjà `Equatable` (vérifier ; sinon synthétiser). `BackgroundTransform` devient `Equatable` (D1).

### D4. Path canonique de drag bg = α (decision validée)

**Drag du background mute UNIQUEMENT `slide.effects.backgroundTransform.offsetX/Y`.**

- `slide.mediaObjects[bg].x/y` devient **donnée morte** pour le canvas et la mini-preview (qui doit aussi migrer pour lire `backgroundTransform`)
- Mini-preview observe `slide.effects.backgroundTransform` (déjà persisté en `@Published var slides`)
- Canvas principal applique `backgroundLayer.transform` via la conversion `bgTransform` existante (`StoryCanvasUIView.swift:1027`)
- Source unique de vérité

**Migration zero-DB :** au prochain édit d'une story existante, `buildEffects()` re-sérialise la slide avec `backgroundTransform` correct ; les `mediaObjects[bg].x/y` non-zéro restent en base mais sont ignorés par le rendu. Aucun script de migration nécessaire — c'est le pattern α "doux".

### D5. Anti-flash : combiner CATransaction synchrone + wrap des chemins async

L'audit confirme que `rebuildLayers()` wrappe DÉJÀ ses mutations dans `CATransaction.setDisableActions(true)` (lignes 1018-1023). Le flash ne vient **pas** de cette couche.

**Hypothèse Phase 1 :** le flash vient des `Task { @MainActor in }` au sein de `configure()` (lignes 254-278 image distante, 327-330 vidéo cache-miss). Ces tâches s'exécutent au prochain tour de runloop, **après** le `CATransaction.commit()` du rebuildLayers parent → les `addSublayer(pl)` et `img.contents = cgImage` se font hors wrap = animations CA implicites activées.

**Fix Phase 3 :** chaque mutation CALayer dans les chemins async wrappée individuellement :

```swift
Task { @MainActor [weak self, weak img] in
    // ...
    let cgImage = uiImage.cgImage
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    img?.contents = cgImage
    CATransaction.commit()
    self?.hasFinalContentStamped = true
}
```

Idem pour `attachBackgroundPlayer.addSublayer(pl)` (StoryBackgroundLayer.swift:396).

Le diff D3 évite le flash sur les paths "rien n'a changé" ; le wrap async évite le flash sur les paths "contenu vraiment changé pour la première fois".

### D6. Live drag du background — branche dédiée dans `handlePan`

`backgroundMediaObjectId` est résolu à `slide.didSet` : `slide.effects.mediaObjects?.first(where: { $0.isBackground == true })?.id`.

```swift
case .changed:
    guard let id = manipulatedItemId, bounds.size != .zero else { return }
    let translation = recognizer.translation(in: self)
    let dxNorm = Double(translation.x / bounds.width)
    let dyNorm = Double(translation.y / renderHeightFor1920)

    if id == backgroundMediaObjectId {
        let live = BackgroundTransform(
            scale: dragStartBgScale,
            offsetX: dragStartBgOffsetX + dxNorm,
            offsetY: dragStartBgOffsetY + dyNorm,
            rotation: dragStartBgRotation,
            videoFitMode: dragStartBgFitMode
        )
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        backgroundLayer.transform = live.caTransform()
        backgroundLayer.transform3D = live  // garder la source de vérité du layer alignée
        CATransaction.commit()
        liveBackgroundTransformDuringDrag = live
        return
    }
    // chemin existant pour stickers/text
    let rawX = clamp(dragStartSlideX + dxNorm)
    let rawY = clamp(dragStartSlideY + dyNorm)
    let (snappedX, didSnapX) = snap(rawX)
    let (snappedY, didSnapY) = snap(rawY)
    updateSnapGuides(x: didSnapX ? snappedX : nil, y: didSnapY ? snappedY : nil)
    slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
    onItemModified?(slide)
```

Au `.ended` du background : commit dans `slide.effects.backgroundTransform` via callback parent (`onBackgroundTransformChanged?(liveBackgroundTransformDuringDrag)`), puis `rebuildLayers()` qui sera **idempotent grâce à D3** (le layer.transform est déjà à jour).

**Snap guides désactivés** pendant drag bg (le bg n'a pas besoin de snap centres).

### D7. Override double-tap

`UITapGestureRecognizer(numberOfTapsRequired: 2)` ajouté à `StoryCanvasUIView`, requiert l'échec du single-tap existant via `require(toFail:)`. Target résolu via `resolveManipulationTarget(at:)`. Toggle ignoré si target ≠ background. Cycle : `nil → "fit" → "fill" → nil`.

### D8. Interaction `videoGravity` × `transform.scale`

**Décision :** le `videoGravity` (fit/fill) définit la **baseline** de comment l'asset remplit le bounding box du layer. Le `transform.scale` (pinch user) est une **multiplication** par-dessus. Cumul libre, pas de clamp.

Conséquences :
- Fit + scale=1 → letterbox visible
- Fit + scale=2 → letterbox doublé, déborde du canvas (effet voulu : zoom in sur une vidéo paysage tout en gardant le ratio)
- Fill + scale=1 → aspectFill (comportement actuel)
- Fill + scale=0.5 → vidéo réduite à 50%, bandes vides révélant le fond story

Le double-tap reset à "auto" remet `videoFitMode = nil` mais **conserve scale/offset/rotation** (le user ne perd pas son zoom/pan).

### D9. SDK Purity

Les changements sont conformes à `packages/MeeshySDK/CLAUDE.md` :

| Changement | Catégorie | Verdict |
|---|---|---|
| `videoGravity` dynamique via ratio | Atom (calcul pur) | ✅ SDK |
| Diff D3 + CATransaction wrap D5 | Atom (no orchestration) | ✅ SDK |
| Champ `videoFitMode` au modèle Codable | Model | ✅ SDK |
| Live drag handlePan branche bg | Gesture local, pas de multi-service cascade, déjà SDK-side comme stickers/text | ✅ SDK borderline acceptable |
| Override double-tap | Gesture local | ✅ SDK |

### D10. Périmètre des changements — fichiers impactés (audit complet)

| Fichier | Changement | Phase |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift` | Ajouter `videoFitMode: String?` à `StoryBackgroundTransform` + update `isIdentity` + update init | 2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift` | `videoFitMode` au struct render-space + `resolveVideoGravity()` + diff D3 + wrap CATransaction async D5 + handle double-tap | 2+3 |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift` | Converter bgTransform (`:1027`) + `captureBackground` (`:1278`) propagent `videoFitMode` + handlePan branche live bg D6 + double-tap gesture D7 + `backgroundMediaObjectId` cache | 2+3+4 |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` | `videoFitMode` au struct interne (`:366`) + cache backgroundTransformCache préserve le champ | 2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` | `restoreCanvas()` (`:1519`) lit `videoFitMode` + `buildEffects()` (`:1532`) le sérialise | 2 |
| `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift` | `paintAspectFill` (`:308`) devient `paintRespectingFitMode()` qui lit `slide.effects.backgroundTransform.videoFitMode` + ratio auto si nil. Pour vidéo (substrate), s'assurer que `AVMutableVideoCompositionLayerInstruction` respecte le mode (transform) | 2 |
| Tests existants étendus (cf. Phase 5) | Pas de nouveaux fichiers, on étend | 1+5 |

Aucun nouveau service, aucune nouvelle API publique exposée.

## Phases d'implémentation

### Phase 1 — Instrumentation & repro (0.5 j)

Avant tout fix, **prouver l'hypothèse principale D5** (flash vient des Task @MainActor async) par test.

**Tests rouges à ajouter dans les fichiers existants :**

| Fichier existant | Nouveau cas test |
|---|---|
| `Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerTests.swift` | `test_configure_sameKindTwice_isNoOp()` : appel `configure()` 2x avec mêmes paramètres → attente : 0 mutation visible sur `CALayer.presentationLayer` (besoin de wrapper via CATransaction.flush et timing) |
| `Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerImageTests.swift` | `test_configure_imageAsyncLoad_doesNotFlash()` : asset async, asserter que l'`addSublayer` du contentLayer arrive dans un contexte `CATransaction.disableActions == true`. Test échoue avant fix, passe après |
| `Tests/MeeshyUITests/Story/Reader/Background/StoryBackgroundLayerVideoTests.swift` | `test_configure_videoAttach_wrappedInCATransaction()` : assert `addSublayer(AVPlayerLayer)` arrive avec actions désactivées |
| `Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift` | `test_textKeystroke_doesNotReattachBackgroundPlayer()` : simule 10 frappes texte, capture compteur attach/detach, asserter 0 réattach |
| `Tests/MeeshyUITests/Story/Canvas/CanvasBackgroundIntegrationTests.swift` | `test_dragBackground_canvasUpdatesLive()` : simule handlePan.changed sur backgroundMediaObjectId, asserter `backgroundLayer.transform` muté DURANT le geste |

**Trace OSLog conditionnelle (`#if DEBUG`)** dans `attachBackgroundPlayer/detachBackgroundPlayer/configure` pour confirmer en simu.

**Critère sortie :** les tests rouges confirment la cause du flash. Si l'hypothèse D5 est invalidée, ré-investiguer avant Phase 3.

### Phase 2 — Fit auto + propagation du `videoFitMode` (1 j)

**Pourquoi 1 j et non 0.5 :** la propagation à travers les 6 fichiers, les 2 converters, et les 3 types nécessite des tests d'isolation par couche.

**StoryBackgroundLayer.swift :**

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

Hooked dans `attachBackgroundPlayer` après load async de `AVURLAsset.tracks(.video).naturalSize`. Avant la résolution, fallback `.resizeAspectFill` (= comportement actuel, pas de régression). Au callback `loaded(.naturalSize)`, update `pl.videoGravity` si nécessaire (wrapped CATransaction).

Pour les images : `contentLayer.contentsGravity = resolveImageGravity(...)` avec même logique sur `UIImage.size`.

**StoryAVCompositor.swift :**

```swift
case .image:
    if let bgImage = resolveBackgroundImage(for: slide) {
        let mode = slide.effects.backgroundTransform?.videoFitMode
        let gravity = resolveImageGravity(naturalSize: bgImage.size,
                                          canvasSize: CGSize(width: width, height: height),
                                          override: mode)
        paintImage(bgImage, in: cg, size: ..., gravity: gravity)
    }
```

Pour la vidéo (substrate AVMutableComposition), construire un `AVMutableVideoCompositionLayerInstruction` avec une `transform` qui applique le bon gravity (calcul `CGAffineTransform` scale + translate pour centrer).

**StoryModels + StoryComposerViewModel + StoryComposerView :** propagation triviale du champ + tests Codable round-trip.

**Critère sortie :** vidéo paysage 16:9 → letterbox immédiat dans composer ET reader ET export. Tests verts.

### Phase 3 — Anti-flash : diff D3 + wrap async D5 (0.5 j)

**StoryBackgroundLayer.swift :**

1. Ajouter `Kind: Equatable` (si pas déjà ; vérifier)
2. Ajouter le no-op check D3 au début de `configure()` :

```swift
let nothingChanged = (self.kind == kind)
    && (self.transform3D == transform)
    && (self.frame.size == geometry.renderSize)
    && (contentLayer != nil || avPlayerLayer != nil)
if nothingChanged { return }
```

3. Wrap chaque mutation CALayer dans les chemins async :

```swift
// Image async load (ligne ~268)
img?.contents = cgImage
// devient :
withDisabledCAActions { img?.contents = cgImage }

// Helper :
@MainActor
private func withDisabledCAActions(_ block: () -> Void) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    block()
    CATransaction.commit()
}
```

Idem pour `attachBackgroundPlayer.addSublayer(pl)` (ligne 396) et le call site `Task { ... attachBackgroundPlayer(...) }` (ligne 327).

**Critère sortie :** taper texte → 0 flash. Drag sticker → 0 flash. Drag bg release → 0 flash. Tests régression verts.

### Phase 4 — Live drag du background (path α) (0.5 j)

**StoryCanvasUIView.swift :**

1. Cache `backgroundMediaObjectId` mis à jour à `slide.didSet`
2. Branche live drag dans `handlePan.changed` (cf. D6)
3. Au `.ended`, callback `onBackgroundTransformChanged?(liveBackgroundTransformDuringDrag)` → le composer mute `viewModel.backgroundTransform` → `buildEffects()` au prochain `syncCurrentSlideEffects()` → persist
4. Désactiver snap guides pendant drag bg

**StoryComposerView.swift :**

5. Câbler le nouveau callback `onBackgroundTransformChanged`
6. **Path α :** retirer le code qui mute `slide.mediaObjects[bg].x/y` au drag (chercher où ça se passait avant — probablement nulle part puisque le drag ne touchait que mediaObject)

**Mini-preview (SlideMiniPreview.swift) :**

7. Vérifier qu'elle lit déjà `slide.effects.backgroundTransform` pour positionner le bg (devrait être le cas — c'est le rendu canvas qui doit migrer)
8. Si elle lit `mediaObject.x/y` pour le bg : la migrer aussi

**Critère sortie :** drag bg → canvas suit live, mini-preview suit live, pas de flash au release.

### Phase 5 — Tests + smoke (0.5 j)

#### Tests unitaires étendus dans les fichiers existants

| Fichier existant | Cas ajoutés |
|---|---|
| `BackgroundTransformTests.swift` | round-trip Codable avec `videoFitMode` nil/"fit"/"fill" ; `isIdentity` retourne false si `videoFitMode != nil` ; equality avec/sans champ |
| `StoryBackgroundLayerTests.swift` | `resolveVideoGravity` paysage/portrait/carré/override ; diff D3 no-op ; double-tap cycle |
| `StoryBackgroundLayerImageTests.swift` | image async load wrapped CATransaction ; image fit/fill via override |
| `StoryBackgroundLayerVideoTests.swift` | landscape video → `.resizeAspect` ; portrait → `.resizeAspectFill` ; override respecté ; configure 2x = 0 réattach |
| `CanvasBackgroundIntegrationTests.swift` | drag bg → layer.transform muté live ; release → model muté 1× ; mini-preview parité ; text keystroke = 0 réattach |
| `Tests/MeeshySDKTests/Models/StoryEffectsCodableTests.swift` (créer si absent) | `StoryEffects` round-trip avec `backgroundTransform.videoFitMode` |

#### Smoke checklist QA

`docs/qa/2026-05-25-story-canvas-bg-fixes-smoke.md`

- [ ] Vidéo paysage 16:9 → letterbox + fond story visible (composer)
- [ ] Vidéo paysage 16:9 → letterbox dans reader publié
- [ ] Vidéo paysage 16:9 → letterbox dans MP4 exporté
- [ ] Vidéo portrait 9:16 → full bleed (comportement actuel)
- [ ] Vidéo carrée 1:1 → letterbox (ratio < canvas)
- [ ] Image paysage → letterbox composer + reader + export
- [ ] Double-tap → cycle .auto → .fit → .fill → .auto (visuel)
- [ ] Override "fit" persiste après save + reload story
- [ ] Édition texte (10+ keystrokes) → 0 flash noir
- [ ] Drag sticker + release → 0 flash noir
- [ ] Drag background → mouvement live sur canvas principal
- [ ] Drag background → mouvement live sur mini-preview (parité)
- [ ] Drag background release → 0 flash noir
- [ ] Pinch zoom bg → behaviour préservé (cumule avec videoGravity)
- [ ] Stories existantes (sans `videoFitMode`) → comportement auto par orientation
- [ ] Stories existantes avec mediaObject.x/y bg non-zéro → ignoré au rendu, prochaine édition nettoie
- [ ] Filtre actif + drag → filtre se met à jour correctement (régression D3)
- [ ] Audio mixer + drag → audio se reconfigure correctement (régression D3)

## Risques (mis à jour)

| # | Risque | Mitigation |
|---|---|---|
| R1 | `AVAsset.tracks(.video).naturalSize` async → fallback `.resizeAspectFill` au premier frame puis "snap" au letterbox quand chargé | Pré-charger via `AVURLAsset.loadValuesAsynchronously` AVANT `attachBackgroundPlayer`. Fallback aspectFill = état actuel, pas de régression |
| R2 | `CATransaction.setDisableActions(true)` global supprime des animations souhaitées (transition entre 2 bg différents) | Préserver les animations explicites via `UIView.animate(...)` ou `CATransaction.setAnimationDuration(...)`. Default "no animation" plus prévisible |
| R3 | Live drag bg avec snap guides codés pour stickers | Désactiver snap guides pendant drag bg |
| R4 | Override `videoFitMode` persisté → export PNG/MP4 doit respecter le mode | Phase 2 inclut StoryAVCompositor : image gravity via `resolveImageGravity`, vidéo via `AVMutableVideoCompositionLayerInstruction.transform` |
| R5 | Mini-preview lit `mediaObject.x/y` du bg (path β legacy) | Phase 4 audit SlideMiniPreview ; si oui, migrer vers `backgroundTransform` (path α) |
| R6 | D3 diff `Kind == Kind` nécessite `Kind: Equatable` — peut révéler des cas où l'égalité est mal définie (ex. .video avec sameMuteFlag) | Auditer `Kind` cases ; les associated values qui ne doivent pas casser le diff (mute, etc.) sont traitées via le contentIdentity existant qui filtre déjà. Préserver ce filtrage |
| R7 | Cache `backgroundTransformCache` du composer (`StoryComposerViewModel.swift:378`) ne sérialise pas `videoFitMode` | Update la struct interne (D1) — round-trip automatique car keying par slide.id et propagation in-memory |
| R8 | Path α migration silencieuse : `mediaObject.x/y` non-zéro persiste en base | Au prochain édit, `buildEffects()` réécrit la slide. Bonus optionnel : script de nettoyage `mediaObject.x = 0, y = 0 WHERE isBackground = true` (PAS bloquant) |
| R9 | `captureBackground` (StoryCanvasUIView:1278) instancie un second `StoryBackgroundLayer` pour filter texture capture → doit aussi respecter `videoFitMode` | La conversion `bgTransform` au `:1278` lit déjà `slide.effects.backgroundTransform` — propagation automatique du nouveau champ |

## Stratégie de test

Pyramide :

1. **Unit (Swift Testing + XCTest)** — `resolveVideoGravity`, diff `BackgroundTransform == BackgroundTransform`, encodage `Codable` du nouveau champ, conversions inter-types
2. **Integration (XCTest UI test)** — `StoryBackgroundLayer.configure(...)` séquences, repro des 3 bugs, parité composer/reader/export
3. **Snapshot (SnapshotTesting)** — letterbox vs aspectFill rendu visuel, override toggle (étendre fichiers existants)
4. **Smoke (manuel)** — checklist QA exhaustive sur device + simu, y compris export MP4

Couverture cible :
- 100% branches `resolveVideoGravity` + `resolveImageGravity`
- 100% chemins `configure()` (no-op D3 + fast-path identité existant + full rebuild + wrap async)
- 100% flow `handlePan` background vs non-background
- 100% round-trips Codable du nouveau champ

## Plan de rollout

- Une seule PR sur la branche `fix/story-canvas-bg-stabilization-2026-05-25`
- Pas de feature flag (fix, pas feature)
- Pas de migration DB destructive (path α "doux")
- Self-review + Codex review obligatoire avant merge sur main
- Smoke QA manuelle (15 items) avant push prod
- Spec checklist incluse dans le PR body

## Estimation totale : 3 jours

| Phase | Estimate |
|---|---|
| 1 — Instrumentation & repro | 0.5 j |
| 2 — Fit auto + propagation 6 fichiers | 1 j |
| 3 — Anti-flash diff + wrap async | 0.5 j |
| 4 — Live drag path α | 0.5 j |
| 5 — Tests + smoke | 0.5 j |
| **Total** | **3 j** |

## Références

- Investigation root causes : conversations Claude 2026-05-25
- Review v1 → v2 : audit cohérence/compatibilité/fonctionnalités 2026-05-25
- Composant principal : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift`
- Compositor export : `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift`
- Modèle persistance : `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1041`
- Lien parent : `docs/superpowers/specs/2026-05-12-story-canvas-fidelity-design.md`
- Règle SDK Purity : `packages/MeeshySDK/CLAUDE.md`

## Changelog vs v1

- **Architecture D1** : explicite les 3 `BackgroundTransform` et les 2 converters à modifier (v1 mentionnait 1 type)
- **Architecture D3** : remplace "skip `slideContentRevision`" (cassait filtres+audio) par "diff complet dans `configure()`"
- **Architecture D4** : tranche path α (decision user) — `backgroundTransform` source unique
- **Architecture D5** : précise que `CATransaction.setDisableActions` existe déjà au niveau `rebuildLayers()` ; le fix cible les chemins Task @MainActor async
- **Architecture D8** : spécifie l'interaction `videoGravity` × `transform.scale` (cumul libre, pas de clamp)
- **Architecture D9** : audit SDK Purity explicite
- **Architecture D10** : tableau exhaustif des 6 fichiers impactés (v1 disait 3)
- **Phase 2** : étendue à 1 j pour propagation triple-type + compositor export
- **Phase 5** : étend les fichiers test existants au lieu de créer 5 nouveaux fichiers
- **Risques** : ajout R6 (Kind Equatable), R7 (cache composer), R8 (migration α douce), R9 (captureBackground)
- **Estimate** : 2-2.5 j → 3 j (révision réaliste)
