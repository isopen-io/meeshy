import Foundation
import Intents
import MeeshySDK

struct CallBackRequest: Equatable {
    let userId: String
    let displayName: String
    let isVideo: Bool
    let conversationId: String?
}

struct CallPeer: Equatable {
    let userId: String
    let displayName: String
}

extension CallBackRequest {
    static let callBackNotificationTypes: Set<String> = ["missed_call", "CALL_MISSED", "call_declined"]

    static let startCallActivityType = "INStartCallIntent"

    init?(notification payload: NotificationPayload) {
        guard let type = payload.type, Self.callBackNotificationTypes.contains(type) else { return nil }
        guard let caller = Self.trimmed(payload.senderId) ?? Self.trimmed(payload.callerUserId) else { return nil }
        self.init(
            userId: caller,
            displayName: Self.trimmed(payload.senderDisplayName)
                ?? Self.trimmed(payload.senderUsername)
                ?? Self.trimmed(payload.callerName)
                ?? "",
            isVideo: payload.isVideoCall,
            conversationId: Self.trimmed(payload.conversationId)
        )
    }

    init?(intent: INStartCallIntent?) {
        guard let person = intent?.contacts?.first,
              let handle = Self.trimmed(person.personHandle?.value) else { return nil }
        self.init(
            userId: handle,
            displayName: person.displayName,
            isVideo: intent?.callCapability == .videoCall,
            conversationId: nil
        )
    }

    init?(userActivity: NSUserActivity) {
        self.init(intent: userActivity.interaction?.intent as? INStartCallIntent)
    }

    private static func trimmed(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        return value
    }
}
