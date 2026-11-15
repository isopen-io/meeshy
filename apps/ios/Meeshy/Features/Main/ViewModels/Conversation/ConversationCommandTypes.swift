import Foundation
import MeeshySDK

nonisolated enum MessageDeleteMode {
    case local
    case everyone
}

nonisolated struct MessagePinState: Equatable, Sendable {
    let pinnedAt: Date?
    let pinnedBy: String?

    var isPinned: Bool { pinnedAt != nil }
}

nonisolated struct ConversationCommandFailure: Error, Equatable, Sendable {
    let userMessage: String

    init(userMessage: String) {
        self.userMessage = userMessage
    }

    init(_ error: any Error) {
        self.userMessage = ConversationErrorText.message(for: error)
    }
}

nonisolated enum ConversationErrorText {
    static func message(for error: any Error) -> String {
        if let meeshyError = error as? MeeshyError, case .server = meeshyError {
            return String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
        }
        return error.localizedDescription
    }
}
