import Testing
@testable import MeeshySDK

/// Comportements de la loi de l'extrait (#8147) — les cas partagés avec le
/// TypeScript vivent dans `LongMessageExcerptVectorTests`.
struct LongMessageExcerptTests {

    private func words(_ count: Int, word: String = "mot") -> String {
        Array(repeating: word, count: count).joined(separator: " ")
    }

    @Test func excerpt_atTheThreshold_isNil() {
        let text = String(repeating: "a", count: LongMessageExcerpt.threshold)
        #expect(LongMessageExcerpt.isLong(text) == false)
        #expect(LongMessageExcerpt.excerpt(text) == nil)
    }

    @Test func excerpt_oneGraphemeOverTheThreshold_isAnExcerpt() {
        let text = String(repeating: "a", count: LongMessageExcerpt.threshold + 1)
        #expect(LongMessageExcerpt.isLong(text))
        #expect(LongMessageExcerpt.excerpt(text) != nil)
    }

    @Test func excerpt_longText_keepsAtMostAQuarter_andNeverHalf() throws {
        let text = words(400)
        let excerpt = try #require(LongMessageExcerpt.excerpt(text))
        #expect(excerpt.count <= text.count / 4)
        #expect(excerpt.count * 2 < text.count)
    }

    @Test func excerpt_longText_cutsOnAWordBoundary() throws {
        let text = words(300, word: "bonjour")
        let excerpt = try #require(LongMessageExcerpt.excerpt(text))
        #expect(text.hasPrefix(excerpt))
        #expect(excerpt.hasSuffix("bonjour"))
        #expect(!excerpt.hasSuffix(" "))
    }

    @Test func excerpt_withoutAnyWordBoundary_fallsBackToGraphemes() throws {
        let text = String(repeating: "漢", count: 800)
        let excerpt = try #require(LongMessageExcerpt.excerpt(text))
        #expect(excerpt.count == 200)
    }

    @Test func excerpt_neverSplitsAGraphemeCluster() throws {
        let text = String(repeating: "👩‍👩‍👧‍👦", count: 600)
        let excerpt = try #require(LongMessageExcerpt.excerpt(text))
        #expect(excerpt.count == 150)
        #expect(excerpt.unicodeScalars.count == 150 * "👩‍👩‍👧‍👦".unicodeScalars.count)
    }

    @Test func excerpt_carriesNoEllipsis() throws {
        let excerpt = try #require(LongMessageExcerpt.excerpt(words(400)))
        #expect(!excerpt.hasSuffix("…"))
        #expect(!excerpt.hasSuffix("..."))
    }
}
