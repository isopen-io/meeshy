import XCTest
import MeeshySDK
@testable import Meeshy

/// Le corps de `POST /posts` tel que la file durable l'émet.
///
/// Un post texte — le cas le plus courant de l'app — ne part JAMAIS par
/// `PostService.create` : il passe par l'outbox, et c'est ce corps-ci qui
/// atteint le serveur. Une référence qui survit jusqu'au payload persisté mais
/// que ce corps n'écrit pas serait perdue au tout dernier saut, exactement
/// comme la position l'avait été (Task 17).
final class OutboxDispatcherCreatePostEncodingTests: XCTestCase {

    private func encodeToJSON<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [String: Any])
    }

    private func makeBody(mentions: [PostMentionInput]?) -> CreatePostBody {
        CreatePostBody(
            content: "Coucou",
            mediaIds: nil,
            visibility: "PUBLIC",
            originalLanguage: nil,
            type: nil,
            moodEmoji: nil,
            audioUrl: nil,
            audioDuration: nil,
            visibilityUserIds: nil,
            location: nil,
            mentions: mentions
        )
    }

    func test_createPostBody_carriesDeclaredReferencesWithTheirMode() throws {
        let json = try encodeToJSON(makeBody(mentions: [
            PostMentionInput.id("u-alice", display: .note),
            PostMentionInput.handle("bob", display: .silent)
        ]))

        let encoded = try XCTUnwrap(json["mentions"] as? [[String: Any]])
        XCTAssertEqual(encoded.count, 2)
        XCTAssertEqual(encoded[0]["userId"] as? String, "u-alice")
        XCTAssertEqual(encoded[0]["display"] as? String, "NOTE")
        XCTAssertEqual(encoded[1]["username"] as? String, "bob")
        XCTAssertEqual(encoded[1]["display"] as? String, "SILENT")
    }

    func test_createPostBody_withoutReferences_omitsTheKey() throws {
        let json = try encodeToJSON(makeBody(mentions: nil))

        XCTAssertNil(json["mentions"],
                     "Rien de déclaré : la clé ne part pas — le serveur relit le texte lui-même")
    }

    func test_createPostBody_emptyReferences_omitsTheKey() throws {
        // À la CRÉATION, `[]` n'a rien à effacer : il n'existe encore aucune
        // ligne. L'émettre ferait porter au réseau un verdict sans objet.
        let json = try encodeToJSON(makeBody(mentions: []))

        XCTAssertNil(json["mentions"])
    }
}
