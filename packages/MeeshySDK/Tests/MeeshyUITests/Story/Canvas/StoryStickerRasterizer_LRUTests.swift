import XCTest
import UIKit
@testable import MeeshyUI

/// Covers the bounded-cache contract of `StoryStickerRasterizer`:
///
///   1. below `countLimit`, repeat lookups hit the same `CGImage`;
///   2. above `countLimit`, NSCache evicts entries so the live set stays
///      bounded (NSCache treats `countLimit` as a best-effort hint, so the
///      contract we assert is "evictions happen", not "resident == limit");
///   3. `UIApplication.didReceiveMemoryWarningNotification` drops every
///      cached glyph synchronously enough that a subsequent probe returns
///      `nil`;
///   4. asking for the same (emoji, size) twice returns the same backing
///      `CGImage` instance (cache hit, not a re-render).
///
/// Tests run on the main actor because `cgImage(for:size:)` is
/// `@MainActor`-isolated (UIKit `UIGraphicsImageRenderer` requirement).
@MainActor
final class StoryStickerRasterizer_LRUTests: XCTestCase {

    // MARK: - Fixtures

    /// Distinct emoji glyphs we can pull from to populate the cache. We
    /// derive the test keyspace from the unicode emoji block at U+1F600 so
    /// we can generate as many unique keys as we need without hand-rolling
    /// a list.
    private func emoji(at index: Int) -> String {
        let scalarValue: UInt32 = 0x1F600 + UInt32(index)
        guard let scalar = Unicode.Scalar(scalarValue) else {
            return "*"
        }
        return String(Character(scalar))
    }

    /// Stable pointer for a CGImage so we can compare backing identity
    /// across cache lookups. CGImage is a CFType bridged into Swift, so
    /// `Unmanaged.passUnretained(...).toOpaque()` is the safe way to get
    /// the underlying CFTypeRef address without retaining it.
    private func opaque(_ image: CGImage) -> UnsafeMutableRawPointer {
        Unmanaged.passUnretained(image).toOpaque()
    }

    // MARK: - Bug P2 — bounded cache

    /// Below the configured `countLimit`, every glyph stays cached and a
    /// second lookup MUST find it.
    func test_rasterize_belowLimit_cachesHit() {
        let rasterizer = StoryStickerRasterizer(countLimitForTesting: 10)

        for i in 0..<5 {
            _ = rasterizer.cgImage(for: emoji(at: i), size: 64)
        }

        for i in 0..<5 {
            XCTAssertNotNil(rasterizer.cachedImage(emoji: emoji(at: i), size: 64),
                            "Glyph #\(i) MUST be cached when below countLimit")
        }
    }

    /// When more than `countLimit` distinct glyphs are rasterized, NSCache
    /// MUST start evicting so the cache cannot grow unbounded. NSCache's
    /// own documentation calls `countLimit` a non-strict hint, so the
    /// contract we hold the rasterizer to is "evictions happen well before
    /// we hit the push count" — the resident set MUST be strictly smaller
    /// than the number of inserts.
    func test_rasterize_aboveLimit_evictsOldest() {
        let limit = 50
        let pushCount = 150
        let rasterizer = StoryStickerRasterizer(countLimitForTesting: limit)

        for i in 0..<pushCount {
            _ = rasterizer.cgImage(for: emoji(at: i), size: 64)
        }

        var residentCount = 0
        for i in 0..<pushCount where rasterizer.cachedImage(emoji: emoji(at: i),
                                                            size: 64) != nil {
            residentCount += 1
        }

        XCTAssertLessThan(residentCount, pushCount,
                          "NSCache MUST evict at least one entry once countLimit is exceeded")
        XCTAssertGreaterThan(residentCount, 0,
                             "Cache MUST still hold the most-recent glyphs")
    }

    /// A `didReceiveMemoryWarning` notification MUST flush every cached
    /// glyph — this is the safety net that protects the app under memory
    /// pressure even when the per-key insert path hasn't tripped eviction.
    func test_cache_clearedOnMemoryWarning() {
        let rasterizer = StoryStickerRasterizer(countLimitForTesting: 100)

        for i in 0..<10 {
            _ = rasterizer.cgImage(for: emoji(at: i), size: 64)
        }

        XCTAssertNotNil(rasterizer.cachedImage(emoji: emoji(at: 0), size: 64),
                        "Pre-condition: glyph must be cached before memory warning")

        NotificationCenter.default.post(name: UIApplication.didReceiveMemoryWarningNotification,
                                        object: nil)

        for i in 0..<10 {
            XCTAssertNil(rasterizer.cachedImage(emoji: emoji(at: i), size: 64),
                         "Glyph #\(i) MUST be evicted after didReceiveMemoryWarning")
        }
    }

    /// Asking for the same (emoji, size) twice MUST return the same
    /// backing `CGImage` — that is the whole point of the cache. A
    /// pointer-equality check via `Unmanaged.toOpaque()` is the strongest
    /// signal that we hit the cache rather than re-rasterizing.
    func test_rasterize_sameKeyTwice_returnsSameInstance() {
        let rasterizer = StoryStickerRasterizer(countLimitForTesting: 10)
        let glyph = emoji(at: 0)

        guard let first = rasterizer.cgImage(for: glyph, size: 96) else {
            XCTFail("First rasterization MUST succeed")
            return
        }
        guard let second = rasterizer.cgImage(for: glyph, size: 96) else {
            XCTFail("Second lookup MUST succeed")
            return
        }

        XCTAssertEqual(opaque(first), opaque(second),
                       "Cache MUST return the same backing CGImage on repeat lookups")
    }
}
