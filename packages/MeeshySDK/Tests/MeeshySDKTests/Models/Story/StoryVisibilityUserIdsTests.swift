import XCTest
@testable import MeeshySDK

// MARK: - StoryVisibilityUserIdsTests
//
// Le picker « Sauf… » / « Seulement… » s'ouvre pré-coché sur la sélection
// actuelle : il faut donc que `visibilityUserIds` traverse le décodage du
// payload jusqu'à `StoryItem`. Optionnel partout → les payloads et les rows
// GRDB antérieurs continuent de décoder sans migration.

final class StoryVisibilityUserIdsTests: XCTestCase {

    private func decodePost(_ json: String) throws -> APIPost {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIPost.self, from: Data(json.utf8))
    }

    private func postJSON(visibilityUserIdsFragment: String) -> String {
        """
        {
          "id": "post-1",
          "type": "STORY",
          "visibility": "EXCEPT",
          \(visibilityUserIdsFragment)
          "createdAt": "2026-07-26T10:00:00Z",
          "author": { "id": "user-1", "username": "alice" }
        }
        """
    }

    func test_apiPost_decodesVisibilityUserIds() throws {
        let post = try decodePost(postJSON(
            visibilityUserIdsFragment: "\"visibilityUserIds\": [\"u1\", \"u2\"],"))
        XCTAssertEqual(post.visibilityUserIds, ["u1", "u2"])
    }

    /// Rétro-compatibilité : un payload antérieur au champ doit décoder, pas jeter.
    func test_apiPost_missingVisibilityUserIds_decodesAsNil() throws {
        let post = try decodePost(postJSON(visibilityUserIdsFragment: ""))
        XCTAssertNil(post.visibilityUserIds)
    }

    func test_storyItem_defaultVisibilityUserIdsIsNil() {
        let item = StoryItem(id: "s1", visibility: "PUBLIC")
        XCTAssertNil(item.visibilityUserIds)
    }

    func test_storyItem_carriesVisibilityUserIds() {
        let item = StoryItem(id: "s1", visibility: "ONLY", visibilityUserIds: ["u1"])
        XCTAssertEqual(item.visibilityUserIds, ["u1"])
    }

    /// `visibility` devient `var` pour permettre la mise à jour optimiste
    /// (même patron que `isViewed`, muté en place plutôt que reconstruit —
    /// une reconstruction partielle droppait ~13 champs à leur défaut).
    func test_storyItem_visibilityIsMutable() {
        var item = StoryItem(id: "s1", visibility: "PUBLIC")
        item.visibility = "PRIVATE"
        item.visibilityUserIds = ["u9"]
        XCTAssertEqual(item.visibility, "PRIVATE")
        XCTAssertEqual(item.visibilityUserIds, ["u9"])
    }

    /// Un `StoryItem` persisté AVANT le champ doit se relire en `nil`
    /// (cache GRDB : aucune migration, décodage tolérant).
    func test_storyItem_decodesLegacyPayloadWithoutVisibilityUserIds() throws {
        let json = """
        {
          "id": "s1",
          "media": [],
          "createdAt": 774000000,
          "visibility": "PUBLIC",
          "isViewed": false,
          "reactionCount": 0,
          "commentCount": 0
        }
        """
        let item = try JSONDecoder().decode(StoryItem.self, from: Data(json.utf8))
        XCTAssertNil(item.visibilityUserIds)
        XCTAssertEqual(item.visibility, "PUBLIC")
    }

    /// La fusion de traductions temps réel reconstruit la `StoryItem` via son
    /// init memberwise : le nouveau champ doit y être transmis, sinon une
    /// traduction reçue effacerait silencieusement la liste d'audience.
    func test_mergingTextObjectTranslations_preservesVisibilityUserIds() {
        let effects = StoryEffects(textObjects: [StoryTextObject(text: "Hello")])
        let item = StoryItem(id: "s1", storyEffects: effects,
                             visibility: "ONLY", visibilityUserIds: ["u1", "u2"])
        let merged = item.mergingTextObjectTranslations(at: 0, translations: ["fr": "Bonjour"])
        XCTAssertEqual(merged.visibilityUserIds, ["u1", "u2"])
        XCTAssertEqual(merged.visibility, "ONLY")
    }
}
