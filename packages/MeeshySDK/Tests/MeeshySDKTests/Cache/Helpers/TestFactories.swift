import Foundation
@testable import MeeshySDK

enum TestFactories {

    static func makeMessage(
        id: String = "msg-\(UUID().uuidString.prefix(8))",
        conversationId: String = "conv-1",
        senderId: String = "sender-1",
        content: String = "Hello",
        createdAt: Date = Date()
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: id,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            createdAt: createdAt,
            updatedAt: createdAt
        )
    }

    static func makeAPIMessage(
        id: String = "msg-\(UUID().uuidString.prefix(8))",
        conversationId: String = "conv-1",
        senderId: String = "sender-1",
        content: String = "Hello",
        createdAt: Date = Date()
    ) -> APIMessage {
        let json: [String: Any] = [
            "id": id,
            "conversationId": conversationId,
            "senderId": senderId,
            "content": content,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: createdAt)
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(APIMessage.self, from: data)
    }

    static func makeConversation(
        id: String = "conv-\(UUID().uuidString.prefix(8))",
        identifier: String = "test-conversation",
        type: MeeshyConversation.ConversationType = .direct,
        title: String? = "Test Conversation",
        unreadCount: Int = 0,
        lastMessageAt: Date = Date()
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: identifier,
            type: type,
            title: title,
            lastMessageAt: lastMessageAt,
            unreadCount: unreadCount
        )
    }

    static func makeParticipant(
        id: String = "part-\(UUID().uuidString.prefix(8))",
        userId: String? = "user-1",
        username: String? = "testuser",
        displayName: String? = "Test User",
        conversationRole: String? = "MEMBER"
    ) -> PaginatedParticipant {
        PaginatedParticipant(
            id: id,
            userId: userId,
            username: username,
            displayName: displayName,
            conversationRole: conversationRole
        )
    }

    static func makeUser(
        id: String = "user-\(UUID().uuidString.prefix(8))",
        username: String = "testuser"
    ) -> MeeshyUser {
        MeeshyUser(id: id, username: username)
    }
}
