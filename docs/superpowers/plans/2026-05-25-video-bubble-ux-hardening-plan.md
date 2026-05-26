# Video bubble UX hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 4 régressions UX sur les vidéos en attachement de bulle de conversation iOS — bandes noires sur vidéos verticales, retour au thumbnail après scroll, bouton vitesse en inline, contrôles fullscreen complets (mute/loop/PIP/AirPlay).

**Architecture:** Tout sous `packages/MeeshySDK/Sources/MeeshyUI/Media/`. Pas de touche backend, pas de touche pbxproj (SPM gère). Branche cible : `feat/ios-video-bubble-ux-hardening` (créer via `superpowers:using-git-worktrees` au début de l'exécution).

**Tech Stack:** Swift 6 / SwiftUI / AVFoundation / AVKit / Combine. Tests : XCTest pour le code @MainActor (interagissant avec `SharedAVPlayerManager`), Swift Testing (`@Test`/`#expect`) pour les types purs sous `MeeshyUI` (qui requièrent `nonisolated` car defaultIsolation MainActor — voir memory `feedback_meeshyui_default_isolation`). Tests SDK lancés via `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath apps/ios/Build`.

**Spec source:** `docs/superpowers/specs/2026-05-25-video-bubble-ux-hardening-design.md`

---

## File Structure

### Nouveaux fichiers
- `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDisplayAspectCache.swift` — actor cache `[String: CGFloat]` URL → display aspect ratio
- `packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift` — UIViewRepresentable autour de `AVRoutePickerView`
- `packages/MeeshySDK/Tests/MeeshyUITests/Media/VideoDisplayAspectCacheTests.swift`
- `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerReleaseTests.swift`
- `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerLoopMuteTests.swift`
- `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift`
- `docs/qa/2026-05-25-video-bubble-ux-smoke.md`

### Fichiers modifiés
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift` — ajouts `ControlSet.airplay/pip/loop`, mise à jour `inlineDefault`/`fullscreenDefault`
- `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift` — propriétés `isMuted`/`shouldLoop`, méthode `release(urlString:)`, mise à jour notif handler
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift` — `_InlineRenderer` aspect cache + teardown release, `_FullscreenRenderer` overlay toujours rendu + reset loop sur close
- `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift` — `_FullscreenOverlayControls` mini-toolbar (mute/loop/pip/airplay)

---

## Task 0 : Setup worktree + branche

- [ ] **Step 1 :** Créer un worktree isolé (skill `superpowers:using-git-worktrees`).

```bash
git worktree add -b feat/ios-video-bubble-ux-hardening \
  ../v2_meeshy-feat-ios-video-bubble-ux-hardening main
cd ../v2_meeshy-feat-ios-video-bubble-ux-hardening
```

- [ ] **Step 2 :** Vérifier qu'on part bien d'un état propre.

```bash
git status
```
Expected : `nothing to commit, working tree clean`

- [ ] **Step 3 :** Baseline build avant toute modification.

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`. Si fail, arrêter et investiguer avant de continuer.

---

## Task 1 : VideoDisplayAspectCache (actor)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDisplayAspectCache.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/VideoDisplayAspectCacheTests.swift`

- [ ] **Step 1 : Écrire le test failing.**

Crée `packages/MeeshySDK/Tests/MeeshyUITests/Media/VideoDisplayAspectCacheTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

// Pas @MainActor : actor's own isolation. Voir feedback_meeshyui_default_isolation.
final class VideoDisplayAspectCacheTests: XCTestCase {

    func test_ratio_missingKey_returnsNil() async {
        let cache = VideoDisplayAspectCache()
        let result = await cache.ratio(for: "https://example.com/video.mp4")
        XCTAssertNil(result)
    }

    func test_store_thenRatio_returnsValue() async {
        let cache = VideoDisplayAspectCache()
        await cache.store(0.5625, for: "https://example.com/video.mp4")
        let result = await cache.ratio(for: "https://example.com/video.mp4")
        XCTAssertEqual(result, 0.5625)
    }

    func test_store_overwritesPreviousValue() async {
        let cache = VideoDisplayAspectCache()
        await cache.store(1.78, for: "url")
        await cache.store(0.56, for: "url")
        let result = await cache.ratio(for: "url")
        XCTAssertEqual(result, 0.56)
    }

    func test_shared_returnsSameInstance() async {
        let a = VideoDisplayAspectCache.shared
        let b = VideoDisplayAspectCache.shared
        XCTAssertTrue(a === b)
    }
}
```

- [ ] **Step 2 : Run test pour confirmer fail (no such type).**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/VideoDisplayAspectCacheTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `Cannot find 'VideoDisplayAspectCache' in scope` ou similar.

- [ ] **Step 3 : Implémenter l'actor.**

Crée `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDisplayAspectCache.swift` :

```swift
import Foundation

/// In-memory cache des aspect ratios d'affichage (post-rotation `preferredTransform`)
/// par URL d'attachment vidéo. Évite de re-résoudre l'`AVAsset` à chaque apparition
/// de bulle.
///
/// Vie : session (vidé au cold start). Empreinte : ~24 bytes/entrée, négligeable
/// même pour 10k vidéos vues. Pas de borne — si on observe une fuite mémoire on
/// ajoutera LRU.
///
/// Utilisé par `_InlineRenderer.bubbleAspectRatio` pour servir une valeur juste
/// dès la 2e apparition d'une vidéo donnée dans la session.
public actor VideoDisplayAspectCache {
    public static let shared = VideoDisplayAspectCache()

    private var cache: [String: CGFloat] = [:]

    public init() {}

    public func ratio(for url: String) -> CGFloat? {
        cache[url]
    }

    public func store(_ ratio: CGFloat, for url: String) {
        cache[url] = ratio
    }
}
```

- [ ] **Step 4 : Run tests pour confirmer pass.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/VideoDisplayAspectCacheTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : 4 tests pass.

- [ ] **Step 5 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/VideoDisplayAspectCache.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/VideoDisplayAspectCacheTests.swift
git commit -m "feat(sdk/media): VideoDisplayAspectCache actor session-scoped"
```

---

## Task 2 : `_InlineRenderer` — cache + thumbnail aspect hint

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift:77-194`

- [ ] **Step 1 : Lire le contexte actuel (lignes 77–194) pour bien comprendre l'ordre des fallbacks.**

- [ ] **Step 2 : Modifier `_InlineRenderer` — ajouter le state thumbnail et la priority order.**

Dans `_InlineRenderer` (vers ligne 77), remplace les déclarations actuelles `displayAspectRatio` + `bubbleAspectRatio` par :

```swift
    /// Aspect ratio DISPLAY (post-rotation) résolu async depuis le
    /// `preferredTransform` de l'AVAsset (priorité 1 une fois en cache).
    @State private var displayAspectRatio: CGFloat?

    /// Aspect ratio extrait du thumbnail PNG cached (priorité 2). Synchrone à
    /// la résolution UIImage cache. Le thumbnail est pré-tourné backend → son
    /// ratio reflète l'orientation d'affichage attendue.
    @State private var thumbnailAspectRatio: CGFloat?

    private var isThisActive: Bool {
        manager.activeURL == player.attachment.fileUrl && manager.player != nil
    }

    /// Ratio source-de-vérité unique pour cette bulle. Ordre de priorité :
    /// 1. `displayAspectRatio` — résolu via `AVAsset.preferredTransform` ou
    ///    `VideoDisplayAspectCache` (instantané pour les vidéos déjà vues).
    /// 2. `thumbnailAspectRatio` — natural size du PNG thumbnail (synchrone
    ///    quand l'image est dans le cache mémoire/disque).
    /// 3. `attachment.videoAspectRatio` — metadata storage (peut être en
    ///    paysage rotation 90° pour les vidéos portrait shootées iPhone).
    /// 4. Fallback final : 16:9.
    private var bubbleAspectRatio: CGFloat {
        displayAspectRatio
            ?? thumbnailAspectRatio
            ?? player.attachment.videoAspectRatio
            ?? (16.0 / 9.0)
    }
```

- [ ] **Step 3 : Modifier `resolveDisplayAspectRatio` pour consulter et écrire le cache.**

Remplace la méthode `resolveDisplayAspectRatio` actuelle (vers ligne 178) par :

```swift
    /// Charge l'AVAsset et applique son `preferredTransform` à la `naturalSize`
    /// pour obtenir l'orientation d'affichage réelle. Couvre le cas iPhone
    /// portrait stocké en paysage + rotation 90°. Consulte d'abord le cache
    /// session-scope avant de toucher au disque.
    @MainActor
    private func resolveDisplayAspectRatio() async {
        guard displayAspectRatio == nil else { return }
        let urlKey = player.attachment.fileUrl
        if let cached = await VideoDisplayAspectCache.shared.ratio(for: urlKey) {
            displayAspectRatio = cached
            return
        }
        guard let url = MeeshyConfig.resolveMediaURL(urlKey) else { return }
        let asset = AVURLAsset(url: url)
        do {
            let tracks = try await asset.loadTracks(withMediaType: .video)
            guard let track = tracks.first else { return }
            let naturalSize = try await track.load(.naturalSize)
            let transform = try await track.load(.preferredTransform)
            let display = naturalSize.applying(transform)
            let w = abs(display.width)
            let h = abs(display.height)
            guard w > 0, h > 0 else { return }
            let ratio = w / h
            displayAspectRatio = ratio
            await VideoDisplayAspectCache.shared.store(ratio, for: urlKey)
        } catch {
            // Le fallback `thumbnailAspectRatio → attachment.videoAspectRatio
            // → 16/9` reste actif.
        }
    }
```

- [ ] **Step 4 : Ajouter une task pour résoudre le thumbnail aspect ratio depuis le cache image.**

Toujours dans `_InlineRenderer`, ajoute cette méthode après `resolveDisplayAspectRatio` :

```swift
    /// Récupère le thumbnail PNG depuis `CacheCoordinator.images` (mémoire
    /// puis disque) et extrait son natural size comme hint synchrone pour
    /// `bubbleAspectRatio`. Si le thumbnail n'est pas encore en cache, no-op
    /// (ProgressiveCachedImage le téléchargera en parallèle et l'app verra
    /// le ratio se mettre à jour quand le thumbnail finit de loader plus
    /// tard via la résolution AVAsset).
    @MainActor
    private func resolveThumbnailAspectRatio() async {
        guard thumbnailAspectRatio == nil else { return }
        guard let thumbUrl = player.attachment.thumbnailUrl, !thumbUrl.isEmpty else { return }
        let image = await CacheCoordinator.shared.images.image(for: thumbUrl)
        guard let size = image?.size, size.width > 0, size.height > 0 else { return }
        thumbnailAspectRatio = size.width / size.height
    }
```

- [ ] **Step 5 : Brancher la nouvelle task dans le body.**

Trouve la ligne `.task(id: player.attachment.fileUrl) { await resolveDisplayAspectRatio() }` (vers 139–141) et remplace par :

```swift
        .task(id: player.attachment.fileUrl) {
            // Lance les deux résolutions en parallèle. La plus rapide (le
            // thumbnail cache hit) sert de fallback temporaire pendant que
            // l'AVAsset résout son `preferredTransform`.
            async let thumb: Void = resolveThumbnailAspectRatio()
            async let display: Void = resolveDisplayAspectRatio()
            _ = await (thumb, display)
        }
```

- [ ] **Step 6 : Build pour vérifier compilation.**

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`.

- [ ] **Step 7 : Vérifier que `CacheCoordinator.shared.images.image(for:)` existe avec cette signature.**

```bash
grep -n "func image(for" packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift
```
Si la signature diffère (ex: `image(for url: URL)` au lieu de `String`), adapte `resolveThumbnailAspectRatio` au type réel. Cette vérif fait partie du Step 6 — un fail de compile sur ce point indique simplement qu'il faut wrapper en `URL(string:)`.

- [ ] **Step 8 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift
git commit -m "feat(sdk/media): _InlineRenderer thumbnail aspect hint + display aspect cache"
```

---

## Task 3 : `SharedAVPlayerManager.release(urlString:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift:117-122`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerReleaseTests.swift`

- [ ] **Step 1 : Écrire le test failing.**

Crée `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerReleaseTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

final class SharedAVPlayerManagerReleaseTests: XCTestCase {

    // NOT @MainActor at class level. Each test hops via MainActor.run for the
    // singleton access. Voir feedback_meeshyui_default_isolation.

    func test_release_noOps_whenActiveUrlEmpty() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop() // clean baseline
            XCTAssertEqual(m.activeURL, "")

            m.release(urlString: "https://example.com/video.mp4")

            XCTAssertEqual(m.activeURL, "")
            XCTAssertNil(m.player)
        }
    }

    func test_release_noOps_whenDifferentUrl() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            // Simulate a different URL being active.
            m.activeURL = "https://example.com/other.mp4"

            m.release(urlString: "https://example.com/video.mp4")

            // Active URL préservée (autre vidéo en cours).
            XCTAssertEqual(m.activeURL, "https://example.com/other.mp4")
            // Reset pour les tests suivants.
            m.stop()
        }
    }

    func test_release_clearsState_whenActiveMatches() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            m.activeURL = "https://example.com/video.mp4"

            m.release(urlString: "https://example.com/video.mp4")

            XCTAssertEqual(m.activeURL, "")
            XCTAssertNil(m.player)
            XCTAssertFalse(m.isPlaying)
        }
    }
}
```

- [ ] **Step 2 : Run test pour confirmer fail.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerReleaseTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : compile fail `Cannot find 'release' on SharedAVPlayerManager`.

- [ ] **Step 3 : Ajouter la méthode `release(urlString:)` au manager.**

Dans `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift`, juste après `public func stop()` (vers ligne 122), ajoute :

```swift
    /// Libère le player POUR cette URL si elle est encore active. No-op si
    /// une autre URL a pris la main entre temps (safe race protection : par
    /// ex. l'utilisateur scrolle vite et une nouvelle bulle a déjà appelé
    /// `load`).
    ///
    /// Utilisé par `_InlineRenderer.teardown()` sur `.onDisappear` pour
    /// libérer le surface au scroll out → la bulle retombe sur le thumbnail
    /// au scroll back. Distinct de `pause()` : ce dernier conserve le
    /// player + activeURL, donc surface remounté sur frame figée.
    public func release(urlString: String) {
        guard activeURL == urlString else { return }
        stop()
    }
```

- [ ] **Step 4 : Run test pour confirmer pass.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerReleaseTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : 3 tests pass.

- [ ] **Step 5 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerReleaseTests.swift
git commit -m "feat(sdk/media): SharedAVPlayerManager.release(urlString:) safe URL-gated stop"
```

---

## Task 4 : `_InlineRenderer.teardown()` — release au lieu de pause

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift:300-305`

- [ ] **Step 1 : Modifier `teardown()` dans `_InlineRenderer`.**

Trouve la méthode actuelle (vers ligne 300) :

```swift
    private func teardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        if manager.activeURL == player.attachment.fileUrl {
            manager.pause()
        }
    }
```

Remplace par :

```swift
    private func teardown() {
        controlsTimer?.invalidate(); controlsTimer = nil
        // Release plutôt que pause : sans ça, `manager.player` + `activeURL`
        // restent câblés sur cette URL après scroll out. Au scroll back,
        // `isThisActive` redevient vrai et la surface remonte sur la dernière
        // frame jouée — l'utilisateur voit une image figée au lieu du
        // thumbnail. `release(urlString:)` est URL-gated (no-op si une autre
        // bulle a pris la main entre temps), donc safe.
        //
        // Note SwiftUI : `.onDisappear` ne fire pas quand un `fullScreenCover`
        // se présente au-dessus de la conversation — la cellule reste mountée
        // sous le cover. Donc ouvrir le fullscreen ne déclenche pas ce release.
        manager.release(urlString: player.attachment.fileUrl)
    }
```

- [ ] **Step 2 : Build.**

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`.

- [ ] **Step 3 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift
git commit -m "fix(sdk/media): _InlineRenderer release-on-disappear → thumbnail au scroll back"
```

---

## Task 5 : `SharedAVPlayerManager.isMuted` + `shouldLoop` + loop dans le notif handler

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift:10-29` (state) et `:184-228` (observer) et `:232-248` (cleanup)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerLoopMuteTests.swift`

- [ ] **Step 1 : Écrire les tests failing.**

Crée `packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerLoopMuteTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

final class SharedAVPlayerManagerLoopMuteTests: XCTestCase {

    func test_isMuted_defaultsFalse() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            m.isMuted = false  // reset
            XCTAssertFalse(m.isMuted)
        }
    }

    func test_isMuted_canBeToggled() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = true
            XCTAssertTrue(m.isMuted)
            m.isMuted = false
            XCTAssertFalse(m.isMuted)
        }
    }

    func test_shouldLoop_defaultsFalse() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.stop()
            XCTAssertFalse(m.shouldLoop)
        }
    }

    func test_shouldLoop_canBeToggled() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.shouldLoop = true
            XCTAssertTrue(m.shouldLoop)
            m.shouldLoop = false
            XCTAssertFalse(m.shouldLoop)
        }
    }

    func test_stop_resetsShouldLoop() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.shouldLoop = true
            m.stop()
            XCTAssertFalse(m.shouldLoop)
        }
    }

    func test_stop_preservesIsMuted() async {
        await MainActor.run {
            let m = SharedAVPlayerManager.shared
            m.isMuted = true
            m.stop()
            XCTAssertTrue(m.isMuted, "isMuted is a session-global pref, must survive stop")
            m.isMuted = false // teardown
        }
    }
}
```

- [ ] **Step 2 : Run test pour confirmer fail.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerLoopMuteTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : compile fail `Cannot find 'isMuted' on SharedAVPlayerManager` et `'shouldLoop'`.

- [ ] **Step 3 : Ajouter les propriétés au manager.**

Dans `SharedAVPlayerManager.swift`, juste après `@Published public var isPipActive = false` (ligne 19), ajoute :

```swift
    /// Mute global du player (préservé entre vidéos dans la session).
    /// Toggle via le bouton mute du fullscreen overlay. Propagé à
    /// `AVPlayer.isMuted` automatiquement via `didSet`.
    @Published public var isMuted: Bool = false {
        didSet { player?.isMuted = isMuted }
    }

    /// Si vrai, le notification handler de fin de lecture seek(0) + play()
    /// au lieu de stop(). Reset à `false` par `cleanup()` → ne traverse pas
    /// un changement de vidéo. Toggle exclusif via le fullscreen overlay
    /// (inline n'expose pas `.loop` dans son ControlSet).
    @Published public var shouldLoop: Bool = false
```

- [ ] **Step 4 : Mettre à jour `cleanup()` pour reset `shouldLoop` (mais PAS `isMuted`).**

Dans `cleanup()` (ligne 232), ajoute la reset de `shouldLoop` AVANT la fin de méthode. Le résultat doit ressembler à :

```swift
    private func cleanup() {
        if let observer = timeObserver, let player {
            player.removeTimeObserver(observer)
        }
        timeObserver = nil
        cancellables.removeAll()
        player?.pause()
        player = nil
        isPlaying = false
        currentTime = 0
        duration = 0
        playbackSpeed = .x1_0
        watchStartTime = nil
        attachmentId = nil
        pipController = nil
        pipDelegate = nil
        // shouldLoop reset : ne traverse pas un changement d'attachment.
        // isMuted NON reset : préférence globale session.
        shouldLoop = false
    }
```

- [ ] **Step 5 : Modifier le notification handler de fin de lecture pour brancher sur `shouldLoop`.**

Dans `setupObservers(for:)` (ligne 184), trouve le bloc :

```swift
        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.reportWatchProgress(complete: true)
                self.watchStartTime = nil
                self.isPlaying = false
                self.seek(to: 0)
                // Clear `activeURL` + tear down player + release `AVAudioSession`.
                // Sans ce stop, `isThisActive` reste `true` dans `_InlineRenderer`,
                // la surface reste mountée sur la dernière frame de la vidéo et
                // l'utilisateur ne revient jamais au thumbnail + play badge.
                // Le re-tap relancera `load(urlString:)` qui hit le cache disk
                // (lecture instantanée — pas de re-download).
                self.stop()
            }
            .store(in: &cancellables)
```

Remplace par :

```swift
        NotificationCenter.default.publisher(for: AVPlayerItem.didPlayToEndTimeNotification, object: player.currentItem)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.reportWatchProgress(complete: true)
                if self.shouldLoop {
                    // Loop fullscreen : seek + replay, on garde le player +
                    // activeURL + audio session. Reset watchStartTime pour que
                    // la prochaine fin de cycle puisse encore report progress.
                    self.seek(to: 0)
                    self.play()
                    self.watchStartTime = Date()
                } else {
                    // Comportement par défaut : tear-down complet → bubble
                    // re-render sur thumbnail (cf. commentaire historique).
                    self.watchStartTime = nil
                    self.isPlaying = false
                    self.seek(to: 0)
                    self.stop()
                }
            }
            .store(in: &cancellables)
```

- [ ] **Step 6 : Propager `isMuted` au nouveau player au moment du `load`.**

Dans `setupObservers(for:)` (ligne 184), AJOUTE en première ligne de la méthode :

```swift
    private func setupObservers(for player: AVPlayer) {
        // Sync immédiat de la pref mute globale sur le nouveau player. Sans
        // ça, un user qui mute en fullscreen puis ouvre une nouvelle vidéo
        // entend le son revenir alors que l'icône mute reste activée.
        player.isMuted = isMuted

        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        // ... reste inchangé
```

- [ ] **Step 7 : Run tests pour confirmer pass.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerLoopMuteTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : 6 tests pass.

- [ ] **Step 8 : Rerun les tests release de Task 3 pour vérifier non-régression.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerReleaseTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : 3 tests pass.

- [ ] **Step 9 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/SharedAVPlayerManagerLoopMuteTests.swift
git commit -m "feat(sdk/media): SharedAVPlayerManager.isMuted + shouldLoop avec branche dans end-notif handler"
```

---

## Task 6 : `ControlSet` — `.airplay`, `.pip`, `.loop` + `inlineDefault` inclut `.speed`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift:30-50`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift`

- [ ] **Step 1 : Écrire les tests failing.**

Crée `packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift` :

```swift
import XCTest
@testable import MeeshyUI

final class MeeshyVideoPlayerControlSetTests: XCTestCase {

    func test_inlineDefault_includesSpeed() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.speed))
    }

    func test_inlineDefault_includesExpand() {
        XCTAssertTrue(MeeshyVideoPlayer.ControlSet.inlineDefault.contains(.expand))
    }

    func test_fullscreenDefault_includesNewFullscreenControls() {
        let fs = MeeshyVideoPlayer.ControlSet.fullscreenDefault
        XCTAssertTrue(fs.contains(.mute))
        XCTAssertTrue(fs.contains(.airplay))
        XCTAssertTrue(fs.contains(.pip))
        XCTAssertTrue(fs.contains(.loop))
    }

    func test_fullscreenDefault_preservesExistingControls() {
        let fs = MeeshyVideoPlayer.ControlSet.fullscreenDefault
        XCTAssertTrue(fs.contains(.playPause))
        XCTAssertTrue(fs.contains(.scrubber))
        XCTAssertTrue(fs.contains(.duration))
        XCTAssertTrue(fs.contains(.save))
        XCTAssertTrue(fs.contains(.share))
        XCTAssertTrue(fs.contains(.close))
        XCTAssertTrue(fs.contains(.speed))
        XCTAssertTrue(fs.contains(.author))
    }

    func test_newControlSet_rawValues_areDistinct() {
        let values: Set<Int> = [
            MeeshyVideoPlayer.ControlSet.airplay.rawValue,
            MeeshyVideoPlayer.ControlSet.pip.rawValue,
            MeeshyVideoPlayer.ControlSet.loop.rawValue
        ]
        XCTAssertEqual(values.count, 3, "Each new control must have a distinct bit")
    }
}
```

- [ ] **Step 2 : Run test pour confirmer fail.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : compile fail (no `.airplay`, `.pip`, `.loop` members ; possibly tests on `inlineDefault.contains(.speed)` fail at runtime).

- [ ] **Step 3 : Ajouter les nouveaux membres `ControlSet`.**

Dans `MeeshyVideoPlayer.swift`, modifier la struct `ControlSet` (lignes 30–50). Après `public static let author = ControlSet(rawValue: 1 << 10)` ajoute :

```swift
        public static let airplay     = ControlSet(rawValue: 1 << 11)
        public static let pip         = ControlSet(rawValue: 1 << 12)
        public static let loop        = ControlSet(rawValue: 1 << 13)
```

- [ ] **Step 4 : Mettre à jour `inlineDefault` pour inclure `.speed`.**

Remplace la ligne :
```swift
        public static let inlineDefault: ControlSet     = [.playPause, .scrubber, .duration, .expand]
```
par :
```swift
        public static let inlineDefault: ControlSet     = [.playPause, .scrubber, .duration, .expand, .speed]
```

- [ ] **Step 5 : Mettre à jour `fullscreenDefault` pour inclure mute/airplay/pip/loop.**

Remplace la ligne :
```swift
        public static let fullscreenDefault: ControlSet = [.playPause, .scrubber, .duration, .save, .share, .close, .speed, .author]
```
par :
```swift
        public static let fullscreenDefault: ControlSet = [
            .playPause, .scrubber, .duration, .save, .share, .close,
            .speed, .author, .mute, .airplay, .pip, .loop
        ]
```

- [ ] **Step 6 : Run tests pour confirmer pass.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : 5 tests pass.

- [ ] **Step 7 : Build complet — confirme que le bouton speed s'affiche bien en inline (le rendu existe déjà dans `_InlineOverlayControls.topBar`).**

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`.

- [ ] **Step 8 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/Media/MeeshyVideoPlayerControlSetTests.swift
git commit -m "feat(sdk/media): ControlSet.airplay/pip/loop + .speed dans inlineDefault"
```

---

## Task 7 : `AirPlayRoutePicker` (UIViewRepresentable)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift`

- [ ] **Step 1 : Créer le wrapper.**

Crée `packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift` :

```swift
import SwiftUI
import AVKit

/// SwiftUI wrapper autour de `AVRoutePickerView` (UIKit). Au tap, ouvre le
/// picker système iOS pour AirPlay / Bluetooth speaker / etc.
///
/// Utilisé par `_FullscreenOverlayControls` quand `controls.contains(.airplay)`.
struct AirPlayRoutePicker: UIViewRepresentable {
    let tintColor: UIColor

    init(tintColor: UIColor = .white) {
        self.tintColor = tintColor
    }

    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = tintColor
        view.activeTintColor = tintColor
        view.prioritizesVideoDevices = true
        return view
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {
        uiView.tintColor = tintColor
        uiView.activeTintColor = tintColor
    }
}
```

- [ ] **Step 2 : Build.**

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`. (Pas de test unitaire pour ce wrapper — UIKit + sytem picker, smoke test seul.)

- [ ] **Step 3 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AirPlayRoutePicker.swift
git commit -m "feat(sdk/media): AirPlayRoutePicker UIViewRepresentable around AVRoutePickerView"
```

---

## Task 8 : `_FullscreenRenderer` — fix bug "controls invisibles" (overlay toujours rendu) + reset loop sur close

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift:349-484`

- [ ] **Step 1 : Lire le body actuel de `_FullscreenRenderer` (lignes 363–417) pour bien comprendre la structure.**

- [ ] **Step 2 : Restructurer pour toujours rendre l'overlay dès `.ready`.**

Trouve `_FullscreenRenderer.body` (vers ligne 363) :

```swift
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch player.availability {
            case .ready:
                if isActive {
                    playerContent
                } else {
                    loadingState
                }
            case .needsDownload, .downloading:
                downloadOverlay
            }
        }
        .offset(y: dismissOffset)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: dismissOffset)
        .onAppear { watchStartTime = Date() }
        .onDisappear { onDisappearTeardown() }
        .statusBarHidden(true)
    }
```

Remplace par :

```swift
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch player.availability {
            case .ready:
                // L'overlay est toujours rendu pour .ready, même si
                // `manager.player` n'est pas encore chargé. Sans ça, le user
                // voit un écran noir + ProgressView sans aucun contrôle
                // pendant la phase load (1–2 s sur cold cache), et croit que
                // les contrôles ont disparu. Les boutons centre + speed +
                // seekbar sont rendus disabled tant que `duration == 0`.
                playerContent
            case .needsDownload, .downloading:
                downloadOverlay
            }
        }
        .offset(y: dismissOffset)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: dismissOffset)
        .onAppear {
            watchStartTime = Date()
            // Defensive : reset l'auto-hide state à l'entrée du fullscreen.
            showControls = true
        }
        .onDisappear { onDisappearTeardown() }
        .statusBarHidden(true)
    }
```

- [ ] **Step 3 : Restructurer `playerContent` pour gérer le cas `manager.player == nil`.**

Trouve `playerContent` (vers ligne 391) :

```swift
    private var playerContent: some View {
        ZStack {
            if let p = manager.player {
                MeeshyVideoSurface(player: p, gravity: videoGravity, isMuted: false)
                    .ignoresSafeArea()
                    .onTapGesture { toggleControls() }
                    .gesture(swipeDownGesture)
                    .gesture(pinchGesture)
            }
            if showControls {
                _FullscreenOverlayControls(
                    manager: manager,
                    accentColor: player.accentColor,
                    controls: player.controls,
                    fileName: player.fileName,
                    onClose: { closePlayer() },
                    onSave: { saveToPhotos() },
                    onShare: player.onShare,
                    saveState: saveState
                )
                .transition(.opacity)
                authorAndCaptionOverlay
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .onAppear { observeEnd() }
    }
```

Remplace par :

```swift
    private var playerContent: some View {
        ZStack {
            if let p = manager.player {
                MeeshyVideoSurface(player: p, gravity: videoGravity, isMuted: manager.isMuted)
                    .ignoresSafeArea()
                    .onTapGesture { toggleControls() }
                    .gesture(swipeDownGesture)
                    .gesture(pinchGesture)
            } else {
                // Player en cours de chargement. Spinner central derrière les
                // contrôles overlay (qui restent visibles + boutons disabled).
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.4)
                    .onAppear {
                        manager.attachmentId = player.attachment.id
                        manager.load(urlString: player.attachment.fileUrl)
                        manager.play()
                    }
            }
            if showControls {
                _FullscreenOverlayControls(
                    manager: manager,
                    accentColor: player.accentColor,
                    controls: player.controls,
                    fileName: player.fileName,
                    onClose: { closePlayer() },
                    onSave: { saveToPhotos() },
                    onShare: player.onShare,
                    saveState: saveState
                )
                .transition(.opacity)
                authorAndCaptionOverlay
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showControls)
        .onAppear { observeEnd() }
    }
```

- [ ] **Step 4 : Reset `shouldLoop` dans `closePlayer()` (defensive).**

Trouve `closePlayer()` (vers ligne 627) :
```swift
    private func closePlayer() {
        player.onClose?()
    }
```

Remplace par :
```swift
    private func closePlayer() {
        // Reset loop défensif : sans ça, le flag persisterait jusqu'au prochain
        // load() et pourrait faire bouclé une vidéo inline ouverte ensuite.
        manager.shouldLoop = false
        player.onClose?()
    }
```

- [ ] **Step 5 : Supprimer la méthode `loadingState` obsolète (le code est désormais dans `playerContent`).**

Trouve et SUPPRIME le bloc (vers ligne 476) :
```swift
    // MARK: Loading state (ready but manager not loaded yet)

    private var loadingState: some View {
        ProgressView()
            .tint(.white)
            .onAppear {
                manager.attachmentId = player.attachment.id
                manager.load(urlString: player.attachment.fileUrl)
                manager.play()
            }
    }
```

- [ ] **Step 6 : Build.**

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`. Si une référence à `loadingState` traîne ailleurs, le compile fail le dira.

- [ ] **Step 7 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift
git commit -m "fix(sdk/media): _FullscreenRenderer overlay toujours rendu + reset shouldLoop sur close"
```

---

## Task 9 : `_FullscreenOverlayControls` — mini-toolbar (mute/loop/pip/airplay)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift:243-405`

- [ ] **Step 1 : Insérer la mini-toolbar dans le `bottomStack`.**

Trouve `bottomStack` dans `_FullscreenOverlayControls` (vers ligne 382) :

```swift
    private var bottomStack: some View {
        VStack(spacing: 8) {
            if controls.contains(.scrubber) {
                seekBar
                    .padding(.horizontal, 16)
            }
            if controls.contains(.duration) {
                HStack {
                    Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.75))
                    Spacer()
                    Text(formatMediaDuration(manager.duration))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.75))
                }
                .padding(.horizontal, 16)
            }
            if controls.contains(.speed) {
                speedRow
                    .padding(.horizontal, 16)
            }
        }
    }
```

Remplace par :

```swift
    private var bottomStack: some View {
        VStack(spacing: 8) {
            // Mini-toolbar : contrôles vidéo persistants (mute/loop/pip/airplay)
            // séparés des actions de fichier (share/save) qui restent en top bar.
            miniToolbar
                .padding(.horizontal, 16)

            if controls.contains(.scrubber) {
                seekBar
                    .padding(.horizontal, 16)
            }
            if controls.contains(.duration) {
                HStack {
                    Text(formatMediaDuration(isSeeking ? seekValue * manager.duration : manager.currentTime))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.75))
                    Spacer()
                    Text(formatMediaDuration(manager.duration))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.75))
                }
                .padding(.horizontal, 16)
            }
            if controls.contains(.speed) {
                speedRow
                    .padding(.horizontal, 16)
            }
        }
    }

    @ViewBuilder
    private var miniToolbar: some View {
        let hasAny = controls.contains(.mute) || controls.contains(.loop)
            || controls.contains(.pip) || controls.contains(.airplay)
        if hasAny {
            HStack(spacing: 16) {
                Spacer()
                if controls.contains(.mute) { muteButton }
                if controls.contains(.loop) { loopButton }
                if controls.contains(.pip)  { pipButton }
                if controls.contains(.airplay) { airplayButton }
                Spacer()
            }
        }
    }

    private var muteButton: some View {
        Button {
            manager.isMuted.toggle()
            HapticFeedback.light()
        } label: {
            miniToolbarIcon(
                systemName: manager.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                isActive: manager.isMuted
            )
        }
        .accessibilityLabel(manager.isMuted ? "Reactiver le son" : "Couper le son")
    }

    private var loopButton: some View {
        Button {
            manager.shouldLoop.toggle()
            HapticFeedback.light()
        } label: {
            miniToolbarIcon(systemName: "repeat", isActive: manager.shouldLoop)
        }
        .accessibilityLabel(manager.shouldLoop ? "Desactiver lecture en boucle" : "Activer lecture en boucle")
    }

    private var pipButton: some View {
        let supported = AVPictureInPictureController.isPictureInPictureSupported()
        return Button {
            if manager.isPipActive {
                manager.stopPip()
            } else {
                manager.startPip()
            }
            HapticFeedback.light()
        } label: {
            miniToolbarIcon(
                systemName: manager.isPipActive ? "pip.exit" : "pip.enter",
                isActive: manager.isPipActive
            )
            .opacity(supported ? 1.0 : 0.4)
        }
        .disabled(!supported)
        .accessibilityLabel(manager.isPipActive ? "Sortir du picture in picture" : "Activer picture in picture")
    }

    private var airplayButton: some View {
        // AVRoutePickerView se sized lui-même + handle le tap natif.
        AirPlayRoutePicker(tintColor: .white)
            .frame(width: 36, height: 36)
            .background(
                ZStack {
                    Circle().fill(.ultraThinMaterial)
                    Circle().fill(Color.white.opacity(0.10))
                }
            )
            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
            .accessibilityLabel("AirPlay")
    }

    private func miniToolbarIcon(systemName: String, isActive: Bool) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 36, height: 36)
            .background(
                ZStack {
                    Circle().fill(.ultraThinMaterial)
                    Circle().fill((isActive ? accent : Color.white.opacity(0.10)))
                }
            )
            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
    }
```

- [ ] **Step 2 : Ajouter l'import `AVKit` en haut du fichier si absent.**

Vérifie l'en-tête de `MeeshyVideoPlayer+Controls.swift` :

```bash
head -5 packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift
```

Si `AVKit` manque, ajoute après `import AVFoundation` :
```swift
import AVKit
```

- [ ] **Step 3 : Build.**

```bash
xcodebuild build \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : `BUILD SUCCEEDED`.

- [ ] **Step 4 : Rerun tous les tests des Tasks précédentes pour s'assurer aucune régression.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/MeeshyVideoPlayerControlSetTests \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerReleaseTests \
  -only-testing:MeeshyUITests/SharedAVPlayerManagerLoopMuteTests \
  -only-testing:MeeshyUITests/VideoDisplayAspectCacheTests \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet
```
Expected : tous les tests passent (18 tests total environ).

- [ ] **Step 5 : Commit.**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyVideoPlayer+Controls.swift
git commit -m "feat(sdk/media): fullscreen mini-toolbar (mute/loop/pip/airplay)"
```

---

## Task 10 : Smoke checklist QA + build final intégré app

**Files:**
- Create: `docs/qa/2026-05-25-video-bubble-ux-smoke.md`

- [ ] **Step 1 : Build complet app iOS pour vérifier intégration end-to-end.**

```bash
./apps/ios/meeshy.sh build
```
Expected : `BUILD SUCCEEDED`. Si erreur, investigate avant de continuer.

- [ ] **Step 2 : Écrire la smoke checklist.**

Crée `docs/qa/2026-05-25-video-bubble-ux-smoke.md` :

```markdown
# QA Smoke — Video bubble UX hardening (2026-05-25)

**Spec :** `docs/superpowers/specs/2026-05-25-video-bubble-ux-hardening-design.md`
**Plan :** `docs/superpowers/plans/2026-05-25-video-bubble-ux-hardening-plan.md`
**Branche :** `feat/ios-video-bubble-ux-hardening`

Tests manuels à exécuter sur device réel (pas simulateur — PIP et AirPlay nécessitent un device) avant merge.

## Setup

- Compte test : `atabeth` (cf `apps/ios/fastlane/.env`)
- Conversation cible : ouvrir une conversation contenant au moins une vidéo portrait (9:16) et une vidéo paysage (16:9). Si absente, en envoyer une fraîche via le composer.

## Section 1 — Aspect ratio (bandes noires)

- [ ] Ouvrir la conversation, scroller jusqu'à la vidéo portrait. **Attendu :** la bulle remplit l'aspect ratio portrait, pas de bandes noires sur les côtés. Premier affichage cold cache peut montrer un flash <200ms — acceptable.
- [ ] Quitter la conversation, revenir. **Attendu :** la même vidéo portrait s'affiche INSTANTANÉMENT avec le bon ratio (cache hit).
- [ ] Vidéo paysage 16:9 : pas de régression — la bulle reste paysage, aucun ratio bizarre.

## Section 2 — Retour thumbnail

- [ ] Tap play sur une vidéo. Attendre 5 secondes. Tap pause. **Attendu :** contrôles restent visibles, surface reste mountée sur la frame courante, l'utilisateur peut reprendre via tap play.
- [ ] Tap play sur une vidéo. Pendant la lecture, scroller la conversation pour faire sortir la bulle de l'écran. Scroller en arrière pour la revoir. **Attendu :** la bulle affiche le thumbnail + bouton play, PAS la dernière frame jouée.
- [ ] Tap play sur une vidéo courte (≤10 s). Laisser jouer jusqu'à la fin. **Attendu :** snap automatique vers le thumbnail + bouton play replay quand la vidéo finit.

## Section 3 — Bouton vitesse inline

- [ ] Tap play sur une vidéo. **Attendu :** capsule "1×" visible en top-RIGHT de la bulle (à côté du bouton expand top-LEFT).
- [ ] Tap sur la capsule vitesse. **Attendu :** cycle 1× → 1.25× → 1.5× → 1.75× → 2× → 1× avec haptic léger à chaque tap, vitesse de lecture suit immédiatement.

## Section 4 — Fullscreen

### 4a : contrôles visibles dès l'entrée

- [ ] Tap sur le bouton expand d'une vidéo inline. **Attendu :** fullscreen s'ouvre AVEC les contrôles immédiatement visibles : top bar (close + filename + share + save), center (±10s + play/pause), mini-toolbar (mute + loop + pip + airplay), bottom (seekbar + time + speed row).
- [ ] Tap n'importe où sur la vidéo en fullscreen. **Attendu :** les contrôles se cachent (auto-hide) ; second tap = ré-apparaissent.

### 4b : nouveaux contrôles

- [ ] **Mute :** tap l'icône haut-parleur dans la mini-toolbar. **Attendu :** son coupé, icône passe à `speaker.slash.fill` avec halo accent. Retap = son revient. État persiste si on ouvre une autre vidéo.
- [ ] **Loop :** tap l'icône `repeat`. **Attendu :** halo accent activé. Vidéo courte qui finit → relance automatiquement depuis 0. Détap loop avant la fin = comportement par défaut (stop + close fullscreen ou retour thumbnail).
- [ ] **PIP :** tap l'icône `pip.enter`. **Attendu :** mini-fenêtre PIP flotte au coin écran ; l'app retourne en background. Tap PIP de retour dans l'OS = retour fullscreen Meeshy. (Sur simulateur le bouton est disabled — comportement attendu.)
- [ ] **AirPlay :** tap l'icône AirPlay. **Attendu :** picker système iOS s'ouvre listant les devices disponibles (Apple TV, HomePod, etc.). Sélection diffuse la vidéo.
- [ ] **Speed row :** tap successivement les 5 chips 1× / 1.25× / 1.5× / 1.75× / 2×. **Attendu :** chip active passe en accent + scale 1.08, vitesse appliquée immédiatement.
- [ ] **Skip ±10s :** tap les boutons ←10s / 10s→. **Attendu :** seek immédiat de ±10s depuis la position courante.
- [ ] **Close + share + save :** tester les 3 boutons top bar.

### 4c : interaction loop + close

- [ ] Fullscreen : activer loop. Tap close (X). Ré-ouvrir la même vidéo en inline. Tap play, laisser finir. **Attendu :** PAS de loop en inline (la bulle retombe sur thumbnail). `manager.shouldLoop` doit être reset à false sur close fullscreen.

## Diagnostics

Si un point fail :
1. Vérifier les logs : `./apps/ios/meeshy.sh logs | grep -i "video\|player\|asset"`
2. Reproduire en mode debug avec breakpoint dans `_InlineRenderer.teardown` ou `SharedAVPlayerManager.release`.
3. Capturer screenshot/vidéo + ouvrir une issue avec le numéro du point QA failé.
```

- [ ] **Step 3 : Commit la checklist.**

```bash
git add docs/qa/2026-05-25-video-bubble-ux-smoke.md
git commit -m "docs(qa): smoke checklist video bubble UX hardening"
```

- [ ] **Step 4 : Lancer toute la suite de tests SDK une dernière fois pour confirmer non-régression globale.**

```bash
xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -disableAutomaticPackageResolution \
  -onlyUsePackageVersionsFromResolvedFile \
  -quiet 2>&1 | tail -50
```
Expected : `Test Succeeded` à la fin. Si des tests préexistants tombent en flake (cf memory `feedback_ios_test_suite_flaky`), re-run avant de conclure à une régression.

- [ ] **Step 5 : Push de la branche + ouvrir la PR.**

```bash
git push -u origin feat/ios-video-bubble-ux-hardening
gh pr create --base dev --title "feat(ios/video): bubble UX hardening — aspect, thumbnail-on-scroll, speed, fullscreen complete" \
  --body "Closes user report 2026-05-25. 4 régressions UX corrigées :

- bandes noires sur vidéos verticales → cache + thumbnail aspect hint
- pas de retour thumbnail au scroll out → SharedAVPlayerManager.release + teardown
- bouton vitesse inline manquant → .speed dans inlineDefault
- fullscreen contrôles invisibles + manque AirPlay/mute/PIP/loop → overlay always-rendered + mini-toolbar

**Spec :** \`docs/superpowers/specs/2026-05-25-video-bubble-ux-hardening-design.md\`
**Plan :** \`docs/superpowers/plans/2026-05-25-video-bubble-ux-hardening-plan.md\`
**QA :** \`docs/qa/2026-05-25-video-bubble-ux-smoke.md\` — checklist à exécuter sur device avant merge."
```

---

## Self-Review

**1. Spec coverage :**
- Section 1 (aspect ratio) → Tasks 1 + 2 ✓
- Section 2 (retour thumbnail) → Tasks 3 + 4 ✓
- Section 3 (bouton vitesse inline) → Task 6 ✓
- Section 4a (bug fullscreen) → Task 8 ✓
- Section 4b (features mute/loop/pip/airplay) → Tasks 5 + 7 + 9 ✓
- Tests planifiés du spec → Tasks 1, 3, 5, 6 (chaque module testé) ✓
- Smoke checklist QA → Task 10 ✓

**2. Placeholder scan :** Aucun TBD, TODO, "implement later", "add error handling", "similar to Task N". Chaque step contient le code complet ou la commande exacte.

**3. Type consistency :**
- `VideoDisplayAspectCache` : nom cohérent partout (Task 1 création, Task 2 usage)
- `release(urlString:)` : signature stable (Task 3 création, Task 4 usage)
- `isMuted`, `shouldLoop` : `@Published public var` cohérent (Task 5 création, Task 9 usage)
- `ControlSet.airplay`, `.pip`, `.loop` : noms stables (Task 6 création, Task 9 usage)
- `AirPlayRoutePicker` : utilisé tel quel dans Task 9 après création Task 7

**4. Decoupling check :** Tâches reviewer-friendly — chaque commit build + passe ses tests indépendamment. Pas de dépendance circulaire (Task N dépend de 1..N-1 maximum).
