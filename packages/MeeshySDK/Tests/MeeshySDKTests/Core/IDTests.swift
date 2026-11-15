import Testing
import Foundation
@testable import MeeshySDK

private struct Probe: Codable {
    let conversationId: ConversationID
    let messageId: MessageID
    let postId: PostID
    let storyId: StoryID
    let userId: UserID
}

private struct TypedProbe: Codable {
    let conversationId: ConversationID
}

private struct LegacyProbe: Codable {
    let conversationId: String
}

private struct UserProbe: Codable {
    let userId: UserID
}

struct IDTests {

    private func sortedEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    @Test func test_roundTrip_jsonBytesIdentical() throws {
        let json = Data(#"{"conversationId":"507f1f77bcf86cd799439011","messageId":"65a1b2c3d4e5f60718293a4b","postId":"65a1b2c3d4e5f60718293a4c","storyId":"65a1b2c3d4e5f60718293a4d","userId":"65a1b2c3d4e5f60718293a4e"}"#.utf8)
        let decoded = try JSONDecoder().decode(Probe.self, from: json)
        let reencoded = try sortedEncoder().encode(decoded)
        #expect(reencoded == json)
    }

    @Test func test_encode_matchesLegacyStringEncoding() throws {
        let typed = try sortedEncoder().encode(TypedProbe(conversationId: ConversationID("abc")))
        let legacy = try sortedEncoder().encode(LegacyProbe(conversationId: "abc"))
        #expect(typed == legacy)
    }

    @Test func test_decode_fromTopLevelFragment() throws {
        let decoded = try JSONDecoder().decode(UserID.self, from: Data(#""u1""#.utf8))
        #expect(decoded.rawValue == "u1")
    }

    @Test func test_decode_nonString_throwsTypeMismatch() {
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode(UserProbe.self, from: Data(#"{"userId":42}"#.utf8))
        }
    }

    @Test func test_equalityAndHash_useRawValue() {
        #expect(ConversationID("a") == ConversationID("a"))
        #expect(ConversationID("a") != ConversationID("b"))
        #expect(Set([ConversationID("a"), ConversationID("a")]).count == 1)
        #expect(ConversationID("a").description == "a")
    }
}
