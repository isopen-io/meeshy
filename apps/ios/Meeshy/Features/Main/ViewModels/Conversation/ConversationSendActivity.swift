import Foundation
import MeeshySDK

nonisolated struct ConversationSendActivity: Equatable, Sendable {
    let inFlight: Int

    static let idle = ConversationSendActivity(inFlight: 0)

    var isSending: Bool { inFlight > 0 }

    func began() -> ConversationSendActivity {
        ConversationSendActivity(inFlight: inFlight + 1)
    }

    func ended() -> ConversationSendActivity {
        ConversationSendActivity(inFlight: max(0, inFlight - 1))
    }
}

nonisolated struct OutgoingMessageState: Equatable, Sendable {
    let messageId: String
    let delivery: MeeshyMessage.DeliveryStatus

    var isFailed: Bool { delivery == .failed }
}
