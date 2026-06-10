import Testing
import Foundation
@testable import MeeshySDK

/// D4 / bandwidth lever 5.2 — `ImageVariantSelector` picks the smallest image
/// whose width >= the target display px, mirroring the web srcset candidate
/// construction (filter/sort/dedupe/append-original-if-strictly-larger) plus
/// the browser's "select an image source" step (>= boundary). Pure function,
/// fully deterministic. See
/// docs/superpowers/specs/2026-06-09-ios-image-variant-selection-bandwidth-52-design.md
struct ImageVariantSelectorTests {

    private func variant(_ width: Int, _ url: String, format: String = "webp") -> MeeshyImageVariant {
        MeeshyImageVariant(width: width, height: width * 3 / 4, url: url, size: width * 100, format: format)
    }

    /// Standard ladder mirroring the gateway output [640, 1080, 1920].
    private var ladder: [MeeshyImageVariant] {
        [variant(640, "/v/640.webp"), variant(1080, "/v/1080.webp"), variant(1920, "/v/1920.webp")]
    }

    // 1 — smallest variant at or above target.
    @Test func picksSmallestVariantAtOrAboveTarget() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 700)
        #expect(r == "/v/1080.webp")
    }

    // 2 — exact match is served (proves the `>=` boundary, not the size above).
    @Test func exactMatchPicksThatVariant() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 640)
        #expect(r == "/v/640.webp")
    }

    // 3 — target between two variants picks the next larger.
    @Test func targetBetweenVariantsPicksNextLarger() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 641)
        #expect(r == "/v/1080.webp")
    }

    // 4 — target above all and original strictly larger → original.
    @Test func targetAboveAll_originalLarger_picksOriginal() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 1921)
        #expect(r == "/orig.jpg")
    }

    // 5 — target above all but original NOT larger than the largest variant → largest variant.
    @Test func targetAboveAll_originalNotLarger_picksLargestVariant() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 1500, targetWidthPx: 1921)
        #expect(r == "/v/1920.webp")
    }

    // 6 — no variants (encrypted image) → original, zero regression.
    @Test func noVariantsReturnsOriginal() {
        let r = ImageVariantSelector.bestImageURL(
            variants: [], originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 700)
        #expect(r == "/orig.jpg")
    }

    // 7 — width==0 and empty-url variants are filtered out.
    @Test func filtersZeroWidthAndEmptyURLVariants() {
        let dirty = [variant(0, "/bad-zero.webp"), variant(800, ""), variant(1080, "/v/1080.webp")]
        let r = ImageVariantSelector.bestImageURL(
            variants: dirty, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 700)
        #expect(r == "/v/1080.webp")
    }

    // 8 — originalWidth nil + all variants smaller than target → largest variant (no upscale candidate).
    @Test func originalWidthNil_allVariantsSmaller_picksLargestVariant() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: nil, targetWidthPx: 5000)
        #expect(r == "/v/1920.webp")
    }

    // 9 — format-agnostic: a webp/avif mix selects by width alone.
    @Test func formatAgnosticSelectsByWidth() {
        let mixed = [variant(640, "/v/640.webp", format: "webp"),
                     variant(1080, "/v/1080.avif", format: "avif")]
        let r = ImageVariantSelector.bestImageURL(
            variants: mixed, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 700)
        #expect(r == "/v/1080.avif")
    }

    // 10 — degenerate non-positive target → cheapest candidate (defensive, no web analogue).
    @Test func nonPositiveTargetPicksSmallest() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 0)
        #expect(r == "/v/640.webp")
    }

    // 11 — originalWidth == largest variant width, target above all → the VARIANT, not the original
    // (proves the strict `>` on the append; a `>=` here would leak the multi-MB original).
    @Test func originalEqualLargestVariant_targetAboveAll_picksVariantNotOriginal() {
        let r = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 1920, targetWidthPx: 2500)
        #expect(r == "/v/1920.webp")
    }

    // 12 — single variant exactly at target.
    @Test func singleVariantExactTarget() {
        let r = ImageVariantSelector.bestImageURL(
            variants: [variant(640, "/v/640.webp")], originalURL: "/orig.jpg",
            originalWidth: nil, targetWidthPx: 640)
        #expect(r == "/v/640.webp")
    }

    // 13 — two variants of EQUAL width, different urls → documented winner is last in
    // ascending (width, url) order (last-write-wins, mirrors srcset.ts), and is deterministic.
    @Test func equalWidthTieIsDeterministic() {
        let tie = [variant(640, "/v/b.webp"), variant(640, "/v/a.webp")]
        let r1 = ImageVariantSelector.bestImageURL(
            variants: tie, originalURL: "/orig.jpg", originalWidth: nil, targetWidthPx: 640)
        let r2 = ImageVariantSelector.bestImageURL(
            variants: tie.reversed(), originalURL: "/orig.jpg", originalWidth: nil, targetWidthPx: 640)
        #expect(r1 == "/v/b.webp")   // last in ascending (width, url): "/v/a" < "/v/b" → "/v/b" wins
        #expect(r1 == r2)            // order-independent → deterministic
    }

    // 14 — real retina floors from the grid branches (documents the 640 floor).
    @Test func retinaFloorsFromGridBranches() {
        // solo cell 300pt @3x → target 900 → 1080
        let solo = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 900)
        #expect(solo == "/v/1080.webp")
        // 3-up right (~120pt) @3x → target 360 → 640 floor
        let narrow = ImageVariantSelector.bestImageURL(
            variants: ladder, originalURL: "/orig.jpg", originalWidth: 4000, targetWidthPx: 360)
        #expect(narrow == "/v/640.webp")
    }

    // 15 — no candidates + empty original + non-positive target → "" (documented no-op contract).
    @Test func emptyEverythingReturnsEmptyString() {
        let r = ImageVariantSelector.bestImageURL(
            variants: [], originalURL: "", originalWidth: nil, targetWidthPx: 0)
        #expect(r == "")
    }
}
