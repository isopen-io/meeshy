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
        XCTAssertTrue(bannerSource.contains("Self.pixelSize(for: height)"),
                      "loadBanner must derive maxPixelSize from the banner's rendered height, like CachedAvatarImage.loadAvatar derives it from size.")
        XCTAssertTrue(bannerSource.contains("maxPixelSize: maxPixel"),
                      "loadBanner must pass the derived maxPixelSize into CacheCoordinator.images.image(for:maxPixelSize:) instead of the generic 1200px default.")
    }

    func test_pixelSize_accountsForTheUnconstrainedFullBleedWidth() throws {
        let bannerSource = try extractBannerSource()
        guard let pixelSizeStart = bannerSource.range(of: "private static func pixelSize(for height: CGFloat) -> CGFloat {") else {
            XCTFail("pixelSize(for:) not found on CachedBannerImage")
            return
        }
        guard let bodyEnd = bannerSource.range(of: "\n    }", range: pixelSizeStart.upperBound..<bannerSource.endIndex) else {
            XCTFail("Could not bound pixelSize(for:)'s body")
            return
        }
        let pixelSizeBody = String(bannerSource[pixelSizeStart.upperBound..<bodyEnd.lowerBound])
        XCTAssertTrue(pixelSizeBody.contains("UIScreen.main.bounds.width"),
                      "pixelSize(for:) must account for the banner's unconstrained (and typically dominant) rendered width via UIScreen.main.bounds.width, not just height — every known call site is full-bleed, so a height-only cap under-resolves the image's actual larger dimension and produces a visible blur regression.")
        XCTAssertFalse(pixelSizeBody.contains("height * UIScreen.main.scale"),
                       "pixelSize(for:) must not regress to the height-only computation — it must take max(width, height) like its CachedAsyncImage/ProgressiveCachedImage siblings.")
    }
}
