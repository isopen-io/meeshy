import XCTest
@testable import MeeshySDK

/// **La publication CITÉE d'une republication sert le texte du Prisme** (#16002).
///
/// Les témoins sont au rang 2 (leçon 261) : la langue d'origine occupe le
/// second rang du prisme, la traduction le premier. Un court-circuit
/// « l'origine est dans le prisme ⇒ l'original » rendrait « Hello ».
final class RepostContentPrismTests: XCTestCase {

    private let prisme = ["fr", "en"]

    private func racineAnglaise(traductions: [String: PostTranslation]? = ["fr": PostTranslation(text: "Bonjour")]) -> RepostContent {
        RepostContent(id: "racine", author: "Bruno", authorId: "bruno-id", content: "Hello",
                      originalLanguage: "en", translations: traductions)
    }

    private func decodeRepostOf() throws -> APIRepostOf {
        let json = """
        {
          "id": "racine",
          "content": "Hello",
          "originalLanguage": "en",
          "translations": {"fr": {"text": "Bonjour"}},
          "author": {"id": "a", "username": "bruno", "displayName": "Bruno"},
          "createdAt": "2026-11-04T10:00:00.000Z"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return formatter.date(from: raw) ?? Date()
        }
        return try decoder.decode(APIRepostOf.self, from: json)
    }

    func test_resolved_secondRankOriginal_servesTheFirstRankTranslation() {
        XCTAssertEqual(racineAnglaise().resolved(preferredLanguages: prisme).displayContent, "Bonjour")
    }

    func test_resolved_noTranslationForThePrism_servesTheOriginal() {
        let racine = racineAnglaise(traductions: ["es": PostTranslation(text: "Hola")])
        XCTAssertEqual(racine.resolved(preferredLanguages: prisme).displayContent, "Hello")
    }

    func test_unresolved_servesTheOriginal() {
        XCTAssertEqual(racineAnglaise().displayContent, "Hello")
    }

    func test_toRepostContent_descendsTheReaderPrism() throws {
        XCTAssertEqual(try decodeRepostOf().toRepostContent(preferredLanguages: prisme).displayContent, "Bonjour")
    }

    func test_feedPostResolved_carriesThePrismToItsRepost() {
        let carte = FeedPost(id: "carte", author: "Alice", authorId: "alice-id", content: "",
                             repost: racineAnglaise())
        XCTAssertEqual(carte.resolved(preferredLanguages: prisme).repost?.displayContent, "Bonjour")
    }

    func test_codable_keepsTheServedTranslation() throws {
        let servie = racineAnglaise().resolved(preferredLanguages: prisme)
        let relue = try JSONDecoder().decode(RepostContent.self, from: JSONEncoder().encode(servie))
        XCTAssertEqual(relue.displayContent, "Bonjour")
    }
}
