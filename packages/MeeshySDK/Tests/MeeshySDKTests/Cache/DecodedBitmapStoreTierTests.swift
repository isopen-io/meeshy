import XCTest
import UIKit
@testable import MeeshySDK

/// **Le plafond de pixels du cache décodé suit le tier de l'appareil (#11281).**
///
/// Un appareil faible ne garde pas résidente une image que le haut de gamme
/// garde : le plafond ne fait que BAISSER pour les tiers bas, il ne relève
/// jamais ce que `high` et `pro` tenaient déjà (rétrocompatible).
final class DecodedBitmapStoreTierTests: XCTestCase {

    private static let mebibyte = 1_024 * 1_024

    func test_residentBudget_shrinksForWeakTiers_andKeepsTheHistoricalCeilingAbove() {
        XCTAssertEqual(DecodedBitmapStore.maxCacheableDecodedBytes(for: .low), 24 * Self.mebibyte)
        XCTAssertEqual(DecodedBitmapStore.maxCacheableDecodedBytes(for: .mid), 40 * Self.mebibyte)
        XCTAssertEqual(DecodedBitmapStore.maxCacheableDecodedBytes(for: .high), 50 * Self.mebibyte)
        XCTAssertEqual(DecodedBitmapStore.maxCacheableDecodedBytes(for: .pro), 50 * Self.mebibyte)
    }

    func test_pixelCeiling_onlyLowersTheLowTier() {
        XCTAssertEqual(DecodedBitmapStore.pixelCeiling(for: .low), 1536)
        XCTAssertEqual(DecodedBitmapStore.pixelCeiling(for: .mid), DiskCacheStore.warmedPixelCap)
        XCTAssertEqual(DecodedBitmapStore.pixelCeiling(for: .high), DiskCacheStore.warmedPixelCap)
        XCTAssertEqual(DecodedBitmapStore.pixelCeiling(for: .pro), DiskCacheStore.warmedPixelCap)
    }

    func test_pixelCeiling_neverCutsBelowTheSizedBucketsOrTheFullFormatSlot() {
        let floor = max(DiskCacheStore.fullFormatPixelCap, 1024)
        for tier in DeviceMediaTier.allCases {
            XCTAssertGreaterThanOrEqual(DecodedBitmapStore.pixelCeiling(for: tier), floor, "\(tier)")
        }
    }

    func test_insertWithinBudget_refusesAnImageTheLowTierCannotAfford_butTheHighTierKeeps() throws {
        let image = Self.bitmap(width: 3_200, height: 2_000)
        let cost = try XCTUnwrap(image.cgImage).bytesPerRow * 2_000
        XCTAssertGreaterThan(cost, DecodedBitmapStore.maxCacheableDecodedBytes(for: .low))
        XCTAssertLessThanOrEqual(cost, DecodedBitmapStore.maxCacheableDecodedBytes(for: .high))
        let lowKey = "tier-low-\(UUID().uuidString)"
        let highKey = "tier-high-\(UUID().uuidString)"
        defer {
            DecodedBitmapStore.removeVariants(fileKey: lowKey)
            DecodedBitmapStore.removeVariants(fileKey: highKey)
        }

        DecodedBitmapStore.insertWithinBudget(image, key: lowKey, tier: .low)
        DecodedBitmapStore.insertWithinBudget(image, key: highKey, tier: .high)

        XCTAssertNil(DecodedBitmapStore.image(forKey: lowKey as NSString))
        XCTAssertNotNil(DecodedBitmapStore.image(forKey: highKey as NSString))
    }

    func test_downsampling_isClampedByTheTierCeiling() throws {
        let data = try XCTUnwrap(Self.bitmap(width: 3_000, height: 2_000).jpegData(compressionQuality: 0.5))

        let low = try XCTUnwrap(DecodedBitmapStore.downsampledImage(data: data, maxPixelSize: 2_048, tier: .low))
        let high = try XCTUnwrap(DecodedBitmapStore.downsampledImage(data: data, maxPixelSize: 2_048, tier: .high))

        XCTAssertEqual(max(low.size.width, low.size.height) * low.scale, 1_536, accuracy: 1)
        XCTAssertEqual(max(high.size.width, high.size.height) * high.scale, 2_048, accuracy: 1)
    }

    func test_downsampling_aSmallRequestIsNeverEnlargedByTheCeiling() throws {
        let data = try XCTUnwrap(Self.bitmap(width: 3_000, height: 2_000).jpegData(compressionQuality: 0.5))

        let thumbnail = try XCTUnwrap(DecodedBitmapStore.downsampledImage(data: data, maxPixelSize: 256, tier: .low))

        XCTAssertEqual(max(thumbnail.size.width, thumbnail.size.height) * thumbnail.scale, 256, accuracy: 1)
    }

    private static func bitmap(width: Int, height: Int) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }
}
