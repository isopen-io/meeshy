import XCTest
@testable import MeeshySDK

/// R10 — the legacy story `content` must resolve over the FULL language
/// chain (parity with textObjects), never `translations.first` (Prisme #1).
final class StoryItemPrismeContentTests: XCTestCase {

    private func makeStory(translations: [StoryTranslation]?) -> StoryItem {
        StoryItem(id: "s1", content: "original", translations: translations)
    }

    func test_chain_fallsThroughToSecondLanguage() {
        let story = makeStory(translations: [StoryTranslation(language: "es", content: "hola")])
        XCTAssertEqual(story.resolvedContent(preferredLanguages: ["fr", "es"]), "hola",
                       "fr missing → the es translation (2nd in chain) must win over the original")
    }

    func test_chainOrder_firstMatchWins() {
        let story = makeStory(translations: [
            StoryTranslation(language: "es", content: "hola"),
            StoryTranslation(language: "fr", content: "bonjour"),
        ])
        XCTAssertEqual(story.resolvedContent(preferredLanguages: ["fr", "es"]), "bonjour")
    }

    func test_noMatch_returnsOriginal_neverTranslationsFirst() {
        let story = makeStory(translations: [StoryTranslation(language: "de", content: "hallo")])
        XCTAssertEqual(story.resolvedContent(preferredLanguages: ["fr", "es"]), "original",
                       "Prisme rule #1: no chain match → ORIGINAL, never translations.first")
    }

    func test_noTranslations_returnsOriginal() {
        XCTAssertEqual(makeStory(translations: nil).resolvedContent(preferredLanguages: ["fr"]), "original")
    }
}

/// R11 — `viewedAt` : migration douce (optionnel, rétro-compatible cache).
final class StoryItemViewedAtTests: XCTestCase {

    func test_codableRoundTrip_preservesViewedAt() throws {
        var story = StoryItem(id: "s1", content: nil, isViewed: true,
                              viewedAt: Date(timeIntervalSince1970: 1_000_000))
        let data = try JSONEncoder().encode(story)
        let decoded = try JSONDecoder().decode(StoryItem.self, from: data)
        XCTAssertEqual(decoded.viewedAt, story.viewedAt)
        story.viewedAt = nil
        XCTAssertNil(story.viewedAt)
    }

    func test_decode_withoutViewedAt_isBackwardCompatible() throws {
        // Un row de cache persisté AVANT ce champ (ou un payload serveur qui
        // n'envoie que le Bool) doit décoder sans erreur, viewedAt = nil.
        let legacy = Data("""
        {"id":"s1","media":[],"createdAt":"2026-07-01T00:00:00Z","isViewed":true,"reactionCount":0,"commentCount":0}
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(StoryItem.self, from: legacy)
        XCTAssertTrue(decoded.isViewed)
        XCTAssertNil(decoded.viewedAt)
    }
}
