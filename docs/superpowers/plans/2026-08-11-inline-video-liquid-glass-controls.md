# Lifting Liquid Glass des contrôles vidéo inline (bulle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre `ControlSet.inlineDefault` avec `.pip`/`.airplay`, refondre la top bar inline (`_InlineOverlayControls.topBar`) en un unique `AdaptiveGlassContainer` de 4 boutons max, migrer les contrôles centraux (skip/play/skip) vers `.adaptiveGlass`/`.adaptiveGlassProminent`, et câbler réellement le Picture-in-Picture sur la surface inline via un flag opt-in `enablesPip` (miroir de `ReelVideoSurface`) — sans quoi le nouveau bouton PiP serait mort.

**Architecture:** Chantier 100% SDK, confiné à `packages/MeeshySDK/Sources/MeeshyUI/Media/` (4 fichiers) + leurs tests sous `packages/MeeshySDK/Tests/MeeshyUITests/Media/`. Deux décisions pures sont extraites AVANT toute modification de vue (même pattern que `_InlineRenderer.shouldAutoplayOnAppear`) : `_InlineOverlayControls.showsPipButton(controls:isPipSupported:)` pilote l'affichage du bouton, `_InlineRenderer.surfaceEnablesPip(controls:)` pilote l'activation réelle du PiP sur `MeeshyVideoSurface`. Les deux lisent la même `ControlSet` — impossible d'avoir l'un sans l'autre. Aucun fichier app-side n'est touché : les 6 call sites de `.inlineDefault` (bulle, attachment de bulle, feed, détail de post, média de commentaire) héritent de PiP+AirPlay sans modification, confirmé par grep (`grep -rn "inlineDefault" apps/ios/Meeshy` → exactement ces 6 sites, aucun test/snapshot qui compte les boutons rendus ou assert l'absence de `.pip`/`.airplay`).

**Tech Stack:** Swift 6, SwiftUI, AVKit (`AVPictureInPictureController`, `AVRoutePickerView` via `AirPlayRoutePicker`), XCTest (`@testable import MeeshyUI`).

## Global Constraints

- iOS 16.0+ ; Swift 6 ; aucune nouvelle dépendance externe.
- Types/enums réutilisables côté SDK dans `packages/MeeshySDK/` (`ControlSet`, `AdaptiveGlass`, `MeeshyVideoSurface`) ; ce chantier est majoritairement SDK. **Confirmé par lecture de la spec + grep : aucun fichier app-side n'est modifié.** Les 6 call sites de `.inlineDefault` (`apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift:401,926`, `.../Bubble/BubbleAttachmentView.swift:48`, `.../FeedPostCard+Media.swift:427`, `.../PostDetailView.swift:1882`, `.../CommentMediaView.swift:223`) restent inchangés — ils héritent de PiP/AirPlay uniquement parce que `inlineDefault` change de valeur, sans toucher un octet de ces fichiers.
- Nouveaux fichiers `.swift` : uniquement des fichiers de TEST sous `packages/MeeshySDK/Tests/MeeshyUITests/Media/` (résolus par Swift Package Manager via le globbing du `Package.swift` du SDK). **`xcodegen generate` n'est PAS nécessaire pour ce chantier** — il ne serait requis que pour de nouveaux fichiers sous `apps/ios/Meeshy/` (globbés par `project.yml`), ce qui n'est pas le cas ici.
- **NE JAMAIS committer le churn `project.pbxproj`/`Meeshy.xcscheme`/`Package.resolved`.** Avant chaque commit : `git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved` puis, si du churn est présent, `git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved`.
- Commandes de test SDK (remplacer `<Classe>`) :
  ```bash
  xcodebuild test -scheme MeeshySDK-Package \
    -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
    -only-testing:MeeshyUITests/<Classe> -quiet
  ```
- Tests app : sans objet ici (aucun fichier app-side touché) — mais la vérification visuelle manuelle (Tâche 7) tourne sur le simulateur iPhone 16 Pro (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`) ET sur iPhone SE (375pt, le plus étroit du parc supporté).
- Commits : convention `feat(sdk):` (tous les fichiers touchés sont sous `packages/MeeshySDK/`), en français, **SANS trailer Co-Authored-By**.
- **Le bouton PiP n'est PAS vérifiable visuellement en simulateur** — `AVPictureInPictureController.isPictureInPictureSupported()` y est toujours `false` (confirmé par `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallPiPPolicy.swift:8`). La Tâche 7 (vérification visuelle simulateur) DOIT donc constater 3 boutons visibles (plein écran, AirPlay, vitesse), jamais 4, sur les deux simulateurs. C'est le comportement ATTENDU, pas un bug.
- Commande de build/test complète (gate final UNIQUEMENT, pas à chaque tâche) : `./apps/ios/meeshy.sh build` puis `./apps/ios/meeshy.sh test`.

---

## File Structure

```
packages/MeeshySDK/Sources/MeeshyUI/Media/
├── MeeshyVideoPlayer.swift              (modify — ControlSet.inlineDefault, ligne 55)
├── MeeshyVideoPlayer+Controls.swift     (modify — _InlineOverlayControls : showsPipButton, topBar, centerControls/skipButton/playPauseButton)
├── MeeshyVideoPlayer+Renderers.swift    (modify — _InlineRenderer : surfaceEnablesPip, call site MeeshyVideoSurface)
└── MeeshyVideoSurface.swift             (modify — champ enablesPip + câblage configurePip)

packages/MeeshySDK/Tests/MeeshyUITests/Media/
├── MeeshyVideoPlayerControlSetTests.swift              (modify — 2 tests RED ajoutés)
├── MeeshyVideoPlayerInlinePipButtonTests.swift         (create — showsPipButton)
├── MeeshyVideoPlayerSurfaceEnablesPipTests.swift       (create — surfaceEnablesPip)
└── MeeshyVideoSurfaceConfigurePipSourceGuardTests.swift (create — garde de source configurePip/enablesPip)
```

Aucun fichier créé ou modifié en dehors de ces deux répertoires.

**Note sur les numéros de ligne :** chaque tâche cite les numéros de ligne du fichier tel que lu le 2026-08-11, AVANT les modifications de ce plan. Les tâches s'exécutent dans l'ordre et modifient parfois le MÊME fichier (`MeeshyVideoPlayer+Controls.swift` : Tasks 2, 5, 6 ; `MeeshyVideoPlayer+Renderers.swift` : Tasks 3, 4) — les numéros de ligne des tâches suivantes se seront donc décalés. Chaque étape de remplacement montre le code EXACT à localiser (commentaires `// MARK:`, signatures) : localiser par ce contenu, pas par une lecture de ligne au caractère près.

---

## Task 1: Étendre `ControlSet.inlineDefault` (§A)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift:55`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift`

**Interfaces:**
- Consumes: `ControlSet.pip` (rawValue `1 << 12`) et `ControlSet.airplay` (rawValue `1 << 11`) — existent déjà dans l'`OptionSet` (`MeeshyVideoPlayer.swift:50-51`), déjà utilisés par `fullscreenDefault`.
- Produces: `ControlSet.inlineDefault` contenant désormais `.pip` et `.airplay` — consommé par les Tâches 2 et 5 (tests utilisant `.inlineDefault` comme fixture), et par les 6 call sites app-side (non modifiés, héritage automatique).

- [ ] **Step 1: Écrire les tests RED**

Dans `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift`, ajouter après `test_inlineDefault_includesExpand` (ligne 12) :

```swift
    func test_inlineDefault_includesPip() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.pip))
    }

    func test_inlineDefault_includesAirplay() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.airplay))
    }
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec RED**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests -quiet
```
Attendu : `test_inlineDefault_includesPip` et `test_inlineDefault_includesAirplay` échouent (FALSE au lieu de TRUE) ; les 4 tests existants restent verts.

- [ ] **Step 3: Implémentation minimale**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift`, ligne 55 :

```swift
        public nonisolated static let inlineDefault: ControlSet     = [.playPause, .scrubber, .duration, .expand, .pip, .airplay, .speed]
```

- [ ] **Step 4: Relancer les tests, vérifier GREEN**

Même commande que Step 2. Attendu : 6/6 tests verts.

- [ ] **Step 5: Commit**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
# si churn présent :
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved

git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift
git commit -m "feat(sdk): étendre inlineDefault avec PiP et AirPlay"
```

---

## Task 2: `showsPipButton(controls:isPipSupported:)` — décision pure d'affichage (§ Tests item 2)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift` (ajout dans `_InlineOverlayControls`, entre ligne 31 et ligne 33)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerInlinePipButtonTests.swift`

**Interfaces:**
- Consumes: `MeeshyVideoPlayer.ControlSet.inlineDefault` (Task 1, contient `.pip`).
- Produces: `_InlineOverlayControls.showsPipButton(controls: MeeshyVideoPlayer.ControlSet, isPipSupported: Bool) -> Bool` — appelé par la Tâche 5 (top bar) avec `isPipSupported: AVPictureInPictureController.isPictureInPictureSupported()`.

- [ ] **Step 1: Écrire le test RED**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerInlinePipButtonTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

/// § B.2 — la top bar inline n'affiche le bouton PiP que si le contrôle est
/// demandé ET que l'appareil supporte réellement le PiP
/// (`AVPictureInPictureController.isPictureInPictureSupported()` vaut
/// toujours `false` sur Simulateur). MASQUÉ, pas désactivé : un bouton grisé
/// flottant sur une vidéo n'est pas explicable, contrairement à un item de
/// menu grisé (cf. `VideoTransportControls.moreMenu`, qui désactive son item
/// PiP au lieu de le masquer).
final class MeeshyVideoPlayerInlinePipButtonTests: XCTestCase {

    func test_showsPipButton_whenControlPresentAndSupported() {
        XCTAssertTrue(_InlineOverlayControls.showsPipButton(
            controls: .inlineDefault, isPipSupported: true))
    }

    func test_hidesPipButton_whenSupportedButControlAbsent() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: [.playPause], isPipSupported: true))
    }

    func test_hidesPipButton_whenControlPresentButUnsupported() {
        XCTAssertFalse(_InlineOverlayControls.showsPipButton(
            controls: .inlineDefault, isPipSupported: false))
    }
}
```

- [ ] **Step 2: Lancer le test, vérifier l'échec RED**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerInlinePipButtonTests -quiet
```
Attendu : échec de COMPILATION (`showsPipButton` n'existe pas encore sur `_InlineOverlayControls`) — c'est le signal RED attendu pour une fonction pas encore écrite.

- [ ] **Step 3: Implémentation minimale**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift`, insérer entre la ligne 31 (`private var progress: Double { ... }`, fin) et la ligne 33 (`var body: some View {`) :

```swift

    /// Décision pure extraite pour la testabilité — `_InlineOverlayControls`
    /// est une `View` SwiftUI, pas un point d'entrée décidable en soi. Même
    /// pattern que `_InlineRenderer.shouldAutoplayOnAppear`. `isPipSupported`
    /// est injecté : le body passe
    /// `AVPictureInPictureController.isPictureInPictureSupported()`, donc le
    /// test ne dépend jamais de l'environnement (faux en CI/simulateur).
    nonisolated static func showsPipButton(controls: MeeshyVideoPlayer.ControlSet, isPipSupported: Bool) -> Bool {
        controls.contains(.pip) && isPipSupported
    }
```

- [ ] **Step 4: Relancer le test, vérifier GREEN**

Même commande que Step 2. Attendu : 3/3 tests verts.

- [ ] **Step 5: Commit**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved 2>/dev/null || true

git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerInlinePipButtonTests.swift
git commit -m "feat(sdk): extraire showsPipButton en décision pure testable"
```

---

## Task 3: `surfaceEnablesPip(controls:)` — décision pure de câblage (§ Tests item 3, partie 1)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift` (ajout dans `_InlineRenderer`, entre ligne 365 et ligne 367)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerSurfaceEnablesPipTests.swift`

**Interfaces:**
- Consumes: `MeeshyVideoPlayer.ControlSet.inlineDefault` (Task 1), `MeeshyVideoPlayer.ControlSet.miniDefault` (existant, `[.duration]`, ne contient pas `.pip`).
- Produces: `_InlineRenderer.surfaceEnablesPip(controls: MeeshyVideoPlayer.ControlSet) -> Bool` — consommé par la Tâche 4 au call site de `MeeshyVideoSurface`.

- [ ] **Step 1: Écrire le test RED**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerSurfaceEnablesPipTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

/// § B.2 — une surface sans bouton PiP visible ne doit JAMAIS armer
/// `canStartPictureInPictureAutomaticallyFromInline` : `configurePip` pose
/// implicitement ce flag (`SharedAVPlayerManager.configurePip`), donc une
/// surface opt-in sans contrôle visible ouvrirait une fenêtre PiP système au
/// passage en arrière-plan sans que l'utilisateur l'ait demandé.
final class MeeshyVideoPlayerSurfaceEnablesPipTests: XCTestCase {

    func test_surfaceEnablesPip_whenControlsIncludePip() {
        XCTAssertTrue(_InlineRenderer.surfaceEnablesPip(controls: .inlineDefault))
    }

    func test_surfaceDoesNotEnablePip_whenControlsExcludePip() {
        XCTAssertFalse(_InlineRenderer.surfaceEnablesPip(controls: .miniDefault))
    }
}
```

- [ ] **Step 2: Lancer le test, vérifier l'échec RED**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerSurfaceEnablesPipTests -quiet
```
Attendu : échec de compilation (`surfaceEnablesPip` n'existe pas encore sur `_InlineRenderer`).

- [ ] **Step 3: Implémentation minimale**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift`, insérer entre la ligne 365 (fin de `shouldAutoplayOnAppear`) et la ligne 367 (`private func autoplayIfNeeded()`) :

```swift

    /// Décision pure (§ B.2) : une surface sans bouton PiP visible ne doit
    /// jamais configurer le PiP — `configurePip` arme implicitement
    /// `canStartPictureInPictureAutomaticallyFromInline`. Miroir de
    /// `ReelVideoSurface.enablesPip` ; source de vérité unique avec
    /// `_InlineOverlayControls.showsPipButton` (même `ControlSet` pilote les
    /// deux — impossible d'avoir l'un sans l'autre).
    nonisolated static func surfaceEnablesPip(controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        controls.contains(.pip)
    }
```

- [ ] **Step 4: Relancer le test, vérifier GREEN**

Même commande que Step 2. Attendu : 2/2 tests verts.

- [ ] **Step 5: Commit**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved 2>/dev/null || true

git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerSurfaceEnablesPipTests.swift
git commit -m "feat(sdk): extraire surfaceEnablesPip en décision pure testable"
```

---

## Task 4: Câbler le PiP sur `MeeshyVideoSurface` et le call site inline (§ B.2, § Tests item 3 partie 2)

C'est la tâche qui rend le bouton PiP (Tâche 5) réellement fonctionnel — sans elle, il s'afficherait et ne ferait rien (§ B.2, problème constaté n°4).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoSurface.swift:13-37`
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift:119` (call site dans `_InlineRenderer.body`)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoSurfaceConfigurePipSourceGuardTests.swift`

**Interfaces:**
- Consumes: `_InlineRenderer.surfaceEnablesPip(controls:)` (Task 3), `SharedAVPlayerManager.shared.configurePip(playerLayer: AVPlayerLayer)` (API publique existante, `SharedAVPlayerManager.swift:324`, idempotente via garde d'identité de layer).
- Produces: `MeeshyVideoSurface.enablesPip: Bool` (défaut `false`) — champ public au sein du module, consommé uniquement par le call site inline modifié ici. `_FlatRenderer` (`MeeshyVideoPlayer+Renderers.swift:21`) et `_FullscreenRenderer` (`:505`) continuent d'appeler `MeeshyVideoSurface(player:gravity:isMuted:)` sans le nouveau paramètre — ils compilent inchangés grâce au défaut, et restent hors PiP (non-régression).

- [ ] **Step 1: Écrire les tests RED (garde de source)**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoSurfaceConfigurePipSourceGuardTests.swift` :

```swift
import XCTest

/// Garde de source (§ B.2) : `configurePip(` ne doit apparaître QUE sous
/// `if enablesPip` dans `MeeshyVideoSurface.swift` (mêmes deux occurrences
/// que `ReelVideoSurface`, `ReelsPlayerView.swift:1539,1556`), et
/// `enablesPip` doit porter un défaut `false` — sinon un call site existant
/// (`_FlatRenderer`, `_FullscreenRenderer`) activerait silencieusement le
/// PiP sans exposer le moindre bouton pour le contrôler.
///
/// Ancré sur le COMPORTEMENT (l'appel n'est jamais atteignable sans le
/// garde), pas sur une mise en forme. Les commentaires sont retirés avant
/// analyse.
final class MeeshyVideoSurfaceConfigurePipSourceGuardTests: XCTestCase {

    func test_configurePip_hasExactlyTwoCallSites() throws {
        let lines = try Self.strippedLines()
        let callSites = lines.filter { $0.contains("configurePip(") }
        XCTAssertEqual(callSites.count, 2, "Attendu : makeUIView + updateUIView, miroir de ReelVideoSurface")
    }

    func test_enablesPip_defaultsToFalse() throws {
        let lines = try Self.strippedLines()
        XCTAssertTrue(
            lines.contains { $0.contains("var enablesPip: Bool = false") },
            "enablesPip doit défauter à false — une surface sans bouton PiP ne doit jamais s'y opter silencieusement"
        )
    }

    func test_configurePip_onlyCalledUnderEnablesPipGuard() throws {
        let lines = try Self.strippedLines()
        let offenders = Self.unguardedConfigurePipCalls(in: lines)
        XCTAssertTrue(offenders.isEmpty, "configurePip( appelé sans garde `if enablesPip` immédiatement au-dessus : \(offenders)")
    }

    /// Contrôle négatif : la garde doit réellement détecter le motif banni.
    func test_guardDetectsUnguardedConfigurePip() {
        let sample = """
        func makeUIView() {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        """
        let lines = sample.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        XCTAssertEqual(Self.unguardedConfigurePipCalls(in: lines).count, 1)
    }

    /// Contrôle positif : la forme correcte ne doit pas déclencher l'alerte.
    func test_guardAcceptsGuardedConfigurePip() {
        let sample = """
        if enablesPip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        """
        let lines = sample.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        XCTAssertTrue(Self.unguardedConfigurePipCalls(in: lines).isEmpty)
    }

    // MARK: - Helpers

    private static func unguardedConfigurePipCalls(in lines: [String]) -> [String] {
        lines.enumerated()
            .filter { $0.element.contains("configurePip(") }
            .filter { entry in
                let start = max(0, entry.offset - 3)
                let window = lines[start..<entry.offset]
                return !window.contains { $0.contains("if enablesPip") }
            }
            .map(\.element)
    }

    /// Racine du package : le fichier vit dans `Tests/MeeshyUITests/Media/`,
    /// il faut donc remonter QUATRE niveaux (fichier → Media → MeeshyUITests
    /// → Tests → racine) avant de redescendre dans `Sources`.
    private static var sourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK (racine du package)
            .appendingPathComponent("Sources/MeeshyUI/Media/MeeshyVideoSurface.swift")
    }

    private static func strippedLines() throws -> [String] {
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        return source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
    }
}
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec RED**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoSurfaceConfigurePipSourceGuardTests -quiet
```
Attendu : `test_configurePip_hasExactlyTwoCallSites` échoue (0 occurrence actuellement, pas 2) et `test_enablesPip_defaultsToFalse` échoue (le champ n'existe pas). `test_configurePip_onlyCalledUnderEnablesPipGuard` passe trivialement (aucun appel à `configurePip(` dans le fichier actuel, donc aucun offender) — c'est attendu, ce n'est pas ce test qui porte le signal RED ici. Les deux tests de contrôle (`test_guardDetects…`/`test_guardAccepts…`) passent déjà : ils valident le MÉCANISME de la garde, indépendamment de l'état de l'implémentation.

- [ ] **Step 3: Implémentation minimale — `MeeshyVideoSurface.swift`**

Remplacer les lignes 13-37 de `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoSurface.swift` :

```swift
internal struct MeeshyVideoSurface: UIViewRepresentable {
    let player: AVPlayer
    let gravity: AVLayerVideoGravity
    let isMuted: Bool
    /// Opt-in Picture-in-Picture. `false` par défaut : attacher un
    /// `AVPictureInPictureController` pose aussi
    /// `canStartPictureInPictureAutomaticallyFromInline = true`, donc une
    /// surface qui n'expose pas de contrôle PiP ne doit JAMAIS l'activer —
    /// elle ouvrirait une fenêtre système au passage en arrière-plan sans
    /// que l'utilisateur l'ait demandé. Miroir de `ReelVideoSurface.enablesPip`
    /// (`ReelsPlayerView.swift`). `var` (et non `let`) avec valeur par
    /// défaut : `MeeshyVideoSurface` est `internal` et n'a pas d'init
    /// explicite, l'init memberwise synthétisé porte donc le défaut — tout
    /// call site futur reste inchangé et hors PiP.
    var enablesPip: Bool = false

    func makeUIView(context: Context) -> _SurfaceUIView {
        let view = _SurfaceUIView()
        view.isOpaque = true
        view.playerLayer.videoGravity = gravity
        view.playerLayer.player = player
        player.isMuted = isMuted
        if enablesPip {
            SharedAVPlayerManager.shared.configurePip(playerLayer: view.playerLayer)
        }
        return view
    }

    func updateUIView(_ uiView: _SurfaceUIView, context: Context) {
        if uiView.playerLayer.player !== player {
            uiView.playerLayer.player = player
        }
        if uiView.playerLayer.videoGravity != gravity {
            uiView.playerLayer.videoGravity = gravity
        }
        if player.isMuted != isMuted {
            player.isMuted = isMuted
        }
        if enablesPip {
            // Idempotent : garde d'identité de layer dans `configurePip`.
            SharedAVPlayerManager.shared.configurePip(playerLayer: uiView.playerLayer)
        }
    }
```

(Le reste du fichier — `sizeThatFits`, `_SurfaceUIView` — reste inchangé.)

- [ ] **Step 4: Relancer les tests, vérifier GREEN**

Même commande que Step 2. Attendu : 5/5 tests verts.

- [ ] **Step 5: Câbler le call site inline**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift`, ligne 119, remplacer :

```swift
                MeeshyVideoSurface(player: p, gravity: .resizeAspect, isMuted: manager.isMuted)
```

par :

```swift
                MeeshyVideoSurface(
                    player: p,
                    gravity: .resizeAspect,
                    isMuted: manager.isMuted,
                    enablesPip: Self.surfaceEnablesPip(controls: player.controls)
                )
```

Ce bloc est dans `_InlineRenderer.body` (à l'intérieur du `if isThisActive, let p = manager.player { ... }`), donc `Self.surfaceEnablesPip` résout vers la fonction statique ajoutée en Tâche 3 sur `_InlineRenderer` — source de vérité unique, pas de duplication de la condition `controls.contains(.pip)`.

- [ ] **Step 6: Vérifier la non-régression par build + tests existants**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerAutoplayDecisionTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerAttachmentIdWiringTests \
  -only-testing:MeeshyUITests/MeeshyVideoSurfaceConfigurePipSourceGuardTests -quiet
```
Attendu : tous verts — confirme que `_FlatRenderer`/`_FullscreenRenderer` (qui n'ont pas été modifiés et n'appellent pas `enablesPip`) compilent toujours grâce au défaut, et que `_InlineRenderer` compile avec le nouveau paramètre.

- [ ] **Step 7: Commit**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved 2>/dev/null || true

git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoSurface.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoSurfaceConfigurePipSourceGuardTests.swift
git commit -m "feat(sdk): câbler le PiP sur MeeshyVideoSurface via enablesPip"
```

---

## Task 5: Top bar inline → `AdaptiveGlassContainer` avec jusqu'à 4 boutons (§ B)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift:74-111`

**Interfaces:**
- Consumes: `_InlineOverlayControls.showsPipButton(controls:isPipSupported:)` (Task 2), `AdaptiveGlassContainer` + `.adaptiveGlass(in:tint:interactive:)` (existants, `Compatibility/AdaptiveGlass.swift`), `AirPlayRoutePicker` (existant, `AirPlayRoutePicker.swift`), `manager.isPipActive`/`startPip()`/`stopPip()` (existants, `SharedAVPlayerManager.swift:19,356,361`).
- Produces: aucune nouvelle API — changement de rendu uniquement, comportement piloté par les décisions déjà testées (Tâches 2-4).

Pas de nouveau test unitaire dans cette tâche : la logique de branchement (`showsPipButton`) est déjà couverte par la Tâche 2, et le repo ne dispose d'aucune infrastructure de snapshot pour ce lecteur (`§ Tests point 1` de la spec : aucun `__Snapshots__/Media/` n'existe). La vérification de ce rendu SwiftUI se fait par compilation + vérification visuelle manuelle (Tâche 7). C'est le pattern déjà suivi par `§ D` de la spec elle-même (items 4-5 de son plan de tests sont build/visuel, pas des tests unitaires supplémentaires).

- [ ] **Step 1: Remplacer `topBar`**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift`, remplacer les lignes 74-111 (le bloc de commentaire `// MARK: - Top Bar` + la propriété `topBar`) par :

```swift
    // MARK: - Top Bar (plein écran + PiP + AirPlay + vitesse)
    //
    // Lifting Liquid Glass 2026-08-11 (§ B) : un unique `AdaptiveGlassContainer`
    // regroupe jusqu'à 4 boutons circulaires 28×28 (taille INCHANGÉE — c'est la
    // taille inline réelle, pas celle du plein écran 36×36). Budget :
    // 4 × 28 + 3 × 10 = 142pt, tient sur iPhone SE. Le PiP est MASQUÉ (pas
    // désactivé) hors support device — cf. `showsPipButton`. Cluster centrée
    // horizontalement via `.frame(maxWidth: .infinity)`, comme avant.

    private var topBar: some View {
        AdaptiveGlassContainer(spacing: 10) {
            HStack(spacing: 10) {
                if controls.contains(.expand), let onExpand {
                    Button {
                        onExpand()
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
                            .adaptiveGlass(in: Circle(), interactive: true)
                    }
                }
                if Self.showsPipButton(controls: controls, isPipSupported: AVPictureInPictureController.isPictureInPictureSupported()) {
                    Button {
                        if manager.isPipActive {
                            manager.stopPip()
                        } else {
                            manager.startPip()
                        }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: manager.isPipActive ? "pip.exit" : "pip.enter")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 28, height: 28)
                            .adaptiveGlass(in: Circle(), interactive: true)
                    }
                    .accessibilityLabel(manager.isPipActive
                        ? String(localized: "media.video.pip.exit", defaultValue: "Quitter le Picture in Picture", bundle: .module)
                        : String(localized: "media.video.pip.enter", defaultValue: "Picture in Picture", bundle: .module))
                }
                if controls.contains(.airplay) {
                    AirPlayRoutePicker(tintColor: .white)
                        .frame(width: 28, height: 28)
                        .accessibilityLabel(String(localized: "media.video.airplay", defaultValue: "AirPlay", bundle: .module))
                }
                if controls.contains(.speed) {
                    Button {
                        manager.cycleSpeed()
                        HapticFeedback.light()
                    } label: {
                        Text(manager.playbackSpeed.label)
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .adaptiveGlass(in: Capsule())
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
```

Notes de fidélité à la spec :
- Ordre des boutons : plein écran → PiP → AirPlay → vitesse (§ B, énumération 1-4).
- AirPlay ne reçoit PAS de `.adaptiveGlass` — « gère son propre chrome » (§ B point 3), même traitement que `VideoTransportControls.airplayButton` (`VideoTransportControls.swift:161-165`, pas de `.adaptiveGlass` non plus).
- `.adaptiveGlass` posé APRÈS `.frame(...)` sur chaque bouton (règle du repo, § B).
- Vitesse : `.adaptiveGlass(in: Capsule())` sans `tint`/`interactive` — remplace `Capsule().fill(accent)`, comportement (`cycleSpeed()`, label) inchangé (§ B point 4).
- Icônes PiP (`pip.enter`/`pip.exit`) et libellés localisés réutilisent EXACTEMENT les clés déjà utilisées par `VideoTransportControls.moreMenu` (`VideoTransportControls.swift:188-193`) — pas de nouvelle chaîne à localiser.

- [ ] **Step 2: Build pour vérifier la compilation**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```
Attendu : build vert, aucune erreur de type/signature.

- [ ] **Step 3: Relancer la suite Media complète pour non-régression**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerInlinePipButtonTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerAutoplayDecisionTests -quiet
```
Attendu : tous verts.

- [ ] **Step 4: Commit**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved 2>/dev/null || true

git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift
git commit -m "feat(sdk): refondre la top bar inline en AdaptiveGlassContainer 4 boutons"
```

---

## Task 6: Centre (skip/play/skip) → `.adaptiveGlass`/`.adaptiveGlassProminent` (§ C)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift:113-164`

**Interfaces:**
- Consumes: `AdaptiveGlassContainer`, `.adaptiveGlass(in:interactive:)`, `.adaptiveGlassProminent(in:tint:)` (existants).
- Produces: aucune nouvelle API — changement de rendu uniquement. `playPauseIcon` (lignes 166-174) et l'accessibilityLabel de `playPauseButton` restent BYTE-FOR-BYTE identiques (§ C, non-régression explicite).

Comme la Tâche 5, aucun nouveau test unitaire : changement de styling pur, vérifié par build + vérification visuelle (Tâche 7).

- [ ] **Step 1: Remplacer le bloc centre**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift`, remplacer les lignes 113-164 (commentaire `// MARK: - Center Controls` + `centerControls` + `skipButton` + `playPauseButton`, JUSQU'À la ligne juste avant `playPauseIcon`) par :

```swift
    // MARK: - Center Controls (skip + play/pause)
    //
    // Hiérarchie visuelle : skip 36 ←→ play 54 (ratio 0.67) — le play domine
    // clairement, tailles INCHANGÉES (l'inline reste plus compact que le
    // plein écran 52/64pt, `VideoTransportControls.swift:87/105`). Lifting
    // Liquid Glass 2026-08-11 (§ C) : migré vers
    // `.adaptiveGlass`/`.adaptiveGlassProminent` sous `AdaptiveGlassContainer`
    // — le double-fill `ultraThinMaterial` + `accent.opacity` + le stroke
    // manuel disparaissent au profit des deux primitives partagées, comme
    // `VideoTransportControls.centerControls`.

    private var centerControls: some View {
        AdaptiveGlassContainer(spacing: 24) {
            HStack(spacing: 24) {
                skipButton(systemName: "gobackward.10", seconds: -10)
                playPauseButton
                skipButton(systemName: "goforward.10", seconds: 10)
            }
        }
    }

    private func skipButton(systemName: String, seconds: Double) -> some View {
        Button {
            manager.skip(seconds: seconds)
            HapticFeedback.light()
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .adaptiveGlass(in: Circle(), interactive: true)
        }
    }

    private var playPauseButton: some View {
        Button {
            manager.togglePlayPause()
            HapticFeedback.light()
        } label: {
            playPauseIcon
                .frame(width: 54, height: 54)
                .adaptiveGlassProminent(in: Circle(), tint: accent.opacity(0.85))
        }
        .accessibilityLabel(manager.isPlaying
            ? String(localized: "media.video.pause", defaultValue: "Pause", bundle: .module)
            : String(localized: "media.video.play", defaultValue: "Lire la vidéo", bundle: .module))
    }

```

`playPauseIcon` (juste après, actuellement lignes 166-174) reste INCHANGÉ :

```swift
    /// Cross-fade entre `play.fill` et `pause.fill`. Gestion versionnée
    /// déléguée à `adaptiveSymbolReplace` (cf. `Compatibility/AdaptiveSymbolEffects`).
    private var playPauseIcon: some View {
        Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
            .font(.system(size: 22, weight: .bold))
            .foregroundColor(.white)
            .offset(x: manager.isPlaying ? 0 : 2)
            .adaptiveSymbolReplace(id: manager.isPlaying)
    }
```

Notes de fidélité à la spec :
- Skip : `.adaptiveGlass(in: Circle(), interactive: true)` — `interactive: true` pour rester homogène avec `VideoTransportControls.skipButton` et avec les boutons de la top bar (§ C point 1).
- Play/pause : `.adaptiveGlassProminent(in: Circle(), tint: accent.opacity(0.85))` — opacité `0.85` reprise de `VideoTransportControls.swift:106`, PAS `accent` nu (§ C point 2). Le `.shadow` manuel disparaît : `adaptiveGlassProminentFallback` porte déjà `shadow(radius: 8, y: 4)` (`AdaptiveGlass.swift:98`).
- Tailles 36/54 INCHANGÉES (§ C, en-tête).

- [ ] **Step 2: Build pour vérifier la compilation**

```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -quiet
```
Attendu : build vert.

- [ ] **Step 3: Relancer la suite Media complète pour non-régression**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerInlinePipButtonTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerSurfaceEnablesPipTests \
  -only-testing:MeeshyUITests/MeeshyVideoSurfaceConfigurePipSourceGuardTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerAutoplayDecisionTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerAttachmentIdWiringTests \
  -only-testing:MeeshyUITests/TransportLayoutTests -quiet
```
Attendu : tous verts — c'est la passe de régression complète sur tout ce que ce chantier touche ou frôle.

- [ ] **Step 4: Commit**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved 2>/dev/null || true

git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift
git commit -m "feat(sdk): migrer les contrôles centraux inline vers adaptiveGlass"
```

---

## Task 7: Vérification visuelle simulateur — iPhone 16 Pro ET iPhone SE (§ Tests item 4)

Aucun code ne change dans cette tâche : c'est une vérification manuelle documentée, requise avant le gate final. **Rappel : le bouton PiP n'apparaîtra jamais en simulateur** (`AVPictureInPictureController.isPictureInPictureSupported()` y est toujours `false`) — 3 boutons visibles (plein écran, AirPlay, vitesse) est le résultat CORRECT sur les deux appareils, pas un échec.

- [ ] **Step 1: Localiser le simulateur iPhone SE**

```bash
xcrun simctl list devices available | grep -i "iPhone SE"
```
Relever l'UDID retourné (nom attendu : « iPhone SE (3rd generation) » ou équivalent selon les runtimes installés).

- [ ] **Step 2: Vérification sur iPhone 16 Pro (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`)**

```bash
xcrun simctl shutdown all 2>/dev/null || true
xcrun simctl boot 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5
open -a Simulator
./apps/ios/meeshy.sh build
./apps/ios/meeshy.sh run
```
Dans l'app : ouvrir une conversation (ou le feed) contenant une bulle vidéo, taper pour lancer la lecture, laisser les contrôles visibles (dans les 3s après lancement).

```bash
xcrun simctl io 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 screenshot /tmp/inline-video-16pro.png
```
Vérifier sur la capture : top bar avec 3 boutons circulaires 28×28 (plein écran, AirPlay, capsule vitesse) sans troncature ni chevauchement ; centre skip/play/skip avec effet verre visible (fond `.ultraThinMaterial` translucide sur iOS < 26, ou `glassEffect` réel sur iOS 26+) ; pas de bouton PiP.

- [ ] **Step 3: Vérification sur iPhone SE**

```bash
./apps/ios/meeshy.sh stop
xcrun simctl shutdown 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5
xcrun simctl boot <SE_UDID_relevé_Step_1>
open -a Simulator
./apps/ios/meeshy.sh run
```
Même navigation que Step 2.

```bash
xcrun simctl io <SE_UDID> screenshot /tmp/inline-video-se.png
```
Vérifier sur la capture (375pt de large — le plus étroit du parc) : les 4 boutons potentiels (budget calculé 142pt, § B) tiennent toujours sans troncature sur la largeur de la bulle vidéo, même avec seulement 3 visibles ici. Si un écart apparaît, la piste de correction par défaut documentée dans la spec (§ Non-régression) est de RÉDUIRE l'espacement entre boutons (actuellement 10) — jamais de retirer un item sans le rendre accessible ailleurs.

- [ ] **Step 4: Arrêter les simulateurs**

```bash
./apps/ios/meeshy.sh stop
```

Aucun commit pour cette tâche (aucun fichier modifié).

---

## Task 8: Gate final — build complet + suite SDK complète (§ Tests items 5-6)

**Files:** aucun (vérification uniquement).

- [ ] **Step 1: Vérifier l'absence de churn projet avant le gate**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
```
Si du churn apparaît (résidu d'un `xcodebuild`/`meeshy.sh` local), l'annuler :
```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
```

- [ ] **Step 2: Build complet**

```bash
./apps/ios/meeshy.sh build
```
Attendu : succès. Ceci compile le SDK ET l'app avec la `ControlSet` étendue — confirme qu'aucun des 6 call sites `.inlineDefault` app-side ne casse (§ Tests item 5).

- [ ] **Step 3: Suite de tests complète**

```bash
./apps/ios/meeshy.sh test
```
Attendu : phase 0 (SDK, scheme `MeeshySDK-Package`, inclut `MeeshyVideoPlayerControlSetTests`, `MeeshyVideoPlayerInlinePipButtonTests`, `MeeshyVideoPlayerSurfaceEnablesPipTests`, `MeeshyVideoSurfaceConfigurePipSourceGuardTests`, et le reste de `MeeshyUITests`/`MeeshySDKTests`) verte, ainsi que les phases 1-3 côté app (aucune régression attendue — aucun fichier app-side modifié par ce chantier). La phase 0 fait partie du verdict du gate depuis 2026-07-30 (ne pas la sauter, cf. Global Constraints du projet).

- [ ] **Step 4: Nettoyer le churn projet post-build/test**

```bash
git status --porcelain apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved 2>/dev/null || true
git status
```
Attendu : seuls les fichiers listés dans « File Structure » apparaissent dans l'historique des commits de ce chantier ; aucun churn `project.pbxproj`/`Meeshy.xcscheme`/`Package.resolved` résiduel.

- [ ] **Step 5: Documenter le point non-automatisable restant (§ Tests item 7)**

Aucune action de code. Noter pour le suivi produit (hors scope de ce plan, vérification DEVICE requise, non bloquante pour ce chantier) : sur un iPhone physique compatible PiP, confirmer que le bouton PiP de la top bar inline ouvre bien une fenêtre système, et que la refermer arrête la lecture (`SharedAVPlayerManager.shouldHaltPlaybackOnPipStop`, `SharedAVPlayerManager.swift:317-320`, déjà testé par ailleurs — seul le nouveau CHEMIN D'ENTRÉE inline n'est pas vérifiable hors device).

Aucun commit pour cette tâche (vérification uniquement — si Step 2 ou Step 3 échoue, revenir à la tâche fautive, corriger, et refaire le gate avant de considérer le chantier terminé).

---

## Non-régression — rappel (ne PAS toucher pendant l'exécution)

- `scrimGradients`, `bottomBar` (seek + time), `seekBar` + `@GestureState isSeeking` + `MediaScrubbingPreferenceKey` : hors périmètre de ce plan, ne rien y modifier. Ne PAS convertir `isSeeking` en `@State`.
- `_FullscreenOverlayControls`, `VideoTransportControls`, `ConversationMediaGalleryView` : non touchés (déjà liftés 2026-07-11).
- `BouncyControlButtonStyle` (appliqué au `ZStack` racine de `_InlineOverlayControls`) : reste — ne pas le retirer au profit du seul `interactive:` du verre.
- `manager.cycleSpeed()`, `manager.skip(seconds:)`, `manager.togglePlayPause()`, `manager.startPip()`/`stopPip()`, `configurePip` elle-même : signatures et logique internes inchangées.
- `ReelVideoSurface`/`ReelFeedVideoSurface` (`ReelsPlayerView.swift`) : non touchés — ce plan copie leur pattern `enablesPip`, ne les modifie pas.
- Aucun effet supprimé de l'écran : tous les boutons disponibles restent visibles simultanément dans la top bar (pas de repli dans un menu ⋯ comme au plein écran).

---

## Self-Review (auto-relecture — voir résumé de couverture ci-dessous)

Couverture spec → tâche :
- § A (ControlSet.inlineDefault) → Task 1.
- § B (top bar, 4 boutons, tailles 28×28, ordre, AirPlay sans glass, budget 142pt) → Task 5.
- § B.2 (câblage PiP, `enablesPip`, non-conflit réels, isPictureInPictureSupported faux en simu) → Task 3, Task 4, rappel Global Constraints + Task 7.
- § C (centre adaptiveGlass/adaptiveGlassProminent, tailles inchangées, playPauseIcon conservé) → Task 6.
- § D (fallback iOS < 26) → aucune action requise, déjà encapsulé par les primitives existantes ; mentionné explicitement dans Task 5/6.
- § Non-régression (6 puces) → section dédiée en fin de plan + notes de fidélité dans Task 4/5/6.
- § Tests item 1 (ControlSet RED) → Task 1.
- § Tests item 2 (showsPipButton) → Task 2.
- § Tests item 3 (surfaceEnablesPip + garde de source) → Task 3, Task 4.
- § Tests item 4 (vérification visuelle 16 Pro + SE) → Task 7.
- § Tests item 5 (build complet) → Task 8 Step 2.
- § Tests item 6 (suite SDK complète) → Task 8 Step 3.
- § Tests item 7 (vérification device PiP) → Task 8 Step 5 (documenté, explicitement non-automatisable, non bloquant).

Scan placeholders : aucun « TBD »/« TODO »/« gérer les cas limites » dans ce document ; chaque step de code contient le code Swift complet à écrire, chaque commande bash est exécutable telle quelle.

Cohérence des types/signatures à travers les tâches :
- `_InlineOverlayControls.showsPipButton(controls: MeeshyVideoPlayer.ControlSet, isPipSupported: Bool) -> Bool` : défini Task 2, appelé Task 5 avec les mêmes noms de paramètres.
- `_InlineRenderer.surfaceEnablesPip(controls: MeeshyVideoPlayer.ControlSet) -> Bool` : défini Task 3, appelé Task 4 Step 5 via `Self.surfaceEnablesPip(controls: player.controls)`.
- `MeeshyVideoSurface.enablesPip: Bool = false` : défini Task 4 Step 3, consommé Task 4 Step 5 au call site inline ; nom identique dans la garde de source Task 4 Step 1.
- `ControlSet.inlineDefault` contenant `.pip`/`.airplay` : défini Task 1, réutilisé comme fixture dans les tests des Tasks 2 et 3.

Aucun fichier app-side dans la liste des fichiers touchés ; confirmé deux fois (Global Constraints + grep initial) que les 6 call sites `.inlineDefault` n'ont besoin d'aucune modification.
