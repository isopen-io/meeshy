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
}
