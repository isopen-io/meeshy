import XCTest
@testable import MeeshySDK

/// L'auteur d'un mood cité doit survivre à l'écho serveur.
///
/// Le nom ne vivait que dans la référence optimiste locale : dès que le message
/// revenait du gateway, `uiReplyTo` reconstruisait la citation avec un
/// `authorName` vide et le titre retombait sur le libellé générique « Humeur ».
final class MoodReplyAuthorTests: XCTestCase {

    /// Même motif que `APIMessageToMessageTests.makeAPIMessage` : dictionnaire
    /// minimal + champs additionnels, décodé en `.iso8601`.
    private func makeMoodReply(authorName: String?) -> APIMessage {
        var postReplyTo: [String: Any] = [
            "id": "post-1",
            "type": "STATUS",
            "moodEmoji": "❤️",
            "previewText": "My heart as no else can do",
            "reactionCount": 0,
            "commentCount": 0,
            "shareCount": 0,
            "createdAt": "2026-08-10T14:43:00Z",
            "authorId": "user-1",
        ]
        if let authorName { postReplyTo["authorName"] = authorName }

        let now = ISO8601DateFormatter().string(from: Date())
        let json: [String: Any] = [
            "id": "msg-1",
            "conversationId": "conv-1",
            "senderId": "me",
            "content": "Oh je comprends",
            "createdAt": now,
            "updatedAt": now,
            "postReplyTo": postReplyTo,
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
    }

    func test_moodReply_carriesAuthorName_fromServerSnapshot() {
        let reply = makeMoodReply(authorName: "Belva Tano").toMessage(currentUserId: "me").replyTo
        XCTAssertEqual(reply?.moodEmoji, "❤️")
        XCTAssertEqual(reply?.authorName, "Belva Tano")
    }

    func test_moodReply_legacySnapshotWithoutAuthor_keepsEmptyName() {
        // Snapshot d'avant la correction : pas d'auteur. La citation doit
        // rester valide — le repli « Humeur » du titre reprend la main.
        let reply = makeMoodReply(authorName: nil).toMessage(currentUserId: "me").replyTo
        XCTAssertNotNil(reply)
        XCTAssertEqual(reply?.moodEmoji, "❤️")
        XCTAssertEqual(reply?.authorName, "")
    }
}
