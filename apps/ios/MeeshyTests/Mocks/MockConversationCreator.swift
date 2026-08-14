import Foundation
@testable import Meeshy
import MeeshySDK

final class MockConversationCreator: ConversationCreating, @unchecked Sendable {
    var result: Result<Conversation, Error> = .success(
        MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .direct)
    )

    var createCallCount = 0
    var lastUserId: String?
    var lastCurrentUserId: String?

    func createDirectConversation(with userId: String, currentUserId: String) async throws -> Conversation {
        createCallCount += 1
        lastUserId = userId
        lastCurrentUserId = currentUserId
        return try result.get()
    }

    func reset() {
        result = .success(MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .direct))
        createCallCount = 0
        lastUserId = nil
        lastCurrentUserId = nil
    }
}
