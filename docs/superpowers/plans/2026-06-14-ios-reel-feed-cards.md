# Cartes Réel plein-cadre dans le feed — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les Réels du feed comme des cartes plein-cadre (média en fond, auteur + boutons en overlay, logo Réel coin haut-droit sans texte), avec autoplay muet du réel le plus centré dans le viewport et ouverture du viewer au tap.

**Architecture:** Nouveau composant app-side `ReelFeedCard` routé depuis `FeedView` quand `post.isReel`. Deux fonctions pures testables (`reelCardHeight`, `mostCenteredReel`) + un `ReelFeedAutoplayCoordinator` (@MainActor, call-aware) qui élit le réel centré et pilote l'unique `SharedAVPlayerManager` en muet. Tap → `ReelsPresenter.shared.present` (révélation liquide existante). Retrait du `reelBadge`.

**Tech Stack:** SwiftUI (iOS 16+), `SharedAVPlayerManager` (SDK MeeshyUI), `VideoAvailabilityResolver` (app), `MediaSessionCoordinator` (SDK), `DynamicColorGenerator`, XCTest. Build via `./apps/ios/meeshy.sh build`.

**Spec :** `docs/superpowers/specs/2026-06-14-ios-reel-feed-cards-design.md`

**Convention pbxproj (objectVersion 63, classique, pas de synchronized groups) :** chaque nouveau `.swift` exige 4 entrées + 2 UUIDs (16 hex uppercase chacun, uniques) :
1. `PBXBuildFile` : `<UUID_BUILD> /* X.swift in Sources */ = {isa = PBXBuildFile; fileRef = <UUID_REF> /* X.swift */; };`
2. `PBXFileReference` : `<UUID_REF> /* X.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "Features/Main/Views/X.swift"; sourceTree = SOURCE_ROOT; };`
3. `children` du PBXGroup `Features/Main/Views` : ajouter `<UUID_REF> /* X.swift */,`
4. `files` de la `PBXSourcesBuildPhase` de la target **Meeshy** : ajouter `<UUID_BUILD> /* X.swift in Sources */,`
Pour un fichier de test : `path = "MeeshyTests/Unit/Views/X.swift"`, groupe `MeeshyTests/Unit/Views`, et `files` de la `PBXSourcesBuildPhase` de la target **MeeshyTests**.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/ReelFeedLayout.swift` (créer) | Logique pure : `reelCardHeight`, `ReelFrame`, `ReelMediaKind`, `mostCenteredReel`. Aucune dépendance UI. |
| `apps/ios/Meeshy/Features/Main/Views/ReelFeedAutoplayCoordinator.swift` (créer) | `@MainActor ObservableObject` : `activeReelId`, `update(...)`, call-aware (injection testable). |
| `apps/ios/Meeshy/Features/Main/Views/ReelFeedVisibility.swift` (créer) | `ReelVisibilityPreferenceKey` + modifier `reportReelFrame(id:kind:)`. |
| `apps/ios/Meeshy/Features/Main/Views/ReelAudioBackdrop.swift` (créer) | Fond audio : dégradé `accentColor` + waveform animé. |
| `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift` (créer) | La carte plein-cadre : média en fond + overlay auteur/boutons + logo Réel. |
| `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (modifier) | Router `post.isReel → ReelFeedCard` ; collecter les frames + piloter le coordinator. |
| `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (modifier) | Retirer `reelBadge` (79-94) + son appel (~293). |
| `apps/ios/MeeshyTests/Unit/Views/ReelFeedLayoutTests.swift` (créer) | Tests purs `reelCardHeight` + `mostCenteredReel`. |
| `apps/ios/MeeshyTests/Unit/Views/ReelFeedAutoplayCoordinatorTests.swift` (créer) | Tests du coordinator (transitions + call-aware). |

---

## Task 1 : Fonctions pures de layout (`ReelFeedLayout.swift`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ReelFeedLayout.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/ReelFeedLayoutTests.swift`

- [ ] **Step 1 : Écrire le test qui échoue (`reelCardHeight`)**

Créer `apps/ios/MeeshyTests/Unit/Views/ReelFeedLayoutTests.swift` :

```swift
import XCTest
@testable import Meeshy

final class ReelFeedLayoutTests: XCTestCase {

    // MARK: - reelCardHeight (plafond 4:5 = 1.25, plancher 4:3 = 0.75)

    func test_reelCardHeight_verticalNineSixteen_isCappedAtFourFive() {
        // 1080x1920 (9:16, ratio 1.777) plafonné à 1.25 → 336 * 1.25 = 420
        let h = reelCardHeight(mediaWidth: 1080, mediaHeight: 1920, cardWidth: 336)
        XCTAssertEqual(h, 420, accuracy: 0.5)
    }

    func test_reelCardHeight_landscape_isFlooredAtFourThree() {
        // 1920x1080 (ratio 0.5625) plancher à 0.75 → 336 * 0.75 = 252
        let h = reelCardHeight(mediaWidth: 1920, mediaHeight: 1080, cardWidth: 336)
        XCTAssertEqual(h, 252, accuracy: 0.5)
    }

    func test_reelCardHeight_square_keepsOneToOne() {
        let h = reelCardHeight(mediaWidth: 1000, mediaHeight: 1000, cardWidth: 336)
        XCTAssertEqual(h, 336, accuracy: 0.5)
    }

    func test_reelCardHeight_unknownDimensions_usesFourFiveDefault() {
        // audio / dimensions absentes → ratio par défaut 1.25
        let h = reelCardHeight(mediaWidth: nil, mediaHeight: nil, cardWidth: 336)
        XCTAssertEqual(h, 420, accuracy: 0.5)
    }

    // MARK: - mostCenteredReel

    private func frame(_ id: String, midY: CGFloat, height: CGFloat = 400) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: height, kind: .video)
    }

    func test_mostCenteredReel_picksClosestToViewportCenter() {
        // viewport [0, 800], centre = 400
        let frames = [frame("a", midY: 200), frame("b", midY: 420), frame("c", midY: 700)]
        let id = mostCenteredReel(frames: frames, viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(id, "b")
    }

    func test_mostCenteredReel_excludesBarelyVisible() {
        // "a" presque hors viewport (fraction < 0.5), "b" pleinement visible
        let frames = [frame("a", midY: -150, height: 400), frame("b", midY: 400, height: 400)]
        let id = mostCenteredReel(frames: frames, viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(id, "b")
    }

    func test_mostCenteredReel_noFrames_returnsNil() {
        XCTAssertNil(mostCenteredReel(frames: [], viewportMinY: 0, viewportMaxY: 800))
    }
}
```

- [ ] **Step 2 : Enregistrer le fichier de test dans le pbxproj (target MeeshyTests)**

Dans `apps/ios/Meeshy.xcodeproj/project.pbxproj`, ajouter les 4 entrées (UUIDs neufs `RFL1...`/`RFL2...`) pour `ReelFeedLayoutTests.swift` : PBXBuildFile, PBXFileReference (`path = "MeeshyTests/Unit/Views/ReelFeedLayoutTests.swift"`), `children` du groupe `MeeshyTests/Unit/Views`, `files` de la `PBXSourcesBuildPhase` de la target **MeeshyTests**.

- [ ] **Step 3 : Lancer le test, vérifier l'échec (compile error : symboles absents)**

Run: `./apps/ios/meeshy.sh build`
Expected: échec de compilation du bundle de test — `cannot find 'reelCardHeight'` / `'ReelFrame'` / `'mostCenteredReel'`.

- [ ] **Step 4 : Écrire l'implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Views/ReelFeedLayout.swift` :

```swift
import CoreGraphics

/// Le média d'un réel détermine son rendu de fond dans le feed.
enum ReelMediaKind: Equatable {
    case video
    case audio
    case imageOnly
}

/// Frame d'une carte réel rapportée au coordinateur d'autoplay (espace global).
struct ReelFrame: Equatable {
    let id: String
    let midY: CGFloat
    let height: CGFloat
    let kind: ReelMediaKind
}

/// Hauteur d'une carte réel : proportionnelle au ratio du média, bornée entre
/// 4:3 (paysage, plancher 0.75) et 4:5 (vertical, plafond 1.25). Le média est
/// affiché en aspect-fill et remplit toute la carte ; un 9:16 est donc recadré.
/// Dimensions absentes (audio) → ratio par défaut 4:5.
func reelCardHeight(
    mediaWidth: Int?,
    mediaHeight: Int?,
    cardWidth: CGFloat,
    maxTallRatio: CGFloat = 1.25,
    minRatio: CGFloat = 0.75
) -> CGFloat {
    guard let w = mediaWidth, let h = mediaHeight, w > 0, h > 0 else {
        return (cardWidth * maxTallRatio).rounded()
    }
    let ratio = CGFloat(h) / CGFloat(w)
    let clamped = min(max(ratio, minRatio), maxTallRatio)
    return (cardWidth * clamped).rounded()
}

/// Élit l'id du réel dont le centre est le plus proche du centre du viewport,
/// parmi les réels suffisamment visibles (fraction ≥ `minVisibleFraction`).
/// `nil` si aucun réel ne franchit le seuil.
func mostCenteredReel(
    frames: [ReelFrame],
    viewportMinY: CGFloat,
    viewportMaxY: CGFloat,
    minVisibleFraction: CGFloat = 0.5
) -> String? {
    let viewportMid = (viewportMinY + viewportMaxY) / 2
    var best: (id: String, distance: CGFloat)?
    for f in frames where f.height > 0 {
        let top = f.midY - f.height / 2
        let bottom = f.midY + f.height / 2
        let visible = max(0, min(bottom, viewportMaxY) - max(top, viewportMinY))
        let fraction = visible / f.height
        guard fraction >= minVisibleFraction else { continue }
        let distance = abs(f.midY - viewportMid)
        if best == nil || distance < best!.distance {
            best = (f.id, distance)
        }
    }
    return best?.id
}
```

- [ ] **Step 5 : Enregistrer `ReelFeedLayout.swift` dans le pbxproj (target Meeshy)**

4 entrées (UUIDs neufs `RFL3...`/`RFL4...`) : PBXBuildFile, PBXFileReference (`path = "Features/Main/Views/ReelFeedLayout.swift"`), `children` du groupe `Features/Main/Views`, `files` de la `PBXSourcesBuildPhase` de la target **Meeshy**.

- [ ] **Step 6 : Lancer le build + tests, vérifier le succès**

Run: `./apps/ios/meeshy.sh build` puis exécuter `ReelFeedLayoutTests` (via Xcode ou `meeshy.sh test`).
Expected: build OK, 7 tests verts.

- [ ] **Step 7 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedLayout.swift \
        apps/ios/MeeshyTests/Unit/Views/ReelFeedLayoutTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): reelCardHeight + mostCenteredReel (fonctions pures testées)"
```

---

## Task 2 : Coordinateur d'autoplay (`ReelFeedAutoplayCoordinator.swift`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ReelFeedAutoplayCoordinator.swift`
- Test: `apps/ios/MeeshyTests/Unit/Views/ReelFeedAutoplayCoordinatorTests.swift`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `apps/ios/MeeshyTests/Unit/Views/ReelFeedAutoplayCoordinatorTests.swift` :

```swift
import XCTest
@testable import Meeshy

@MainActor
final class ReelFeedAutoplayCoordinatorTests: XCTestCase {

    private func frame(_ id: String, midY: CGFloat) -> ReelFrame {
        ReelFrame(id: id, midY: midY, height: 400, kind: .video)
    }

    func test_update_setsActiveToMostCenteredReel() {
        let sut = ReelFeedAutoplayCoordinator(isCallActive: { false })
        sut.update(frames: [frame("a", midY: 100), frame("b", midY: 400)],
                   viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(sut.activeReelId, "b")
    }

    func test_update_whenCallActive_clearsActive() {
        var callActive = false
        let sut = ReelFeedAutoplayCoordinator(isCallActive: { callActive })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(sut.activeReelId, "b")

        callActive = true
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertNil(sut.activeReelId)
    }

    func test_update_noVisibleReel_clearsActive() {
        let sut = ReelFeedAutoplayCoordinator(isCallActive: { false })
        sut.update(frames: [frame("b", midY: 400)], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertEqual(sut.activeReelId, "b")
        sut.update(frames: [], viewportMinY: 0, viewportMaxY: 800)
        XCTAssertNil(sut.activeReelId)
    }
}
```

- [ ] **Step 2 : pbxproj — enregistrer le test (target MeeshyTests)**

4 entrées (UUIDs `RAC1...`/`RAC2...`) pour `ReelFeedAutoplayCoordinatorTests.swift` (groupe `MeeshyTests/Unit/Views`, target **MeeshyTests**).

- [ ] **Step 3 : Build, vérifier l'échec**

Run: `./apps/ios/meeshy.sh build`
Expected: `cannot find 'ReelFeedAutoplayCoordinator' in scope`.

- [ ] **Step 4 : Implémentation minimale**

Créer `apps/ios/Meeshy/Features/Main/Views/ReelFeedAutoplayCoordinator.swift` :

```swift
import SwiftUI
import MeeshySDK

/// Élit le réel le plus centré dans le viewport du feed et expose son id.
/// Source UNIQUE de "quel réel joue". Call-aware : pendant un appel, aucun
/// réel n'est actif (la session audio appartient à l'appel).
@MainActor
final class ReelFeedAutoplayCoordinator: ObservableObject {
    @Published private(set) var activeReelId: String?

    private let isCallActive: () -> Bool

    init(isCallActive: @escaping () -> Bool = { MediaSessionCoordinator.shared.isCallActive }) {
        self.isCallActive = isCallActive
    }

    func update(frames: [ReelFrame], viewportMinY: CGFloat, viewportMaxY: CGFloat) {
        if isCallActive() {
            if activeReelId != nil { activeReelId = nil }
            return
        }
        let next = mostCenteredReel(frames: frames, viewportMinY: viewportMinY, viewportMaxY: viewportMaxY)
        if next != activeReelId { activeReelId = next }
    }

    func clear() {
        if activeReelId != nil { activeReelId = nil }
    }
}
```

- [ ] **Step 5 : pbxproj — enregistrer la source (target Meeshy)**

4 entrées (UUIDs `RAC3...`/`RAC4...`) pour `ReelFeedAutoplayCoordinator.swift` (groupe `Features/Main/Views`, target **Meeshy**).

- [ ] **Step 6 : Build + tests verts**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK, 3 tests `ReelFeedAutoplayCoordinatorTests` verts.

- [ ] **Step 7 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedAutoplayCoordinator.swift \
        apps/ios/MeeshyTests/Unit/Views/ReelFeedAutoplayCoordinatorTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): ReelFeedAutoplayCoordinator (réel centré, call-aware)"
```

---

## Task 3 : PreferenceKey de visibilité (`ReelFeedVisibility.swift`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ReelFeedVisibility.swift`

- [ ] **Step 1 : Implémentation**

Créer `apps/ios/Meeshy/Features/Main/Views/ReelFeedVisibility.swift` :

```swift
import SwiftUI

/// Agrège les frames des cartes réel visibles, remontées au niveau du feed.
struct ReelVisibilityPreferenceKey: PreferenceKey {
    static var defaultValue: [ReelFrame] { [] }
    static func reduce(value: inout [ReelFrame], nextValue: () -> [ReelFrame]) {
        value.append(contentsOf: nextValue())
    }
}

extension View {
    /// Chaque carte réel publie sa frame (espace `.global`) pour que le feed
    /// élise le réel le plus centré. iOS 16-compatible (GeometryReader +
    /// PreferenceKey, pas d'API scroll iOS 17).
    func reportReelFrame(id: String, kind: ReelMediaKind) -> some View {
        background(
            GeometryReader { proxy in
                let f = proxy.frame(in: .global)
                Color.clear.preference(
                    key: ReelVisibilityPreferenceKey.self,
                    value: [ReelFrame(id: id, midY: f.midY, height: f.height, kind: kind)]
                )
            }
        )
    }
}
```

- [ ] **Step 2 : pbxproj — enregistrer la source (target Meeshy)**

4 entrées (UUIDs `RFV3...`/`RFV4...`) pour `ReelFeedVisibility.swift` (groupe `Features/Main/Views`, target **Meeshy**).

- [ ] **Step 3 : Build vert**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedVisibility.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): ReelVisibilityPreferenceKey + reportReelFrame modifier"
```

---

## Task 4 : Fond audio (`ReelAudioBackdrop.swift`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ReelAudioBackdrop.swift`

- [ ] **Step 1 : Implémentation**

Créer `apps/ios/Meeshy/Features/Main/Views/ReelAudioBackdrop.swift` :

```swift
import SwiftUI
import MeeshyUI

/// Fond d'un réel AUDIO dans le feed : dégradé de la couleur d'accent +
/// waveform animée quand le réel est le plus centré. Pas de son dans le feed
/// (le son démarre dans le viewer plein écran au tap).
struct ReelAudioBackdrop: View, Equatable {
    let accentHex: String
    let isActive: Bool

    @State private var phase: CGFloat = 0

    static func == (lhs: ReelAudioBackdrop, rhs: ReelAudioBackdrop) -> Bool {
        lhs.accentHex == rhs.accentHex && lhs.isActive == rhs.isActive
    }

    private let bars = 28

    var body: some View {
        let accent = Color(hex: accentHex)
        ZStack {
            LinearGradient(
                colors: [accent.opacity(0.85), accent.opacity(0.45), accent.opacity(0.85)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            HStack(spacing: 4) {
                ForEach(0..<bars, id: \.self) { i in
                    Capsule()
                        .fill(Color.white.opacity(0.85))
                        .frame(width: 3, height: barHeight(i))
                }
            }
            .frame(maxHeight: 120)
            Image(systemName: "waveform")
                .font(.system(size: 44, weight: .semibold))
                .foregroundColor(.white.opacity(0.25))
        }
        .onAppear { if isActive { startAnimating() } }
        .adaptiveOnChange(of: isActive) { _, active in
            if active { startAnimating() }
        }
    }

    private func barHeight(_ i: CGFloat) -> CGFloat {
        let base: CGFloat = 18
        guard isActive else { return base }
        let amp: CGFloat = 46
        return base + amp * abs(sin(phase + i * 0.5))
    }

    private func barHeight(_ i: Int) -> CGFloat { barHeight(CGFloat(i)) }

    private func startAnimating() {
        withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
            phase = .pi
        }
    }
}
```

- [ ] **Step 2 : pbxproj — enregistrer la source (target Meeshy)**

4 entrées (UUIDs `RAB3...`/`RAB4...`) pour `ReelAudioBackdrop.swift` (groupe `Features/Main/Views`, target **Meeshy**).

- [ ] **Step 3 : Build vert**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK (vérifier `Color(hex:)` résout via `import MeeshyUI`).

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelAudioBackdrop.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): ReelAudioBackdrop (dégradé accent + waveform animé)"
```

---

## Task 5 : Surface vidéo en fond de carte (`ReelFeedVideoSurface`)

But : un réel vidéo joue MUET en fond tant qu'il est actif (le plus centré), via l'unique `SharedAVPlayerManager`. Réutilise le pattern `VideoAvailabilityResolver` de `ReelVideoView` (ReelsPlayerView.swift:363-400). Affiché aspect-fill.

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift` (le sous-composant sera dans ce fichier — créé au Task 6). Pour garder Task 5 atomique, le composant `ReelFeedVideoSurface` est créé dans son propre fichier.
- Create: `apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift`

- [ ] **Step 1 : Implémentation**

Créer `apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift` :

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Joue un réel vidéo MUET en fond de carte tant qu'il est actif (le plus
/// centré). Réutilise l'unique `SharedAVPlayerManager` + `VideoAvailabilityResolver`.
/// Aucun contrôleur : la carte n'expose pas play/pause/scrub (ils vivent dans
/// le viewer plein écran). Aspect-fill via `ReelVideoSurface`.
struct ReelFeedVideoSurface: View {
    let media: FeedMedia
    let isActive: Bool

    @ObservedObject private var manager = SharedAVPlayerManager.shared

    private var attachment: MeeshyMessageAttachment { media.toMessageAttachment() }
    private var isShowingThis: Bool {
        manager.player != nil && manager.activeURL == attachment.fileUrl
    }

    var body: some View {
        VideoAvailabilityResolver(attachment: MessageAttachment(from: attachment), autoDownload: true) { availability, _ in
            ZStack {
                ReelPoster(thumbHash: media.thumbHash, url: media.thumbnailUrl ?? media.url, color: media.thumbnailColor)
                if isActive, availability == .ready, isShowingThis, let player = manager.player {
                    ReelVideoSurface(player: player)
                }
            }
            .onAppear { drive(ready: availability == .ready) }
            .adaptiveOnChange(of: isActive) { _, _ in drive(ready: availability == .ready) }
            .adaptiveOnChange(of: availability == .ready) { _, _ in drive(ready: availability == .ready) }
            .onDisappear { if isShowingThis { manager.pause() } }
        }
    }

    private func drive(ready: Bool) {
        if isActive, ready {
            if manager.activeURL != attachment.fileUrl {
                manager.load(urlString: attachment.fileUrl)
            }
            manager.isMuted = true
            manager.shouldLoop = true
            manager.play()
        } else if isShowingThis {
            manager.pause()
        }
    }
}
```

> **Note d'intégration à vérifier au build** : `ReelPoster`, `ReelVideoSurface` sont définis dans `ReelsPlayerView.swift` (mêmes target). S'ils sont `private`/`fileprivate`, les rendre `internal` (retirer `private`) pour réutilisation, OU dupliquer un mini-poster `Color(hex: media.thumbnailColor)` si la surface SDK `MeeshyVideoSurface` est directement utilisable. Le constructeur `MessageAttachment(from:)` doit exister ; sinon utiliser directement le type attendu par `VideoAvailabilityResolver` (il prend `MessageAttachment` — vérifier le bridge `FeedMedia → MessageAttachment` déjà utilisé par `FeedPostCard+Media.videoMediaView`, et réutiliser exactement ce chemin).

- [ ] **Step 2 : pbxproj — enregistrer la source (target Meeshy)**

4 entrées (UUIDs `RVS3...`/`RVS4...`) pour `ReelFeedVideoSurface.swift`.

- [ ] **Step 3 : Build vert**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK. Si erreurs d'accès (`ReelPoster`/`ReelVideoSurface` private), appliquer la note d'intégration.

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift \
        apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): ReelFeedVideoSurface — lecture muette en fond via SharedAVPlayerManager"
```

---

## Task 6 : La carte (`ReelFeedCard.swift`)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift`

- [ ] **Step 1 : Implémentation**

Créer `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift`. Réutilise les callbacks identiques à `FeedPostCard` (onLike/onComment/onRepost/onBookmark/onShare/onTapPost). Le fond dépend du média : vidéo → `ReelFeedVideoSurface` ; audio → `ReelAudioBackdrop` ; image → `ProgressiveCachedImage` (même composant que `FeedPostCard+Media.imageMediaView`). Overlay bas (scrim + auteur + boutons), logo Réel coin haut-droit.

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Carte Réel plein-cadre du feed : média en fond (aspect-fill, plafond 4:5),
/// auteur + boutons en overlay, logo Réel coin haut-droit sans texte. Autoplay
/// muet quand `isActive`. Tap sur le média → viewer plein écran via `onTapMedia`.
struct ReelFeedCard: View, Equatable {
    let post: FeedPost
    let isActive: Bool
    let isDark: Bool

    // Optimistic state (fourni par FeedView, identique à FeedPostCard)
    let isLiked: Bool
    let displayLikeCount: Int
    let isBookmarked: Bool
    let displayBookmarkCount: Int
    let isReposted: Bool
    let displayRepostCount: Int
    let displayShareCount: Int

    // Callbacks (mêmes signatures que FeedPostCard)
    let onTapMedia: () -> Void
    let onLike: (String) -> Void
    let onComment: (String) -> Void
    let onRepost: (String) -> Void
    let onBookmark: (String) -> Void
    let onShare: (String) -> Void
    let onTapAuthor: (String) -> Void

    static func == (lhs: ReelFeedCard, rhs: ReelFeedCard) -> Bool {
        lhs.post.id == rhs.post.id
            && lhs.isActive == rhs.isActive
            && lhs.isDark == rhs.isDark
            && lhs.isLiked == rhs.isLiked
            && lhs.displayLikeCount == rhs.displayLikeCount
            && lhs.isBookmarked == rhs.isBookmarked
            && lhs.displayBookmarkCount == rhs.displayBookmarkCount
            && lhs.isReposted == rhs.isReposted
            && lhs.displayRepostCount == rhs.displayRepostCount
            && lhs.displayShareCount == rhs.displayShareCount
    }

    private var media: FeedMedia? { post.primaryReelMedia }
    private var accentHex: String { post.authorColor }

    private var kind: ReelMediaKind {
        switch media?.type {
        case .video: return .video
        case .audio: return .audio
        default: return .imageOnly
        }
    }

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let height = reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: width)
            ZStack(alignment: .bottom) {
                background(width: width, height: height)
                bottomOverlay
                reelGlyph
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .onTapGesture { onTapMedia() }
        }
        .frame(height: reelCardHeight(mediaWidth: media?.width, mediaHeight: media?.height, cardWidth: cardWidthEstimate))
        .reportReelFrame(id: post.id, kind: kind)
    }

    // Largeur de contenu du feed (le GeometryReader donne la vraie ; estimation
    // pour fixer la hauteur du conteneur avant mesure).
    private var cardWidthEstimate: CGFloat { UIScreen.main.bounds.width - 32 }

    @ViewBuilder
    private func background(width: CGFloat, height: CGFloat) -> some View {
        switch kind {
        case .video:
            if let media {
                ReelFeedVideoSurface(media: media, isActive: isActive)
                    .frame(width: width, height: height)
                    .clipped()
            }
        case .audio:
            ReelAudioBackdrop(accentHex: accentHex, isActive: isActive)
        case .imageOnly:
            if let url = media?.url {
                ProgressiveCachedImage(url: url, thumbHash: media?.thumbHash)
                    .scaledToFill()
                    .frame(width: width, height: height)
                    .clipped()
            } else {
                Color(hex: accentHex).opacity(0.5)
            }
        }
    }

    private var reelGlyph: some View {
        VStack {
            HStack {
                Spacer()
                Image(systemName: "play.rectangle.on.rectangle.fill")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .padding(8)
                    .background(Circle().fill(.ultraThinMaterial))
                    .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                    .padding(10)
                    .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
            }
            Spacer()
        }
        .accessibilityHidden(true)
    }

    private var bottomOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            Spacer()
            authorRow
            if !post.content.isEmpty {
                Text(post.displayContent)
                    .font(.subheadline)
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
            actionsRow
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.55)],
                startPoint: .top, endPoint: .bottom
            )
        )
    }

    private var authorRow: some View {
        Button { onTapAuthor(post.authorId) } label: {
            HStack(spacing: 8) {
                MeeshyAvatar(name: post.author, imageURL: post.authorAvatarURL, size: 34, accentHex: accentHex)
                Text(post.author)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private var actionsRow: some View {
        HStack(spacing: 0) {
            reelButton(system: isLiked || displayLikeCount > 0 ? "heart.fill" : "heart",
                       tint: isLiked ? MeeshyColors.error : .white,
                       count: displayLikeCount) { onLike(post.id) }
            Spacer()
            reelButton(system: "bubble.right", tint: .white, count: post.commentCount) { onComment(post.id) }
            Spacer()
            reelButton(system: isReposted ? "arrow.2.squarepath.circle.fill" : "arrow.2.squarepath",
                       tint: isReposted ? MeeshyColors.success : .white,
                       count: displayRepostCount) { onRepost(post.id) }
            Spacer()
            reelButton(system: isBookmarked ? "bookmark.fill" : "bookmark",
                       tint: isBookmarked ? MeeshyColors.warning : .white,
                       count: displayBookmarkCount) { onBookmark(post.id) }
            Spacer()
            reelButton(system: "square.and.arrow.up", tint: .white, count: displayShareCount) { onShare(post.id) }
        }
    }

    private func reelButton(system: String, tint: Color, count: Int, action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: system).font(.system(size: 18))
                if count > 0 {
                    Text("\(count)").font(.footnote.weight(.medium))
                }
            }
            .foregroundColor(tint)
            .shadow(color: .black.opacity(0.4), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
    }
}
```

> **Notes d'intégration à valider au build :**
> - `ProgressiveCachedImage` : vérifier sa signature exacte dans `FeedPostCard+Media.imageMediaView` et l'utiliser à l'identique (mêmes paramètres).
> - `MeeshyAvatar` : vérifier la signature réelle du composant avatar utilisé ailleurs (nom des params `name`/`imageURL`/`size`/`accentHex`). Réutiliser le composant avatar existant du projet.
> - Si le double calcul de hauteur (estimation + GeometryReader) cause un saut visuel, fixer la hauteur via la largeur réelle mesurée une seule fois (PreferenceKey de largeur) — sinon l'estimation `UIScreen.main.bounds.width - 32` suffit pour la v1.

- [ ] **Step 2 : pbxproj — enregistrer la source (target Meeshy)**

4 entrées (UUIDs `RFC3...`/`RFC4...`) pour `ReelFeedCard.swift`.

- [ ] **Step 3 : Build vert**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK. Appliquer les notes d'intégration (signatures `ProgressiveCachedImage`/`MeeshyAvatar`) si erreurs.

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): ReelFeedCard — carte Réel plein-cadre (média fond + overlay + logo)"
```

---

## Task 7 : Câblage dans `FeedView` (routage + coordinator)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`

- [ ] **Step 1 : Ajouter le coordinator en `@StateObject`**

Dans `FeedView` (zone des `@StateObject`/`@State`), ajouter :

```swift
@StateObject private var reelAutoplay = ReelFeedAutoplayCoordinator()
```

- [ ] **Step 2 : Router les réels vers `ReelFeedCard` dans `feedPostCardView(for:)`**

Au DÉBUT de `feedPostCardView(for:)` (FeedView.swift:626), avant le `FeedPostCard(...)`, insérer le branchement réel (les callbacks réutilisent les MÊMES handlers que `FeedPostCard` — `togglePostHeart`, `togglePostBookmark`, `togglePostRepost`, `sharePostWithLink`, et l'ouverture du viewer identique au bloc `onTapPost` existant) :

```swift
@ViewBuilder
private func feedPostCardView(for post: FeedPost) -> some View {
    if post.isReel {
        ReelFeedCard(
            post: post,
            isActive: reelAutoplay.activeReelId == post.id,
            isDark: colorScheme == .dark,
            isLiked: postLikedIds.contains(post.id),
            displayLikeCount: max(0, post.likes + (postLikeDelta[post.id] ?? 0)),
            isBookmarked: postBookmarkedIds.contains(post.id),
            displayBookmarkCount: max(0, post.bookmarkCount + (postBookmarkDelta[post.id] ?? 0)),
            isReposted: postRepostedIds.contains(post.id),
            displayRepostCount: max(0, post.repostCount + (postRepostDelta[post.id] ?? 0)),
            displayShareCount: max(0, post.shareCount + (postShareDelta[post.id] ?? 0)),
            onTapMedia: {
                HapticFeedback.medium()
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    ReelsPresenter.shared.present(posts: viewModel.posts, startId: post.id)
                }
                Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
            },
            onLike: { _ in togglePostHeart(post: post) },
            onComment: { _ in expandedComments.insert(post.id) },
            onRepost: { postId in togglePostRepost(postId: postId) },
            onBookmark: { postId in togglePostBookmark(postId: postId) },
            onShare: { postId in sharePostWithLink(postId: postId) },
            onTapAuthor: { authorId in router.push(.profile(authorId)) }
        )
        .equatable()
    } else {
        // ... le corps existant `FeedPostCard(...)` inchangé ...
    }
}
```

> Vérifier la route profil exacte (`router.push(.profile(...))`) telle qu'utilisée ailleurs dans le projet ; sinon réutiliser le mécanisme d'ouverture de profil existant (`selectedProfileUser`).

- [ ] **Step 3 : Brancher la collecte des frames + le pilotage du coordinator**

Sur le conteneur scroll (`feedScrollView`, le `MeeshyRefreshableScroll`/`LazyVStack`), ajouter à l'extérieur un `GeometryReader` qui fournit la frame globale du viewport, et l'`onPreferenceChange` qui pilote le coordinator. Le viewport = la frame globale du conteneur scroll. Exemple (adapter au conteneur réel) :

```swift
private var feedScrollView: some View {
    GeometryReader { viewportProxy in
        let vMinY = viewportProxy.frame(in: .global).minY
        let vMaxY = viewportProxy.frame(in: .global).maxY
        ScrollViewReader { scrollProxy in
            MeeshyRefreshableScroll(/* ... inchangé ... */) {
                LazyVStack(spacing: 16) {
                    /* ... inchangé ... */
                }
            }
        }
        .onPreferenceChange(ReelVisibilityPreferenceKey.self) { frames in
            reelAutoplay.update(frames: frames, viewportMinY: vMinY, viewportMaxY: vMaxY)
        }
    }
}
```

> `onPreferenceChange` est déjà throttlé par SwiftUI (ne fire qu'au changement de valeur). Si churn excessif observé sur device, ajouter une coalescence (Task de suivi). Pour la v1, `onPreferenceChange` direct suffit.

- [ ] **Step 4 : Suspendre l'autoplay quand le viewer s'ouvre**

À l'endroit où `ReelsPresenter.shared.present` est appelé (carte réel `onTapMedia`), le viewer prend la session via son propre usage de `SharedAVPlayerManager`. Pour éviter un conflit, appeler `reelAutoplay.clear()` juste avant `present` afin de stopper la lecture muette du feed :

```swift
onTapMedia: {
    reelAutoplay.clear()
    SharedAVPlayerManager.shared.pause()
    HapticFeedback.medium()
    withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
        ReelsPresenter.shared.present(posts: viewModel.posts, startId: post.id)
    }
    Task { try? await PostService.shared.viewPost(postId: post.id, duration: nil) }
}
```

- [ ] **Step 5 : Build vert + smoke**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK. Lancer l'app (`./apps/ios/meeshy.sh run`), ouvrir le feed : les réels s'affichent en cartes plein-cadre, le réel centré joue muet, le tap ouvre le viewer.

- [ ] **Step 6 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedView.swift
git commit -m "feat(ios): feed — route les réels vers ReelFeedCard + autoplay centré"
```

---

## Task 8 : Retirer le tag « Réel » de `FeedPostCard`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift`

- [ ] **Step 1 : Supprimer l'appel du badge (~ligne 293)**

Retirer l'overlay :

```swift
.overlay(alignment: .topTrailing) {
    if post.isReel { reelBadge }
}
```

(Si l'`.overlay` ne contient QUE ce badge, supprimer tout le bloc `.overlay`.)

- [ ] **Step 2 : Supprimer la propriété `reelBadge` (lignes 79-94)**

Retirer entièrement `private var reelBadge: some View { ... }`.

- [ ] **Step 3 : Build vert**

Run: `./apps/ios/meeshy.sh build`
Expected: build OK (les réels ne passent plus par `FeedPostCard` de toute façon ; on retire le code mort + on garantit zéro tag « Réel »).

- [ ] **Step 4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift
git commit -m "feat(ios): retire le tag « Réel » de FeedPostCard (cartes Réel dédiées)"
```

---

## Task 9 : Vérification end-to-end + suite de tests

- [ ] **Step 1 : Build complet propre**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED, zéro warning nouveau.

- [ ] **Step 2 : Tests unitaires**

Run: `./apps/ios/meeshy.sh test`
Expected: les nouveaux tests (`ReelFeedLayoutTests` 7, `ReelFeedAutoplayCoordinatorTests` 3) verts ; pas de régression (re-run si tests timing flaky connus).

- [ ] **Step 3 : Smoke device/simu**

Run: `./apps/ios/meeshy.sh run`
Vérifier : (a) réels = cartes plein-cadre média + overlay + logo coin haut-droit, AUCUN tag texte « Réel » ; (b) scroll → le réel le plus centré joue muet, les autres en pause ; (c) tap média → viewer plein écran (révélation) ; (d) cœur/commentaire/repartage/sauvegarde/partage + auteur tappables sans ouvrir le viewer ; (e) réel audio = dégradé + waveform ; (f) pendant un appel, aucun autoplay.

- [ ] **Step 4 : Commit final si ajustements**

```bash
git add -A && git commit -m "test(ios): vérification end-to-end cartes Réel feed"
```

---

## Self-review (couverture spec)

- ✅ Carte séparée plein-cadre, média en fond aspect-fill, plafond 4:5 → Task 1 (`reelCardHeight`) + Task 6 (`background`).
- ✅ Overlay auteur + boutons (like/comment/repost/bookmark/share) + tap auteur → Task 6.
- ✅ Logo Réel coin haut-droit sans texte → Task 6 (`reelGlyph`).
- ✅ Réel audio = dégradé accent + waveform → Task 4.
- ✅ Autoplay muet du réel centré, single engine, call-aware, stop hors centre → Task 1 (`mostCenteredReel`) + Task 2 (coordinator) + Task 3 (frames) + Task 5 (`isMuted`) + Task 7 (câblage).
- ✅ Tap → viewer (révélation liquide existante) + handoff (pause feed) → Task 7.
- ✅ Retrait du tag « Réel » → Task 8.
- ✅ Aucun contrôleur de lecture sur la carte → Task 5/6 (pas de play/pause/scrub exposés).
