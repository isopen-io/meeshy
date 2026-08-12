# Lifting Liquid Glass du lecteur vidéo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Moderniser le lecteur vidéo plein écran (galerie conversation + player des bulles) en Liquid Glass, supprimer le double contrôleur play, et regrouper les contrôles secondaires dans une barre unique + menu ⋯.

**Architecture:** Le composant SDK partagé `VideoTransportControls` est restylé (centre glass + une seule barre bas avec menu ⋯) via un helper pur testable `TransportLayout` qui répartit le `ControlSet` entre barre et menu. Côté app, `GalleryVideoPage` corrige son gating (`!isPlayerAttached`) pour tuer le double contrôleur, et le chrome de la galerie (X, compteur, save) passe en `.adaptiveGlass`. L'API `ControlSet` ne change pas — aucun call site modifié.

**Tech Stack:** SwiftUI iOS 16+ (Liquid Glass réel sur iOS 26 via `.adaptiveGlass`/`AdaptiveGlassContainer`, fallback material en dessous), XCTest.

**Spec:** `docs/superpowers/specs/2026-07-11-video-player-liquid-glass-lifting-design.md`

## Global Constraints

- Swift 6 (tools 6.2), plancher iOS 16.0 — jamais d'API 26 sans passer par les wrappers `Compatibility/AdaptiveGlass.swift`.
- `.adaptiveGlass` s'applique APRÈS le sizing (`.frame`), jamais après un élargisseur de hit-area (bug header 2026-07-11).
- API publique `MeeshyVideoPlayer.ControlSet` inchangée (OptionSet, aucune nouvelle option, aucun call site touché).
- SDK purity : `TransportLayout` prend un `ControlSet` opaque, zéro singleton Meeshy.
- Tests : XCTest, nommage `test_{method}_{condition}_{expectedResult}` ; tests MeeshyUITests NON `@MainActor` ; tests app MeeshyTests `@MainActor` (pattern existant).
- Nouveaux fichiers de test app : enregistrer dans le pbxproj via `cd apps/ios && xcodegen generate` PUIS restaurer `CURRENT_PROJECT_VERSION` écrasé (sed → valeur d'avant régénération) et vérifier que le diff pbxproj ne contient QUE les nouvelles entrées.
- Commits : messages conventionnels, PAS de trailer Co-Authored-By, jamais `--amend`, `git add` par pathspec strict.
- Ne supprimer AUCUNE fonctionnalité : vitesse/boucle/PiP migrent dans le menu ⋯.

---

### Task 1: SDK — helper pur `TransportLayout` (TDD)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Media/TransportLayout.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Media/TransportLayoutTests.swift`

**Interfaces:**
- Consumes: `MeeshyVideoPlayer.ControlSet` (OptionSet existant, membres `nonisolated`).
- Produces: `TransportLayout.BarItem` (`.mute`, `.airplay`), `TransportLayout.MenuItem` (`.speed`, `.loop`, `.pip`), `TransportLayout.barItems(for:) -> [BarItem]`, `TransportLayout.menuItems(for:) -> [MenuItem]`, `TransportLayout.showsMenuButton(for:) -> Bool` — consommés par Task 2.

- [ ] **Step 1: Écrire les tests qui échouent**

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/Media/TransportLayoutTests.swift
import XCTest
@testable import MeeshyUI

/// Répartition barre/menu du lifting Liquid Glass (spec 2026-07-11) :
/// `.mute`/`.airplay` restent visibles dans la barre unique, `.speed`/
/// `.loop`/`.pip` migrent dans le menu ⋯ — le bouton ⋯ n'existe que si
/// au moins un item de menu est présent dans le ControlSet.
final class TransportLayoutTests: XCTestCase {

    func test_barItems_galleryControlSet_returnsMuteOnly() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .speed, .mute, .pip]
        XCTAssertEqual(TransportLayout.barItems(for: set), [.mute])
    }

    func test_menuItems_galleryControlSet_returnsSpeedAndPip() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .speed, .mute, .pip]
        XCTAssertEqual(TransportLayout.menuItems(for: set), [.speed, .pip])
    }

    func test_barItems_fullscreenDefault_returnsMuteAndAirplay() {
        XCTAssertEqual(
            TransportLayout.barItems(for: .fullscreenDefault),
            [.mute, .airplay]
        )
    }

    func test_menuItems_fullscreenDefault_returnsSpeedLoopPip() {
        XCTAssertEqual(
            TransportLayout.menuItems(for: .fullscreenDefault),
            [.speed, .loop, .pip]
        )
    }

    func test_showsMenuButton_withoutMenuControls_isFalse() {
        let set: MeeshyVideoPlayer.ControlSet = [.playPause, .scrubber, .duration, .mute]
        XCTAssertFalse(TransportLayout.showsMenuButton(for: set))
    }

    func test_showsMenuButton_withAnyMenuControl_isTrue() {
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.loop]))
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.speed]))
        XCTAssertTrue(TransportLayout.showsMenuButton(for: [.pip]))
    }

    func test_barAndMenuItems_emptySet_areEmpty() {
        XCTAssertTrue(TransportLayout.barItems(for: .none).isEmpty)
        XCTAssertTrue(TransportLayout.menuItems(for: .none).isEmpty)
        XCTAssertFalse(TransportLayout.showsMenuButton(for: .none))
    }
}
```

- [ ] **Step 2: Vérifier l'échec (symbole absent = échec de compile attendu)**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/TransportLayoutTests 2>&1 | tail -20
```
Expected: FAIL — `cannot find 'TransportLayout' in scope`.

- [ ] **Step 3: Implémentation minimale**

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Media/TransportLayout.swift
import Foundation

/// Répartition PURE des contrôles de transport entre la barre unique visible
/// et le menu ⋯ (lifting Liquid Glass 2026-07-11). L'API `ControlSet` reste
/// la seule entrée : les call sites existants n'ont pas changé, seul le rendu
/// des options `.speed`/`.loop`/`.pip` (menu) et `.mute`/`.airplay` (barre)
/// a été déplacé.
public nonisolated enum TransportLayout {
    public enum BarItem: Hashable, Sendable { case mute, airplay }
    public enum MenuItem: Hashable, Sendable { case speed, loop, pip }

    public static func barItems(for controls: MeeshyVideoPlayer.ControlSet) -> [BarItem] {
        var items: [BarItem] = []
        if controls.contains(.mute) { items.append(.mute) }
        if controls.contains(.airplay) { items.append(.airplay) }
        return items
    }

    public static func menuItems(for controls: MeeshyVideoPlayer.ControlSet) -> [MenuItem] {
        var items: [MenuItem] = []
        if controls.contains(.speed) { items.append(.speed) }
        if controls.contains(.loop) { items.append(.loop) }
        if controls.contains(.pip) { items.append(.pip) }
        return items
    }

    public static func showsMenuButton(for controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        !menuItems(for: controls).isEmpty
    }
}
```

- [ ] **Step 4: Vérifier le vert**

Run: même commande que Step 2.
Expected: PASS — 7 tests OK (vérifier le `.xcresult`, pas seulement l'exit code).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/TransportLayout.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/TransportLayoutTests.swift
git commit -m "feat(sdk/video): TransportLayout — répartition pure barre/menu du ControlSet (TDD)"
```

---

### Task 2: SDK — restyle `VideoTransportControls` (barre unique + menu ⋯, Liquid Glass)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift` (remplacement quasi complet du body — le fichier fait 269 lignes)

**Interfaces:**
- Consumes: `TransportLayout` (Task 1), `.adaptiveGlass`/`.adaptiveGlassProminent`/`AdaptiveGlassContainer` (`Compatibility/AdaptiveGlass.swift`), `SharedAVPlayerManager` (`isPlaying`, `currentTime`, `duration`, `playbackSpeed`, `isMuted`, `shouldLoop`, `isPipActive`, `togglePlayPause()`, `skip(seconds:)`, `seek(to:)`, `setSpeed(_:)`, `startPip()`, `stopPip()`), `PlaybackSpeed` (MediaTypes.swift), `AirPlayRoutePicker`, `formatMediaDuration`, `HapticFeedback`.
- Produces: même struct publique `VideoTransportControls(manager:accentColor:controls:)` — signature intacte, consommée telle quelle par `ConversationMediaGalleryView` et `_FullscreenOverlayControls`.

- [ ] **Step 1: Remplacer le contenu du fichier**

Garder l'en-tête de commentaire existant (lignes 1–18) en ajoutant une ligne sur le lifting, puis remplacer la struct par :

```swift
public struct VideoTransportControls: View {
    @ObservedObject private var manager: SharedAVPlayerManager
    private let accentColor: String
    private let controls: MeeshyVideoPlayer.ControlSet

    @State private var isSeeking = false
    @State private var seekValue: Double = 0

    private let speeds: [PlaybackSpeed] = [.x1_0, .x1_25, .x1_5, .x1_75, .x2_0]

    public init(
        manager: SharedAVPlayerManager,
        accentColor: String,
        controls: MeeshyVideoPlayer.ControlSet
    ) {
        self.manager = manager
        self.accentColor = accentColor
        self.controls = controls
    }

    private var accent: Color { Color(hex: accentColor) }

    private var progress: Double {
        guard manager.duration > 0 else { return 0 }
        return isSeeking ? seekValue : manager.currentTime / manager.duration
    }

    private var hasBottomBar: Bool {
        controls.contains(.scrubber) || controls.contains(.duration)
            || !TransportLayout.barItems(for: controls).isEmpty
            || TransportLayout.showsMenuButton(for: controls)
    }

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()
            centerControls
            Spacer()
            if hasBottomBar {
                bottomBar.padding(.horizontal, 16)
            }
        }
        .buttonStyle(BouncyTransportButtonStyle())
    }

    // MARK: - Centre (⏪10 · ▶︎/⏸ · ⏩10) — Liquid Glass

    private var centerControls: some View {
        AdaptiveGlassContainer(spacing: 32) {
            HStack(spacing: 32) {
                if controls.contains(.scrubber) { skipButton(systemName: "gobackward.10", seconds: -10) }
                if controls.contains(.playPause) { playPauseButton }
                if controls.contains(.scrubber) { skipButton(systemName: "goforward.10", seconds: 10) }
            }
        }
    }

    private func skipButton(systemName: String, seconds: Double) -> some View {
        Button {
            manager.skip(seconds: seconds)
            HapticFeedback.light()
        } label: {
            // Glyphe figé : contrôle circulaire de taille fixe (52pt).
            Image(systemName: systemName)
                .font(.system(size: 22, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 52, height: 52)
                .adaptiveGlass(in: Circle(), interactive: true)
        }
        .accessibilityLabel(seconds < 0 ? "Reculer de 10 secondes" : "Avancer de 10 secondes")
    }

    private var playPauseButton: some View {
        Button {
            manager.togglePlayPause()
            HapticFeedback.light()
        } label: {
            Image(systemName: manager.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.white)
                .offset(x: manager.isPlaying ? 0 : 2)
                .adaptiveSymbolReplace(id: manager.isPlaying)
                .frame(width: 64, height: 64)
                .adaptiveGlassProminent(in: Circle(), tint: accent.opacity(0.85))
        }
        .accessibilityLabel(manager.isPlaying ? "Pause" : "Play")
    }

    // MARK: - Barre unique bas : temps · scrubber · durée · mute · airplay · ⋯

    private var bottomBar: some View {
        HStack(spacing: 10) {
            if controls.contains(.duration) {
                timeLabel(isSeeking ? seekValue * manager.duration : manager.currentTime)
            }
            if controls.contains(.scrubber) { seekBar }
            if controls.contains(.duration) {
                timeLabel(manager.duration)
            }
            ForEach(TransportLayout.barItems(for: controls), id: \.self) { item in
                switch item {
                case .mute: muteButton
                case .airplay: airplayButton
                }
            }
            if TransportLayout.showsMenuButton(for: controls) { moreMenu }
        }
        .padding(.horizontal, 14)
        .frame(height: 48)
        .adaptiveGlass(in: Capsule())
    }

    private func timeLabel(_ seconds: Double) -> some View {
        Text(formatMediaDuration(seconds))
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .foregroundColor(.white.opacity(0.85))
            .lineLimit(1)
            .fixedSize()
    }

    private var muteButton: some View {
        Button {
            manager.isMuted.toggle()
            HapticFeedback.light()
        } label: {
            Image(systemName: manager.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(manager.isMuted ? accent : .white)
                .frame(width: 32, height: 32)
                .contentShape(Circle())
        }
        .accessibilityLabel(manager.isMuted ? "Réactiver le son" : "Couper le son")
    }

    private var airplayButton: some View {
        AirPlayRoutePicker(tintColor: .white)
            .frame(width: 32, height: 32)
            .accessibilityLabel("AirPlay")
    }

    private var moreMenu: some View {
        Menu {
            if TransportLayout.menuItems(for: controls).contains(.speed) {
                Picker("Vitesse", selection: Binding(
                    get: { manager.playbackSpeed },
                    set: { manager.setSpeed($0) }
                )) {
                    ForEach(speeds, id: \.rawValue) { speed in
                        Text(speed.label).tag(speed)
                    }
                }
            }
            if TransportLayout.menuItems(for: controls).contains(.loop) {
                Toggle(isOn: $manager.shouldLoop) {
                    Label("Boucle", systemImage: "repeat")
                }
            }
            if TransportLayout.menuItems(for: controls).contains(.pip) {
                Button {
                    if manager.isPipActive { manager.stopPip() } else { manager.startPip() }
                } label: {
                    Label(
                        manager.isPipActive ? "Quitter le Picture in Picture" : "Picture in Picture",
                        systemImage: manager.isPipActive ? "pip.exit" : "pip.enter"
                    )
                }
                .disabled(!AVPictureInPictureController.isPictureInPictureSupported())
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .contentShape(Circle())
        }
        .accessibilityLabel("Plus d'options")
    }

    // MARK: - Seek bar (highPriorityGesture conservé — fix pager historique)

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 4
            let thumbSize: CGFloat = 14
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.3)).frame(height: trackHeight)
                Capsule().fill(accent).frame(width: max(0, filledWidth), height: trackHeight)
                Circle().fill(Color.white).frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            // Cible pleine hauteur + highPriorityGesture : le scrub gagne sur
            // le pan du pager de la galerie (bug user historique).
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .highPriorityGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isSeeking = true
                        seekValue = max(0, min(1, value.location.x / geo.size.width))
                    }
                    .onEnded { value in
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        manager.seek(to: fraction * manager.duration)
                        isSeeking = false
                        seekValue = 0
                    }
            )
        }
        .frame(height: 32)
        .frame(maxWidth: .infinity)
    }
}
```

`BouncyTransportButtonStyle` (fin de fichier) reste inchangé. Les sous-vues supprimées : `bottomStack`, `miniToolbar`, `loopButton`, `pipButton`, `speedRow`, `speedChip`, `toolbarIcon` (leurs fonctions vivent désormais dans `moreMenu`/`muteButton`).

Imports : le fichier importe déjà `SwiftUI` et `AVKit` (nécessaire pour `AVPictureInPictureController`).

- [ ] **Step 2: Compiler le SDK + relancer les tests UI média**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/TransportLayoutTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests 2>&1 | tail -15
```
Expected: PASS (12 tests) — l'API ControlSet n'a pas bougé.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift
git commit -m "feat(sdk/video): VideoTransportControls en Liquid Glass — centre glass + barre unique (temps·scrubber·durée·mute·airplay·menu ⋯ vitesse/boucle/PiP)"
```

---

### Task 3: App — fix du double contrôleur + poster Liquid Glass (TDD source-guard)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift` (struct `GalleryVideoPage`, ~lignes 542–675)
- Test: Create `apps/ios/MeeshyTests/Unit/Views/ConversationMediaGalleryVideoControlsTests.swift`

**Interfaces:**
- Consumes: `isPlayerAttached` (computed existant de `GalleryVideoPage`), `.adaptiveGlassProminent` (SDK).
- Produces: rien de nouveau — changement de gating interne.

- [ ] **Step 1: Écrire le test source-guard qui échoue**

```swift
// apps/ios/MeeshyTests/Unit/Views/ConversationMediaGalleryVideoControlsTests.swift
import XCTest
@testable import Meeshy

/// Source-guards du lifting Liquid Glass de la galerie média (spec
/// 2026-07-11) : un seul contrôleur play (fini le bouton poster empilé sur
/// le play/pause du transport quand la vidéo est en pause), chrome glass.
@MainActor
final class ConversationMediaGalleryVideoControlsTests: XCTestCase {

    private func gallerySource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_galleryVideoPage_postersButton_gatedOnPlayerAttached_notPlaying() throws {
        // Double contrôleur (bug) : gaté sur `!isPlayerActive`, le bouton
        // poster 64pt réapparaissait PENDANT LA PAUSE, empilé sur le
        // play/pause du transport partagé. Le poster ne doit exister que
        // tant que le player n'est pas attaché à cette URL.
        let source = try gallerySource()
        guard let range = source.range(of: "if !isPlayerAttached {\n                playOrDownloadButton") else {
            XCTFail(
                "GalleryVideoPage must gate playOrDownloadButton on !isPlayerAttached " +
                "(not !isPlayerActive) so the paused state shows ONLY the shared transport controls."
            )
            return
        }
        _ = range
    }

    func test_galleryVideoPage_posterButton_usesAdaptiveGlass() throws {
        let source = try gallerySource()
        guard let start = source.range(of: "private var playOrDownloadButton") else {
            XCTFail("playOrDownloadButton not found"); return
        }
        let end = source.index(start.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[start.lowerBound..<end])
        XCTAssertTrue(
            body.contains(".adaptiveGlassProminent(in: Circle()"),
            "Le bouton poster doit être en Liquid Glass prominent teinté accent " +
            "(remplace le duo ultraThinMaterial + fill accent)."
        )
    }
}
```

- [ ] **Step 2: Enregistrer le fichier de test puis vérifier l'échec**

```bash
grep -o 'CURRENT_PROJECT_VERSION = [0-9]*' apps/ios/Meeshy.xcodeproj/project.pbxproj | head -1  # noter N
cd apps/ios && xcodegen generate && cd -
sed -i '' "s/CURRENT_PROJECT_VERSION = 1;/CURRENT_PROJECT_VERSION = N;/" apps/ios/Meeshy.xcodeproj/project.pbxproj
git diff --stat apps/ios/Meeshy.xcodeproj/project.pbxproj   # QUE les entrées du nouveau test (+ Package.resolved/xcscheme à checkout si churn)
./apps/ios/meeshy.sh build 2>&1 | tail -5                    # compile app+tests
```
Puis lancer la suite :
```bash
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/ConversationMediaGalleryVideoControlsTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -10
```
Expected: FAIL — les 2 tests rouges (gating encore sur `!isPlayerActive`, pas d'adaptiveGlass).

- [ ] **Step 3: Implémentation minimale dans `GalleryVideoPage`**

Dans `var body` (~ligne 555), remplacer :
```swift
            if !isPlayerActive {
                playOrDownloadButton
            }
```
par :
```swift
            // Un seul contrôleur : une fois le player attaché à cette URL
            // (lecture OU pause), play/pause appartient au transport partagé
            // (`VideoTransportControls`). Gater sur `!isPlayerActive` faisait
            // réapparaître ce poster 64pt PENDANT la pause, empilé sur le
            // play/pause 64pt du transport (double contrôleur, bug user).
            if !isPlayerAttached {
                playOrDownloadButton
            }
```

Dans `playOrDownloadButton` (~ligne 592), remplacer le label :
```swift
        } label: {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 64, height: 64)
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.85))
                    .frame(width: 56, height: 56)
                buttonContent
            }
            .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
        }
```
par :
```swift
        } label: {
            buttonContent
                .frame(width: 64, height: 64)
                .adaptiveGlassProminent(in: Circle(), tint: Color(hex: accentColor).opacity(0.85))
        }
```

- [ ] **Step 4: Vérifier le vert**

Run : `./apps/ios/meeshy.sh build 2>&1 | tail -5` puis la même commande `xcodebuild test-without-building` que Step 2.
Expected: PASS — 2 tests verts.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationMediaGalleryVideoControlsTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "fix(ios/gallery): un seul contrôleur vidéo — poster gaté sur !isPlayerAttached + Liquid Glass (double play empilé en pause)"
```

---

### Task 4: App — chrome galerie en Liquid Glass (X, compteur, save)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift` (`controlsOverlay`, ~lignes 274–348)
- Test: Modify `apps/ios/MeeshyTests/Unit/Views/ConversationMediaGalleryVideoControlsTests.swift` (ajout d'un test)

**Interfaces:**
- Consumes: `.adaptiveGlass` (SDK).
- Produces: rien — restyle visuel pur.

- [ ] **Step 1: Ajouter le test source-guard qui échoue**

Ajouter à `ConversationMediaGalleryVideoControlsTests` :
```swift
    func test_controlsOverlay_chrome_usesAdaptiveGlass() throws {
        let source = try gallerySource()
        guard let start = source.range(of: "private var controlsOverlay") else {
            XCTFail("controlsOverlay not found"); return
        }
        let end = source.index(start.lowerBound, offsetBy: 2600, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[start.lowerBound..<end])
        XCTAssertFalse(
            body.contains("xmark.circle.fill"),
            "Le X doit être un glyphe xmark dans un cercle .adaptiveGlass, pas le xmark.circle.fill plein."
        )
        XCTAssertGreaterThanOrEqual(
            body.components(separatedBy: ".adaptiveGlass(").count - 1, 3,
            "X, compteur et save doivent porter chacun leur surface .adaptiveGlass."
        )
        XCTAssertFalse(
            body.contains("Circle().fill(Color.white.opacity(0.2))"),
            "Plus de cercle blanc opaque 0.2 : chrome Liquid Glass uniquement."
        )
    }
```

- [ ] **Step 2: Vérifier l'échec**

Run : même commande `xcodebuild test-without-building` que Task 3 (précédée de `./apps/ios/meeshy.sh build`).
Expected: FAIL — le nouveau test rouge.

- [ ] **Step 3: Restyler `controlsOverlay`**

Bouton X (~ligne 277) — remplacer le label :
```swift
                } label: {
                    // Chrome : glyphe `xmark` figé (cadre tap = icône + padding
                    // par défaut ≈ 60pt, doctrine 82i) — ne pas scaler.
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.8))
                        .padding()
                }
```
par :
```swift
                } label: {
                    // Chrome : glyphe `xmark` figé dans un cercle glass 40pt
                    // (doctrine 82i) — ne pas scaler. Glass APRÈS le sizing.
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
                        .padding()
                }
```

Compteur (~ligne 293) — remplacer :
```swift
                        .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
```
par :
```swift
                        .adaptiveGlass(in: Capsule())
```

Bouton save (~lignes 307–321) — remplacer :
```swift
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                        .padding(.trailing, 12)
                        .padding(.top, 8)
```
par :
```swift
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .adaptiveGlass(in: Circle(), interactive: true)
                        .padding(.trailing, 12)
                        .padding(.top, 8)
```

- [ ] **Step 4: Vérifier le vert**

Run : `./apps/ios/meeshy.sh build 2>&1 | tail -5` puis la suite complète `ConversationMediaGalleryVideoControlsTests`.
Expected: PASS — 3 tests verts.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift \
        apps/ios/MeeshyTests/Unit/Views/ConversationMediaGalleryVideoControlsTests.swift
git commit -m "feat(ios/gallery): chrome galerie média en Liquid Glass (X, compteur, save)"
```

---

### Task 5: SDK — top bar du plein écran bulle en Liquid Glass

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift` (`_FullscreenOverlayControls.topBar`, ~lignes 278–332)

**Interfaces:**
- Consumes: `.adaptiveGlass` (SDK, même module).
- Produces: rien — restyle visuel pur du chrome fichier (close/share/save).

- [ ] **Step 1: Remplacer les trois fonds `Color.white.opacity(0.2)`**

Dans `topBar`, pour les boutons close, share et save, remplacer chaque occurrence de :
```swift
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(Color.white.opacity(0.2)))
```
par :
```swift
                        .frame(width: 36, height: 36)
                        .adaptiveGlass(in: Circle(), interactive: true)
```
(3 occurrences : close ~ligne 289, share ~ligne 309, save ~ligne 327.)

- [ ] **Step 2: Compiler le SDK**

Run:
```bash
xcodebuild build -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' 2>&1 | tail -3
```
Expected: `BUILD SUCCEEDED`.

- [ ] **Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift
git commit -m "feat(sdk/video): top bar du player plein écran en Liquid Glass (close/share/save)"
```

---

### Task 6: Vérification bout-en-bout + push

**Files:**
- Aucun nouveau — build, tests, vérification visuelle simulateur, push.

- [ ] **Step 1: Build app complet**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
grep -c "FAILED" apps/ios/logs/build*.log 2>/dev/null || true   # exit 0 peut mentir — grep le log
```
Expected: build OK, zéro `FAILED`.

- [ ] **Step 2: Suites ciblées (app + SDK)**

```bash
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyTests/ConversationMediaGalleryVideoControlsTests \
  -only-testing:MeeshyTests/HeaderCallButtonsViewTests \
  -derivedDataPath apps/ios/Build 2>&1 | tail -8
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' \
  -only-testing:MeeshyUITests/TransportLayoutTests \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests 2>&1 | tail -8
```
Expected: tout vert.

- [ ] **Step 3: Vérification visuelle simulateur**

```bash
./apps/ios/meeshy.sh run   # BLOQUANT — lancer en arrière-plan
# Naviguer : conversation avec vidéo → tap vidéo (galerie) → vérifier :
#   1. Poster glass teinté accent (pas de double bouton).
#   2. Lecture → tap → contrôles : centre ⏪ ▶ ⏩ glass, UNE barre bas.
#   3. Pause → PAS de second play empilé.
#   4. Menu ⋯ → vitesse/PiP fonctionnels.
xcrun simctl io 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5 screenshot /tmp/gallery_lifting_after.png
```
Vérifier le mtime du PNG avant analyse (leçon snapshot silencieux).

- [ ] **Step 4: Intégrer l'auto-bump de version éventuel puis push**

```bash
git status --porcelain    # si meeshy.sh a bumpé Info.plist/pbxproj, les committer
git add -A apps/ios/Meeshy/Info.plist apps/ios/Meeshy.xcodeproj/project.pbxproj 2>/dev/null || true
git commit -m "chore(ios): bump build (auto-bump meeshy.sh)" || true
git push origin main
```
Expected: push OK, CI verte ensuite.
