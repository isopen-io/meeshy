import XCTest
import QuartzCore
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// Covers the `languages` axis of `StoryRendererCache.ItemSignature`.
///
/// Background: until the fix, the signature captured only id + spatial +
/// opacity + visibility fields. A future multilingual export pipeline (see
/// the publish → exporter wiring design at
/// `docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md`)
/// would issue per-frame `layer(for:at:languages:build:)` calls with different
/// language lists for the same item id. Without `languages` in the signature
/// the cache would return the previously built layer rendered in the wrong
/// language. This suite locks in the corrected behaviour:
///
///   1. Different `languages` lists for the same item produce a cache miss.
///   2. Identical `languages` lists produce a cache hit (regression guard so
///      the steady-state export performance contract is preserved).
///   3. The empty list is treated as a normal value — `[]` then `[]` hits,
///      `[]` then `["fr"]` misses.
///   4. Order is significant: `["fr","en"]` differs from `["en","fr"]`. This
///      mirrors the canonical-order contract enforced by `resolveUserLanguage`
///      in `packages/shared/utils/conversation-helpers.ts` (highest priority
///      first), so callers MUST pass languages in a stable canonical order.
///
/// Tests are `@MainActor` because `StoryRendererCache.layer(for:at:languages:build:)`
/// is MainActor-isolated under MeeshyUI's `defaultIsolation(MainActor)`.
@MainActor
final class StoryRendererCache_LanguagesTests: XCTestCase {

    // MARK: - Fixtures

    /// A minimal `StoryTextObject` whose only purpose is to be a stable
    /// `RenderableItem` we can feed the cache. We don't care about the actual
    /// rendered output here — only about whether the cache rebuilds the
    /// layer, which the cache reports via `cacheHitCount` / `cacheMissCount`.
    private func makeItem(id: String = "t1") -> StoryTextObject {
        return StoryTextObject(id: id, text: "Hello",
                               translations: ["fr": "Bonjour", "en": "Hello"])
    }

    /// Counts how many times the build closure is invoked. The cache uses
    /// counter increments internally too, but checking the build-closure
    /// invocation count tests the user-visible contract directly: "did we
    /// pay the cost of rebuilding the layer?".
    @MainActor
    private final class BuildCounter {
        var invocations: Int = 0
        func build(_ item: any RenderableItem) -> CALayer {
            invocations += 1
            let l = CALayer()
            l.name = item.id
            return l
        }
    }

    // MARK: - 1. Different languages produce a cache miss

    func test_signature_differentLanguages_producesCacheMiss() {
        let cache = StoryRendererCache()
        let item = makeItem()
        let counter = BuildCounter()

        _ = cache.layer(for: item, at: 0.0, languages: ["fr"], build: counter.build)
        _ = cache.layer(for: item, at: 0.0, languages: ["en"], build: counter.build)

        XCTAssertEqual(counter.invocations, 2,
                       "Switching languages from [fr] to [en] must rebuild the layer")
        XCTAssertEqual(cache.cacheMissCount, 2)
        XCTAssertEqual(cache.cacheHitCount, 0)
    }

    // MARK: - 2. Same languages produce a cache hit (regression)

    func test_signature_sameLanguages_producesCacheHit() {
        let cache = StoryRendererCache()
        let item = makeItem()
        let counter = BuildCounter()

        _ = cache.layer(for: item, at: 0.0, languages: ["fr"], build: counter.build)
        _ = cache.layer(for: item, at: 0.0, languages: ["fr"], build: counter.build)

        XCTAssertEqual(counter.invocations, 1,
                       "Identical languages must reuse the cached layer")
        XCTAssertEqual(cache.cacheMissCount, 1)
        XCTAssertEqual(cache.cacheHitCount, 1)
    }

    // MARK: - 3. Empty list treated consistently

    func test_signature_emptyLanguages_treatedConsistently() {
        let cache = StoryRendererCache()
        let item = makeItem()
        let counter = BuildCounter()

        // Two consecutive calls with `[]` hit.
        _ = cache.layer(for: item, at: 0.0, languages: [], build: counter.build)
        _ = cache.layer(for: item, at: 0.0, languages: [], build: counter.build)
        XCTAssertEqual(counter.invocations, 1)
        XCTAssertEqual(cache.cacheHitCount, 1)
        XCTAssertEqual(cache.cacheMissCount, 1)

        // Switching from `[]` to `["fr"]` misses — the empty list is a
        // distinct value, not a wildcard.
        _ = cache.layer(for: item, at: 0.0, languages: ["fr"], build: counter.build)
        XCTAssertEqual(counter.invocations, 2,
                       "Empty list and non-empty list are different signatures")
        XCTAssertEqual(cache.cacheMissCount, 2)
    }

    // MARK: - 4. Language order is significant

    /// Order matters: `["fr","en"]` and `["en","fr"]` resolve to different
    /// preferred translations under `resolveUserLanguage` (the first element
    /// is the primary preference), so the signature MUST distinguish them.
    /// This test pins the order-sensitive behaviour so a future "normalise to
    /// sorted set" refactor cannot land silently.
    func test_signature_languageOrder_invariantOrSensitive() {
        let cache = StoryRendererCache()
        let item = makeItem()
        let counter = BuildCounter()

        _ = cache.layer(for: item, at: 0.0, languages: ["fr", "en"], build: counter.build)
        _ = cache.layer(for: item, at: 0.0, languages: ["en", "fr"], build: counter.build)

        XCTAssertEqual(counter.invocations, 2,
                       "Language order is significant: [fr,en] and [en,fr] must miss")
        XCTAssertEqual(cache.cacheMissCount, 2)
        XCTAssertEqual(cache.cacheHitCount, 0)

        // Cross-check via the pure signature helper — same expectation, no
        // CALayer instantiation.
        let sigFrEn = StoryRendererCache.makeSignature(for: item, at: 0.0, languages: ["fr", "en"])
        let sigEnFr = StoryRendererCache.makeSignature(for: item, at: 0.0, languages: ["en", "fr"])
        XCTAssertNotEqual(sigFrEn, sigEnFr)
        XCTAssertNotEqual(sigFrEn.hashValue, sigEnFr.hashValue,
                          "Distinct signatures should also produce distinct hashes (best-effort)")
    }
}
