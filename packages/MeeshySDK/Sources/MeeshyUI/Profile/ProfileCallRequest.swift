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
        // Deux tête-à-tête avec ce contact (#12966) : l'appel part du chiffré de
        // bout en bout, comme la passerelle le rend (#13006).
        let directs = sharedConversations
            .filter { $0.type == .direct && ($0.participantUserId == nil || $0.participantUserId == userId) }
            .map { conversation -> MeeshyConversation in
                var adopted = conversation
                adopted.participantUserId = userId
                return adopted
            }
        let direct = DirectPairChoice.preferred(among: directs, with: userId)
        self.init(userId: userId, displayName: displayName, isVideo: isVideo, conversationId: direct?.id)
    }
}
