import XCTest
@testable import MeeshyUI

/// B8 item 1+2 (ios-full-remediation) — `MediaFetchGate.shouldSkipNetworkFetch`
/// is the single pure decision extracted from the 3× copy-pasted cascade
/// previously inlined in `CachedAsyncImage.loadImage` and
/// `ProgressiveCachedImage.loadThumbnail`/`.loadFullImage`. Every signal is a
/// plain parameter (SDK-purity: no singleton reads inside the gate itself),
/// which is exactly what makes it unit-testable without MainActor/SwiftUI
/// hosting.
final class MediaFetchGateTests: XCTestCase {

    func test_shouldSkipNetworkFetch_autoLoadTrue_neverSkips() {
        XCTAssertFalse(MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: true, isLocalFileURL: false, hasLocalCacheHit: false, policyAllowsAutoLoad: false
        ))
    }

    func test_shouldSkipNetworkFetch_localFileURL_neverSkips() {
        XCTAssertFalse(MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: false, isLocalFileURL: true, hasLocalCacheHit: false, policyAllowsAutoLoad: false
        ))
    }

    func test_shouldSkipNetworkFetch_hasLocalCacheHit_neverSkips() {
        XCTAssertFalse(MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: false, isLocalFileURL: false, hasLocalCacheHit: true, policyAllowsAutoLoad: false
        ))
    }

    func test_shouldSkipNetworkFetch_policyAllows_neverSkips() {
        XCTAssertFalse(MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: false, isLocalFileURL: false, hasLocalCacheHit: false, policyAllowsAutoLoad: true
        ))
    }

    func test_shouldSkipNetworkFetch_noBypassSignal_skips() {
        XCTAssertTrue(MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: false, isLocalFileURL: false, hasLocalCacheHit: false, policyAllowsAutoLoad: false
        ))
    }

    func test_shouldSkipNetworkFetch_allSignalsTrue_neverSkips() {
        XCTAssertFalse(MediaFetchGate.shouldSkipNetworkFetch(
            autoLoad: true, isLocalFileURL: true, hasLocalCacheHit: true, policyAllowsAutoLoad: true
        ))
    }

    // MARK: - Relance après un report de politique

    /// Une case retenue par la politique ne relançait jamais son chargement
    /// quand son URL restait la même : le média téléchargé par un autre chemin
    /// (bouton de la bulle) restait flou. Le jeton de l'hôte entre dans
    /// l'identité du chargement, qui repart dès qu'il change.
    func test_progressiveLoadID_changedReloadToken_restartsTheLoad() {
        let before = ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: AnyHashable(false))
        let after = ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: AnyHashable(true))

        XCTAssertNotEqual(before, after)
    }

    func test_progressiveLoadID_sameURLAndToken_doesNotRestart() {
        XCTAssertEqual(
            ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: AnyHashable(true)),
            ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: AnyHashable(true))
        )
        XCTAssertEqual(
            ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: nil),
            ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: nil)
        )
    }

    func test_progressiveLoadID_changedURL_restartsTheLoad() {
        XCTAssertNotEqual(
            ProgressiveImageLoadID(url: "https://x/p_960.webp", reloadToken: nil),
            ProgressiveImageLoadID(url: "https://x/p.jpg", reloadToken: nil)
        )
    }

    func test_localImagePresence_unknownURL_isNotOnDevice() {
        XCTAssertFalse(LocalImagePresence.isOnDevice(resolvedURL: "https://never.example/\(UUID().uuidString).jpg"))
    }
}
