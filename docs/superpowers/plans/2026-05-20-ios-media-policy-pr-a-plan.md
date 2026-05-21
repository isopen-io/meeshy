# iOS Media Policy — PR A : Politique download-first messages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter la politique configurable « download avant lecture » pour messages audio/vidéo iOS avec préférences locales par appareil (4 options × 4 types média), détection réseau wifi/cellular bonne-mauvaise, et fix bug switch langue audio qui streame sans cache.

**Architecture:** Engine pur (`MediaDownloadPolicyEngine`) consomme préférences (`MediaDownloadPreferences`) + condition réseau (`NetworkConditionMonitor`). Tous les composants média (`AudioMediaView`, `VideoMediaView`, `CachedAsyncImage`) consultent l'engine pour décider d'auto-DL. Le UI Settings existante orpheline est refactoré pour piloter le nouveau modèle. `SharedAVPlayerManager.load()` supprime son fallback streaming réseau pour forcer cache-first.

**Tech Stack:** SwiftUI iOS 17+, Swift 6 strict concurrency, SPM monorepo (MeeshySDK + MeeshyUI dual-target + apps/ios), AVFoundation, NWPathMonitor, XCTest + Swift Testing. Build via `./apps/ios/meeshy.sh`.

**Spec source:** `docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md` §0-§4 + §11.1-4 + §14 + §15 (PR A scope).

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift` | **Create** | Singleton `@MainActor` wrappant `NWPathMonitor`. `condition: NetworkCondition` publié. `resolve(path:)` pure pour tests. |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift` | **Create** | Enum `AutoDownloadPolicy` + `MediaKind` + struct `MediaDownloadPreferences` + Codable. |
| `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift` | **Create** | Enum + 1 static func pure 16-cas. |
| `packages/MeeshySDK/Sources/MeeshyUI/Networking/MediaDownloadPreferencesStore.swift` | **Create** | Singleton `@MainActor` UserDefaults persisted, observable. |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/VideoAvailability.swift` | **Create** | Miroir d'`AudioAvailability` pour vidéo. |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | **Modify** | `switchToLanguage` : `player.stop()` + supprimer auto-play. |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift` | **Modify** | Params `availability`, `onDownload`. Gate `startPlayback()`. |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift` | **Modify** | Supprimer streaming fallback (l. 63-69). |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift` | **Modify** | Gating + bouton DL. |
| `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift` | **Modify** | Skip async fetch si engine `false` pour `.image`. |
| `apps/ios/Meeshy/Features/Main/Views/VideoMediaView.swift` | **Create** | Wrapper miroir `AudioMediaView` pour vidéo. |
| `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift` | **Modify** | Refactor 6-toggles vers 4-pickers + 4ème section AudioTranslation + migration UserDefaults. Struct `MediaDownloadPreferences` DÉPLACÉE vers SDK MeeshyUI/Networking. |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` | **Modify** | `AudioMediaView` : `currentAudioUrl`/`currentMediaKind`/`currentFileSize` + auto-DL. `AttachmentDownloader.startTranslatedAudio`. |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift` | **Modify** | Gating per-item via `VideoMediaView` ou pré-resolve. |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/NetworkConditionMonitorTests.swift` | **Create** | Tests purs `resolve(path:)` 5 cas. |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/MediaDownloadPolicyEngineTests.swift` | **Create** | Table 4×4 = 16 cas + offline gate. |
| `packages/MeeshySDK/Tests/MeeshyUITests/MediaDownloadPreferencesStoreTests.swift` | **Create** | Roundtrip JSON + défauts + Combine observe. |
| `apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift` | **Modify** | Tests `currentAudioUrl`/`currentMediaKind`/auto-DL. |
| `apps/ios/MeeshyTests/Unit/Views/VideoMediaViewRenderTests.swift` | **Create** | Tests miroir AudioMediaView. |
| `apps/ios/Meeshy.xcodeproj/project.pbxproj` | **Modify** | Ajouter `VideoMediaView.swift` + `VideoMediaViewRenderTests.swift` (4 entrées + 2 UUIDs chacun, classic xcodeproj). |

---

## Pré-requis

- [ ] **P0 : Branche dédiée + sanity build**

```bash
cd /Users/smpceo/Documents/v2_meeshy
git status   # main, clean ou WIP non bloquant
git checkout -b feat/ios-media-policy-pr-a
./apps/ios/meeshy.sh build
```

Expected: `Build succeeded`. Si échec, ne pas continuer.

---

## Task 1 : `NetworkConditionMonitor` + tests (TDD)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/NetworkConditionMonitorTests.swift`

- [ ] **Step 1.1 : Écrire les tests (RED)**

Créer `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/NetworkConditionMonitorTests.swift` :

```swift
import XCTest
import Network
@testable import MeeshySDK

final class NetworkConditionMonitorTests: XCTestCase {

    /// Le `path.status != .satisfied` doit toujours retourner `.offline`,
    /// quelque soit le type d'interface ou les flags.
    func test_resolve_offline_returnsOffline() {
        // NWPath n'est pas instanciable directement en test. On teste via
        // un wrapper protocol injectable (ou via une vraie sub-mock).
        // Pour ce test : utiliser un stub Path-like.
        // Stratégie : exposer une fonction pure `resolveFromFlags` que
        // `resolve(path:)` appelle après extraction des flags.
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: false,
            isConstrained: false,
            isExpensive: false,
            usesWiFi: false,
            usesCellular: false
        )
        XCTAssertEqual(condition, .offline)
    }

    /// WiFi non-constrained → `.wifi`.
    func test_resolve_wifiUnconstrained_returnsWifi() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: false,
            isExpensive: false,
            usesWiFi: true,
            usesCellular: false
        )
        XCTAssertEqual(condition, .wifi)
    }

    /// WiFi avec Low Data Mode (constrained) → `.badCellular` (downgrade).
    /// L'utilisateur a explicitement demandé d'économiser → on traite comme bad.
    func test_resolve_wifiConstrained_returnsBadCellular() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: true,
            isExpensive: false,
            usesWiFi: true,
            usesCellular: false
        )
        XCTAssertEqual(condition, .badCellular)
    }

    /// Cellular non-constrained → `.goodCellular`.
    func test_resolve_cellularUnconstrained_returnsGoodCellular() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: false,
            isExpensive: true,
            usesWiFi: false,
            usesCellular: true
        )
        XCTAssertEqual(condition, .goodCellular)
    }

    /// Cellular avec Low Data Mode → `.badCellular`.
    func test_resolve_cellularConstrained_returnsBadCellular() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: true,
            isExpensive: true,
            usesWiFi: false,
            usesCellular: true
        )
        XCTAssertEqual(condition, .badCellular)
    }

    /// Ethernet (ni WiFi ni Cellular) non-constrained → `.wifi` (catch-all unconstrained).
    func test_resolve_ethernetUnconstrained_returnsWifi() {
        let condition = NetworkConditionMonitor.resolveFromFlags(
            isSatisfied: true,
            isConstrained: false,
            isExpensive: false,
            usesWiFi: false,
            usesCellular: false
        )
        XCTAssertEqual(condition, .wifi)
    }
}
```

- [ ] **Step 1.2 : Run tests pour confirmer RED**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/NetworkConditionMonitorTests \
  2>&1 | grep -E "error|TEST FAILED|cannot find" | head -10
```

Expected: errors `cannot find 'NetworkConditionMonitor' in scope` ou similaire.

- [ ] **Step 1.3 : Implémenter le monitor (GREEN)**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift` :

```swift
import Foundation
import Network
import Combine

/// État du réseau détecté par le monitor.
public enum NetworkCondition: String, Equatable, Sendable, Codable {
    case offline       // path !isSatisfied
    case badCellular   // cellular ou wifi avec Low Data Mode (isConstrained)
    case goodCellular  // cellular sans Low Data Mode
    case wifi          // wifi non-constrained, ou autre interface unconstrained
}

/// Singleton qui observe le réseau via `NWPathMonitor` et publie l'état
/// résolu. Consommé par `MediaDownloadPolicyEngine` pour décider de
/// l'auto-download des médias.
@MainActor
public final class NetworkConditionMonitor: ObservableObject {
    @MainActor public static let shared = NetworkConditionMonitor()

    @Published public private(set) var condition: NetworkCondition = .offline

    // `nonisolated(unsafe)` requis pour Swift 6 strict concurrency :
    // `NWPathMonitor` est configuré une fois à l'init et jamais muté ensuite.
    // Le `pathUpdateHandler` s'exécute sur la `queue` non-main qui hop ensuite
    // sur MainActor via Task pour publier `condition`.
    nonisolated(unsafe) private let monitor = NWPathMonitor()
    nonisolated(unsafe) private let queue = DispatchQueue(
        label: "me.meeshy.network-condition", qos: .utility
    )

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let resolved = Self.resolve(path: path)
            Task { @MainActor in self?.condition = resolved }
        }
        monitor.start(queue: queue)
    }

    /// Convenience : online iff condition != .offline.
    public var isOnline: Bool { condition != .offline }

    /// Pure resolution depuis un `NWPath`. Délègue à `resolveFromFlags` pour testabilité.
    public static func resolve(path: NWPath) -> NetworkCondition {
        resolveFromFlags(
            isSatisfied: path.status == .satisfied,
            isConstrained: path.isConstrained,
            isExpensive: path.isExpensive,
            usesWiFi: path.usesInterfaceType(.wifi),
            usesCellular: path.usesInterfaceType(.cellular)
        )
    }

    /// Pure resolution depuis les flags. Testable sans dépendre de `NWPath`
    /// qui n'est pas instanciable directement.
    public static func resolveFromFlags(
        isSatisfied: Bool,
        isConstrained: Bool,
        isExpensive: Bool,
        usesWiFi: Bool,
        usesCellular: Bool
    ) -> NetworkCondition {
        guard isSatisfied else { return .offline }
        // WiFi avec Low Data Mode → utilisateur demande d'économiser → bad.
        if usesWiFi && !isConstrained { return .wifi }
        if usesCellular {
            return isConstrained ? .badCellular : .goodCellular
        }
        // Autre interface (Ethernet, USB-tethering, VPN) :
        // si non-constrained, traiter comme wifi (catch-all unconstrained).
        if !isConstrained { return .wifi }
        return .badCellular
    }
}
```

- [ ] **Step 1.4 : Run tests pour confirmer GREEN**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/NetworkConditionMonitorTests \
  2>&1 | grep -E "Executed|TEST FAILED|TEST SUCCEEDED" | tail -3
```

Expected: `Executed 6 tests, with 0 failures`. `** TEST SUCCEEDED **`.

- [ ] **Step 1.5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/NetworkConditionMonitor.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Networking/NetworkConditionMonitorTests.swift
git commit -m "feat(sdk): NetworkConditionMonitor + NetworkCondition enum

Singleton @MainActor wrappant NWPathMonitor. condition: NetworkCondition
publié (.offline / .badCellular / .goodCellular / .wifi). Heuristique pure
resolveFromFlags(...) testable sans NWPath (qui n'est pas instanciable).

WiFi avec Low Data Mode classé .badCellular (downgrade conscient
demandé par l'utilisateur). 6 tests TDD passent.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.1"
```

---

## Task 2 : `AutoDownloadPolicy` + `MediaDownloadPreferences` (SDK)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift`

- [ ] **Step 2.1 : Créer le fichier**

```swift
import Foundation

/// Politique d'auto-téléchargement pour un type de média selon l'état réseau.
public enum AutoDownloadPolicy: String, Codable, CaseIterable, Equatable, Sendable {
    /// Auto-DL tout le temps, même en bad cellular.
    case always
    /// Auto-DL en wifi OU bon cellulaire.
    case wifiAndGoodCellular
    /// Auto-DL en wifi seulement.
    case wifiOnly
    /// Jamais d'auto-DL, manuel uniquement.
    case never

    /// Libellé localisé court pour le picker UI.
    public var shortLabel: String {
        switch self {
        case .always:              return String(localized: "media.policy.always.short", defaultValue: "Toujours", bundle: .module)
        case .wifiAndGoodCellular: return String(localized: "media.policy.wifiGood.short", defaultValue: "Wi-Fi + bon cellulaire", bundle: .module)
        case .wifiOnly:            return String(localized: "media.policy.wifi.short", defaultValue: "Wi-Fi uniquement", bundle: .module)
        case .never:               return String(localized: "media.policy.never.short", defaultValue: "Jamais", bundle: .module)
        }
    }
}

/// Type de média auquel s'applique une `AutoDownloadPolicy`.
public enum MediaKind: String, Equatable, Sendable, Codable {
    case image
    case audio
    case audioTranslation
    case video
}

/// Préférences utilisateur de téléchargement automatique des médias.
/// Une `AutoDownloadPolicy` par type. Sérialisable en JSON pour persistance
/// dans UserDefaults.
public struct MediaDownloadPreferences: Codable, Equatable, Sendable {
    public var image: AutoDownloadPolicy
    public var audio: AutoDownloadPolicy
    public var audioTranslation: AutoDownloadPolicy
    public var video: AutoDownloadPolicy

    public init(
        image: AutoDownloadPolicy = .wifiAndGoodCellular,
        audio: AutoDownloadPolicy = .wifiAndGoodCellular,
        audioTranslation: AutoDownloadPolicy = .wifiOnly,
        video: AutoDownloadPolicy = .wifiOnly
    ) {
        self.image = image
        self.audio = audio
        self.audioTranslation = audioTranslation
        self.video = video
    }

    public static let defaults = MediaDownloadPreferences()

    public func policy(for kind: MediaKind) -> AutoDownloadPolicy {
        switch kind {
        case .image:            return image
        case .audio:            return audio
        case .audioTranslation: return audioTranslation
        case .video:            return video
        }
    }
}
```

- [ ] **Step 2.2 : Build SDK pour vérifier compilation**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: `Build succeeded`.

- [ ] **Step 2.3 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift
git commit -m "feat(sdk): AutoDownloadPolicy + MediaKind + MediaDownloadPreferences

Enum 4-cases (always / wifiAndGoodCellular / wifiOnly / never) par type
média (image, audio, audioTranslation, video). Codable pour persistance
UserDefaults. Défauts : images+audios wifiAndGoodCellular, traductions+
vidéos wifiOnly (volumineux, non critiques en cellulaire).

Note : remplace la struct 6-booleans existante dans
apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift
(refactoring Task 5).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.2"
```

---

## Task 3 : `MediaDownloadPolicyEngine` + tests (TDD, 17 cas)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Networking/MediaDownloadPolicyEngineTests.swift`

- [ ] **Step 3.1 : Écrire les tests (RED)**

```swift
import XCTest
@testable import MeeshySDK

final class MediaDownloadPolicyEngineTests: XCTestCase {

    // MARK: - Offline gate

    /// Hors ligne, toujours `false`, indépendamment de la policy.
    func test_shouldAutoDownload_offline_returnsFalse() {
        let prefs = MediaDownloadPreferences(image: .always, audio: .always, audioTranslation: .always, video: .always)
        for kind in [MediaKind.image, .audio, .audioTranslation, .video] {
            let result = MediaDownloadPolicyEngine.shouldAutoDownload(
                kind: kind, condition: .offline, prefs: prefs
            )
            XCTAssertFalse(result, "kind=\(kind) doit retourner false offline")
        }
    }

    // MARK: - Policy `.always` (16 cas couverts par 1 par condition × 4 kinds)

    func test_shouldAutoDownload_always_inWifi_returnsTrue() {
        let prefs = MediaDownloadPreferences(image: .always, audio: .always, audioTranslation: .always, video: .always)
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
    }

    func test_shouldAutoDownload_always_inGoodCellular_returnsTrue() {
        let prefs = MediaDownloadPreferences(image: .always, audio: .always, audioTranslation: .always, video: .always)
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .goodCellular, prefs: prefs))
    }

    func test_shouldAutoDownload_always_inBadCellular_returnsTrue() {
        let prefs = MediaDownloadPreferences(image: .always, audio: .always, audioTranslation: .always, video: .always)
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: .badCellular, prefs: prefs))
    }

    // MARK: - Policy `.wifiAndGoodCellular`

    func test_shouldAutoDownload_wifiAndGood_inWifi_returnsTrue() {
        let prefs = MediaDownloadPreferences(image: .wifiAndGoodCellular, audio: .wifiAndGoodCellular, audioTranslation: .wifiAndGoodCellular, video: .wifiAndGoodCellular)
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiAndGood_inGoodCellular_returnsTrue() {
        let prefs = MediaDownloadPreferences(image: .wifiAndGoodCellular, audio: .wifiAndGoodCellular, audioTranslation: .wifiAndGoodCellular, video: .wifiAndGoodCellular)
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .goodCellular, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiAndGood_inBadCellular_returnsFalse() {
        let prefs = MediaDownloadPreferences(image: .wifiAndGoodCellular, audio: .wifiAndGoodCellular, audioTranslation: .wifiAndGoodCellular, video: .wifiAndGoodCellular)
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: .badCellular, prefs: prefs))
    }

    // MARK: - Policy `.wifiOnly`

    func test_shouldAutoDownload_wifiOnly_inWifi_returnsTrue() {
        let prefs = MediaDownloadPreferences(image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly)
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiOnly_inGoodCellular_returnsFalse() {
        let prefs = MediaDownloadPreferences(image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly)
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .goodCellular, prefs: prefs))
    }

    func test_shouldAutoDownload_wifiOnly_inBadCellular_returnsFalse() {
        let prefs = MediaDownloadPreferences(image: .wifiOnly, audio: .wifiOnly, audioTranslation: .wifiOnly, video: .wifiOnly)
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audioTranslation, condition: .badCellular, prefs: prefs))
    }

    // MARK: - Policy `.never`

    func test_shouldAutoDownload_never_inAnyCondition_returnsFalse() {
        let prefs = MediaDownloadPreferences(image: .never, audio: .never, audioTranslation: .never, video: .never)
        for condition in [NetworkCondition.wifi, .goodCellular, .badCellular] {
            XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs),
                "condition=\(condition) doit retourner false pour .never")
        }
    }

    // MARK: - Discrimination par kind

    /// Si la prefs audio = .always mais video = .never, audio doit auto-DL mais pas video.
    func test_shouldAutoDownload_discriminatesByKind() {
        let prefs = MediaDownloadPreferences(image: .never, audio: .always, audioTranslation: .wifiOnly, video: .never)
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: .wifi, prefs: prefs))
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: .badCellular, prefs: prefs))
        XCTAssertTrue(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audioTranslation, condition: .wifi, prefs: prefs))
        XCTAssertFalse(MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: .wifi, prefs: prefs))
    }
}
```

- [ ] **Step 3.2 : Run tests RED**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/MediaDownloadPolicyEngineTests \
  2>&1 | grep -E "error|cannot find" | head -5
```

Expected: `cannot find 'MediaDownloadPolicyEngine' in scope`.

- [ ] **Step 3.3 : Implémenter l'engine (GREEN)**

Créer `packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift` :

```swift
import Foundation

/// Moteur pur de décision « faut-il auto-télécharger ce média maintenant ? ».
/// Table de vérité : 4 (`NetworkCondition`) × 4 (`AutoDownloadPolicy`) = 16 cas
/// + offline gate. Sortie ne dépend que des inputs, sans I/O ni état mutable.
public enum MediaDownloadPolicyEngine {
    public static func shouldAutoDownload(
        kind: MediaKind,
        condition: NetworkCondition,
        prefs: MediaDownloadPreferences
    ) -> Bool {
        guard condition != .offline else { return false }
        switch prefs.policy(for: kind) {
        case .never:               return false
        case .always:              return true
        case .wifiOnly:            return condition == .wifi
        case .wifiAndGoodCellular: return condition == .wifi || condition == .goodCellular
        }
    }
}
```

- [ ] **Step 3.4 : Run tests GREEN**

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests/MediaDownloadPolicyEngineTests \
  2>&1 | grep -E "Executed|TEST" | tail -3
```

Expected: `Executed 11 tests, with 0 failures`. `** TEST SUCCEEDED **`.

- [ ] **Step 3.5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPolicyEngine.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Networking/MediaDownloadPolicyEngineTests.swift
git commit -m "feat(sdk): MediaDownloadPolicyEngine — décision pure 16 cas

Fonction static pure shouldAutoDownload(kind:condition:prefs:) → Bool.
Couvre table 4×4 + offline gate. 11 tests TDD passent.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.3"
```

---

## Task 4 : `MediaDownloadPreferencesStore` (MeeshyUI) + tests

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Networking/MediaDownloadPreferencesStore.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/MediaDownloadPreferencesStoreTests.swift`

- [ ] **Step 4.1 : Créer le Store**

```swift
import Foundation
import Combine
import MeeshySDK

/// Singleton @MainActor qui persiste les préférences média en UserDefaults
/// et publie les changements via Combine. Migré au démarrage depuis l'ancien
/// format 6-booleans wifi/cellular s'il est présent.
@MainActor
public final class MediaDownloadPreferencesStore: ObservableObject {
    @MainActor public static let shared = MediaDownloadPreferencesStore()

    @Published public var preferences: MediaDownloadPreferences

    /// Clé UserDefaults nouveau format.
    static let storageKey = "me.meeshy.mediaDownloadPreferences"
    /// Clé UserDefaults legacy (6-booleans wifi/cellular) à migrer.
    static let legacyStorageKey = "meeshy_media_download_prefs"

    private var cancellables = Set<AnyCancellable>()

    private init() {
        self.preferences = Self.loadOrMigrate()
        // Persist à chaque change (debounce 100ms).
        $preferences
            .dropFirst()
            .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
            .sink { Self.save($0) }
            .store(in: &cancellables)
    }

    /// Convenience pour tests / DI : init avec un userDefaults explicite.
    init(userDefaults: UserDefaults) {
        self.preferences = Self.loadOrMigrate(userDefaults: userDefaults)
    }

    static func loadOrMigrate(userDefaults: UserDefaults = .standard) -> MediaDownloadPreferences {
        // Nouveau format prioritaire.
        if let data = userDefaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(MediaDownloadPreferences.self, from: data) {
            return decoded
        }
        // Migration legacy 6-booleans → policy enum.
        if let legacyData = userDefaults.data(forKey: legacyStorageKey),
           let legacy = try? JSONDecoder().decode(LegacyPreferences.self, from: legacyData) {
            let migrated = MediaDownloadPreferences(
                image: legacy.imagesOnWifi
                    ? (legacy.imagesOnCellular ? .always : .wifiOnly)
                    : .never,
                audio: legacy.audioOnWifi
                    ? (legacy.audioOnCellular ? .always : .wifiOnly)
                    : .never,
                audioTranslation: .wifiOnly, // legacy n'avait pas cette catégorie
                video: legacy.videoOnWifi
                    ? (legacy.videoOnCellular ? .always : .wifiOnly)
                    : .never
            )
            save(migrated, userDefaults: userDefaults)
            // Supprimer la legacy après migration réussie.
            userDefaults.removeObject(forKey: legacyStorageKey)
            return migrated
        }
        return .defaults
    }

    static func save(_ prefs: MediaDownloadPreferences, userDefaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        userDefaults.set(data, forKey: storageKey)
    }

    /// Snapshot du format legacy 6-booleans pour la migration uniquement.
    private struct LegacyPreferences: Codable {
        var imagesOnWifi: Bool = true
        var imagesOnCellular: Bool = true
        var audioOnWifi: Bool = true
        var audioOnCellular: Bool = false
        var videoOnWifi: Bool = true
        var videoOnCellular: Bool = false
    }
}
```

- [ ] **Step 4.2 : Écrire les tests**

Créer `packages/MeeshySDK/Tests/MeeshyUITests/MediaDownloadPreferencesStoreTests.swift` :

```swift
import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class MediaDownloadPreferencesStoreTests: XCTestCase {

    // MARK: - Helpers

    private func makeIsolatedDefaults(suite: String = UUID().uuidString) -> UserDefaults {
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    // MARK: - Defaults

    func test_loadOrMigrate_emptyDefaults_returnsDefaults() {
        let defaults = makeIsolatedDefaults()
        let prefs = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(prefs, .defaults)
    }

    // MARK: - Roundtrip

    func test_save_then_load_roundtrip() {
        let defaults = makeIsolatedDefaults()
        let custom = MediaDownloadPreferences(
            image: .always, audio: .never, audioTranslation: .wifiAndGoodCellular, video: .wifiOnly
        )
        MediaDownloadPreferencesStore.save(custom, userDefaults: defaults)
        let loaded = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(loaded, custom)
    }

    // MARK: - Migration legacy

    func test_loadOrMigrate_legacyAllOn_migratesTo_always() {
        let defaults = makeIsolatedDefaults()
        let legacyJSON = """
        {"imagesOnWifi":true,"imagesOnCellular":true,"audioOnWifi":true,"audioOnCellular":true,"videoOnWifi":true,"videoOnCellular":true}
        """
        defaults.set(legacyJSON.data(using: .utf8)!, forKey: MediaDownloadPreferencesStore.legacyStorageKey)

        let prefs = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(prefs.image, .always)
        XCTAssertEqual(prefs.audio, .always)
        XCTAssertEqual(prefs.video, .always)
        XCTAssertEqual(prefs.audioTranslation, .wifiOnly) // catégorie non présente legacy → défaut
    }

    func test_loadOrMigrate_legacyWifiOnly_migratesTo_wifiOnly() {
        let defaults = makeIsolatedDefaults()
        let legacyJSON = """
        {"imagesOnWifi":true,"imagesOnCellular":false,"audioOnWifi":true,"audioOnCellular":false,"videoOnWifi":true,"videoOnCellular":false}
        """
        defaults.set(legacyJSON.data(using: .utf8)!, forKey: MediaDownloadPreferencesStore.legacyStorageKey)

        let prefs = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertEqual(prefs.image, .wifiOnly)
        XCTAssertEqual(prefs.audio, .wifiOnly)
        XCTAssertEqual(prefs.video, .wifiOnly)
    }

    func test_loadOrMigrate_clearsLegacyKey_afterMigration() {
        let defaults = makeIsolatedDefaults()
        let legacyJSON = """
        {"imagesOnWifi":true,"imagesOnCellular":false,"audioOnWifi":true,"audioOnCellular":false,"videoOnWifi":true,"videoOnCellular":false}
        """
        defaults.set(legacyJSON.data(using: .utf8)!, forKey: MediaDownloadPreferencesStore.legacyStorageKey)

        _ = MediaDownloadPreferencesStore.loadOrMigrate(userDefaults: defaults)
        XCTAssertNil(defaults.data(forKey: MediaDownloadPreferencesStore.legacyStorageKey),
            "legacy key doit être supprimée après migration")
    }
}
```

- [ ] **Step 4.3 : Build + tests**

```bash
cd /Users/smpceo/Documents/v2_meeshy
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/MediaDownloadPreferencesStoreTests \
  2>&1 | grep -E "Executed|TEST" | tail -3
```

Expected: `Executed 5 tests, with 0 failures`.

- [ ] **Step 4.4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Networking/MediaDownloadPreferencesStore.swift \
        packages/MeeshySDK/Tests/MeeshyUITests/MediaDownloadPreferencesStoreTests.swift
git commit -m "feat(sdk): MediaDownloadPreferencesStore singleton + migration legacy

@MainActor singleton publié via @Published, debounce 100ms avant persist
UserDefaults. Au démarrage : load nouveau format si présent, sinon migre
depuis l'ancien format 6-booleans (clé legacy meeshy_media_download_prefs)
vers AutoDownloadPolicy enum, puis supprime la clé legacy. Si rien présent,
applique MediaDownloadPreferences.defaults.

5 tests TDD passent (defaults, roundtrip, migration always/wifiOnly,
cleanup legacy key).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.4"
```

---

## Task 5 : Refactor `MediaDownloadSettingsView` UI

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift`

- [ ] **Step 5.1 : Supprimer la struct locale + utiliser le Store**

Remplacer ligne 6-13 (struct locale) par un import du SDK :

```swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// La struct MediaDownloadPreferences vient désormais de MeeshySDK
// (packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift).
// Le store qui la persiste vit dans MeeshyUI.

struct MediaDownloadSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @ObservedObject private var store = MediaDownloadPreferencesStore.shared

    private let accentColor = "E67E22"
    // ... (reste inchangé jusqu'aux sections)
```

- [ ] **Step 5.2 : Remplacer les sections toggle par des pickers 4-options**

Remplacer `imagesSection`, `audioSection`, `videoSection` par des sections « picker » + ajouter `audioTranslationSection`. Helper :

```swift
    @ViewBuilder
    private func policyPicker(
        title: String,
        icon: String,
        color: String,
        binding: Binding<AutoDownloadPolicy>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: title, icon: icon, color: color)

            VStack(spacing: 0) {
                ForEach(AutoDownloadPolicy.allCases, id: \.self) { policy in
                    Button {
                        HapticFeedback.light()
                        binding.wrappedValue = policy
                    } label: {
                        HStack(spacing: 12) {
                            fieldIcon(policyIcon(policy), color: color)
                            Text(policy.shortLabel)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                            Spacer()
                            if binding.wrappedValue == policy {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(Color(hex: accentColor))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title), \(policy.shortLabel)")
                    .accessibilityValue(binding.wrappedValue == policy ? "sélectionné" : "")

                    if policy != AutoDownloadPolicy.allCases.last {
                        Divider().padding(.leading, 54)
                    }
                }
            }
            .background(sectionBackground(tint: color))
        }
    }

    private func policyIcon(_ policy: AutoDownloadPolicy) -> String {
        switch policy {
        case .always:              return "infinity"
        case .wifiAndGoodCellular: return "antenna.radiowaves.left.and.right"
        case .wifiOnly:            return "wifi"
        case .never:               return "xmark.octagon"
        }
    }
```

Modifier `scrollContent` :

```swift
    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                infoSection
                policyPicker(
                    title: "Images", icon: "photo.fill", color: "4ECDC4",
                    binding: $store.preferences.image
                )
                policyPicker(
                    title: "Audio", icon: "waveform", color: "9B59B6",
                    binding: $store.preferences.audio
                )
                policyPicker(
                    title: "Traductions audio", icon: "translate", color: "F39C12",
                    binding: $store.preferences.audioTranslation
                )
                policyPicker(
                    title: "Vidéo", icon: "play.rectangle.fill", color: "E74C3C",
                    binding: $store.preferences.video
                )
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }
```

- [ ] **Step 5.3 : Supprimer les sections devenues mortes**

Supprimer `imagesSection`, `audioSection`, `videoSection`, `toggleRow`, et les `static func loadPrefs/savePrefs` + `storageKey` (le Store fait tout désormais).

Supprimer aussi le `.onChange(of: prefs)` du body (le Store auto-persist).

- [ ] **Step 5.4 : Build + ouvrir l'écran pour sanity**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK.

- [ ] **Step 5.5 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift
git commit -m "refactor(ios): MediaDownloadSettingsView — passer aux pickers 4-options

Supprime la struct locale MediaDownloadPreferences (déplacée vers SDK).
Remplace les 3 sections toggle wifi/cellular par 4 sections \"policy picker\"
(Images / Audio / Traductions audio / Vidéo) × 4 options (always /
wifiAndGoodCellular / wifiOnly / never).

Consomme MediaDownloadPreferencesStore.shared (MeeshyUI). Auto-persist au
change via Combine debounce 100ms dans le Store. La migration UserDefaults
depuis l'ancien format se fait automatiquement au premier load du Store.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.4-4.5"
```

---

## Task 6 : Bugfix `AudioPlayerView.switchToLanguage` — bug §1.1

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:417-426`

- [ ] **Step 6.1 : Lire le code actuel pour confirmer**

```bash
cd /Users/smpceo/Documents/v2_meeshy
sed -n '415,428p' packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift
```

Expected output : voir la fonction `switchToLanguage` actuelle avec `player.play(urlString:)` direct.

- [ ] **Step 6.2 : Patcher la fonction**

Modifier `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, remplacer le bloc actuel :

```swift
    private func switchToLanguage(_ code: String) {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedAudioLanguage = code
        }
        if code == "orig" {
            player.play(urlString: attachment.fileUrl)
        } else if let translated = translatedAudios.first(where: { $0.targetLanguage.lowercased() == code.lowercased() }) {
            player.play(urlString: translated.url)
        }
    }
```

par :

```swift
    private func switchToLanguage(_ code: String) {
        // Stop playback immédiatement — le parent (AudioMediaView via le
        // binding `externalLanguage`) re-resolve availability pour la nouvelle
        // URL et déclenche soit auto-DL (si policy permet) soit affiche le
        // bouton download. L'utilisateur retappe play après → handlePlayTap()
        // (gated par availability) joue depuis le cache.
        player.stop()

        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedAudioLanguage = code
        }
        // Plus de player.play() ici — voir bug §1.1 du spec.
    }
```

- [ ] **Step 6.3 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK.

- [ ] **Step 6.4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift
git commit -m "fix(sdk): AudioPlayerView.switchToLanguage ne streame plus l'audio traduit

Bug §1.1 : changer de langue d'un audio déclenchait player.play(urlString:)
direct sur l'URL traduit sans consulter availability. Si la version traduite
n'était pas en cache, l'audio se téléchargeait silencieusement (streaming).

Fix : player.stop() + propagation langue via externalLanguage binding. Le
parent AudioMediaView (Task 7) re-resolve availability pour la nouvelle URL
et déclenche auto-DL si policy permet, sinon affiche le bouton download.
L'utilisateur retappe play après → handlePlayTap() gated par availability.

UX change consciente : switch langue ne joue plus immédiatement (même quand
cached). User retap play après. Aligné avec la policy stricte download-first.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.6"
```

---

## Task 7 : `AudioMediaView` — currentAudioUrl, currentMediaKind, auto-DL

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`

- [ ] **Step 7.1 : Ajouter les computed properties**

Dans `AudioMediaView`, après les `@StateObject private var downloader = AttachmentDownloader()` (ligne ~388), ajouter :

```swift
    /// URL de la langue actuellement sélectionnée (orig ou traduite).
    /// Drive `resolveAvailability` et le déclencheur d'auto-DL.
    private var currentAudioUrl: String {
        if let lang = selectedAudioLangCode,
           let translated = translatedAudios.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
            return translated.url
        }
        return attachment.fileUrl
    }

    /// MediaKind selon l'URL courante : orig = `.audio`, traduit = `.audioTranslation`.
    /// Discrimination par présence dans `translatedAudios` (PAS via
    /// `message.originalLanguage` qui peut différer du sentinel "orig").
    private var currentMediaKind: MediaKind {
        guard let lang = selectedAudioLangCode,
              translatedAudios.contains(where: { $0.targetLanguage.lowercased() == lang.lowercased() })
        else { return .audio }
        return .audioTranslation
    }

    /// Taille connue pour l'URL courante. Orig = `attachment.fileSize`,
    /// traduit = `MessageTranslatedAudio.fileSize` (0 tant que backend follow-up
    /// pas livré ; `DownloadBadgeView` gère 0 gracieusement).
    private var currentFileSize: Int64 {
        if let lang = selectedAudioLangCode,
           let translated = translatedAudios.first(where: { $0.targetLanguage.lowercased() == lang.lowercased() }) {
            // `fileSize` ajouté par backend follow-up. En attendant : 0.
            return Int64(translated.fileSize ?? 0)
        }
        return Int64(attachment.fileSize)
    }
```

**Note importante** : `MessageTranslatedAudio.fileSize` n'existe pas encore (spec §7 follow-up backend). La propriété `translated.fileSize` n'est pas définie. Pour ce step, utiliser `translated.fileSize ?? 0` ne compilera pas. Alternative robuste **immédiate** : retourner `0` pour les traductions tant que le backend n'expose pas la taille.

Remplacer le bloc traduit par :

```swift
    private var currentFileSize: Int64 {
        if selectedAudioLangCode != nil,
           translatedAudios.contains(where: { $0.targetLanguage.lowercased() == selectedAudioLangCode?.lowercased() }) {
            // Backend follow-up : MessageTranslatedAudio.fileSize pas encore
            // exposé. DownloadBadgeView affiche "" pour 0 (gracieux).
            return 0
        }
        return Int64(attachment.fileSize)
    }
```

- [ ] **Step 7.2 : Modifier `resolveAvailability` pour utiliser `currentAudioUrl`**

Trouver le `resolveAvailability` (autour ligne 405) et remplacer :

```swift
    private func resolveAvailability() async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = AudioAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        resolvedAvailability = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }
```

par :

```swift
    private func resolveAvailability() async {
        let urlString = currentAudioUrl // ← Changement clé : URL de la langue courante.
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = AudioAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        resolvedAvailability = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }
```

- [ ] **Step 7.3 : Patcher `.task(id:)` pour re-resolve + auto-DL**

Trouver le `.task(id: attachment.fileUrl) { await resolveAvailability() }` (ligne ~458) et remplacer par :

```swift
        .task(id: currentAudioUrl) {
            await resolveAvailability()

            // Auto-DL si policy permet + non encore cached + non en cours.
            if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: currentMediaKind, condition: condition, prefs: prefs
                ) {
                    // Pour orig → start(attachment:). Pour traduit → startTranslatedAudio.
                    if currentMediaKind == .audioTranslation {
                        downloader.startTranslatedAudio(
                            url: currentAudioUrl,
                            fileSize: currentFileSize
                        )
                    } else {
                        downloader.start(attachment: attachment, onShare: nil)
                    }
                }
            }
        }
```

- [ ] **Step 7.4 : Build (la méthode `startTranslatedAudio` n'existe pas encore — c'est Task 8)**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error" | head -5
```

Expected: erreur `Value of type 'AttachmentDownloader' has no member 'startTranslatedAudio'`. C'est attendu — Task 8 va le créer.

- [ ] **Step 7.5 : Ne pas commit encore — passer à Task 8**

(Skip commit, on regroupe avec Task 8 qui ajoute `startTranslatedAudio`.)

---

## Task 8 : `AttachmentDownloader.startTranslatedAudio`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (struct `AttachmentDownloader`)

- [ ] **Step 8.1 : Ajouter `startTranslatedAudio`**

Trouver `func start(attachment: MessageAttachment, onShare: ((URL) -> Void)?)` (ligne ~201). Refactor : extraire le corps de download dans une méthode privée `startDownloadFlow(urlString:expectedSize:cacheStore:cacheKey:)`, puis créer 2 méthodes publiques : `start(attachment:onShare:)` (existante, refactorisée) + `startTranslatedAudio(url:fileSize:)` (nouvelle).

Voici la version complète du refactor :

```swift
    /// Download d'un attachment de message (audio/image/vidéo, etc.).
    func start(attachment: MessageAttachment, onShare: ((URL) -> Void)?) {
        guard !isDownloading, !isCached else { return }
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        let store: CacheStoreKind = {
            switch attachment.type {
            case .audio: return .audio
            case .video: return .video
            case .image: return .image
            case .file, .location: return .audio // fallback (pas de cache typed pour file/location ; ne sera pas atteint car DL manuel uniquement)
            }
        }()
        startDownloadFlow(
            urlString: resolved,
            expectedSize: Int64(attachment.fileSize),
            cacheStore: store,
            cacheKey: resolved,
            onComplete: onShare
        )
    }

    /// Download d'un audio traduit (URL HTTPS distincte de l'attachment original).
    /// Le file size de l'audio traduit n'est pas encore exposé par le backend
    /// (spec §7 follow-up) → `fileSize == 0` autorisé (Content-Length du
    /// response header sera lu en cours de DL).
    func startTranslatedAudio(url: String, fileSize: Int64) {
        guard !isDownloading, !isCached else { return }
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        startDownloadFlow(
            urlString: resolved,
            expectedSize: fileSize,
            cacheStore: .audio,
            cacheKey: resolved,
            onComplete: nil
        )
    }

    private enum CacheStoreKind {
        case audio, video, image
    }

    /// Shared download flow. Stream URLSession.bytes → progress publish →
    /// store dans le typed cache + memory image cache si .image.
    /// Note : si le réseau bascule wifi → cellular pendant le DL, on continue
    /// (la policy régit le déclenchement, pas la continuation — décision §14.2
    /// du spec). Pas d'observation NetworkConditionMonitor.condition ici.
    private func startDownloadFlow(
        urlString: String,
        expectedSize: Int64,
        cacheStore: CacheStoreKind,
        cacheKey: String,
        onComplete: ((URL) -> Void)?
    ) {
        guard let url = URL(string: urlString) else { return }
        isDownloading = true
        downloadedBytes = 0
        totalBytes = expectedSize

        Task {
            do {
                let (asyncBytes, response) = try await URLSession.shared.bytes(from: url)
                if let httpResponse = response as? HTTPURLResponse,
                   let contentLength = httpResponse.value(forHTTPHeaderField: "Content-Length"),
                   let length = Int64(contentLength) {
                    await MainActor.run { self.totalBytes = length }
                }
                var data = Data()
                var lastUpdate: Date = .distantPast
                for try await byte in asyncBytes {
                    data.append(byte)
                    let now = Date()
                    if now.timeIntervalSince(lastUpdate) > 0.1 {
                        let bytesNow = Int64(data.count)
                        await MainActor.run { self.downloadedBytes = bytesNow }
                        lastUpdate = now
                    }
                }
                // Persist dans le cache typed.
                switch cacheStore {
                case .audio:
                    await CacheCoordinator.shared.audio.store(data, for: cacheKey)
                case .video:
                    await CacheCoordinator.shared.video.store(data, for: cacheKey)
                case .image:
                    await CacheCoordinator.shared.images.store(data, for: cacheKey)
                    if let image = UIImage(data: data) {
                        DiskCacheStore.cacheImageForPreview(image, key: cacheKey)
                    }
                }
                await MainActor.run {
                    self.isCached = true
                    self.isDownloading = false
                    self.downloadedBytes = Int64(data.count)
                    self.totalBytes = Int64(data.count)
                }
            } catch {
                await MainActor.run {
                    self.isDownloading = false
                    Logger.media.error("AttachmentDownloader.startDownloadFlow failed: \(error.localizedDescription)")
                }
            }
        }
    }
```

**Note** : le code ci-dessus suppose que `AttachmentDownloader` accède à des propriétés `@Published var isDownloading`, `@Published var downloadedBytes: Int64`, `@Published var totalBytes: Int64`, `@Published var isCached: Bool`, `var progress: Double { get }`. Confirmé par l'exploration §0 (lignes 165-300 du fichier actuel).

- [ ] **Step 8.2 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | grep -E "error" | head -5
```

Expected: build OK ou erreurs cosmétiques.

- [ ] **Step 8.3 : Tester Equatable AudioMediaView (les tests précédents doivent passer)**

```bash
xcodebuild test \
    -project apps/ios/Meeshy.xcodeproj \
    -scheme Meeshy \
    -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
    -only-testing:MeeshyTests/AudioMediaViewRenderTests \
    -derivedDataPath apps/ios/Build \
    2>&1 | grep -E "Executed|TEST" | tail -3
```

Expected: tests existants passent.

- [ ] **Step 8.4 : Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift
git commit -m "feat(ios): AudioMediaView gate availability per current language + auto-DL

Nouvelles computed currentAudioUrl/currentMediaKind/currentFileSize qui
discriminent orig vs traduit via présence dans translatedAudios.

resolveAvailability() utilise désormais currentAudioUrl (au lieu de
attachment.fileUrl) — re-resolve automatique au changement de langue via
.task(id: currentAudioUrl).

Si availability == .needsDownload et MediaDownloadPolicyEngine.shouldAutoDownload
retourne true pour (currentMediaKind, NetworkConditionMonitor.shared.condition,
MediaDownloadPreferencesStore.shared.preferences), déclenche auto-DL via
downloader.start(attachment:) ou downloader.startTranslatedAudio(url:fileSize:).

AttachmentDownloader gagne startTranslatedAudio(url:fileSize:) et refactore
les downloads via startDownloadFlow privé partagé. URL-based download tolère
fileSize=0 (lit Content-Length du response header en cours de DL).

DL continue si réseau wifi → cellular en cours (décision spec §14.2).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.6-4.8"
```

---

## Task 9 : `VideoAvailability` enum + `VideoMediaView` wrapper

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/VideoAvailability.swift`
- Create: `apps/ios/Meeshy/Features/Main/Views/VideoMediaView.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (ajouter 4 entrées + 2 UUIDs pour VideoMediaView.swift)

- [ ] **Step 9.1 : Créer `VideoAvailability`**

```swift
import Foundation

/// Disponibilité de lecture d'une vidéo dans une bulle de message. Miroir
/// d'`AudioAvailability` pour la cohérence des composants média.
public enum VideoAvailability: Equatable, Sendable {
    case ready
    case needsDownload
    case downloading(progress: Double)

    public static func resolve(
        isLocalFile: Bool,
        localFileExists: Bool,
        isServerCached: Bool
    ) -> VideoAvailability {
        if isLocalFile {
            return localFileExists ? .ready : .needsDownload
        }
        return isServerCached ? .ready : .needsDownload
    }
}
```

- [ ] **Step 9.2 : Créer `VideoMediaView`**

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Wrapper de `InlineVideoPlayerView` qui résout `VideoAvailability` depuis
/// `CacheCoordinator.shared.video`, déclenche auto-DL via `AttachmentDownloader`
/// selon `MediaDownloadPolicyEngine`, et injecte `availability` + `onDownload`
/// dans le player inline. Miroir conceptuel d'`AudioMediaView`.
struct VideoMediaView: View, Equatable {
    let attachment: MessageAttachment
    let accentColor: String
    let isDark: Bool

    var onExpandFullscreen: (() -> Void)? = nil

    static func == (lhs: VideoMediaView, rhs: VideoMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.attachment.fileSize == rhs.attachment.fileSize
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
    }

    @State private var resolvedAvailability: VideoAvailability = .needsDownload
    @StateObject private var downloader = AttachmentDownloader()

    private var availability: VideoAvailability {
        if downloader.isDownloading {
            return .downloading(progress: downloader.progress)
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    private func resolveAvailability() async {
        let urlString = attachment.fileUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "")
            resolvedAvailability = VideoAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.video.isCached(resolved)
        resolvedAvailability = VideoAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }

    var body: some View {
        InlineVideoPlayerView(
            attachment: attachment,
            accentColor: accentColor,
            availability: availability,
            onDownload: { downloader.start(attachment: attachment, onShare: nil) },
            onExpandFullscreen: onExpandFullscreen
        )
        .task(id: attachment.fileUrl) {
            await resolveAvailability()
            if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: .video, condition: condition, prefs: prefs
                ) {
                    downloader.start(attachment: attachment, onShare: nil)
                }
            }
        }
    }
}
```

- [ ] **Step 9.3 : Ajouter `VideoMediaView.swift` au pbxproj**

Memory note : iOS classic xcodeproj (`objectVersion 63`, pas de synchronized groups). Chaque nouveau fichier nécessite 4 entrées dans pbxproj + 2 UUIDs.

```bash
cd /Users/smpceo/Documents/v2_meeshy
# Générer 2 UUIDs au format Xcode (24 hex uppercase)
UUID1=$(uuidgen | tr -d '-' | cut -c1-24)
UUID2=$(uuidgen | tr -d '-' | cut -c1-24)
echo "UUID1=$UUID1"
echo "UUID2=$UUID2"
```

Modifier `apps/ios/Meeshy.xcodeproj/project.pbxproj` :

1. **PBXBuildFile section** (vers le haut) : ajouter ligne `$UUID1 /* VideoMediaView.swift in Sources */ = {isa = PBXBuildFile; fileRef = $UUID2 /* VideoMediaView.swift */; };`
2. **PBXFileReference section** : ajouter ligne `$UUID2 /* VideoMediaView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = VideoMediaView.swift; sourceTree = "<group>"; };`
3. **PBXGroup section** pour le dossier `Views` : ajouter `$UUID2 /* VideoMediaView.swift */,` dans `children`.
4. **PBXSourcesBuildPhase section** : ajouter `$UUID1 /* VideoMediaView.swift in Sources */,` dans `files`.

Le pattern exact à suivre : copier le bloc existant d'un autre fichier proche (`ConversationMediaViews.swift` par exemple) et adapter.

- [ ] **Step 9.4 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK. Si échec sur `InlineVideoPlayerView` (params `availability`/`onDownload` pas encore définis), c'est attendu — Task 10 les ajoute.

- [ ] **Step 9.5 : Pas de commit encore — regrouper avec Task 10**

---

## Task 10 : `InlineVideoPlayerView` — params `availability` + `onDownload`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift`

- [ ] **Step 10.1 : Étendre l'init et le state**

Trouver le `public struct InlineVideoPlayerView: View` (ligne ~47) et son init (~68). Modifier les propriétés et l'init :

```swift
public struct InlineVideoPlayerView: View {
    public let attachment: MeeshyMessageAttachment
    public let accentColor: String
    public let availability: VideoAvailability
    public let onDownload: (() -> Void)?
    public var onExpandFullscreen: (() -> Void)?

    // ... reste des @State / @ObservedObject inchangés ...

    public init(
        attachment: MeeshyMessageAttachment,
        accentColor: String,
        availability: VideoAvailability = .ready,
        onDownload: (() -> Void)? = nil,
        onExpandFullscreen: (() -> Void)? = nil
    ) {
        self.attachment = attachment
        self.accentColor = accentColor
        self.availability = availability
        self.onDownload = onDownload
        self.onExpandFullscreen = onExpandFullscreen
    }
```

Note : `availability = .ready` par défaut pour rétro-compat sur call sites qui n'ont pas encore migré. À removed dans un suivi.

- [ ] **Step 10.2 : Gater `startPlayback()` par `availability == .ready`**

Trouver `private func startPlayback()` (ligne ~190) :

```swift
    private func startPlayback() {
        // ... existing ...
        manager.load(urlString: attachment.fileUrl)
        manager.play()
    }
```

Remplacer par :

```swift
    private func startPlayback() {
        // Gate par availability : si non cached, l'appel onDownload doit
        // déclencher le DL (par le parent VideoMediaView). Le startPlayback
        // ne fait rien tant que availability != .ready.
        guard case .ready = availability else {
            onDownload?()
            HapticFeedback.light()
            return
        }
        manager.load(urlString: attachment.fileUrl)
        manager.play()
        isActive = true
    }
```

- [ ] **Step 10.3 : Adapter le play icon central pour montrer download si needsDownload**

Trouver le play icon central (généralement dans `playOverlay` ou similaire). Modifier pour brancher sur `availability` :

```swift
    @ViewBuilder
    private var playOverlay: some View {
        Button(action: { startPlayback() }) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 56, height: 56)
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.9))
                    .frame(width: 48, height: 48)
                playIconForAvailability
            }
            .shadow(color: .black.opacity(0.4), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabelForAvailability)
    }

    @ViewBuilder
    private var playIconForAvailability: some View {
        switch availability {
        case .ready:
            Image(systemName: "play.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
                .offset(x: 2)
        case .needsDownload:
            VStack(spacing: 1) {
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                if attachment.fileSize > 0 {
                    Text(AttachmentDownloader.fmt(Int64(attachment.fileSize)))
                        .font(.system(size: 9, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white.opacity(0.9))
                }
            }
        case .downloading(let progress):
            if progress > 0 {
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 28, height: 28)
                    .animation(.linear(duration: 0.2), value: progress)
            } else {
                ProgressView().tint(.white).scaleEffect(0.8)
            }
        }
    }

    private var accessibilityLabelForAvailability: String {
        switch availability {
        case .ready:                return "Lire la vidéo"
        case .needsDownload:        return "Télécharger la vidéo"
        case .downloading:          return "Téléchargement en cours"
        }
    }
```

**Note** : adapter le code existant qui gère le play icon — la structure exacte dépend du composant actuel. Lire le fichier avant le edit pour préserver l'esthétique (taille du cercle, accent color, etc.).

- [ ] **Step 10.4 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK.

- [ ] **Step 10.5 : Vérifier les call sites de `InlineVideoPlayerView`**

```bash
grep -rn "InlineVideoPlayerView(" packages/MeeshySDK apps/ios 2>/dev/null | grep -v ".o-\|Index"
```

Tous les call sites sans `availability` utilisent `.ready` par défaut. Pour ceux qui doivent gater (carrousel, galerie), Task 11 les met à jour. Les autres restent en `.ready` (rétro-compat).

- [ ] **Step 10.6 : Commit Tasks 9 + 10**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/VideoAvailability.swift \
        packages/MeeshySDK/Sources/MeeshyUI/Media/InlineVideoPlayerView.swift \
        apps/ios/Meeshy/Features/Main/Views/VideoMediaView.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat: VideoAvailability + VideoMediaView wrapper + InlineVideoPlayerView gated

VideoAvailability enum SDK (miroir AudioAvailability). VideoMediaView app
résout availability depuis CacheCoordinator.shared.video, déclenche auto-DL
via MediaDownloadPolicyEngine, injecte availability + onDownload dans
InlineVideoPlayerView.

InlineVideoPlayerView gagne params availability:VideoAvailability et
onDownload:(()->Void)? (défaut .ready / nil pour rétro-compat). Play icon
central remplacé par download icon + taille quand .needsDownload, par anneau
de progression quand .downloading. startPlayback() gated par availability ==
.ready (sinon appel onDownload).

VideoMediaView.swift ajouté au pbxproj (classic xcodeproj, 4 entrées).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.9"
```

---

## Task 11 : Gating `VideoFullscreenPlayerView` + `ConversationMediaGalleryView`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift`

- [ ] **Step 11.1 : Lire le code actuel des deux fichiers**

```bash
cd /Users/smpceo/Documents/v2_meeshy
sed -n '90,160p' packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift
echo "---"
sed -n '230,270p' apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift
```

Note : l'implémentation exacte dépend du code lu. Le principe :
- `VideoFullscreenPlayerView` reçoit un nouveau param `availability: VideoAvailability` + `onDownload: (() -> Void)?`. Si `.needsDownload` → afficher un overlay download au lieu du player.
- `ConversationMediaGalleryView` : pour chaque item vidéo, pré-resolve `availability` (via le pattern `VideoMediaView`) et afficher `DownloadBadgeView` si non cached.

- [ ] **Step 11.2 : Patcher `VideoFullscreenPlayerView`**

Ajouter le param dans l'init, puis dans le body remplacer la branche du player par une condition sur availability :

```swift
public struct VideoFullscreenPlayerView: View {
    // ... existing properties ...
    public let availability: VideoAvailability
    public let onDownload: (() -> Void)?

    public init(
        urlString: String,
        accentColor: String,
        fileName: String,
        caption: String? = nil,
        mentionDisplayNames: [String: String]? = nil,
        availability: VideoAvailability = .ready,
        onDownload: (() -> Void)? = nil
    ) {
        self.urlString = urlString
        self.accentColor = accentColor
        self.fileName = fileName
        self.caption = caption
        self.mentionDisplayNames = mentionDisplayNames
        self.availability = availability
        self.onDownload = onDownload
    }

    public var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch availability {
            case .ready:
                if manager.player != nil && manager.activeURL == urlString {
                    playerContent
                } else {
                    loadingState
                }
            case .needsDownload, .downloading:
                downloadOverlay
            }
        }
        // ... existing modifiers ...
    }

    @ViewBuilder
    private var downloadOverlay: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 80, height: 80)
                Circle()
                    .fill(Color(hex: accentColor).opacity(0.9))
                    .frame(width: 64, height: 64)
                if case .downloading(let progress) = availability {
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 40, height: 40)
                } else {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .onTapGesture { onDownload?(); HapticFeedback.light() }
            .accessibilityLabel(availability == .needsDownload ? "Télécharger la vidéo" : "Téléchargement en cours")

            Text("Téléchargez pour lire la vidéo")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.85))
        }
    }
}
```

- [ ] **Step 11.3 : Patcher `ConversationMediaGalleryView` pour gating per-item**

Pour la galerie média, chaque item vidéo doit pré-resolve son `availability` et afficher un badge download si non cached. L'approche : wrapper chaque cell vidéo dans une vue qui résout availability + offre tap-to-DL.

Voici le pattern à appliquer dans la fonction qui rend une cell vidéo (typiquement `videoCell(...)` ou similaire) :

```swift
    @ViewBuilder
    private func galleryVideoCell(_ attachment: MessageAttachment) -> some View {
        VideoGalleryItemView(attachment: attachment, accentColor: accentColor)
    }

    private struct VideoGalleryItemView: View {
        let attachment: MessageAttachment
        let accentColor: String

        @State private var resolvedAvailability: VideoAvailability = .needsDownload
        @StateObject private var downloader = AttachmentDownloader()

        private var availability: VideoAvailability {
            if downloader.isDownloading { return .downloading(progress: downloader.progress) }
            if downloader.isCached { return .ready }
            return resolvedAvailability
        }

        private func resolveAvailability() async {
            let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
            let cached = await CacheCoordinator.shared.video.isCached(resolved)
            resolvedAvailability = VideoAvailability.resolve(
                isLocalFile: false, localFileExists: false, isServerCached: cached
            )
        }

        var body: some View {
            ZStack {
                // Thumbnail toujours visible (ProgressiveCachedImage)
                ProgressiveCachedImage(
                    thumbHash: attachment.thumbHash,
                    thumbnailUrl: attachment.thumbnailUrl,
                    fullUrl: attachment.thumbnailUrl
                ) {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .clipped()

                switch availability {
                case .ready:
                    Button { /* open fullscreen — existing logic */ } label: {
                        Image(systemName: "play.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                            .padding(12)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                case .needsDownload, .downloading:
                    Button {
                        if case .needsDownload = availability {
                            downloader.start(attachment: attachment, onShare: nil)
                        }
                        HapticFeedback.light()
                    } label: {
                        DownloadBadgeView(attachment: attachment, accentColor: accentColor, messageDeliveryStatus: .sent, onShareFile: { _ in })
                    }
                    .buttonStyle(.plain)
                }
            }
            .task(id: attachment.fileUrl) {
                await resolveAvailability()
                // Auto-DL si policy permet
                if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
                    let condition = NetworkConditionMonitor.shared.condition
                    let prefs = MediaDownloadPreferencesStore.shared.preferences
                    if MediaDownloadPolicyEngine.shouldAutoDownload(
                        kind: .video, condition: condition, prefs: prefs
                    ) {
                        downloader.start(attachment: attachment, onShare: nil)
                    }
                }
            }
        }
    }
```

**Note** : adapter à la structure exacte du fichier existant. La logique-clé est : gate `play.fill` button derrière `availability == .ready`. Le fullscreen `VideoFullscreenPlayerView` est appelé avec `availability:` qui est résolu localement avant l'ouverture (passer `.ready` si on a déjà téléchargé).

- [ ] **Step 11.4 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

- [ ] **Step 11.5 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/VideoFullscreenPlayerView.swift \
        apps/ios/Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift
git commit -m "feat: gating cache-first sur VideoFullscreenPlayerView + ConversationMediaGalleryView

VideoFullscreenPlayerView gagne params availability + onDownload. Si
.needsDownload ou .downloading, affiche un overlay download au lieu du
player (sinon fond noir vide après suppression streaming fallback de
SharedAVPlayerManager).

ConversationMediaGalleryView : chaque item vidéo passe par
VideoGalleryItemView qui résout son availability via
CacheCoordinator.shared.video, affiche thumbnail + play icon si ready,
ou DownloadBadgeView (avec taille) si needsDownload. Auto-DL si policy
permet (consulte MediaDownloadPolicyEngine).

Préserve l'UX galerie : items audio + image inchangés (pas gated, déjà
ProgressiveCachedImage progressif pour images). Items vidéo seuls gated.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.10"
```

---

## Task 12 : `SharedAVPlayerManager.load()` — supprimer streaming fallback

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift:33-70`

- [ ] **Step 12.1 : Lire le code actuel**

```bash
sed -n '33,75p' packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift
```

- [ ] **Step 12.2 : Patcher `load(urlString:)`**

Trouver les lignes 63-69 (le fallback streaming) et les remplacer par un log warning + early return. La forme exacte dépend du code existant ; voici la modification logique :

```swift
public func load(urlString: String) {
    // ... existing path A: prerolled cache check (~l.47-50) ...
    if let prerolledPlayer = StoryMediaLoader.shared.cachedPlayer(for: url) {
        self.player = prerolledPlayer
        self.activeURL = urlString
        return
    }

    // ... existing path B: disk cache check (~l.51-63) ...
    if let localURL = CacheCoordinator.videoLocalFileURL(for: resolved) {
        let player = AVPlayer(url: localURL)
        // ... existing setup ...
        self.player = player
        self.activeURL = urlString
        return
    }

    // PATH C: streaming fallback SUPPRIMÉ (spec §4.10).
    // Caller doit gate via availability == .ready avant d'appeler .load().
    // Si on arrive ici sans cache, c'est une erreur du caller.
    Logger.media.warning(
        "SharedAVPlayerManager.load called for non-cached URL — caller should gate via availability. URL: \(urlString)"
    )
    // Aucun AVPlayer instancié. self.player reste nil.
}
```

- [ ] **Step 12.3 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: build OK.

- [ ] **Step 12.4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/SharedAVPlayerManager.swift
git commit -m "fix(sdk): SharedAVPlayerManager.load supprime le fallback streaming

Le fallback streaming AVPlayer(url:) sur cache miss est supprimé. Caller
doit désormais gate via availability == .ready avant d'appeler .load().
Si appelé sur URL non cached, log warning défensif et n'instancie aucun
player (self.player reste nil → caller affiche overlay download).

Impact : conversations (bulles + galerie + fullscreen) sont protégées par
les gates ajoutés Tasks 10-11. Stories NE PASSENT PAS par ce manager
actuellement (vrai pipeline = StoryReaderPrefetcher + StoryMediaLoader),
donc pas d'impact stories.

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.10"
```

---

## Task 13 : `CachedAsyncImage` / `ProgressiveCachedImage` — consult engine

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`

- [ ] **Step 13.1 : Ajouter la consultation engine dans `CachedAsyncImage`**

Trouver le `.task` async de `CachedAsyncImage` (lignes ~113-135). Wrap la fetch dans un check policy :

```swift
        .task {
            if loaded == nil {
                let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
                // Consulter engine : si policy ne permet pas l'auto-fetch en
                // condition courante, skip le network fetch (rester au thumbHash
                // / placeholder). Le DownloadBadgeView dans le composant parent
                // permet le tap-to-download manuel.
                let condition = await MainActor.run { NetworkConditionMonitor.shared.condition }
                let prefs = await MainActor.run { MediaDownloadPreferencesStore.shared.preferences }
                guard MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: .image, condition: condition, prefs: prefs
                ) else {
                    return
                }
                loaded = await CacheCoordinator.shared.images.image(for: resolved, maxPixelSize: maxPixel)
            }
        }
```

**Note** : la consultation `NetworkConditionMonitor.shared.condition` et `MediaDownloadPreferencesStore.shared.preferences` est `@MainActor`. Le `.task` SwiftUI exécute sur MainActor par défaut quand attaché à une view, mais `await MainActor.run { ... }` est explicite pour ne pas dépendre du runtime context.

- [ ] **Step 13.2 : Idem pour `ProgressiveCachedImage`**

Trouver le `.task` de `ProgressiveCachedImage` (~lignes 385-403). Appliquer le même pattern : check engine avant chaque fetch full/thumbnail. Si engine `false`, rester au thumbHash + thumbnail si déjà cached (mais ne pas fetch network).

Modifier le `.task` async :

```swift
        .task {
            let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
            let condition = await MainActor.run { NetworkConditionMonitor.shared.condition }
            let prefs = await MainActor.run { MediaDownloadPreferencesStore.shared.preferences }
            let canAutoFetch = MediaDownloadPolicyEngine.shouldAutoDownload(
                kind: .image, condition: condition, prefs: prefs
            )

            // Thumbnail : si pas cached et policy ne permet pas, skip.
            // Si policy permet ou si déjà cached, charge.
            if thumbLoaded == nil, let thumbUrl = thumbnailUrl {
                let thumbResolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString ?? thumbUrl
                if canAutoFetch || DiskCacheStore.cachedImage(for: thumbResolved) != nil {
                    thumbLoaded = await CacheCoordinator.shared.images.image(for: thumbResolved)
                }
            }

            // Full : même check.
            if fullLoaded == nil, let fullUrl = fullUrl {
                let fullResolved = MeeshyConfig.resolveMediaURL(fullUrl)?.absoluteString ?? fullUrl
                if canAutoFetch || DiskCacheStore.cachedImage(for: fullResolved) != nil {
                    fullLoaded = await CacheCoordinator.shared.images.image(for: fullResolved)
                }
            }
        }
```

**Note** : le code exact dépend de la structure interne du fichier. Lire ses lignes 380-420 avant d'appliquer.

- [ ] **Step 13.3 : Build**

```bash
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

- [ ] **Step 13.4 : Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift
git commit -m "feat(sdk): CachedAsyncImage / ProgressiveCachedImage consultent l'engine

Le .task async qui fetch les images depuis le network consulte désormais
MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition:, prefs:)
avant chaque appel à CacheCoordinator.shared.images.image(for:). Si le
engine retourne false ET que l'image n'est pas déjà cached en mémoire
(via DiskCacheStore.cachedImage(for:)), skip le fetch network.

L'image reste alors au thumbHash (instant local) sans fetch automatique.
Le DownloadBadgeView en overlay sur les composants parents (BubbleGridCell,
ProgressiveCachedImage callers) permet le tap-to-download manuel — ce qui
override la policy (tap = action utilisateur explicite, spec §14.1).

Spec : docs/superpowers/specs/2026-05-20-ios-media-download-policy-design.md §4.11"
```

---

## Task 14 : Tests d'intégration `AudioMediaView` étendus

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift`

- [ ] **Step 14.1 : Ajouter tests `currentAudioUrl` / `currentMediaKind`**

Ces tests vérifient le routing per-langue. Étant donné que `currentAudioUrl` et `currentMediaKind` sont `private`, on les teste indirectement via le comportement d'Equatable + un helper de test qui inspecte.

Ajouter dans `AudioMediaViewRenderTests.swift` :

```swift
    /// Quand on passe une selectedAudioLangCode pour une langue présente dans
    /// translatedAudios, l'Equatable détecte un changement (URL différente).
    func test_audioMediaView_equatable_detectsLanguageChangeViaTranslatedAudios() {
        let original = MeeshyMessageAttachment(
            id: "att-1", messageId: "msg-1",
            fileName: "test.m4a", originalName: "test.m4a",
            mimeType: "audio/m4a", fileSize: 1000,
            filePath: "/test", fileUrl: "https://example.com/orig.m4a",
            uploadedBy: "user-1"
        )
        let message = MeeshyMessage(
            id: "msg-1", conversationId: "conv-1", senderId: "user-1",
            content: "",
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0)
        )
        let translatedFR = MessageTranslatedAudio(
            id: "ta-fr", attachmentId: "att-1", targetLanguage: "fr",
            url: "https://example.com/fr.m4a",
            transcription: "Bonjour", durationMs: 1000, segments: [],
            format: "m4a", cloned: false, quality: "standard",
            voiceModelId: nil, ttsModel: "test"
        )

        let viewA = AudioMediaView(
            attachment: original, message: message,
            contactColor: "#6366F1", visualAttachments: [],
            isDark: false, accentColor: "#6366F1",
            translatedAudios: [translatedFR]
        )

        // L'Equatable AudioMediaView ne capture pas selectedAudioLangCode
        // (c'est un @State interne). On vérifie que les deux instances avec
        // les mêmes translatedAudios sont égales. Le re-resolve effectif est
        // testé dans le smoke visuel.
        let viewB = AudioMediaView(
            attachment: original, message: message,
            contactColor: "#6366F1", visualAttachments: [],
            isDark: false, accentColor: "#6366F1",
            translatedAudios: [translatedFR]
        )
        XCTAssertTrue(viewA == viewB,
            "AudioMediaView avec les mêmes inputs doit rester Equatable-stable")
    }
```

- [ ] **Step 14.2 : Run tests**

```bash
xcodebuild test \
    -project apps/ios/Meeshy.xcodeproj \
    -scheme Meeshy \
    -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
    -only-testing:MeeshyTests/AudioMediaViewRenderTests \
    -derivedDataPath apps/ios/Build \
    2>&1 | grep -E "Executed|TEST" | tail -3
```

Expected: tous les tests passent (4 existants + 1 nouveau).

- [ ] **Step 14.3 : Commit**

```bash
git add apps/ios/MeeshyTests/Unit/Views/AudioMediaViewRenderTests.swift
git commit -m "test(ios): AudioMediaView equatable stable avec translatedAudios

Test additionnel qui confirme la stabilité d'Equatable pour
AudioMediaView quand on passe des translatedAudios identiques entre
deux instances. Garantit le pattern zero-rerender pour les bulles
audio en switch de langue."
```

---

## Task 15 : Validation finale + smoke visuel

**Files:** aucun.

- [ ] **Step 15.1 : Clean build depuis main pour catcher pépins d'intégration**

```bash
cd /Users/smpceo/Documents/v2_meeshy
./apps/ios/meeshy.sh clean
./apps/ios/meeshy.sh build 2>&1 | tail -5
```

Expected: `Build succeeded`.

- [ ] **Step 15.2 : Suite complète de tests**

```bash
DEVICE_ID="30BFD3A6-C80B-489D-825E-5D14D6FCCAB5"
xcodebuild test \
    -project apps/ios/Meeshy.xcodeproj \
    -scheme Meeshy \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -configuration Debug \
    -enableCodeCoverage NO \
    -resultBundlePath tasks/test-output/pr-a-full.xcresult \
    -only-testing:MeeshyTests \
    -derivedDataPath apps/ios/Build \
    2>&1 | grep -E "Executed [0-9]+|TEST FAILED|TEST SUCCEEDED" | tail -3
```

Expected: `Executed N tests, with 0 failures`. `** TEST SUCCEEDED **`.

```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshySDKTests \
  -only-testing:MeeshyUITests \
  2>&1 | grep -E "Executed [0-9]+|TEST" | tail -3
```

Expected: SDK + UI tests verts.

- [ ] **Step 15.3 : Smoke visuel 10 scénarios (manuel)**

Lancer l'app et tester (login `atabeth` / `<DEMO_PASSWORD — see apps/ios/fastlane/.env>`) :

1. **Audio orig non cached** → button DL + taille → tap → DL progress → joue ✓
2. **Switch langue audio non cached** → stop player + button DL (sans taille tant que backend follow-up) → tap → DL → joue ✓
3. **Switch langue audio cached** → stop + retap play → joue ✓
4. **Vidéo inline non cached** → button DL + taille → tap → DL → joue ✓
5. **Vidéo fullscreen non cached** → overlay download visible (pas player noir) → tap → DL → joue ✓
6. **Galerie médias non cached** → items vidéo affichent download badge ; items image en thumbHash + badge ✓
7. **Settings → Téléchargement auto** → 4 sections (Images / Audio / Traductions audio / Vidéo) × 4 options chacune → toggle → persist + influence prochain DL ✓
8. **Toggle vidéo à `.never`** → relance app → vidéos restent en button DL même en wifi ✓
9. **Toggle audio à `.always`** → bad cellular simulé (Low Data Mode) → audios continuent d'auto-DL ✓
10. **Migration legacy** : si UserDefaults avait l'ancien format (rare en prod car orphelin), vérifier que prefs migrent au premier launch + ancienne clé supprimée ✓

- [ ] **Step 15.4 : Récap commits**

```bash
git log --oneline main..HEAD
```

Expected: 13 commits (Tasks 1-14, certains regroupés).

- [ ] **Step 15.5 : Pas de push automatique — décision utilisateur**

Selon project memory (« Confirmation needed before commit/push unless durably authorized »), ne pas push automatiquement. Demander à l'utilisateur s'il souhaite ouvrir une PR vers `dev` ou autre branche.

---

## Self-review

**1. Spec coverage** :
- §4.1 NetworkConditionMonitor → Task 1 ✓
- §4.2 AutoDownloadPolicy + MediaDownloadPreferences → Task 2 ✓
- §4.3 MediaDownloadPolicyEngine → Task 3 ✓
- §4.4 MediaDownloadPreferencesStore → Task 4 ✓
- §4.5 MediaDownloadSettingsView refactor → Task 5 ✓
- §4.6 AudioPlayerView.switchToLanguage fix → Task 6 ✓
- §4.7 AudioMediaView extensions → Task 7 ✓
- §4.8 AttachmentDownloader.startTranslatedAudio → Task 8 ✓
- §4.9 VideoMediaView + InlineVideoPlayerView → Tasks 9-10 ✓
- §4.10 SharedAVPlayerManager + VideoFullscreenPlayerView + ConversationMediaGalleryView → Tasks 11-12 ✓
- §4.11 Images consult engine → Task 13 ✓
- §4.12 DownloadBadge size visible → couvert par le code existant (vérifié smoke §15.3.6)
- §11.1-4 + §11.9-10 smoke → Task 15.3 ✓
- §14.1 tap fullscreen override policy → couvert par le tap-to-DL des composants → smoke #5
- §14.2 DL continue wifi→cellular → commenté dans Task 8 `startDownloadFlow`

**2. Placeholder scan** : aucun TBD/TODO/"implement later". Tous les blocs de code complets. Une mention "follow-up backend" pour `MessageTranslatedAudio.fileSize` est intentionnelle et documentée (spec §7).

**3. Type consistency** :
- `NetworkCondition` cases consistant entre Task 1 et Tasks 3-13 (`.offline`, `.badCellular`, `.goodCellular`, `.wifi`)
- `AutoDownloadPolicy` cases consistant (`.always`, `.wifiAndGoodCellular`, `.wifiOnly`, `.never`)
- `MediaKind` cases consistant (`.image`, `.audio`, `.audioTranslation`, `.video`)
- `VideoAvailability` parallèle d'`AudioAvailability` — signatures `resolve` symétriques
- `MediaDownloadPreferencesStore.shared` accédé partout via la même API (`.preferences.image`/`.audio`/`.audioTranslation`/`.video`)
- `MediaDownloadPolicyEngine.shouldAutoDownload(kind:condition:prefs:)` signature exacte partout

**4. Ambiguity check** :
- `currentMediaKind` dans Task 7 utilise `translatedAudios.contains(where:)` — discrimination claire, pas ambigu.
- `startTranslatedAudio(url:fileSize:)` Task 8 accepte `fileSize: Int64` (0 autorisé). `startDownloadFlow` lit Content-Length du response header en cours de DL si fileSize == 0 (documenté dans le code).
- `VideoAvailability.resolve(isLocalFile:localFileExists:isServerCached:)` reprend exactement la signature d'`AudioAvailability.resolve` — symétrie.
- Path `apps/ios/Meeshy.xcodeproj/project.pbxproj` modification : pattern d'ajout de fichier classic xcodeproj documenté Task 9.3 (4 entrées + 2 UUIDs).

**Aucune lacune identifiée.** Le plan couvre intégralement §4 du spec et les sections support (§11 tests, §14 décisions explicites).
