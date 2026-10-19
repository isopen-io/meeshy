import XCTest
@testable import MeeshyUI

/// B8 item 5 (ios-full-remediation) — CachedBannerImage decoded at the
/// pipeline's generic 1200px cap regardless of the banner's actual rendered
/// size, over-allocating memory for small banners. Mirrors
/// `CachedAvatarImage.pixelSize(for:)`. Source-guard since the async
/// `loadBanner` isn't unit-testable without a live CacheCoordinator/network
/// stack.
///
/// Correctif B8 (2026-07-21): the original `height`-only cap under-resolved
/// every real call site — banners are full-bleed (`.frame(height:).clipped()`
/// with NO width constraint), so the view's rendered width is always ≥ its
/// height and often much larger (e.g. `ProfileView`'s 120pt-tall banner
/// stretches across the ~360-400pt device width). `pixelSize(for:)` must
/// anchor on the device screen width, not `height` alone, or the image is
/// decoded well below the resolution it is actually displayed at — a real
/// blur regression versus the prior flat 1200px cap.
@MainActor
final class CachedBannerImagePixelSizeTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func extractBannerSource() throws -> String {
        let source = try sdkSource("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")
        guard let start = source.range(of: "public struct CachedBannerImage") else {
            XCTFail("CachedBannerImage not found in CachedAsyncImage.swift")
            return ""
        }
        guard let end = source.range(of: "public struct ProgressiveCachedImage", range: start.upperBound..<source.endIndex) else {
            XCTFail("Could not bound CachedBannerImage's body")
            return ""
        }
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_loadBanner_passesHeightDerivedMaxPixelSize() throws {
        let bannerSource = try extractBannerSource()
        XCTAssertTrue(bannerSource.contains("DecodeBudget.maxPixelWidth(for: .fullBleed(height: height))"))
        XCTAssertTrue(bannerSource.contains("maxPixelSize: maxPixel"))
    }

    func test_fullBleedBudget_accountsForTheUnconstrainedFullBleedWidth() {
        let display = DisplayMetrics(points: CGSize(width: 390, height: 844), scale: 3)
        XCTAssertEqual(DecodeBudget.maxPixelWidth(for: .fullBleed(height: 200), on: display), 1170)
    }
}
