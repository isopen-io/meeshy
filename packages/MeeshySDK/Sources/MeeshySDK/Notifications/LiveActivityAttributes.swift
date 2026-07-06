import Foundation

/// MARK: - Live Activity Attributes
public struct MeeshyActivityAttributes: @unchecked Sendable, Codable {
    public struct ContentState: Codable, Hashable {
        public var activityType: ActivityType
        public var contactName: String
        public var contactAvatar: String?
        public var duration: TimeInterval
        public var messageStatus: MessageStatus?
        public var translationProgress: Double?
        public var sourceLanguage: String?
        public var targetLanguage: String?

        public init(
            activityType: ActivityType,
            contactName: String,
            contactAvatar: String? = nil,
            duration: TimeInterval = 0,
            messageStatus: MessageStatus? = nil,
            translationProgress: Double? = nil,
            sourceLanguage: String? = nil,
            targetLanguage: String? = nil
        ) {
            self.activityType = activityType
            self.contactName = contactName
            self.contactAvatar = contactAvatar
            self.duration = duration
            self.messageStatus = messageStatus
            self.translationProgress = translationProgress
            self.sourceLanguage = sourceLanguage
            self.targetLanguage = targetLanguage
        }
    }

    public enum ActivityType: String, Codable {
        case call
        case messageDelivery
        case translation
    }

    public enum MessageStatus: String, Codable {
        case sending
        case sent
        case delivered
        case read
        case failed
    }

    public var conversationId: String
    public var contactName: String

    public init(conversationId: String, contactName: String) {
        self.conversationId = conversationId
        self.contactName = contactName
    }
}

#if canImport(ActivityKit)
import ActivityKit
extension MeeshyActivityAttributes: ActivityAttributes {}
#endif
