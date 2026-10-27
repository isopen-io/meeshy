import Foundation

extension CallManager {
    @discardableResult
    func rejectCall(
        withReply text: String,
        originalLanguage: String?,
        messenger: CallDeclineMessengerProviding = CallDeclineMessenger.shared
    ) -> Bool {
        guard let plan = CallDeclineReplyRule.plan(
            isDeclinable: isDeclinableIncomingCall,
            conversationId: conversationId,
            text: text,
            originalLanguage: originalLanguage
        ) else { return false }
        rejectCall()
        Task { @MainActor in
            await messenger.send(plan)
        }
        return true
    }

    private var isDeclinableIncomingCall: Bool {
        guard case .ringing(isOutgoing: false) = callState else { return false }
        return currentCallId != nil && remoteUserId != nil
    }
}
