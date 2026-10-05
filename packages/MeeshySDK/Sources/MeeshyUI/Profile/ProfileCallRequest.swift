import Foundation
import MeeshySDK

public struct ProfileCallRequest: Equatable, Sendable {
    public let userId: String
    public let displayName: String
    public let isVideo: Bool
    public let conversationId: String?

    public init(userId: String, displayName: String, isVideo: Bool, conversationId: String?) {
        self.userId = userId
        self.displayName = displayName
        self.isVideo = isVideo
        self.conversationId = conversationId
    }

    public init?(userId: String?, displayName: String, isVideo: Bool, sharedConversations: [MeeshyConversation]) {
        guard let userId = userId?.trimmingCharacters(in: .whitespacesAndNewlines), !userId.isEmpty else { return nil }
        let direct = sharedConversations.first { conversation in
            conversation.type == .direct && (conversation.participantUserId == nil || conversation.participantUserId == userId)
        }
        self.init(userId: userId, displayName: displayName, isVideo: isVideo, conversationId: direct?.id)
    }
}
