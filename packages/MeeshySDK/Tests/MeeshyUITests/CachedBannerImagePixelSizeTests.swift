import XCTest
@testable import MeeshyUI

/// B8 item 5 (ios-full-remediation) — CachedBannerImage decoded at the
/// pipeline's generic 1200px cap regardless of the banner's actual rendered
/// height, over-allocating memory for small banners. Mirrors
/// `CachedAvatarImage.pixelSize(for:)`. Source-guard since the async
/// `loadBanner` isn't unit-testable without a live CacheCoordinator/network
/// stack.
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

    func test_loadBanner_passesHeightDerivedMaxPixelSize() throws {
        let source = try sdkSource("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")
        guard let start = source.range(of: "public struct CachedBannerImage") else {
            XCTFail("CachedBannerImage not found in CachedAsyncImage.swift")
            return
        }
        guard let end = source.range(of: "public struct ProgressiveCachedImage", range: start.upperBound..<source.endIndex) else {
            XCTFail("Could not bound CachedBannerImage's body")
            return
        }
        let bannerSource = String(source[start.lowerBound..<end.lowerBound])
        XCTAssertTrue(bannerSource.contains("Self.pixelSize(for: height)"),
                      "loadBanner must derive maxPixelSize from the banner's rendered height, like CachedAvatarImage.loadAvatar derives it from size.")
        XCTAssertTrue(bannerSource.contains("maxPixelSize: maxPixel"),
                      "loadBanner must pass the derived maxPixelSize into CacheCoordinator.images.image(for:maxPixelSize:) instead of the generic 1200px default.")
    }
}
