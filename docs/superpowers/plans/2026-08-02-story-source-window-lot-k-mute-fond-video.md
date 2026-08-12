# Fenêtre de source — Lot K (mute de la vidéo de fond) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la vidéo **de fond** le bouton de coupure du son que les vidéos d'avant-plan ont déjà — c'est le cas le plus courant, et le seul sans affordance.

**Architecture:** Le moteur est déjà là et correct : `volume == 0` est l'état muet persistant (`StoryVolumeCarrying`), avec `mutedVolumeMemento` pour restaurer le niveau de l'auteur, honoré par le canvas, l'aperçu, le lecteur et l'export. Le volume du fond est lu au rendu (`StoryCanvasUIView+Rendering.swift:196`). Il ne manque que le bouton. On ajoute donc une résolution **pure** du fond vidéo, testable sans monter de vue, puis l'overlay qui s'en sert.

**Tech Stack:** Swift 6, SwiftUI, XCTest.

## Global Constraints

- Build et tests via `./apps/ios/meeshy.sh` — jamais `xcodebuild` à la main.
- **Un** binding optionnel, jamais un tableau filtré : le modèle ne contraint pas l'unicité du fond, et un tableau rendrait deux boutons superposés.
- Réutiliser `videoMuteButton(for:canvasSize:)` (`StoryComposerView+Canvas.swift:1212-1248`) tel quel : même icône, même geste, même libellé d'accessibilité. Un second bouton visuellement différent pour la même action serait une régression d'apprentissage.
- Ce lot est **totalement indépendant** de la fenêtre de source. Il ne touche ni `sourceStart`, ni les résolveurs, ni les moteurs. Il peut être livré en parallèle des lots A et B, et sert de validation du pipeline de PR pour la série.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift:1202-1272` | Overlays de coupure du son, bindings | Modifier |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundVideoMuteTests.swift` | Tests | Créer |

---

### Task 1: Résolution pure du fond vidéo

Une vue SwiftUI ne se teste pas directement ; la **décision** qu'elle prend, si. On extrait donc « quel média est la vidéo de fond ? » en fonction pure statique, sur le patron de `StoryComposerView.presentedCameraCapture(isRequested:provider:)` qui existe déjà dans ce fichier (`:103`).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundVideoMuteTests.swift`

**Interfaces:**
- Consumes: `StoryMediaObject` de `MeeshySDK`.
- Produces: `StoryComposerView.backgroundVideoIndex(in medias: [StoryMediaObject]) -> Int?` — la tâche 2 s'en sert pour construire le binding.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundVideoMuteTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// La vidéo de FOND — le cas le plus courant — n'avait aucun bouton de
/// coupure du son : `foregroundVideoBindings` filtre sur
/// `isBackground == false`. Son volume était pourtant bien lu au rendu.
final class StoryBackgroundVideoMuteTests: XCTestCase {

    private func video(id: String, background: Bool) -> StoryMediaObject {
        var m = StoryMediaObject(id: id, kind: .video, aspectRatio: 1.0, volume: 1.0)
        m.isBackground = background
        return m
    }

    private func image(id: String, background: Bool) -> StoryMediaObject {
        var m = StoryMediaObject(id: id, kind: .image, aspectRatio: 1.0, volume: 1.0)
        m.isBackground = background
        return m
    }

    func test_backgroundVideoIndex_findsTheBackgroundVideo() {
        let medias = [video(id: "fg", background: false), video(id: "bg", background: true)]
        XCTAssertEqual(StoryComposerView.backgroundVideoIndex(in: medias), 1)
    }

    func test_backgroundVideoIndex_ignoresForegroundVideos() {
        let medias = [video(id: "fg1", background: false), video(id: "fg2", background: false)]
        XCTAssertNil(StoryComposerView.backgroundVideoIndex(in: medias))
    }

    func test_backgroundVideoIndex_ignoresBackgroundImage() {
        // Une image de fond n'a pas de son : lui poser un bouton de coupure
        // serait un contrôle inerte.
        XCTAssertNil(StoryComposerView.backgroundVideoIndex(in: [image(id: "bg", background: true)]))
    }

    func test_backgroundVideoIndex_multipleBackgrounds_returnsTheFirstOnly() {
        // Le modèle ne contraint pas l'unicité du fond. Rendre un tableau
        // superposerait deux boutons au même endroit du canvas.
        let medias = [video(id: "bg1", background: true), video(id: "bg2", background: true)]
        XCTAssertEqual(StoryComposerView.backgroundVideoIndex(in: medias), 0)
    }

    func test_backgroundVideoIndex_emptyList_isNil() {
        XCTAssertNil(StoryComposerView.backgroundVideoIndex(in: []))
    }
}
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -40
```

Attendu : ÉCHEC de compilation du bundle de tests — `backgroundVideoIndex` n'existe pas. En Swift, un symbole absent casse la compilation, pas un test : c'est le rouge attendu ici.

- [ ] **Step 3: Écrire l'implémentation**

Dans `StoryComposerView+Canvas.swift`, à côté de `foregroundVideoBindings` :

```swift
    /// Index de la vidéo de FOND, s'il y en a une.
    ///
    /// Pure et statique : la décision se teste sans monter la vue. Rend le
    /// PREMIER fond vidéo et non un tableau — le modèle ne contraint pas
    /// l'unicité du fond, et deux bindings poseraient deux boutons superposés
    /// au même coin du canvas.
    nonisolated static func backgroundVideoIndex(in medias: [StoryMediaObject]) -> Int? {
        medias.firstIndex { $0.isBackground && $0.kind == .video }
    }
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -40
```

Attendu : PASS, 5 tests dans la nouvelle classe.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundVideoMuteTests.swift
git commit -m "feat(sdk/story): resolution pure du fond video pour le bouton de coupure

Rend le PREMIER fond video et non un tableau : le modele ne contraint pas
l'unicite du fond, et deux bindings poseraient deux boutons superposes."
```

---

### Task 2: Le bouton sur le canvas

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift:1202-1210` (`videoMuteOverlay`), `:1253-1272` (bindings)
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundVideoMuteTests.swift`

**Interfaces:**
- Consumes: `backgroundVideoIndex(in:)` de la tâche 1, `videoMuteButton(for:canvasSize:)` existant.
- Produces: `backgroundVideoBinding: Binding<StoryMediaObject>?`, monté par `videoMuteOverlay`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `StoryBackgroundVideoMuteTests.swift` — un test de comportement sur le modèle, plus une garde de source qui ancre le montage (une vue SwiftUI ne s'inspecte pas ; la garde filtre les commentaires, sinon une mention en prose suffirait à la faire passer) :

```swift
    // MARK: - Le toggle atteint bien le modèle du FOND

    func test_toggleMute_onBackgroundVideo_silencesAndRestores() {
        var bg = video(id: "bg", background: true)
        bg.volume = 0.8
        bg.toggleMute()
        XCTAssertEqual(bg.volume, 0)
        XCTAssertEqual(bg.mutedVolumeMemento, 0.8)
        bg.toggleMute()
        XCTAssertEqual(bg.volume, 0.8, accuracy: 0.001,
                       "l'unmute restaure le niveau de l'auteur, il ne force pas 1.0")
        XCTAssertNil(bg.mutedVolumeMemento)
    }

    // MARK: - Garde de source du montage

    func test_videoMuteOverlay_mountsTheBackgroundButton() throws {
        // Quatre `deletingLastPathComponent` depuis
        // `Tests/MeeshyUITests/Story/` pour atteindre la racine du paquet.
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
        let file = root
            .appendingPathComponent("Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift")
        guard let raw = try? String(contentsOf: file, encoding: .utf8) else {
            throw XCTSkip("source introuvable : \(file.path)")
        }
        // Sans le filtrage des commentaires, une simple mention en prose du
        // nom suffirait à faire passer la garde.
        let code = raw
            .replacingOccurrences(of: "(?s)/\\*.*?\\*/", with: "", options: .regularExpression)
            .replacingOccurrences(of: "(?m)//.*$", with: "", options: .regularExpression)

        XCTAssertTrue(code.contains("backgroundVideoBinding"),
                      "le binding du fond doit exister")
        // Le binding doit être CONSOMMÉ par l'overlay, pas seulement déclaré.
        guard let overlayRange = code.range(of: "var videoMuteOverlay") else {
            return XCTFail("videoMuteOverlay introuvable")
        }
        let overlay = String(code[overlayRange.lowerBound...].prefix(900))
        XCTAssertTrue(overlay.contains("backgroundVideoBinding"),
                      "videoMuteOverlay doit monter le bouton du fond")
    }
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -40
```

Attendu : le test de garde ÉCHOUE (`backgroundVideoBinding` absent). Le test de toggle passe déjà — c'est normal, il documente l'acquis du moteur et sert de garde de non-régression.

- [ ] **Step 3: Écrire l'implémentation**

Dans `StoryComposerView+Canvas.swift`, ajouter le binding à côté de `foregroundVideoBindings` :

```swift
    /// Binding vers la vidéo de FOND, s'il y en a une. Optionnel et non
    /// tableau — cf. `backgroundVideoIndex(in:)`.
    var backgroundVideoBinding: Binding<StoryMediaObject>? {
        let medias = viewModel.currentEffects.mediaObjects ?? []
        guard let idx = Self.backgroundVideoIndex(in: medias) else { return nil }
        let snapshot = medias[idx]
        return Binding<StoryMediaObject>(
            get: {
                let list = viewModel.currentEffects.mediaObjects ?? []
                return list.indices.contains(idx) ? list[idx] : snapshot
            },
            set: { newValue in
                var effects = viewModel.currentEffects
                guard var list = effects.mediaObjects,
                      list.indices.contains(idx) else { return }
                list[idx] = newValue
                effects.mediaObjects = list
                viewModel.currentEffects = effects
            }
        )
    }
```

Puis étendre `videoMuteOverlay` :

```swift
    @ViewBuilder
    var videoMuteOverlay: some View {
        if !viewModel.isDrawingActive {
            GeometryReader { geo in
                ForEach(foregroundVideoBindings, id: \.wrappedValue.id) { binding in
                    videoMuteButton(for: binding, canvasSize: geo.size)
                }
                // La vidéo de FOND — le cas le plus courant, et le seul qui
                // n'avait aucune affordance. Même bouton, même geste : un
                // contrôle visuellement différent pour la même action serait
                // une régression d'apprentissage.
                if let bg = backgroundVideoBinding {
                    backgroundVideoMuteButton(for: bg, canvasSize: geo.size)
                }
            }
        }
    }

    /// Bouton de coupure du son de la vidéo de fond. Le fond occupe tout le
    /// canvas : sa position ne dérive pas du modèle comme celle d'un clip
    /// d'avant-plan, elle est ancrée au coin haut-droit.
    func backgroundVideoMuteButton(for binding: Binding<StoryMediaObject>,
                                   canvasSize: CGSize) -> some View {
        let muted = binding.wrappedValue.volume <= 0
        let inset: CGFloat = 18
        return Button {
            HapticFeedback.light()
            var obj = binding.wrappedValue
            obj.toggleMute()
            binding.wrappedValue = obj
        } label: {
            Image(systemName: muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 30, height: 30)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .position(x: canvasSize.width - inset - 15, y: inset + 15)
        .accessibilityLabel(muted
            ? String(localized: "story.video.unmute", defaultValue: "Activer le son de la vidéo", bundle: .module)
            : String(localized: "story.video.mute", defaultValue: "Couper le son de la vidéo", bundle: .module))
    }
```

Les deux clés de localisation sont **celles déjà utilisées** par `videoMuteButton` : aucune clé neuve, donc aucune traduction à ajouter dans les sept locales.

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
./apps/ios/meeshy.sh test 2>&1 | tail -40
```

Attendu : PASS.

- [ ] **Step 5: Vérifier à l'œil sur le simulateur**

```bash
./apps/ios/meeshy.sh build
```

Puis ouvrir le composer sur une slide portant une vidéo de fond et vérifier : le bouton apparaît en haut à droite, un tap coupe le son, l'icône bascule, un second tap le rend. Une slide à fond **image** n'affiche aucun bouton.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Canvas.swift packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryBackgroundVideoMuteTests.swift
git commit -m "feat(sdk/story): la video de FOND recoit le bouton de coupure du son

foregroundVideoBindings filtre sur isBackground == false : la video plein
ecran, le cas le plus courant, n'avait aucune affordance alors que son
volume etait bien lu au rendu. Meme bouton, meme geste, memes cles de
localisation que l'avant-plan."
```

---

### Task 3: Gate

- [ ] **Step 1: Suite iOS complète**

```bash
./apps/ios/meeshy.sh test
```

Attendu : aucune régression. En particulier `StoryTrackMuteToggleTests` et `CanvasEditMuteLivePropagationTests` restent verts — ce sont eux qui protègent la convention `volume == 0` et la propagation live au mixer.

- [ ] **Step 2: Commit s'il reste quoi que ce soit**

```bash
git status --porcelain
```

---

## Couverture du spec par ce plan

| Exigence du spec | Tâche |
|---|---|
| § 2.7 — la vidéo de fond n'a pas de bouton de coupure | 1, 2 |
| § 8.4 — binding optionnel unique, jamais un tableau filtré | 1, 2 |
| § 8.4 — l'optimisation « ne plus planifier à `volume == 0` » reste **écartée** | garde du gate : `CanvasEditMuteLivePropagationTests` doit rester vert |
