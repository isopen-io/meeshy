# Story Canvas — Phase 4 Follow-ups

**Date** : 2026-05-09
**Author** : Claude (brainstorming session avec J. Charles N. M.)
**Status** : Approved (design phase) — Ready for implementation plan
**Worktree** : `.claude/worktrees/feat+story-canvas-fidelity`
**Related** :
- `docs/superpowers/specs/2026-05-08-story-canvas-fidelity-design.md` (spec mère — phases P0..P5)
- `docs/superpowers/specs/2026-05-09-story-canvas-reader-migration-and-repost-design.md` (Plan A, indépendant)
- Phase 4 livrée commits `8754f97b..828b9a03`, tag `story-canvas-p4-complete`

---

## 1. Objectif

Finaliser la promesse de la Phase 4 (« live preview composer = export AVFoundation = lecture viewer Reader, identité bit-exact ») en levant 3 limitations connues identifiées lors du livraison P4 :

1. **Synthetic video track** pour les slides static-only (texte/sticker pur sans média) — sans piste vidéo, `AVMutableComposition` ne peut pas créer de `videoComposition` et l'export retourne un fichier audio-only ou vide.
2. **SSIM tolerance metric** pour activer le test pixel-equivalence `test_export_matches_liveView_pixelExact` (actuellement skipped). Tolerance 0 px strict est trop fragile face aux divergences font hinting iOS 26 (1-2 LSB) ; SSIM ≥ 0.99 active le test sans masquer les vraies régressions.
3. **Cache layer-tree** entre frames du `StoryAVCompositor` — actuellement `StoryRenderer.render()` reconstruit l'arbre CALayer entièrement à chaque frame du compositor. Pour 12 s × 60 fps = 720 frames, c'est coûteux. Cache par item.id avec invalidation sélective sur changement state (transform/opacity/contents).

---

## 2. Contrat de design

> Plan B est **indépendant du Plan A** et **ne touche aucune feature utilisateur**. Pas de régression possible côté Reader/Composer. Les 3 chantiers sont des optimisations export-side + test-side.
>
> - Synthetic track : débloque les exports slide texte-only (régression prod découverte récemment) sans changer le rendu visuel.
> - SSIM tolerance : active un test existant skip ; pas de changement de production code.
> - Cache layer-tree : optimisation perf export (~3-5× plus rapide), 0 changement de pipeline rendu.

---

## 3. Découpage des 3 chantiers

### 3.1 B1 — Synthetic video track (~0.5 j, **bloquant prio 1**)

**Problème** : Quand un slide a uniquement des `textObjects` / `stickerObjects` / `drawingData` mais **aucun** `mediaObjects` vidéo, `AVMutableComposition` n'a pas de `videoTrack` source. `AVMutableVideoComposition.customVideoCompositorClass` ne s'applique qu'aux pistes vidéo existantes. Résultat : l'export produit un fichier sans frame vidéo (ou écran noir entier).

**Conception** :

```swift
// Canvas/StoryExporter.swift (existant, modifié)
extension StoryExporter {
    /// Adds a synthetic 1-frame transparent video track of the slide's
    /// effective duration when no media video track exists. The
    /// `StoryAVCompositor` uses this track as the substrate to draw
    /// textObjects / stickers / drawings on every frame.
    private func ensureVideoTrack(in composition: AVMutableComposition,
                                  duration: CMTime,
                                  size: CGSize) throws {
        let videoTracks = composition.tracks(withMediaType: .video)
        if !videoTracks.isEmpty { return }

        // Generate a 1×1 transparent CVPixelBuffer asset (cached as a
        // .mov in CacheCoordinator.video).
        let syntheticAssetURL = try syntheticTransparentAsset(size: size)
        let asset = AVAsset(url: syntheticAssetURL)
        guard let track = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else { throw StoryExporterError.cannotCreateVideoTrack }

        let timeRange = CMTimeRange(start: .zero, duration: duration)
        try track.insertTimeRange(
            CMTimeRange(start: .zero, duration: asset.duration),
            of: asset.tracks(withMediaType: .video)[0],
            at: .zero
        )
        // Loop or stretch to fill `duration`
        ...
    }

    private func syntheticTransparentAsset(size: CGSize) throws -> URL {
        let cacheKey = "synthetic-transparent-\(Int(size.width))x\(Int(size.height)).mov"
        if let cached = CacheCoordinator.shared.video.localFileURL(for: cacheKey) {
            return cached
        }
        // Generate via AVAssetWriter with CVPixelBuffer pool, single frame
        // BGRA 0x00000000, 1 sec, 30 fps → cache.
        let url = try generateTransparentMov(size: size, duration: 1.0)
        CacheCoordinator.shared.video.write(url, for: cacheKey)
        return url
    }
}
```

**Pourquoi 1 sec puis stretch** : un asset court (1 s) puis insertion répétée via `insertTimeRange` jusqu'à atteindre `duration`. Évite de générer un asset de 12-30 s à chaque export. Le synthetic asset est mis en cache disque.

**Pourquoi transparent (BGRA 0x00000000)** : le `StoryAVCompositor.startRequest` overwrite chaque pixel via `layerTree.render(in: context)` (cf. spec mère §5.2). Le synthetic frame est purement un substrat ; sa couleur n'est jamais visible.

**Tests** :
- `test_export_slideStaticOnly_producesVideoFile` (slide = 1 textObject, pas de média)
- `test_export_slideStaticOnly_videoFileHasFrames` (frame count = duration × 60 fps)
- `test_export_slideStaticOnly_frameMatchesLiveView` (extract frame at t=0, compare avec snapshot)
- `test_syntheticTransparentAsset_cached` (2ème appel utilise cache)
- `test_syntheticTransparentAsset_correctSize` (1080×1920)

### 3.2 B2 — SSIM tolerance metric (~0.5 j, prio 2)

**Problème** : `test_export_matches_liveView_pixelExact` (Phase 4 task 4.3, commit `828b9a03`) compare bit-à-bit `StoryCanvasUIView.snapshot()` ↔ frame extrait de l'export. Sur iOS 26, le sous-système de font hinting (CoreText) peut produire 1-2 LSB de différence sur les bords de glyphes anti-aliasés entre rendu UIKit (snapshot) et rendu CoreAnimation (compositor). Tolerance 0 px → test fragile, actuellement skipped.

**Conception** :

```swift
// Tests/MeeshyUITests/Story/Helpers/PixelComparison.swift
public enum PixelComparison {
    /// Bit-exact comparison. Returns 0 if identical, count of differing pixels otherwise.
    public static func difference(_ a: CGImage, _ b: CGImage) -> Int { ... }

    /// Structural Similarity Index (SSIM), 0-1.
    /// 1.0 = identical, 0.99+ = perceptually identical (acceptable for
    /// font hinting / anti-aliasing LSB differences).
    public static func ssim(_ a: CGImage, _ b: CGImage,
                           windowSize: Int = 8) -> Double { ... }

    /// Returns a diff image highlighting differing pixels (red overlay).
    /// Used in test failure messages.
    public static func diffImage(_ a: CGImage, _ b: CGImage) -> CGImage { ... }
}
```

**Algorithme SSIM** : implémentation standard Wang et al. 2004 (luminance × contrast × structure), fenêtre 8×8 glissante avec stride 4, retourne moyenne sur toutes les fenêtres. Pas de framework externe — ~80 lignes Swift.

**Activation du test 4.3** :

```swift
@Test
func export_matches_liveView_pixelExact() async throws {
    let slide = makeFixture(.complexSlide)
    let liveImage = StoryCanvasUIView(slide: slide, mode: .play, time: CMTime(seconds: 5)).snapshot()
    let exportURL = try await StoryExporter.export(slide).get()
    let exportFrame = try await extractFrame(from: exportURL, at: CMTime(seconds: 5))

    let ssim = PixelComparison.ssim(liveImage, exportFrame)
    if ssim < 0.99 {
        let diff = PixelComparison.diffImage(liveImage, exportFrame)
        attach(diff, named: "pixel-diff.png")  // Xcode test attachment
        Issue.record("SSIM \(ssim) < 0.99 — see attached diff image")
    }
    #expect(ssim >= 0.99)
}
```

**Pourquoi 0.99** : empirique acceptable. SSIM 1.0 = identité parfaite. SSIM 0.99 = différences imperceptibles à l'œil nu (1-2 LSB sur < 1 % des pixels). En dessous de 0.95 → différence visible, vraie régression.

**Tests** :
- `test_ssim_identicalImages_returns1`
- `test_ssim_completelyDifferentImages_returnsLow` (< 0.5)
- `test_ssim_minorAntialiasingDifference_returns_above_099`
- `test_diffImage_highlightsDifferingPixels`

### 3.3 B3 — Cache layer-tree entre frames (~1 j, prio 3)

**Problème** : `StoryAVCompositor.startRequest` (spec mère §5.2) appelle `StoryRenderer.render()` pour CHAQUE frame export (720 frames pour 12 s × 60 fps). À chaque appel, l'arbre CALayer est entièrement reconstruit : nouveaux `CALayer`, nouveaux `CGImage` chargés, nouveaux `CATransform3D` calculés. C'est inefficace : entre frame N et N+1 (16.66 ms), l'écrasante majorité des items n'a pas changé d'état (mêmes transforms, opacités, contents).

**Conception** :

```swift
// Canvas/StoryRendererCache.swift
public final class StoryRendererCache: @unchecked Sendable {
    private struct ItemSignature: Hashable {
        let id: String
        let position: CGPoint
        let scale: Double
        let rotation: Double
        let opacity: Double
        let visible: Bool
        // Hash from these fields → if all match between frame N and N+1, the
        // CALayer can be reused as-is. Hashing 5 doubles + 1 bool = O(1).
    }

    private var layerCache: [String: (signature: ItemSignature, layer: CALayer)] = [:]
    private var lastSlideId: String?
    private var lastBackgroundSignature: BackgroundSignature?

    /// Returns a CALayer for the item, reusing the cached one if signature matches,
    /// else creates a fresh one and replaces the cache entry.
    public func layer(for item: any RenderableItem,
                      at time: Double,
                      languages: [String],
                      build: (any RenderableItem) -> CALayer) -> CALayer {
        let sig = signature(for: item, at: time, languages: languages)
        if let cached = layerCache[item.id], cached.signature == sig {
            return cached.layer
        }
        let layer = build(item)
        layerCache[item.id] = (sig, layer)
        return layer
    }

    /// Invalidates the entire cache (slide changed, language changed, mode toggled).
    public func invalidate() {
        layerCache.removeAll()
    }
}
```

**Branchement `StoryRenderer`** :

```swift
extension StoryRenderer {
    public static func render(slide: StorySlide,
                              into geometry: CanvasGeometry,
                              at time: CMTime,
                              mode: RenderMode,
                              languages: [String] = [],
                              cache: StoryRendererCache? = nil) -> CALayer {
        // ... compute root layer
        for item in slide.allItems.sorted(by: { $0.zIndex < $1.zIndex }) {
            let layer = cache?.layer(for: item, at: time.seconds, languages: languages) {
                buildLayer(for: $0, geometry: geometry, time: time, mode: mode, languages: languages)
            } ?? buildLayer(for: item, geometry: geometry, time: time, mode: mode, languages: languages)
            root.addSublayer(layer)
        }
        return root
    }
}
```

**Cache lifecycle** :
- `StoryAVCompositor` : un cache par export. Réutilisé entre les 720 frames d'un même slide. Invalidation entre exports (slide changed).
- `StoryCanvasUIView` : pas de cache (mode .edit = items modifiés constamment, mode .play = `rebuildLayers` appelé seulement sur slide change). N'utilise pas `StoryRendererCache`.
- Cache invalidation triggers : `slide.id` change, `languages` change (chain re-resolved), `mode` change.

**Mesure perf attendue** :
- Avant cache : ~25 ms / frame (ProMotion devices), ~40 ms / frame iPhone SE 3
- Après cache : ~5 ms / frame ProMotion, ~10 ms / frame SE 3
- Export 12 s slide : avant ~18 s, après ~3.6 s (target spec mère §4.7 : iPhone 16 Pro < 4 s ✅, SE 3 < 10 s ✅)

**Tests** :
- `test_cache_returnsSameLayer_whenSignatureUnchanged`
- `test_cache_returnsNewLayer_whenPositionChanges`
- `test_cache_returnsNewLayer_whenOpacityChanges`
- `test_cache_returnsNewLayer_whenLanguageChanges`
- `test_cache_invalidate_clearsAllEntries`
- `test_compositor_usesCacheAcrossFrames` (mock cache, verify hit count)
- `test_compositor_export_completes_inUnder_4s_iPhone16Pro` (perf assertion, run manuel)

---

## 4. Ordre de merge

B1 → B2 → B3 (séquentiel mais indépendant — chaque chantier mergeable seul).

**Justification ordre** :
- **B1 d'abord** : bloquant prod (slides texte-only ne s'exportent pas). Doit être livré ASAP indépendamment du reste.
- **B2 ensuite** : active le test 4.3 qui valide la promesse `live preview = export`. Sans B2, on ne peut pas prouver bit-exact identity sur iOS 26.
- **B3 dernier** : optimisation perf, non-bloquant fonctionnellement. À livrer une fois B1+B2 stables.

Possibles parallélisations : B1 et B2 sont totalement orthogonaux (B1 = StoryExporter ; B2 = test infrastructure) → parallélisables si plusieurs devs.

---

## 5. Acceptance criteria

1. ✅ B1 : `test_export_slideStaticOnly_producesVideoFile` passe ; un slide texte-only s'exporte en MP4 lisible
2. ✅ B1 : Le synthetic transparent asset est cached dans `CacheCoordinator.video` ; 2ème export n'en regénère pas
3. ✅ B2 : `PixelComparison.ssim()` retourne 1.0 sur images identiques, > 0.99 sur images perceptuellement identiques avec différences font hinting
4. ✅ B2 : `test_export_matches_liveView_pixelExact` est activé (skip retiré) et passe avec SSIM ≥ 0.99 sur fixtures complexes
5. ✅ B3 : `StoryRendererCache` retourne le même `CALayer` quand signature inchangée
6. ✅ B3 : Cache invalide correctement sur slide.id / languages / mode change
7. ✅ B3 : Export 12 s slide complet < 4 s sur iPhone 16 Pro (vs ~18 s avant cache)
8. ✅ Aucune régression : tests existants (≥ 576 baseline + ~55 Plan A) continuent de passer
9. ✅ Aucun changement utilisateur visible : `StoryCanvasUIView` rendu, gestures, audio, transitions, filters identiques avant/après Plan B
10. ✅ `./apps/ios/meeshy.sh build` succeed sans warning Swift 6

---

## 6. Plan d'exécution

| Sous-phase | Travail | Effort | Mergeable seul |
|------------|---------|-------:|:--------------:|
| B1 | Synthetic video track (StoryExporter + asset generator + cache + 5 tests) | 0.5 j | ✅ |
| B2 | SSIM helper + diffImage + activation test 4.3 + 4 tests | 0.5 j | ✅ |
| B3 | StoryRendererCache + branchement compositor + invalidation + 7 tests | 1 j | ✅ |
| **Total** | | **~2 j** | |

---

## 7. Fichiers ajoutés / modifiés

### 7.1 Ajoutés

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRendererCache.swift` (B3)
- `packages/MeeshySDK/Tests/MeeshyUITests/Story/Helpers/PixelComparison.swift` (B2 — déplacé en source si besoin de SSIM en prod, mais probablement test-only)
- `packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryExporterStaticOnlyTests.swift` (B1)
- `packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryExporterCacheTests.swift` (B3)

### 7.2 Modifiés

- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExporter.swift` :
  - `ensureVideoTrack(in:duration:size:)`
  - `syntheticTransparentAsset(size:)` + cache lookup
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift` :
  - `init` accepte un `StoryRendererCache`
  - `startRequest` passe le cache à `StoryRenderer.render()`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryRenderer.swift` :
  - `render(... cache: StoryRendererCache? = nil)` (param optionnel)
- `packages/MeeshySDK/Tests/MeeshyUITests/Story/Export/StoryExporterEquivalenceTests.swift` (B2 active le test 4.3)

### 7.3 Documentation

- `apps/ios/CLAUDE.md` : section perf export — mention cache layer-tree + targets atteints
- `packages/MeeshySDK/decisions.md` : choix SSIM 0.99 vs strict 0 px

---

## 8. Hors-scope (différé)

- **MetalFX upscaling** : différé (optimisation post-launch, gain sur very low-end)
- **Cache layer-tree pour `StoryCanvasUIView`** : non implémenté (mode .edit modifie items constamment, mode .play rare reuse — gain marginal)
- **CI Xcode** : différé tant que l'environnement n'est pas disponible

---

**Fin du document.**
