import XCTest
import MeeshySDK
@testable import Meeshy

/// Le corps de `POST /posts/:id/like` tel que la file durable l'émet.
///
/// Une réaction de story rejouée depuis l'outbox emprunte la route du like de
/// post ; ce qui la distingue, c'est l'emoji dans le corps — et c'est ce corps-ci
/// qui atteint le serveur. Un emoji qui survit jusqu'au payload persisté mais
/// que ce corps n'écrit pas arriverait au gateway comme un like `❤️` par
/// défaut : la réaction changerait de visage au dernier saut.
final class OutboxDispatcherToggleLikePostEncodingTests: XCTestCase {

    private func makePayload(emoji: String?) -> ToggleLikePostPayload {
        ToggleLikePostPayload(
            clientMutationId: "cmid_00000000-0000-4000-8000-000000000021",
            postId: "story-1",
            liked: true,
            emoji: emoji
        )
    }

    func test_encoded_forReactionWithEmoji_carriesTheEmojiAsTheOnlyKey() throws {
        let data = try XCTUnwrap(try ToggleLikePostBody.encoded(for: makePayload(emoji: "🔥")))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["emoji"] as? String, "🔥")
        XCTAssertEqual(json.count, 1, "`LikeSchema` ne lit que `emoji` : rien d'autre ne doit partir")
    }

    func test_encoded_forPlainLike_returnsNil() throws {
        XCTAssertNil(
            try ToggleLikePostBody.encoded(for: makePayload(emoji: nil)),
            "Un like simple garde son corps vide — le gateway applique son défaut"
        )
    }
}
